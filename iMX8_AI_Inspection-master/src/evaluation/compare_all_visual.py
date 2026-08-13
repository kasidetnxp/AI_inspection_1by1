"""Visual Comparison of All Models."""
import os
import sys
import random
import torch
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
import torchvision.transforms.functional as TF

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.unet.model import UNet
from src.resnet_unet.model_resnet import ResNet34UNet
from src.utils.config import CLASSES, NUM_CLASSES, COLOR_MAP, ID_TO_LABEL, IMAGE_SIZE, get_path

# Path Configuration
UNET_MODEL_PATH = get_path("unet", "models")
KERAS_MODEL_PATH = get_path("unet_keras", "models")
RESNET_MODEL_PATH = get_path("resnet_unet", "models")
YOLO_MODEL_PATH = get_path("yolo_best", "models")

VAL_IMAGES_DIR = os.path.join(get_path("processed_unet"), "val/images")
VAL_MASKS_DIR = os.path.join(get_path("processed_unet"), "val/masks")
class_folder = f"{len(CLASSES)}class"
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "outputs/evaluation", class_folder)


def create_overlay(img_rgb, mask_2d, alpha=0.4):
    """Overlays mask classes dynamically using project config COLOR_MAP."""
    overlay_img = img_rgb.copy().astype(np.float32)

    for class_id, color in COLOR_MAP.items():
        if class_id == 0:  # Skip background
            continue
        class_mask = (mask_2d == class_id)
        if class_mask.any():
            color_arr = np.array(color, dtype=np.float32)
            overlay_img[class_mask] = (overlay_img[class_mask] * (1.0 - alpha) + color_arr * alpha)

    return overlay_img.astype(np.uint8)


def preprocess_pytorch(img_path, image_size, device):
    image = Image.open(img_path).convert("RGB")
    image_resized = TF.resize(image, image_size, interpolation=TF.InterpolationMode.BILINEAR)
    image_tensor = TF.to_tensor(image_resized)
    image_tensor = TF.normalize(image_tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    return image_tensor.unsqueeze(0).to(device), np.array(image_resized)


def get_yolo_predictions_as_mask(yolo_model, img_path, image_size):
    import cv2
    h, w = image_size
    unified_mask = np.zeros((h, w), dtype=np.uint8)

    results = yolo_model(img_path, verbose=False)[0]

    if results.masks is not None:
        masks_data = results.masks.data.cpu().numpy()
        classes = results.boxes.cls.cpu().numpy().astype(int)
        confidences = results.boxes.conf.cpu().numpy()

        sorted_indices = np.argsort(confidences)

        for idx in sorted_indices:
            mask = masks_data[idx]
            yolo_class = classes[idx]
            unet_class_id = yolo_class + 1

            if unet_class_id >= NUM_CLASSES:
                continue

            resized_mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
            unified_mask[resized_mask > 0.5] = unet_class_id

    return unified_mask


def predict_pytorch(model, img_tensor):
    with torch.no_grad():
        outputs = model(img_tensor)
        preds = torch.argmax(outputs, dim=1)
        pred_mask = preds.squeeze(0).cpu().numpy().astype(np.uint8)
    return pred_mask


def load_keras_prediction_mask(img_name, image_size):
    class_folder = f"{len(CLASSES)}class"
    keras_mask_path = os.path.join(PROJECT_ROOT, f"outputs/unet_keras/{class_folder}/val", f"{os.path.splitext(img_name)[0]}_mask.png")
    if not os.path.exists(keras_mask_path):
        return np.zeros(image_size, dtype=np.uint8)

    mask_img = Image.open(keras_mask_path).convert("RGB").resize(image_size, Image.NEAREST)
    mask_np = np.array(mask_img)

    mask_2d = np.zeros(image_size, dtype=np.uint8)
    # Map unified colors back to class IDs:
    # pad=1: [255, 128, 0], probemark=2: [0, 255, 255], grain=3: [255, 0, 255]
    mask_2d[np.all(mask_np == [255, 128, 0], axis=-1)] = 1
    mask_2d[np.all(mask_np == [0, 255, 255], axis=-1)] = 2
    mask_2d[np.all(mask_np == [255, 0, 255], axis=-1)] = 3
    return mask_2d


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(VAL_IMAGES_DIR) or not os.listdir(VAL_IMAGES_DIR):
        print(f"Error: Validation directory missing or empty at {VAL_IMAGES_DIR}")
        return

    image_files = sorted([f for f in os.listdir(VAL_IMAGES_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))])
    matching_files = []

    print("Scanning validation set for images with both Pad and Probemark...")
    for fname in image_files:
        mask_path = os.path.join(VAL_MASKS_DIR, fname)
        if not os.path.exists(mask_path):
            name_only, _ = os.path.splitext(fname)
            mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.png")
            if not os.path.exists(mask_path):
                mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.bmp")
                if not os.path.exists(mask_path):
                    continue

        gt_mask_pil = Image.open(mask_path).convert("L")
        gt_mask = np.array(gt_mask_pil)
        if NUM_CLASSES == 3:
            gt_mask[gt_mask == 3] = 1

        # Check if pad (1) and probemark (2) are present (standard class IDs for semiconductor wafer dataset)
        if 1 in gt_mask and 2 in gt_mask:
            matching_files.append(fname)

    print(f"Found {len(matching_files)} images containing both Pad and Probemark.")

    if len(matching_files) == 0:
        print("Error: No images found with both Pad and Probemark in validation masks.")
        return

    if len(matching_files) < 10:
        print(f"Warning: Only {len(matching_files)} matching images found. Using all of them.")
        selected_files = matching_files
    else:
        random.seed(42)
        selected_files = sorted(random.sample(matching_files, 10))

    print("Selected 10 files:")
    for idx, f in enumerate(selected_files):
        print(f"  {idx+1}. {f}")

    # Load PyTorch UNet
    print("\nLoading Standard U-Net (PyTorch)...")
    if os.path.exists(UNET_MODEL_PATH):
        unet_pytorch = UNet(n_channels=3, n_classes=NUM_CLASSES).to(device)
        checkpoint = torch.load(UNET_MODEL_PATH, map_location=device, weights_only=False)
        unet_pytorch.load_state_dict(checkpoint['model_state_dict'])
        unet_pytorch.eval()
        print("Standard U-Net (PyTorch) loaded.")
    else:
        print(f"Warning: Model file not found at {UNET_MODEL_PATH}")
        unet_pytorch = None

    # Load PyTorch ResNet34-UNet
    print("Loading ResNet34-UNet (PyTorch)...")
    if os.path.exists(RESNET_MODEL_PATH):
        resnet_unet = ResNet34UNet(n_classes=NUM_CLASSES, pretrained=False).to(device)
        checkpoint = torch.load(RESNET_MODEL_PATH, map_location=device, weights_only=False)
        resnet_unet.load_state_dict(checkpoint['model_state_dict'])
        resnet_unet.eval()
        print("ResNet34-UNet (PyTorch) loaded.")
    else:
        print(f"Warning: Model file not found at {RESNET_MODEL_PATH}")
        resnet_unet = None

    # Check Keras U-Net
    print("Checking Keras U-Net model...")
    if os.path.exists(KERAS_MODEL_PATH):
        unet_keras = True
        print("Keras U-Net marked for evaluation.")
        keras_val_dir = os.path.join(PROJECT_ROOT, f"outputs/unet_keras/{class_folder}/val")
        
        # Check for prediction cache mismatch (e.g. grain color [255, 0, 255] in 2-class mode)
        if os.path.exists(keras_val_dir) and os.listdir(keras_val_dir):
            sample_files = [os.path.join(keras_val_dir, f) for f in os.listdir(keras_val_dir) if f.endswith('_mask.png')][:5]
            found_grain_in_cache = False
            for fpath in sample_files:
                try:
                    img = Image.open(fpath).convert("RGB")
                    img_np = np.array(img)
                    if np.any(np.all(img_np == [255, 0, 255], axis=-1)):
                        found_grain_in_cache = True
                        break
                except Exception:
                    pass
            
            # If 2class mode (NUM_CLASSES == 3) but found grain, or 3class mode (NUM_CLASSES == 4) but no grain
            if (NUM_CLASSES == 3 and found_grain_in_cache) or (NUM_CLASSES == 4 and not found_grain_in_cache and len(CLASSES) == 3):
                print("\n⚠️ [WARNING] Keras U-Net prediction cache class mismatch detected!")
                print(f"The cached masks in outputs/unet_keras/{class_folder}/val do not match the current {len(CLASSES)}-class config.")
                print("Regenerating the validation masks to ensure accuracy...")
                import shutil
                shutil.rmtree(keras_val_dir, ignore_errors=True)

        if not os.path.exists(keras_val_dir) or not os.listdir(keras_val_dir):
            print("Keras U-Net validation masks not found. Generating them in a subprocess...")
            import subprocess
            subprocess.run([
                sys.executable,
                os.path.join(PROJECT_ROOT, "src/unet/predict_keras.py"),
                VAL_IMAGES_DIR,
                f"{class_folder}/val"
            ], check=True)
            print("Keras U-Net predictions generated.")
    else:
        print(f"Warning: Model file not found at {KERAS_MODEL_PATH}")
        unet_keras = None

    # Load YOLOv8-seg
    print("Loading YOLOv8-seg (Ultralytics)...")
    if os.path.exists(YOLO_MODEL_PATH):
        try:
            from ultralytics import YOLO
            yolo_model = YOLO(YOLO_MODEL_PATH)
            print("YOLOv8-seg loaded.")
        except Exception as e:
            print(f"Error loading YOLOv8-seg: {e}")
            yolo_model = None
    else:
        print(f"Warning: Model file not found at {YOLO_MODEL_PATH}")
        yolo_model = None

    num_samples = len(selected_files)
    fig, axes = plt.subplots(num_samples, 6, figsize=(22, 3.8 * num_samples))

    if num_samples == 1:
        axes = np.expand_dims(axes, axis=0)

    headers = [
        "Original Image",
        "Ground Truth Overlay",
        "U-Net (PyTorch) Overlay",
        "U-Net (Keras) Overlay",
        "ResNet34-UNet Overlay",
        "YOLOv8-seg Overlay"
    ]

    for col_idx, text in enumerate(headers):
        axes[0, col_idx].set_title(text, fontsize=14, pad=10, weight='bold')

    print("\nRunning inference and generating visualizations...")
    for idx, fname in enumerate(selected_files):
        img_path = os.path.join(VAL_IMAGES_DIR, fname)

        mask_path = os.path.join(VAL_MASKS_DIR, fname)
        if not os.path.exists(mask_path):
            name_only, _ = os.path.splitext(fname)
            mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.png")
            if not os.path.exists(mask_path):
                mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.bmp")

        img_tensor, raw_img_256 = preprocess_pytorch(img_path, IMAGE_SIZE, device)

        gt_mask_pil = Image.open(mask_path).convert("L")
        gt_mask_256 = np.array(gt_mask_pil.resize(IMAGE_SIZE, Image.NEAREST))
        if NUM_CLASSES == 3:
            gt_mask_256[gt_mask_256 == 3] = 1

        if unet_pytorch is not None:
            unet_py_mask = predict_pytorch(unet_pytorch, img_tensor)
        else:
            unet_py_mask = np.zeros(IMAGE_SIZE, dtype=np.uint8)

        if resnet_unet is not None:
            resnet_mask = predict_pytorch(resnet_unet, img_tensor)
        else:
            resnet_mask = np.zeros(IMAGE_SIZE, dtype=np.uint8)

        if unet_keras is not None:
            unet_keras_mask = load_keras_prediction_mask(fname, IMAGE_SIZE)
        else:
            unet_keras_mask = np.zeros(IMAGE_SIZE, dtype=np.uint8)

        if yolo_model is not None:
            yolo_mask = get_yolo_predictions_as_mask(yolo_model, img_path, IMAGE_SIZE)
        else:
            yolo_mask = np.zeros(IMAGE_SIZE, dtype=np.uint8)

        gt_overlay = create_overlay(raw_img_256, gt_mask_256)
        unet_py_overlay = create_overlay(raw_img_256, unet_py_mask)
        unet_keras_overlay = create_overlay(raw_img_256, unet_keras_mask)
        resnet_overlay = create_overlay(raw_img_256, resnet_mask)
        yolo_overlay = create_overlay(raw_img_256, yolo_mask)

        axes[idx, 0].imshow(raw_img_256)
        axes[idx, 0].set_ylabel(f"Sample {idx+1}\n{fname[:15]}...", fontsize=12, weight='bold')
        axes[idx, 0].axis('on')
        axes[idx, 0].set_xticks([])
        axes[idx, 0].set_yticks([])

        axes[idx, 1].imshow(gt_overlay)
        axes[idx, 1].axis('off')

        axes[idx, 2].imshow(unet_py_overlay)
        axes[idx, 2].axis('off')

        axes[idx, 3].imshow(unet_keras_overlay)
        axes[idx, 3].axis('off')

        axes[idx, 4].imshow(resnet_overlay)
        axes[idx, 4].axis('off')

        axes[idx, 5].imshow(yolo_overlay)
        axes[idx, 5].axis('off')

        fig_ind, axes_ind = plt.subplots(1, 6, figsize=(20, 4))
        axes_ind[0].imshow(raw_img_256)
        axes_ind[0].set_title("Original Image", weight='bold')
        axes_ind[0].axis('off')

        axes_ind[1].imshow(gt_overlay)
        axes_ind[1].set_title("Ground Truth", weight='bold')
        axes_ind[1].axis('off')

        axes_ind[2].imshow(unet_py_overlay)
        axes_ind[2].set_title("U-Net (PyTorch)", weight='bold')
        axes_ind[2].axis('off')

        axes_ind[3].imshow(unet_keras_overlay)
        axes_ind[3].set_title("U-Net (Keras)", weight='bold')
        axes_ind[3].axis('off')

        axes_ind[4].imshow(resnet_overlay)
        axes_ind[4].set_title("ResNet34-UNet", weight='bold')
        axes_ind[4].axis('off')

        axes_ind[5].imshow(yolo_overlay)
        axes_ind[5].set_title("YOLOv8-seg", weight='bold')
        axes_ind[5].axis('off')

        plt.tight_layout()
        ind_save_path = os.path.join(OUTPUT_DIR, f"comparison_sample_{idx+1}.png")
        plt.savefig(ind_save_path, dpi=180, bbox_inches='tight')
        plt.close(fig_ind)
        print(f" Saved individual comparison {idx+1}/{num_samples} to: {ind_save_path}")

    plt.tight_layout()
    grid_save_path = os.path.join(OUTPUT_DIR, "all_models_visual_comparison.png")
    plt.savefig(grid_save_path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"\nSaved combined comparison grid to: {grid_save_path}")


if __name__ == "__main__":
    main()
