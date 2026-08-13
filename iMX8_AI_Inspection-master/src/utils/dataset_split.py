import os
import shutil
import random

def split_dataset(image_folder, label_folder, output_folder, train_ratio=0.8):
    """
    Copies images and labels from raw source folders into train and validation splits,
    avoiding duplicating files that have already been copied.
    """
    folders = [
        "images/train",
        "images/val",
        "labels/train",
        "labels/val"
    ]
    
    # Create output directories if they don't exist
    for f in folders:
        os.makedirs(os.path.join(output_folder, f), exist_ok=True)
        
    if not os.path.exists(image_folder):
        print(f"❌ Source image folder does not exist: {image_folder}")
        return
        
    # Get all BMP images in source
    all_images = [f for f in os.listdir(image_folder) if f.endswith(".bmp")]
    
    # Check what already exists in the destination to avoid duplication
    existing_train = set(os.listdir(os.path.join(output_folder, "images/train")))
    existing_val = set(os.listdir(os.path.join(output_folder, "images/val")))
    existing_images = existing_train.union(existing_val)
    
    # Filter for new images
    new_images = [img for img in all_images if img not in existing_images]
    
    print(f"📊 Total source images: {len(all_images)}")
    print(f"📦 Existing in destination dataset: {len(existing_images)}")
    print(f"✨ New images to split: {len(new_images)}")
    
    if len(new_images) > 0:
        random.shuffle(new_images)
        split_idx = int(len(new_images) * train_ratio)
        
        # Ensure we place at least one image in train if there is at least one new image
        if split_idx == 0 and len(new_images) > 0:
            split_idx = 1
            
        train_imgs = new_images[:split_idx]
        val_imgs = new_images[split_idx:]
        
        def process(images_list, split):
            copied_img_count = 0
            copied_txt_count = 0
            for img_file in images_list:
                name = os.path.splitext(img_file)[0]
                
                img_src = os.path.join(image_folder, img_file)
                txt_src = os.path.join(label_folder, name + ".txt")
                
                img_dst = os.path.join(output_folder, f"images/{split}", img_file)
                txt_dst = os.path.join(output_folder, f"labels/{split}", name + ".txt")
                
                # Copy image
                if os.path.exists(img_src):
                    shutil.copy(img_src, img_dst)
                    copied_img_count += 1
                    
                # Copy label
                if os.path.exists(txt_src):
                    shutil.copy(txt_src, txt_dst)
                    copied_txt_count += 1
                else:
                    print(f"⚠️ Warning: Missing label for {img_file}")
            return copied_img_count, copied_txt_count
            
        train_img_c, train_txt_c = process(train_imgs, "train")
        val_img_c, val_txt_c = process(val_imgs, "val")
        
        print(f"✅ Split completed successfully!")
        print(f"   - Train split: +{train_img_c} images, +{train_txt_c} labels")
        print(f"   - Val split: +{val_img_c} images, +{val_txt_c} labels")
    else:
        print("ℹ️ No new images to split and organize.")
