"""Convert LabelMe JSON annotations to grayscale mask images."""
import os
import sys
import json
import numpy as np
from PIL import Image, ImageDraw

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.utils.config import LABEL_TO_ID


def json_to_mask(json_path, output_mask_path, image_shape=None):
    """
    Convert a single LabelMe JSON file to a grayscale mask image.
    Args:
        json_path: Path to the LabelMe JSON file.
        output_mask_path: Path where the output mask (.png) will be saved.
        image_shape: (height, width). If None, read from JSON.
    """
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if image_shape is not None:
        height, width = image_shape
    else:
        height = data.get("imageHeight")
        width = data.get("imageWidth")
        if height is None or width is None:
            raise ValueError(f"Image dimensions not found in {json_path}.")

    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)

    shapes = data.get("shapes", [])

    # Sort by class ID so smaller details (higher id) are drawn on top
    def get_draw_order(shape):
        label = shape.get("label", "").lower()
        return LABEL_TO_ID.get(label, 0)

    shapes_sorted = sorted(shapes, key=get_draw_order)

    for shape in shapes_sorted:
        label = shape.get("label", "").lower()
        points = shape.get("points")
        shape_type = shape.get("shape_type", "polygon")

        if label not in LABEL_TO_ID:
            print(f"Warning: Label '{label}' in {json_path} not in class map. Skipping.")
            continue

        class_id = LABEL_TO_ID[label]
        flat_points = [coord for pt in points for coord in pt]

        if len(flat_points) < 4:
            continue

        if shape_type in ("polygon", "rectangle"):
            draw.polygon(flat_points, fill=class_id)
        elif shape_type == "circle":
            if len(points) == 2:
                center = points[0]
                edge = points[1]
                radius = np.sqrt((center[0] - edge[0])**2 + (center[1] - edge[1])**2)
                bbox = [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius]
                draw.ellipse(bbox, fill=class_id)
        else:
            print(f"Warning: Unsupported shape type '{shape_type}' in {json_path}. Skipping.")

    mask.save(output_mask_path)


def batch_convert(json_dir, output_dir, image_dir=None):
    """
    Batch convert all JSON files in json_dir to PNG masks in output_dir.
    """
    os.makedirs(output_dir, exist_ok=True)
    json_files = [f for f in os.listdir(json_dir) if f.endswith('.json')]

    if not json_files:
        print(f"No JSON files found in {json_dir}")
        return

    print(f"Found {len(json_files)} JSON files to convert.")
    converted_count = 0

    for filename in json_files:
        json_path = os.path.join(json_dir, filename)
        mask_name = os.path.splitext(filename)[0] + ".png"
        output_mask_path = os.path.join(output_dir, mask_name)

        try:
            image_shape = None
            if image_dir:
                base_name = os.path.splitext(filename)[0]
                matching = [f for f in os.listdir(image_dir) if os.path.splitext(f)[0] == base_name and f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
                if matching:
                    with Image.open(os.path.join(image_dir, matching[0])) as img:
                        image_shape = (img.height, img.width)

            json_to_mask(json_path, output_mask_path, image_shape)
            converted_count += 1
        except Exception as e:
            print(f"Error converting {filename}: {e}")

    print(f"Converted {converted_count}/{len(json_files)} files to '{output_dir}'.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python json_to_mask.py <json_dir> <output_mask_dir> [matching_images_dir]")
    else:
        batch_convert(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
