import os
import random
from PIL import Image
import numpy as np
import torch
from torch.utils.data import Dataset
import torchvision.transforms.functional as TF
from tqdm import tqdm

class SegmentationDataset(Dataset):
    """
    Custom Dataset for Multi-class Image Segmentation with selective RAM Preloading.
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

        # Preload datasets in RAM ONLY for validation/testing to keep them fast,
        # but load on-the-fly for training to allow random online data augmentation per epoch.
        self.preloaded_images = []
        self.preloaded_masks = []
        
        if not self.is_train:
            print(f"Preloading dataset from {images_dir} into RAM...")
            for idx in tqdm(range(len(self.images)), desc="Preloading Dataset"):
                img_path = os.path.join(self.images_dir, self.images[idx])
                mask_path = os.path.join(self.masks_dir, self.masks[idx])
                
                # Load and convert image & mask
                image = Image.open(img_path).convert("RGB")
                mask = Image.open(mask_path).convert("L")
                
                # Resize image and mask
                image = TF.resize(image, self.image_size, interpolation=TF.InterpolationMode.BILINEAR)
                mask = TF.resize(mask, self.image_size, interpolation=TF.InterpolationMode.NEAREST)
                
                # Transform to Tensors
                image_tensor = TF.to_tensor(image)
                image_tensor = TF.normalize(image_tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
                
                mask_np = np.array(mask, dtype=np.int64)
                mask_tensor = torch.from_numpy(mask_np).long()
                
                self.preloaded_images.append(image_tensor)
                self.preloaded_masks.append(mask_tensor)

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        if not self.is_train:
            return self.preloaded_images[idx], self.preloaded_masks[idx]
            
        # For training: Load from disk on-the-fly and apply random online augmentations
        img_path = os.path.join(self.images_dir, self.images[idx])
        mask_path = os.path.join(self.masks_dir, self.masks[idx])
        
        image = Image.open(img_path).convert("RGB")
        mask = Image.open(mask_path).convert("L")
        
        image = TF.resize(image, self.image_size, interpolation=TF.InterpolationMode.BILINEAR)
        mask = TF.resize(mask, self.image_size, interpolation=TF.InterpolationMode.NEAREST)
        
        image_tensor = TF.to_tensor(image)
        
        mask_np = np.array(mask, dtype=np.int64)
        mask_tensor = torch.from_numpy(mask_np).long()
        
        # Online data augmentations
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

        image_tensor = TF.normalize(image_tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])

        return image_tensor, mask_tensor
