import os
import sys
import subprocess

# Auto re-execute using virtual environment python and setup LD_LIBRARY_PATH for GPU support
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
VENV_PYTHON = os.path.join(PROJECT_ROOT, ".venv/bin/python")

site_packages = os.path.join(PROJECT_ROOT, ".venv/lib/python3.12/site-packages")
has_nvidia_libs = False
if "LD_LIBRARY_PATH" in os.environ:
    has_nvidia_libs = "site-packages/nvidia" in os.environ["LD_LIBRARY_PATH"]

if os.path.exists(VENV_PYTHON) and (os.path.abspath(sys.executable) != os.path.abspath(VENV_PYTHON) or not has_nvidia_libs):
    env = os.environ.copy()
    if os.path.exists(site_packages):
        nvidia_dirs = []
        nvidia_root = os.path.join(site_packages, "nvidia")
        if os.path.exists(nvidia_root):
            for sub in os.listdir(nvidia_root):
                lib_path = os.path.join(nvidia_root, sub, "lib")
                if os.path.exists(lib_path) and lib_path not in nvidia_dirs:
                    nvidia_dirs.append(lib_path)
        for name in os.listdir(site_packages):
            if name.startswith("nvidia"):
                lib_path = os.path.join(site_packages, name, "lib")
                if os.path.exists(lib_path) and lib_path not in nvidia_dirs:
                    nvidia_dirs.append(lib_path)
        if nvidia_dirs:
            existing = env.get("LD_LIBRARY_PATH", "")
            env["LD_LIBRARY_PATH"] = ":".join(nvidia_dirs) + (":" + existing if existing else "")
    
    result = subprocess.run([VENV_PYTHON] + sys.argv, env=env)
    sys.exit(result.returncode)

import numpy as np
import tensorflow as tf
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        pass
from tensorflow.keras.callbacks import ModelCheckpoint
import matplotlib.pyplot as plt
from PIL import Image

from model_keras import unet

# Resolve paths relative to the project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))

if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.utils.config import (
    NUM_CLASSES, IMAGE_SIZE, EPOCHS, BATCH_SIZE, LEARNING_RATE, get_path, CLASSES,
)

DATA_TRAIN_IMG = os.path.join(get_path("processed_unet"), "train/images")
DATA_TRAIN_MSK = os.path.join(get_path("processed_unet"), "train/masks")
DATA_VAL_IMG = os.path.join(get_path("processed_unet"), "val/images")
DATA_VAL_MSK = os.path.join(get_path("processed_unet"), "val/masks")

class_folder = f"{len(CLASSES)}class"
CHECKPOINT_DIR = os.path.join(PROJECT_ROOT, "models", class_folder, "weights")
HISTORY_DIR = os.path.join(PROJECT_ROOT, "models", class_folder, "history")
MODEL_SAVE_PATH = os.path.join(CHECKPOINT_DIR, f"unet_keras_{len(CLASSES)}class.keras")

class KerasSegmentationDataset(tf.keras.utils.Sequence):
    """
    Custom Dataset generator for Keras to match PyTorch's preprocessing exactly.
    """
    def __init__(self, images_dir, masks_dir, batch_size=4, image_size=(256, 256), shuffle=True):
        self.images_dir = images_dir
        self.masks_dir = masks_dir
        self.batch_size = batch_size
        self.image_size = image_size
        self.shuffle = shuffle
        
        self.images = sorted(os.listdir(images_dir))
        self.masks = sorted(os.listdir(masks_dir))
        
        assert len(self.images) == len(self.masks), f"Mismatch between images and masks: {len(self.images)} vs {len(self.masks)}"
        
        self.indices = np.arange(len(self.images))
        if self.shuffle:
            np.random.shuffle(self.indices)

    def __len__(self):
        return int(np.ceil(len(self.images) / self.batch_size))

    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)

    def __getitem__(self, idx):
        batch_indices = self.indices[idx * self.batch_size : min((idx + 1) * self.batch_size, len(self.images))]
        
        batch_images = []
        batch_masks = []
        
        # ImageNet normalization stats (matching PyTorch's TF.normalize)
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        
        for i in batch_indices:
            img_path = os.path.join(self.images_dir, self.images[i])
            mask_path = os.path.join(self.masks_dir, self.masks[i])
            
            # Load images
            image = Image.open(img_path).convert("RGB")
            mask = Image.open(mask_path).convert("L")
            
            # Resize
            # Image uses BILINEAR, Mask uses NEAREST
            image = image.resize(self.image_size, Image.BILINEAR)
            mask = mask.resize(self.image_size, Image.NEAREST)
            
            # Normalize image to [0.0, 1.0] and apply standard mean/std normalization
            image_np = np.array(image, dtype=np.float32) / 255.0
            image_np = (image_np - mean) / std
            
            # Mask is integer class labels (0, 1, 2, 3)
            mask_np = np.array(mask, dtype=np.int32)
            
            batch_images.append(image_np)
            batch_masks.append(mask_np)
            
        return np.array(batch_images), np.array(batch_masks)

def calculate_class_weights(masks_dir, num_classes=4, sample_size=100):
    """
    Calculate class weights dynamically from a subset of dataset masks to handle class imbalance.
    """
    import random
    from PIL import Image
    print("Calculating class weights from dataset subset...")
    mask_files = [f for f in os.listdir(masks_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
    if not mask_files:
        return None
    if len(mask_files) > sample_size:
        random.seed(42)
        mask_files = random.sample(mask_files, sample_size)

    class_counts = np.zeros(num_classes)
    for fname in mask_files:
        mask_path = os.path.join(masks_dir, fname)
        mask = np.array(Image.open(mask_path).convert("L"))
        for c in range(num_classes):
            class_counts[c] += (mask == c).sum()

    total_pixels = class_counts.sum()
    if total_pixels == 0:
        return None

    # Inverse frequency weighting
    weights = total_pixels / (num_classes * (class_counts + 1e-6))

    # Clip weights to a sensible range (0.2 to 5.0) to prevent minority classes from blowing up gradients
    weights = np.clip(weights, 0.2, 5.0)

    # Normalize so they sum to num_classes
    weights = weights / weights.sum() * num_classes
    return weights

def main():
    # Ensure checkpoint directory exists
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)
    
    # --- Auto Convert JSON Labels if present ---
    try:
        from json_to_mask import batch_convert
        
        train_json_dir = os.path.join(PROJECT_ROOT, "data/2_processed_unet/train/json_labels")
        val_json_dir = os.path.join(PROJECT_ROOT, "data/2_processed_unet/val/json_labels")
        
        if os.path.exists(train_json_dir) and any(f.endswith('.json') for f in os.listdir(train_json_dir)):
            print("\n--- Found JSON labels in training set. Automatically converting to masks... ---")
            batch_convert(train_json_dir, DATA_TRAIN_MSK, DATA_TRAIN_IMG)
            
        if os.path.exists(val_json_dir) and any(f.endswith('.json') for f in os.listdir(val_json_dir)):
            print("\n--- Found JSON labels in validation set. Automatically converting to masks... ---")
            batch_convert(val_json_dir, DATA_VAL_MSK, DATA_VAL_IMG)
    except Exception as e:
        print(f"Note: Auto JSON conversion skipped or encountered an issue: {e}")
    # -------------------------------------------

    # Verify directories exist and are not empty
    if not (os.path.exists(DATA_TRAIN_IMG) and os.listdir(DATA_TRAIN_IMG)):
        print(f"Warning: Training directory '{DATA_TRAIN_IMG}' is empty or does not exist.")
        print("Please place your images in 'data/' folder before running.")
        return

    # 1. Prepare Data Generators
    train_generator = KerasSegmentationDataset(
        DATA_TRAIN_IMG, DATA_TRAIN_MSK, batch_size=BATCH_SIZE, image_size=IMAGE_SIZE, shuffle=True
    )
    val_generator = KerasSegmentationDataset(
        DATA_VAL_IMG, DATA_VAL_MSK, batch_size=BATCH_SIZE, image_size=IMAGE_SIZE, shuffle=False
    )
    
    # Calculate class weights dynamically to handle class imbalance
    class_weights = calculate_class_weights(DATA_TRAIN_MSK, num_classes=NUM_CLASSES, sample_size=100)
    
    # 2. Build Keras Model
    print(f"\nInitializing Keras U-Net Model (Input size: {IMAGE_SIZE}, Classes: {NUM_CLASSES})...")
    model = unet(input_size=(IMAGE_SIZE[0], IMAGE_SIZE[1], 3), num_classes=NUM_CLASSES, class_weights=class_weights)
    
    # 3. Callbacks
    checkpoint_callback = ModelCheckpoint(
        filepath=MODEL_SAVE_PATH,
        monitor='val_loss',
        save_best_only=True,
        verbose=1,
        mode='min'
    )
    
    # 4. Training
    print(f"\n--- Starting Keras U-Net Training ({EPOCHS} Epochs) ---")
    history = model.fit(
        train_generator,
        validation_data=val_generator,
        epochs=EPOCHS,
        callbacks=[checkpoint_callback],
        verbose=1
    )
    
    # 5. Plot training history
    plt.figure(figsize=(12, 5))
    
    # Plot Loss
    plt.subplot(1, 2, 1)
    plt.plot(history.history['loss'], label='Train Loss')
    plt.plot(history.history['val_loss'], label='Val Loss')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Keras: Training and Validation Loss')
    plt.legend()
    
    # Plot Accuracy & mIoU
    plt.subplot(1, 2, 2)
    plt.plot(history.history['accuracy'], label='Train Acc')
    plt.plot(history.history['val_accuracy'], label='Val Acc')
    if 'mean_iou' in history.history:
        plt.plot(history.history['mean_iou'], label='Train mIoU', linestyle='--')
    if 'val_mean_iou' in history.history:
        plt.plot(history.history['val_mean_iou'], label='Val mIoU', linestyle='--')
    plt.xlabel('Epoch')
    plt.ylabel('Metric')
    plt.title('Keras: Training and Validation Accuracy & mIoU')
    plt.legend()
    
    plt.tight_layout()
    plot_path = os.path.join(HISTORY_DIR, f"unet_keras_{len(CLASSES)}class_history.png")
    plt.savefig(plot_path)
    print(f"\nTraining history plot saved to: {plot_path}")
    
    # Save training history JSON
    history_json_path = os.path.join(HISTORY_DIR, f"unet_keras_{len(CLASSES)}class_history.json")
    try:
        import json
        with open(history_json_path, 'w') as f:
            json.dump({
                'epoch': list(range(1, len(history.history['loss']) + 1)),
                'train_losses': [float(x) for x in history.history['loss']],
                'val_losses': [float(x) for x in history.history['val_loss']],
                'train_accs': [float(x) for x in history.history['accuracy']],
                'val_accs': [float(x) for x in history.history['val_accuracy']],
                'val_mious': [float(x) for x in history.history.get('val_mean_iou', [0.0] * len(history.history['loss']))]
            }, f, indent=4)
        print(f"Training history JSON saved to: {history_json_path}")
    except Exception as e:
        print(f"Warning: Could not save Keras history JSON: {e}")
        
    print("Keras Training Complete!")

if __name__ == "__main__":
    main()
