"""Standard U-Net prediction script (Keras/TF)."""
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import tensorflow as tf
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        pass
from PIL import Image
import numpy as np
import matplotlib.pyplot as plt
import cv2
import json

from src.utils.config import NUM_CLASSES, COLOR_MAP, ID_TO_LABEL, IMAGE_SIZE, get_path, interactive_select_paths
MODEL_PATH = get_path("unet_keras", "models")


def preprocess_image(image_path, image_size):
    """Load and preprocess the input image for Keras."""
    image = Image.open(image_path).convert("RGB")
    orig_size = image.size

    image_resized = image.resize(image_size, Image.BILINEAR)
    img_arr = np.array(image_resized, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img_arr = (img_arr - mean) / std
    img_arr = np.expand_dims(img_arr, axis=0)
    return img_arr, image, orig_size


def decode_mask_to_rgb(mask_np):
    """Convert class ID map to RGB mask image using unified YOLO colors."""
    h, w = mask_np.shape
    rgb_mask = np.zeros((h, w, 3), dtype=np.uint8)
    unified_colors = {
        0: [0, 0, 0],         # Background
        1: [255, 128, 0],     # Pad: Orange (RGB)
        2: [0, 255, 255],     # Probemark: Cyan (RGB)
        3: [255, 0, 255]      # Grain: Hot Pink (RGB)
    }
    for class_id, color in unified_colors.items():
        rgb_mask[mask_np == class_id] = color
    return rgb_mask


def predict(image_path, model):
    """Predict segmentation mask for a single image using Keras."""
    img_arr, original_pil, orig_size = preprocess_image(image_path, IMAGE_SIZE)

    pred = model.predict(img_arr, verbose=0)[0]
    prediction_mask = np.argmax(pred, axis=-1).astype(np.uint8)

    predicted_rgb_mask = decode_mask_to_rgb(prediction_mask)
    predicted_mask_pil = Image.fromarray(predicted_rgb_mask)
    predicted_mask_pil = predicted_mask_pil.resize(orig_size, resample=Image.NEAREST)

    prediction_mask_resized = Image.fromarray(prediction_mask)
    prediction_mask_resized = prediction_mask_resized.resize(orig_size, resample=Image.NEAREST)
    prediction_mask_orig = np.array(prediction_mask_resized)

    return original_pil, predicted_mask_pil, prediction_mask_orig


def save_comparison_plot(original_pil, predicted_mask_pil, filename, output_dir):
    """Save side-by-side comparison."""
    plt.figure(figsize=(10, 5))

    plt.subplot(1, 2, 1)
    plt.imshow(original_pil)
    plt.title("Original Image")
    plt.axis("off")

    plt.subplot(1, 2, 2)
    plt.imshow(predicted_mask_pil)
    plt.title("Predicted Mask (Keras U-Net)")
    plt.axis("off")

    plt.tight_layout()
    plot_path = os.path.join(output_dir, filename)
    plt.savefig(plot_path)
    plt.close()
    print(f"Saved side-by-side comparison to: {plot_path}")


def create_selective_overlay(original_pil, mask_pil, alpha=0.45):
    """Overlay mask on original image (background stays unchanged)."""
    original_np = np.array(original_pil.convert("RGB"))
    mask_np = np.array(mask_pil.convert("RGB"))

    non_bg_mask = np.any(mask_np != 0, axis=-1)
    overlay = original_np.copy()
    overlay[non_bg_mask] = (original_np[non_bg_mask] * (1 - alpha) + mask_np[non_bg_mask] * alpha).astype(np.uint8)
    return Image.fromarray(overlay)


def save_prediction_as_json(prediction_mask_orig, image_path, output_json_path):
    """Convert prediction mask to LabelMe JSON format."""
    shapes = []
    h, w = prediction_mask_orig.shape

    # Extract binary masks for each class
    masks = {}
    for class_id, label in ID_TO_LABEL.items():
        masks[label] = (prediction_mask_orig == class_id).astype(np.uint8) * 255

    # Merge pad mask with probemark and grain to make it solid (so pad doesn't have holes)
    if "pad" in masks:
        solid_pad = masks["pad"].copy()
        if "probemark" in masks:
            solid_pad = cv2.bitwise_or(solid_pad, masks["probemark"])
        if "grain" in masks:
            solid_pad = cv2.bitwise_or(solid_pad, masks["grain"])
        masks["pad"] = solid_pad

    # Find contours and export shapes
    for label, class_mask in masks.items():
        if np.sum(class_mask) == 0:
            continue
            
        contours, _ = cv2.findContours(class_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.002 * perimeter, True)

            if len(approx) >= 3:
                points = [[float(pt[0][0]), float(pt[0][1])] for pt in approx]
                shapes.append({
                    "label": label,
                    "points": points,
                    "group_id": None,
                    "shape_type": "polygon",
                    "flags": {},
                })

    labelme_data = {
        "version": "5.0.1",
        "flags": {},
        "shapes": shapes,
        "imagePath": os.path.basename(image_path),
        "imageData": None,
        "imageHeight": h,
        "imageWidth": w,
    }

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(labelme_data, f, ensure_ascii=False, indent=2)


def process_single_image(image_path, model, output_dir):
    """Process a single image: predict, save mask, overlay, comparison, JSON, and return generic polygons."""
    if not os.path.exists(image_path):
        print(f"Error: Target image file '{image_path}' does not exist.")
        return None

    print(f"Running inference on: {image_path}")
    original_pil, predicted_mask_pil, prediction_mask_orig = predict(image_path, model)

    base_name = os.path.basename(image_path)
    name, _ = os.path.splitext(base_name)

    mask_save_path = os.path.join(output_dir, f"{name}_mask.png")
    predicted_mask_pil.save(mask_save_path)
    print(f"Saved predicted RGB mask to: {mask_save_path}")

    overlay_pil = create_selective_overlay(original_pil, predicted_mask_pil, alpha=0.45)
    overlay_save_path = os.path.join(output_dir, f"{name}_overlay.png")
    overlay_pil.save(overlay_save_path)
    print(f"Saved blended overlay to: {overlay_save_path}")

    save_comparison_plot(original_pil, predicted_mask_pil, f"{name}_comparison.png", output_dir)

    image_dir = os.path.dirname(os.path.abspath(image_path))
    json_save_path = os.path.join(image_dir, f"{name}.json")
    save_prediction_as_json(prediction_mask_orig, image_path, json_save_path)
    print(f"Saved LabelMe JSON to: {json_save_path}")

    # Extract polygons for generic inspection format
    pads, probemarks, grains = [], [], []
    for class_id, label in ID_TO_LABEL.items():
        class_mask = (prediction_mask_orig == class_id).astype(np.uint8) * 255
        contours, _ = cv2.findContours(class_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            polygon = contour.astype(np.int32)
            if label == "pad":
                pads.append(polygon)
            elif label == "probemark":
                probemarks.append(polygon)
            elif label == "grain":
                grains.append(polygon)

    return {
        "image_path": image_path,
        "pads": pads,
        "probemarks": probemarks,
        "grains": grains
    }


def main(input_path, out_subfolder=None):
    if out_subfolder is None:
        if os.path.isdir(input_path):
            subfolder_name = os.path.basename(os.path.abspath(input_path))
        else:
            subfolder_name = os.path.basename(os.path.dirname(os.path.abspath(input_path)))
        if not subfolder_name:
            subfolder_name = "predict_result"
    else:
        subfolder_name = out_subfolder

    run_output_dir = os.path.join(PROJECT_ROOT, "outputs/unet_keras", subfolder_name)
    os.makedirs(run_output_dir, exist_ok=True)
    print(f"All outputs will be saved to: {run_output_dir}")

    if not os.path.exists(MODEL_PATH):
        print(f"Error: Keras model not found at '{MODEL_PATH}'.")
        print("Please train the model first.")
        return

    print(f"Loading Keras model from {MODEL_PATH}...")
    model = tf.keras.models.load_model(MODEL_PATH, compile=False)
    print("Model loaded successfully.")

    generic_results = []
    if os.path.isdir(input_path):
        valid_extensions = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
        images = [os.path.join(input_path, f) for f in os.listdir(input_path)
                  if f.lower().endswith(valid_extensions)]
        if not images:
            print(f"No valid images found in '{input_path}'.")
            return
        print(f"Found {len(images)} images. Starting batch prediction...")
        for img_path in images:
            res = process_single_image(img_path, model, run_output_dir)
            if res is not None:
                generic_results.append(res)
            print("-" * 30)
        print("Batch prediction complete!")
    else:
        res = process_single_image(input_path, model, run_output_dir)
        if res is not None:
            generic_results.append(res)

    # Run inspection on the collected generic results
    if generic_results:
        from src.yolo_seg.inspection import run_inspection
        rules_path = os.path.join(PROJECT_ROOT, "configs/inspection_rules.yaml")
        run_inspection(
            generic_results,
            output_csv_path=os.path.join(run_output_dir, "inspection_report.csv"),
            output_viz_dir=os.path.join(run_output_dir, "inspection_visuals"),
            config_path=rules_path
        )


if __name__ == "__main__":
    if len(sys.argv) < 2:
        default_dir = get_path("test", "data")
        target_path, out_subfolder = interactive_select_paths("unet_keras", default_dir)
        if os.path.exists(target_path):
            main(target_path, out_subfolder)
        else:
            print(f"Error: Path '{target_path}' does not exist.")
    else:
        out_sub = sys.argv[2] if len(sys.argv) > 2 else None
        main(sys.argv[1], out_sub)
