"""
Shared segmentation metrics.

Used by both unet/train.py and resnet_unet/train_resnet.py.
"""
import os
import numpy as np
import torch


def calculate_pixel_accuracy(outputs, targets):
    """
    Pixel accuracy: fraction of correctly classified pixels.
    outputs: (B, C, H, W)  targets: (B, H, W)
    """
    with torch.no_grad():
        preds = torch.argmax(outputs, dim=1)
        correct = (preds == targets).sum().item()
        total = targets.numel()
        return correct / total


def calculate_miou(outputs, targets, num_classes):
    """Mean Intersection over Union (mIoU)."""
    with torch.no_grad():
        preds = torch.argmax(outputs, dim=1)
        iou_list = []
        for c in range(num_classes):
            pred_c = (preds == c)
            target_c = (targets == c)
            intersection = torch.logical_and(pred_c, target_c).sum().item()
            union = torch.logical_or(pred_c, target_c).sum().item()
            if union > 0:
                iou_list.append(intersection / union)
            else:
                iou_list.append(float('nan'))
        return np.nanmean(iou_list)


def calculate_class_weights(masks_dir, num_classes, sample_size=100):
    """
    Inverse-frequency class weights from a sample of masks.
    Returns numpy array of shape (num_classes,) or None.
    """
    import random
    from PIL import Image

    print("Calculating class weights from dataset subset...")
    mask_files = [f for f in os.listdir(masks_dir)
                  if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
    if not mask_files:
        return None
    if len(mask_files) > sample_size:
        random.seed(42)
        mask_files = random.sample(mask_files, sample_size)

    class_counts = np.zeros(num_classes)
    for fname in mask_files:
        mask = np.array(Image.open(os.path.join(masks_dir, fname)).convert("L"))
        for c in range(num_classes):
            class_counts[c] += (mask == c).sum()

    total_pixels = class_counts.sum()
    if total_pixels == 0:
        return None

    weights = total_pixels / (num_classes * (class_counts + 1e-6))
    weights = np.clip(weights, 0.2, 5.0)
    weights = weights / weights.sum() * num_classes
    return weights
