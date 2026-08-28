import os
import sys
import glob
import shutil
import subprocess

import cv2
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


def export_pytorch_to_onnx(weights_path="Model_unet/unet_pytorch_3class.pth", onnx_path="unet.onnx"):
    print("\n--- PHASE 1: Exporting PyTorch to ONNX ---")
    if not os.path.exists(weights_path):
        raise FileNotFoundError(f"Weights file not found: {weights_path}")

    model = UNet(n_channels=3, n_classes=4, bilinear=False)
    checkpoint = torch.load(weights_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint.get("model_state_dict", checkpoint))
    model.eval()

    dummy_input = torch.randn(1, 3, 256, 256)
    torch.onnx.export(
        model,
        dummy_input,
        onnx_path,
        opset_version=18,
        dynamo=False,
        input_names=["input"],
        output_names=["output"]
    )
    print(f"ONNX export completed: {onnx_path}")


def letterbox(image, new_shape=(256, 256), color=(114, 114, 114)):
    h_orig, w_orig = image.shape[:2]
    w_new, h_new = new_shape
    scale = min(w_new / w_orig, h_new / h_orig)

    w_resized = int(round(w_orig * scale))
    h_resized = int(round(h_orig * scale))
    resized = cv2.resize(image, (w_resized, h_resized), interpolation=cv2.INTER_LINEAR)

    pad_w = w_new - w_resized
    pad_h = h_new - h_resized
    pad_left, pad_top = pad_w // 2, pad_h // 2
    pad_right, pad_bottom = pad_w - pad_left, pad_h - pad_top

    padded = cv2.copyMakeBorder(
        resized, pad_top, pad_bottom, pad_left, pad_right,
        cv2.BORDER_CONSTANT, value=color
    )
    return padded


MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)


def prepare_calibration_data(input_dir="input_images", calib_file="calibration_data.npy", shape=(256, 256)):
    image_paths = glob.glob(os.path.join(input_dir, "*.*"))
    representative_images = []

    for path in image_paths[:100]:
        img = cv2.imread(path)
        if img is None:
            continue
        img_lb = letterbox(img, shape)
        img_rgb = cv2.cvtColor(img_lb, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        # ImageNet Normalization
        img_norm = (img_rgb - MEAN) / STD
        representative_images.append(img_norm)

    if not representative_images:
        raise ValueError(
            f"Error: No calibration images found in '{input_dir}'. "
            "Please provide real images in 'input_images' folder for accurate INT8 quantization."
        )

    representative_images = np.stack(representative_images, axis=0).astype(np.float32)
    np.save(calib_file, representative_images)
    print(f"Saved calibration data ({representative_images.shape}) to {calib_file}")


def convert_onnx_to_tflite(onnx_path="unet.onnx", output_tflite="unet.tflite"):
    print("\n--- PHASE 2: Quantizing ONNX to TFLite (INT8) ---")
    calib_file = "calibration_data.npy"
    prepare_calibration_data(calib_file=calib_file)

    output_dir = "unet_tf"
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)

    case_unet_python = "/home/nxp1/Desktop/PUNPUNJA/PROJECT/CASE_UNET/.venv/bin/python"
    if os.path.exists(case_unet_python):
        python_cmd = case_unet_python
    else:
        python_cmd = sys.executable

    cmd = [
        python_cmd, "-m", "onnx2tf",
        "-i", onnx_path,
        "-o", output_dir,
        "-oiqt",
        "-cind", "input", calib_file, "-2.118", "2.64"
    ]

    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Error: onnx2tf failed.")
        sys.exit(1)

    quant_file = os.path.join(output_dir, "unet_integer_quant.tflite")
    if not os.path.exists(quant_file):
        for f in os.listdir(output_dir):
            if "quant" in f and f.endswith(".tflite"):
                quant_file = os.path.join(output_dir, f)
                break

    if os.path.exists(quant_file):
        shutil.copy(quant_file, output_tflite)
        print(f"\nSuccessfully saved {output_tflite}")
    else:
        print("\nError: Quantized TFLite output file not found.")
        sys.exit(1)

    if os.path.exists(calib_file):
        os.remove(calib_file)


def main():
    export_pytorch_to_onnx()
    convert_onnx_to_tflite()
    print("\nConversion finished successfully!")


if __name__ == "__main__":
    main()
