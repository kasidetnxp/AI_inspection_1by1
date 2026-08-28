import os
import sys
import shutil
import subprocess
import numpy as np
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
        return self.outc(x)


def _do_convert(pth_path: str, output_tflite: str, shape=(256, 256)) -> str:
    if not os.path.exists(pth_path):
        raise FileNotFoundError(f"PyTorch weights not found: {pth_path}")

    base_dir = os.path.dirname(os.path.abspath(pth_path))
    stem = os.path.splitext(os.path.basename(pth_path))[0]
    temp_onnx = os.path.join(base_dir, f"{stem}_temp.onnx")
    temp_calib = os.path.join(base_dir, f"{stem}_calib.npy")
    temp_tf_dir = os.path.join(base_dir, f"{stem}_tf_out")

    try:
        # Phase 1: PyTorch -> ONNX
        print(f"🔄 [CONVERT] Loading PyTorch weights from {pth_path}")
        checkpoint = torch.load(pth_path, map_location="cpu", weights_only=False)
        sd = checkpoint.get("model_state_dict", checkpoint.get("state_dict", checkpoint))
        clean_sd = {k.replace("module.", ""): v for k, v in sd.items()}

        # Auto-detect number of classes from final layer shape
        n_classes = 4
        if "outc.conv.weight" in clean_sd:
            n_classes = clean_sd["outc.conv.weight"].shape[0]

        model = UNet(n_channels=3, n_classes=n_classes, bilinear=False)
        model.load_state_dict(clean_sd)
        model.eval()

        dummy_input = torch.randn(1, 3, shape[0], shape[1])
        torch.onnx.export(
            model,
            dummy_input,
            temp_onnx,
            opset_version=18,
            dynamo=False,
            input_names=["input"],
            output_names=["output"]
        )
        print(f"✅ [CONVERT] Exported ONNX to {temp_onnx} (n_classes={n_classes})")

        # Phase 2: Create Real Calibration Data from datasets
        import cv2, glob
        MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
        STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)
        
        calib_images = []
        search_dirs = [
            "/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/Pun_for_Accuracy_real",
            "/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets/Pun_for_Accuracy",
            "/home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU/datasets",
            "/home/nxp1/Desktop/PUNPUNJA/PROJECT/run_yoloINimx8/input_images"
        ]
        cand_files = []
        for s_dir in search_dirs:
            if os.path.exists(s_dir):
                cand_files.extend(glob.glob(os.path.join(s_dir, "**", "*.bmp"), recursive=True))
                cand_files.extend(glob.glob(os.path.join(s_dir, "**", "*.png"), recursive=True))
                cand_files.extend(glob.glob(os.path.join(s_dir, "**", "*.jpg"), recursive=True))
            if len(cand_files) >= 50:
                break

        for p in cand_files[:60]:
            img = cv2.imread(p)
            if img is None: continue
            h_orig, w_orig = img.shape[:2]
            scale = min(shape[1] / w_orig, shape[0] / h_orig)
            w_res, h_res = int(round(w_orig * scale)), int(round(h_orig * scale))
            resized = cv2.resize(img, (w_res, h_res), interpolation=cv2.INTER_LINEAR)
            pad_w = shape[1] - w_res
            pad_h = shape[0] - h_res
            padded = cv2.copyMakeBorder(
                resized, pad_h // 2, pad_h - pad_h // 2, pad_w // 2, pad_w - pad_w // 2,
                cv2.BORDER_CONSTANT, value=(114, 114, 114)
            )
            img_rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            img_norm = (img_rgb - MEAN) / STD
            calib_images.append(img_norm)

        if len(calib_images) >= 10:
            calib_data = np.stack(calib_images, axis=0).astype(np.float32)
            print(f"📊 [CONVERT] Prepared {len(calib_images)} real wafer calibration images for INT8 quantization")
        else:
            calib_data = np.random.uniform(-2.118, 2.64, size=(25, shape[0], shape[1], 3)).astype(np.float32)
            print(f"⚠️ [CONVERT] Fallback to synthetic calibration data")

        np.save(temp_calib, calib_data)

        if os.path.exists(temp_tf_dir):
            shutil.rmtree(temp_tf_dir)

        # Phase 3: Run onnx2tf for INT8 quantization
        case_unet_python = "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python"
        python_cmd = case_unet_python if os.path.exists(case_unet_python) else sys.executable

        cmd = [
            python_cmd, "-m", "onnx2tf",
            "-i", temp_onnx,
            "-o", temp_tf_dir,
            "-oiqt",
            "-cind", "input", temp_calib, "-2.118", "2.64"
        ]

        print(f"🔄 [CONVERT] Running onnx2tf quantization...")
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            err_msg = result.stderr if result.stderr else result.stdout
            print(f"❌ [CONVERT] onnx2tf failed: {err_msg[-500:]}")
            raise RuntimeError(f"onnx2tf quantization failed: {err_msg[-300:]}")

        quant_file = os.path.join(temp_tf_dir, f"{stem}_temp_integer_quant.tflite")
        if not os.path.exists(quant_file):
            for f in os.listdir(temp_tf_dir):
                if "integer_quant" in f and f.endswith(".tflite"):
                    quant_file = os.path.join(temp_tf_dir, f)
                    break
                elif "quant" in f and f.endswith(".tflite"):
                    quant_file = os.path.join(temp_tf_dir, f)
                    break

        if not os.path.exists(quant_file):
            for f in os.listdir(temp_tf_dir):
                if f.endswith(".tflite"):
                    quant_file = os.path.join(temp_tf_dir, f)
                    break

        if not os.path.exists(quant_file):
            raise FileNotFoundError("Quantized TFLite output file not generated by onnx2tf.")

        os.makedirs(os.path.dirname(os.path.abspath(output_tflite)), exist_ok=True)
        shutil.copy(quant_file, output_tflite)
        print(f"🎉 [CONVERT] Successfully generated TFLite model at {output_tflite}")

        return output_tflite

    finally:
        # Cleanup temporary files
        if os.path.exists(temp_onnx):
            try: os.remove(temp_onnx)
            except Exception: pass
        if os.path.exists(temp_calib):
            try: os.remove(temp_calib)
            except Exception: pass
        if os.path.exists(temp_tf_dir):
            try: shutil.rmtree(temp_tf_dir)
            except Exception: pass


def convert_pth_to_tflite(pth_path: str, output_tflite: str, shape=(256, 256)) -> str:
    """
    Converts a PyTorch UNet (.pth) model file to an INT8 Quantized TFLite model (.tflite).
    If the current Python environment lacks 'onnx', delegates to CASE_UNET venv.
    """
    case_unet_python = "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python"
    python_cmd = case_unet_python if os.path.exists(case_unet_python) else sys.executable

    if os.path.exists(case_unet_python) and sys.executable != case_unet_python:
        this_script = os.path.abspath(__file__)
        cmd = [python_cmd, this_script, pth_path, output_tflite, str(shape[0]), str(shape[1])]
        print(f"🔄 [CONVERT] Executing conversion in AI venv: {python_cmd}")
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            err = res.stderr or res.stdout
            print(f"❌ [CONVERT] AI venv conversion failed: {err[-500:]}")
            raise RuntimeError(f"Conversion failed: {err[-300:]}")
        return output_tflite
    else:
        return _do_convert(pth_path, output_tflite, shape)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert_model.py <pth_path> <output_tflite> [height] [width]")
        sys.exit(1)
    
    pth = sys.argv[1]
    out = sys.argv[2]
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 256
    w = int(sys.argv[4]) if len(sys.argv) > 4 else 256
    
    _do_convert(pth, out, shape=(h, w))
