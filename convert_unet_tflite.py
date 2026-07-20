import os
import sys
import subprocess
import shutil

def run_phase_1_pytorch_to_onnx():
    print("\n--- PHASE 1: Exporting PyTorch to ONNX ---")
    script = """
import torch
import torch.nn as nn

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
            self.up = nn.Upsample(scale_factor=2, mode='bilinear', align_corners=True)
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
    def __init__(self, n_channels, n_classes, bilinear=False):
        super(UNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        self.bilinear = bilinear

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
        logits = self.outc(x)
        return logits

# Load and export model
model = UNet(n_channels=3, n_classes=4, bilinear=False)
checkpoint = torch.load("unet_pytorch_3class.pth", map_location="cpu", weights_only=False)
model.load_state_dict(checkpoint["model_state_dict"])
model.eval()

dummy_input = torch.randn(1, 3, 256, 256)
torch.onnx.export(
    model,
    dummy_input,
    "unet.onnx",
    opset_version=18,
    dynamo=False,
    input_names=["input"],
    output_names=["output"]
)
print("ONNX export completed successfully.")
"""
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("Error in Phase 1:")
        print(result.stderr)
        sys.exit(1)

def run_phase_2_onnx_to_tflite_quant():
    print("\n--- PHASE 2: Preparing Calibration Data & Running onnx2tf INT8 Quantization ---")
    
    # Write representative data to .npy script
    prep_data_script = """
import glob
import cv2
import numpy as np

input_w, input_h = 256, 256
image_paths = glob.glob("input_images/*.*")

if not image_paths:
    print("Warning: No calibration images found in input_images/. Using dummy calibration data.")
    representative_images = np.random.rand(50, input_h, input_w, 3).astype(np.float32)
else:
    representative_images = []
    for path in image_paths[:100]:
        img = cv2.imread(path)
        if img is None:
            continue
        img = cv2.resize(img, (input_w, input_h))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        representative_images.append(img)
    representative_images = np.stack(representative_images, axis=0).astype(np.float32)

np.save("calibration_data.npy", representative_images)
print(f"Calibration data saved (shape: {representative_images.shape})")
"""
    result = subprocess.run([sys.executable, "-c", prep_data_script], capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("Error preparing calibration data:")
        print(result.stderr)
        sys.exit(1)

    # Clean up previous unet_tf directory
    if os.path.exists("unet_tf"):
        shutil.rmtree("unet_tf")

    # Run onnx2tf with INT8 quantization option
    cmd = [
        "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/onnx2tf",
        "-i", "unet.onnx",
        "-o", "unet_tf",
        "-oiqt",
        "-cind", "input", "calibration_data.npy", "0.0", "1.0"
    ]
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Error in Phase 2 onnx2tf.")
        sys.exit(1)

    # Find the generated integer quantized file and copy it to unet.tflite
    quant_file_src = os.path.join("unet_tf", "unet_integer_quant.tflite")
    if os.path.exists(quant_file_src):
        shutil.copy(quant_file_src, "unet.tflite")
        print("\nSuccessfully generated and saved unet.tflite at the root.")
    else:
        # Sometimes named slightly differently, let's search
        found = False
        for f in os.listdir("unet_tf"):
            if "quant" in f and f.endswith(".tflite"):
                shutil.copy(os.path.join("unet_tf", f), "unet.tflite")
                print(f"\nSuccessfully generated and saved unet.tflite from {f}")
                found = True
                break
        if not found:
            print("\nError: Could not locate quantized TFLite file in unet_tf/")
            sys.exit(1)

if __name__ == "__main__":
    run_phase_1_pytorch_to_onnx()
    run_phase_2_onnx_to_tflite_quant()
    
    # Cleanup temp files
    if os.path.exists("calibration_data.npy"):
        os.remove("calibration_data.npy")
        
    print("\nConversion successfully completed!")
