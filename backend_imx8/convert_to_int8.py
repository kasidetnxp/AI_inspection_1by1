import os
import sys
import shutil
import glob
import numpy as np
import cv2
import torch
import torch.nn as nn
import subprocess
import tensorflow as tf

class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )
    def forward(self, x):
        return self.double_conv(x)

class Down(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )
    def forward(self, x):
        return self.maxpool_conv(x)

class Up(nn.Module):
    def __init__(self, in_channels, out_channels, bilinear=False):
        super().__init__()
        if bilinear:
            self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=True)
            self.conv = DoubleConv(in_channels, out_channels)
        else:
            self.up = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
            self.conv = DoubleConv(in_channels, out_channels)
    def forward(self, x1, x2):
        x1 = self.up(x1)
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)

class OutConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)
    def forward(self, x):
        return self.conv(x)

class UNet(nn.Module):
    def __init__(self, n_channels=3, n_classes=4, bilinear=False):
        super().__init__()
        self.inc = DoubleConv(n_channels, 64)
        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        factor = 2 if bilinear else 1
        self.down4 = Down(512, 1024 // factor)
        self.up1 = Up(1024, 512 // factor, bilinear)
        self.up2 = Up(512, 256 // factor, bilinear)
        self.up3 = Up(256, 128 // factor, bilinear)
        self.up4 = Up(128, 64, bilinear)
        self.outc = OutConv(64, n_classes)
    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)
        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        return self.outc(x)

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

def letterbox(img, new_shape=(256, 256), color=(114, 114, 114)):
    h_orig, w_orig = img.shape[:2]
    w_new, h_new = new_shape
    scale = min(w_new / w_orig, h_new / h_orig)
    w_resized = int(round(w_orig * scale))
    h_resized = int(round(h_orig * scale))
    resized = cv2.resize(img, (w_resized, h_resized), interpolation=cv2.INTER_LINEAR)
    pad_w = w_new - w_resized
    pad_h = h_new - h_resized
    pad_left, pad_top = pad_w // 2, pad_h // 2
    pad_right, pad_bottom = pad_w - pad_left, pad_h - pad_top
    padded = cv2.copyMakeBorder(
        resized, pad_top, pad_bottom, pad_left, pad_right,
        cv2.BORDER_CONSTANT, value=color
    )
    return padded

def convert_to_int8(pth_path, output_tflite_path, num_calib=100):
    print(f"\n=======================================================")
    print(f"🚀 Starting INT8 Conversion for i.MX8 NPU")
    print(f"📌 Input PyTorch: {pth_path}")
    print(f"📌 Output TFLite: {output_tflite_path}")
    print(f"=======================================================")
    
    # 1. Load PyTorch model
    checkpoint = torch.load(pth_path, map_location="cpu", weights_only=False)
    sd = checkpoint.get("model_state_dict", checkpoint.get("state_dict", checkpoint))
    clean_sd = {k.replace("module.", ""): v for k, v in sd.items()}
    n_classes = clean_sd["outc.conv.weight"].shape[0] if "outc.conv.weight" in clean_sd else 4
    
    model = UNet(n_channels=3, n_classes=n_classes, bilinear=False)
    model.load_state_dict(clean_sd)
    model.eval()
    print(f"✅ PyTorch model loaded (n_classes={n_classes})")
    
    # 2. Export to ONNX
    temp_onnx = "/tmp/temp_unet.onnx"
    dummy_input = torch.randn(1, 3, 256, 256)
    torch.onnx.export(
        model, dummy_input, temp_onnx,
        opset_version=18, dynamo=False,
        input_names=["input"],
        output_names=["output"]
    )
    print(f"✅ Exported temporary ONNX: {temp_onnx}")
    
    # 3. Convert ONNX to TF SavedModel using onnx2tf
    temp_tf_dir = "/tmp/temp_tf_savedmodel"
    if os.path.exists(temp_tf_dir):
        shutil.rmtree(temp_tf_dir)
        
    print(f"🔄 Converting ONNX to TF SavedModel...")
    cmd = [sys.executable, "-m", "onnx2tf", "-i", temp_onnx, "-o", temp_tf_dir, "-n"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("❌ onnx2tf failed:", res.stderr or res.stdout)
        sys.exit(1)
    print(f"✅ TF SavedModel generated at {temp_tf_dir}")
    
    # 4. Prepare Representative Calibration Dataset from real wafer images
    print(f"📊 Gathering calibration images...")
    search_dirs = [
        "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/data/RETRAIN_DATA_NEW/val/images",
        "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/data/RETRAIN_DATA_NEW/train/images",
        "/home/nxp1/Desktop/PUNPUNJA/PROJECT/testiniMX8/input_images"
    ]
    img_files = []
    for d in search_dirs:
        if os.path.exists(d):
            img_files.extend(glob.glob(os.path.join(d, "*.bmp")) + glob.glob(os.path.join(d, "*.png")) + glob.glob(os.path.join(d, "*.jpg")))
            if len(img_files) >= num_calib:
                break
    
    selected_files = img_files[:num_calib]
    print(f"✅ Loaded {len(selected_files)} real wafer images for INT8 calibration.")
    
    calib_data = []
    for p in selected_files:
        img = cv2.imread(p)
        if img is None: continue
        padded = letterbox(img, (256, 256))
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        norm = (rgb - MEAN) / STD
        calib_data.append(norm)
    
    calib_data = np.stack(calib_data, axis=0).astype(np.float32)
    
    def representative_dataset_gen():
        for i in range(len(calib_data)):
            yield [np.expand_dims(calib_data[i], axis=0)]
            
    # 5. Full INT8 Quantization via TFLiteConverter
    print(f"⚙️ Running Full INT8 Quantization (TFLITE_BUILTINS_INT8, full I/O int8)...")
    converter = tf.lite.TFLiteConverter.from_saved_model(temp_tf_dir)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset_gen
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.int8
    converter.inference_output_type = tf.int8
    
    tflite_int8_model = converter.convert()
    
    os.makedirs(os.path.dirname(os.path.abspath(output_tflite_path)), exist_ok=True)
    with open(output_tflite_path, "wb") as f:
        f.write(tflite_int8_model)
        
    size_mb = len(tflite_int8_model) / (1024 * 1024)
    print(f"🎉 INT8 TFLite model successfully written to: {output_tflite_path}")
    print(f"📦 Model Size: {size_mb:.2f} MB ({len(tflite_int8_model)} bytes)")
    
    # Cleanup
    if os.path.exists(temp_onnx): os.remove(temp_onnx)
    if os.path.exists(temp_tf_dir): shutil.rmtree(temp_tf_dir)
    
    return model, output_tflite_path

def verify_model(torch_model, tflite_path, test_image_path):
    print(f"\n🔬 Running Verification & Defect Detection Test...")
    print(f"Image: {test_image_path}")
    
    img = cv2.imread(test_image_path)
    if img is None:
        print("❌ Test image not found")
        return
        
    padded = letterbox(img, (256, 256))
    rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    norm = (rgb - MEAN) / STD
    
    # 1. PyTorch inference (Reference Ground Truth)
    with torch.no_grad():
        t_in = torch.from_numpy(norm.transpose(2, 0, 1)).unsqueeze(0).float()
        torch_out = torch_model(t_in).squeeze(0).permute(1, 2, 0).cpu().numpy()
        torch_pred = np.argmax(torch_out, axis=-1)
        
    # 2. INT8 TFLite inference
    inter = tf.lite.Interpreter(model_path=tflite_path)
    inter.allocate_tensors()
    inp_desc = inter.get_input_details()[0]
    out_desc = inter.get_output_details()[0]
    
    scale_in, zp_in = inp_desc['quantization']
    q_in = np.clip(np.round(norm / scale_in) + zp_in, -128, 127).astype(np.int8)
    q_in = np.expand_dims(q_in, axis=0)
    
    inter.set_tensor(inp_desc['index'], q_in)
    inter.invoke()
    q_out = inter.get_tensor(out_desc['index'])
    
    scale_out, zp_out = out_desc['quantization']
    deq_out = (q_out.astype(np.float32) - zp_out) * scale_out
    tflite_pred = np.argmax(deq_out[0], axis=-1)
    
    # Compute pixel match agreement between PyTorch and INT8 TFLite
    match_pct = (torch_pred == tflite_pred).mean() * 100.0
    print(f"🎯 Agreement (PyTorch Float32 vs TFLite INT8): {match_pct:.2f}% match!")
    
    t_u, t_c = np.unique(torch_pred, return_counts=True)
    tf_u, tf_c = np.unique(tflite_pred, return_counts=True)
    print(f"📊 PyTorch predictions per class: {dict(zip(t_u, t_c))}")
    print(f"📊 TFLite INT8 predictions per class: {dict(zip(tf_u, tf_c))}")

if __name__ == "__main__":
    pth = sys.argv[1] if len(sys.argv) > 1 else "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/models/3class/weights/unet_pytorch_3class.pth"
    out = sys.argv[2] if len(sys.argv) > 2 else "/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/backend_imx8/models/unet_3class_new.tflite"
    
    model, out_path = convert_to_int8(pth, out)
    
    # Test image with defects
    test_imgs = glob.glob("/home/nxp1/Desktop/PUNPUNJA/PROJECT/testiniMX8/input_images/*.bmp")
    if test_imgs:
        verify_model(model, out_path, test_imgs[0])
