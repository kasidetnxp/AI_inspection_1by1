"""ResNet34-UNet training script."""
import os
import sys
import json

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from tqdm import tqdm

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.utils.config import NUM_CLASSES, IMAGE_SIZE, BATCH_SIZE, LEARNING_RATE, get_path, CLASSES
from src.utils.metrics import calculate_pixel_accuracy, calculate_miou, calculate_class_weights
from model_resnet import ResNet34UNet
from dataset import SegmentationDataset

EPOCHS = 150  # ResNet uses fewer epochs than standard UNet

DATA_TRAIN_IMG = os.path.join(get_path("processed_unet"), "train/images")
DATA_TRAIN_MSK = os.path.join(get_path("processed_unet"), "train/masks")
DATA_VAL_IMG   = os.path.join(get_path("processed_unet"), "val/images")
DATA_VAL_MSK   = os.path.join(get_path("processed_unet"), "val/masks")

class_folder = f"{len(CLASSES)}class"
CHECKPOINT_DIR  = os.path.join(PROJECT_ROOT, "models", class_folder, "weights")
HISTORY_DIR     = os.path.join(PROJECT_ROOT, "models", class_folder, "history")
MODEL_SAVE_PATH = os.path.join(CHECKPOINT_DIR, f"resnet34_unet_{len(CLASSES)}class.pth")


def train_one_epoch(model, dataloader, criterion, optimizer, device):
    model.train()
    running_loss = 0.0
    running_acc = 0.0

    for images, masks in tqdm(dataloader, desc="Training ResNet-UNet", leave=False):
        images = images.to(device)
        masks = masks.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, masks)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        running_acc += calculate_pixel_accuracy(outputs, masks) * images.size(0)

    return running_loss / len(dataloader.dataset), running_acc / len(dataloader.dataset)


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

    n = len(dataloader.dataset)
    return running_loss / n, running_acc / n, running_miou / n


def main(epochs=EPOCHS, resume=True):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)

    train_dataset = SegmentationDataset(DATA_TRAIN_IMG, DATA_TRAIN_MSK, image_size=IMAGE_SIZE, is_train=True)
    val_dataset   = SegmentationDataset(DATA_VAL_IMG, DATA_VAL_MSK, image_size=IMAGE_SIZE, is_train=False)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
    val_loader   = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    print("Initializing ResNet34-UNet with pretrained ImageNet weights...")
    model = ResNet34UNet(n_classes=NUM_CLASSES, pretrained=True).to(device)

    class_weights = calculate_class_weights(DATA_TRAIN_MSK, num_classes=NUM_CLASSES)
    if class_weights is not None:
        print(f"Applying Class Weights: {class_weights}")
        criterion = nn.CrossEntropyLoss(weight=torch.FloatTensor(class_weights).to(device))
    else:
        criterion = nn.CrossEntropyLoss()

    optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

    best_val_loss = float('inf')
    start_epoch = 1
    train_losses, val_losses = [], []
    train_accs, val_accs = [], []
    val_mious = []
    history_json_path = os.path.join(HISTORY_DIR, f"resnet34_unet_{len(CLASSES)}class_history.json")

    if resume and os.path.exists(MODEL_SAVE_PATH):
        print(f"Loading checkpoint from {MODEL_SAVE_PATH}...")
        checkpoint = torch.load(MODEL_SAVE_PATH, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        start_epoch = checkpoint['epoch'] + 1
        best_val_loss = checkpoint.get('val_loss', float('inf'))
        print(f"Resuming from Epoch {start_epoch}")

        if os.path.exists(history_json_path):
            try:
                with open(history_json_path, 'r') as f:
                    history = json.load(f)
                limit = checkpoint['epoch']
                train_losses = history['train_losses'][:limit]
                val_losses = history['val_losses'][:limit]
                train_accs = history['train_accs'][:limit]
                val_accs = history['val_accs'][:limit]
                val_mious = history['val_mious'][:limit]
            except Exception as e:
                print(f"Warning: Could not load history: {e}")
    else:
        print("Starting training from scratch...")

    print("\n--- Starting Training ---")
    for epoch in range(start_epoch, epochs + 1):
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
            print(f"--> Saved best ResNet-UNet to: {MODEL_SAVE_PATH}")

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

    # ponytail: plotting removed — learning_curve_resnet.py reads JSON history and does it better
    print("Training Complete!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--resume", action="store_true", default=True)
    parser.add_argument("--scratch", action="store_true", help="Force training from scratch")
    args = parser.parse_args()

    main(args.epochs, resume=args.resume and not args.scratch)
