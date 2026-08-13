"""Standard U-Net training script (PyTorch)."""
import os
import sys
import json

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm

# Add project root to path for config imports
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.utils.config import (
    NUM_CLASSES, IMAGE_SIZE, EPOCHS, BATCH_SIZE, LEARNING_RATE, get_path, CLASSES,
)
from src.utils.metrics import (
    calculate_pixel_accuracy, calculate_miou, calculate_class_weights,
)
from model import UNet
from dataset import SegmentationDataset

# Paths
DATA_TRAIN_IMG = os.path.join(get_path("processed_unet"), "train/images")
DATA_TRAIN_MSK = os.path.join(get_path("processed_unet"), "train/masks")
DATA_VAL_IMG   = os.path.join(get_path("processed_unet"), "val/images")
DATA_VAL_MSK   = os.path.join(get_path("processed_unet"), "val/masks")

class_folder = f"{len(CLASSES)}class"
CHECKPOINT_DIR  = os.path.join(PROJECT_ROOT, "models", class_folder, "weights")
HISTORY_DIR     = os.path.join(PROJECT_ROOT, "models", class_folder, "history")
MODEL_SAVE_PATH = os.path.join(CHECKPOINT_DIR, f"unet_pytorch_{len(CLASSES)}class.pth")


def train_one_epoch(model, dataloader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    running_acc = 0.0

    for images, masks in tqdm(dataloader, desc="Training", leave=False):
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, masks)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        running_acc += calculate_pixel_accuracy(outputs, masks) * images.size(0)

    epoch_loss = running_loss / len(dataloader.dataset)
    epoch_acc = running_acc / len(dataloader.dataset)
    return epoch_loss, epoch_acc


def validate(model, dataloader, criterion, device):
    model.eval()
    running_loss = 0.0
    running_acc = 0.0
    running_miou = 0.0

    with torch.no_grad():
        for images, masks in tqdm(dataloader, desc="Validation", leave=False):
            images = images.to(device)
            masks = masks.to(device)

            outputs = model(images)
            loss = criterion(outputs, masks)

            running_loss += loss.item() * images.size(0)
            running_acc += calculate_pixel_accuracy(outputs, masks) * images.size(0)
            running_miou += calculate_miou(outputs, masks, NUM_CLASSES) * images.size(0)

    val_loss = running_loss / len(dataloader.dataset)
    val_acc = running_acc / len(dataloader.dataset)
    val_miou = running_miou / len(dataloader.dataset)
    return val_loss, val_acc, val_miou


def main(epochs=EPOCHS, resume=True):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)

    # --- Auto Convert JSON Labels if present ---
    try:
        from json_to_mask import batch_convert

        train_json_dir = os.path.join(get_path("processed_unet"), "train/json_labels")
        val_json_dir   = os.path.join(get_path("processed_unet"), "val/json_labels")

        if os.path.exists(train_json_dir) and any(f.endswith('.json') for f in os.listdir(train_json_dir)):
            print("\n--- Auto-converting JSON labels to masks (train) ---")
            batch_convert(train_json_dir, DATA_TRAIN_MSK, DATA_TRAIN_IMG)

        if os.path.exists(val_json_dir) and any(f.endswith('.json') for f in os.listdir(val_json_dir)):
            print("\n--- Auto-converting JSON labels to masks (val) ---")
            batch_convert(val_json_dir, DATA_VAL_MSK, DATA_VAL_IMG)
    except Exception as e:
        print(f"Note: Auto JSON conversion skipped: {e}")

    # --- Datasets ---
    if not (os.path.exists(DATA_TRAIN_IMG) and os.listdir(DATA_TRAIN_IMG)):
        print(f"Warning: Training directory '{DATA_TRAIN_IMG}' is empty or missing.")
        return

    train_dataset = SegmentationDataset(DATA_TRAIN_IMG, DATA_TRAIN_MSK, image_size=IMAGE_SIZE, is_train=True)
    val_dataset   = SegmentationDataset(DATA_VAL_IMG, DATA_VAL_MSK, image_size=IMAGE_SIZE, is_train=False)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader   = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    # --- Model, Loss, Optimizer ---
    model = UNet(n_channels=3, n_classes=NUM_CLASSES).to(device)

    class_weights = calculate_class_weights(DATA_TRAIN_MSK, num_classes=NUM_CLASSES)
    if class_weights is not None:
        print(f"Applying Class Weights: {class_weights}")
        criterion = nn.CrossEntropyLoss(weight=torch.FloatTensor(class_weights).to(device))
    else:
        criterion = nn.CrossEntropyLoss()

    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

    best_val_loss = float('inf')
    train_losses, val_losses = [], []
    train_accs, val_accs = [], []
    val_mious = []
    history_json_path = os.path.join(HISTORY_DIR, f"unet_pytorch_{len(CLASSES)}class_history.json")

    # Resume from checkpoint (YOLO-style: load weights, reset epochs)
    if resume and os.path.exists(MODEL_SAVE_PATH):
        print(f"Loading pretrained weights from {MODEL_SAVE_PATH}...")
        checkpoint = torch.load(MODEL_SAVE_PATH, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        prev_miou = checkpoint.get('val_miou')
        print(f"✅ Loaded weights (prev epoch {checkpoint.get('epoch', '?')})")
        if prev_miou is not None:
            print(f"   Previous best val mIoU: {prev_miou*100:.2f}%")
        print(f"🔄 Starting fresh {epochs}-epoch run with these weights")
    else:
        print("Starting training from scratch...")

    print("\n--- Starting Training ---")
    for epoch in range(1, epochs + 1):
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc, val_miou = validate(model, val_loader, criterion, device)

        train_losses.append(train_loss)
        val_losses.append(val_loss)
        train_accs.append(train_acc)
        val_accs.append(val_acc)
        val_mious.append(val_miou)

        print(f"Epoch {epoch:02d}/{epochs:02d} | "
              f"Train Loss: {train_loss:.4f} - Acc: {train_acc*100:.2f}% | "
              f"Val Loss: {val_loss:.4f} - Acc: {val_acc*100:.2f}% - mIoU: {val_miou*100:.2f}%")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'val_loss': val_loss,
                'val_miou': val_miou,
            }, MODEL_SAVE_PATH)
            print(f"--> Saved best model to: {MODEL_SAVE_PATH}")

        # Save history JSON every epoch
        try:
            with open(history_json_path, 'w') as f:
                json.dump({
                    'epoch': list(range(1, epoch + 1)),
                    'train_losses': train_losses,
                    'val_losses': val_losses,
                    'train_accs': train_accs,
                    'val_accs': val_accs,
                    'val_mious': val_mious,
                }, f, indent=4)
        except Exception as e:
            print(f"Warning: Could not save history JSON: {e}")

    # ponytail: plotting removed — learning_curve.py reads JSON history and does it better
    print("Training Complete!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--resume", action="store_true", default=True)
    parser.add_argument("--scratch", action="store_true", help="Force training from scratch")
    args = parser.parse_args()

    main(args.epochs, resume=args.resume and not args.scratch)
