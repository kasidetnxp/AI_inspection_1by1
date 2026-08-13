import os
import random
from PIL import Image
import numpy as np
import torch
from torch.utils.data import Dataset
import torchvision.transforms.functional as TF

class SegmentationDataset(Dataset):
    """
    Custom Dataset for Multi-class Image Segmentation.
    Expects directory structure:
        images/ -> containing original images (RGB)
        masks/  -> containing segmentation masks (Grayscale with pixel values: 0, 1, 2, 3)
    """
    def __init__(self, images_dir, masks_dir, image_size=(256, 256), is_train=False):
        self.images_dir = images_dir
        self.masks_dir = masks_dir
        self.image_size = image_size
        self.is_train = is_train
        
        valid_exts = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
        self.images = sorted([f for f in os.listdir(images_dir) if f.lower().endswith(valid_exts)])
        self.masks = sorted([f for f in os.listdir(masks_dir) if f.lower().endswith(valid_exts)])
        
        # Verify matching file counts
        assert len(self.images) == len(self.masks), f"Mismatch between images and masks counts: {len(self.images)} vs {len(self.masks)}"

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img_path = os.path.join(self.images_dir, self.images[idx])
        mask_path = os.path.join(self.masks_dir, self.masks[idx])
        
        # Load image (RGB) and mask (Grayscale)
        image = Image.open(img_path).convert("RGB")
        mask = Image.open(mask_path).convert("L") # 'L' mode is 8-bit grayscale
        
        # Resize image and mask
        # IMPORTANT: Use BILINEAR for image, and NEAREST for mask to avoid creating fake class labels!
        image = TF.resize(image, self.image_size, interpolation=TF.InterpolationMode.BILINEAR)
        mask = TF.resize(mask, self.image_size, interpolation=TF.InterpolationMode.NEAREST)
        
        # Transform to Tensors
        image_tensor = TF.to_tensor(image) # Scales pixels to [0.0, 1.0] and shape (3, H, W)
        
        # Convert mask to numpy array first to keep exact class indices (0, 1, 2, 3)
        mask_np = np.array(mask, dtype=np.int64)
        mask_tensor = torch.from_numpy(mask_np).long()
        
        # Apply online data augmentations if we are in training mode
        if self.is_train:
            # 1. Random Horizontal Flip
            if random.random() > 0.5:
                image_tensor = TF.hflip(image_tensor)
                mask_tensor = TF.hflip(mask_tensor)
                
            # 2. Random Vertical Flip
            if random.random() > 0.5:
                image_tensor = TF.vflip(image_tensor)
                mask_tensor = TF.vflip(mask_tensor)
                
            # 3. Random Rotation (90, 180, 270 degrees)
            if random.random() > 0.5:
                angle = random.choice([90, 180, 270])
                image_tensor = TF.rotate(image_tensor, angle)
                mask_tensor = TF.rotate(mask_tensor.unsqueeze(0), angle).squeeze(0)
                
            # 4. Random Color Jitter (Brightness, Contrast, Saturation)
            if random.random() > 0.5:
                image_tensor = TF.adjust_brightness(image_tensor, random.uniform(0.8, 1.2))
                image_tensor = TF.adjust_contrast(image_tensor, random.uniform(0.8, 1.2))
                image_tensor = TF.adjust_saturation(image_tensor, random.uniform(0.8, 1.2))

        # Optional Normalization for image (standard ImageNet normalization)
        image_tensor = TF.normalize(image_tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])

        return image_tensor, mask_tensor
