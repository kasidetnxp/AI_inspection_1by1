import os
import cv2
import numpy as np
import torch

MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

def process_single_image(image_path, model, device, output_dir=None):
    img = cv2.imread(image_path)
    if img is None:
        return {"pads": [], "probemarks": [], "grains": []}

    h_orig, w_orig = img.shape[:2]
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_resized = cv2.resize(img_rgb, (256, 256))
    img_norm = (img_resized.astype(np.float32) / 255.0 - MEAN) / STD
    tensor = torch.from_numpy(img_norm.transpose(2, 0, 1)).unsqueeze(0).to(device)

    with torch.no_grad():
        logits = model(tensor)
        pred_mask = torch.argmax(logits, dim=1).squeeze(0).cpu().numpy().astype(np.uint8)

    pred_mask_orig = cv2.resize(pred_mask, (w_orig, h_orig), interpolation=cv2.INTER_NEAREST)

    pads, probemarks, grains = [], [], []
    n_classes = logits.shape[1]

    for cls_id in range(1, n_classes):
        if cls_id == 1:  # Pad (combines Pad + Probemark + Grain if solid pad)
            c_mask = ((pred_mask_orig == 1) | (pred_mask_orig == 2) | (pred_mask_orig == 3)).astype(np.uint8) if n_classes > 3 else ((pred_mask_orig == 1) | (pred_mask_orig == 2)).astype(np.uint8)
            contours, _ = cv2.findContours(c_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                if cv2.contourArea(c) > 50:
                    pads.append(cv2.convexHull(c).astype(np.int32))
        elif cls_id == 2:  # Probemark
            c_mask = (pred_mask_orig == 2).astype(np.uint8)
            contours, _ = cv2.findContours(c_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                probemarks.append(c.astype(np.int32))
        elif cls_id == 3:  # Grain / Contamination
            c_mask = (pred_mask_orig == 3).astype(np.uint8)
            contours, _ = cv2.findContours(c_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                grains.append(c.astype(np.int32))

    return {
        "pads": pads,
        "probemarks": probemarks,
        "grains": grains
    }
