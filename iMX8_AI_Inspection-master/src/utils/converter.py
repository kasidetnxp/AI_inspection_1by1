import os
import json
import cv2

def yolo_to_labelme(images_dir, labels_dir, output_dir, classes=['pad', 'probemark', 'grain'], only_labeled=False):
    """
    Converts YOLO segmentation text files to LabelMe JSON format.
    images_dir can be a directory path or a single image file path.
    """
    os.makedirs(output_dir, exist_ok=True)
    count = 0
    
    if not os.path.exists(images_dir):
        print(f"❌ Images path does not exist: {images_dir}")
        return
        
    if os.path.isfile(images_dir):
        img_files = [os.path.basename(images_dir)]
        real_images_dir = os.path.dirname(os.path.abspath(images_dir))
    else:
        img_files = os.listdir(images_dir)
        real_images_dir = images_dir
        
    for img_name in img_files:
        if not img_name.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
            continue
            
        img_path = os.path.join(real_images_dir, img_name)
        txt_name = os.path.splitext(img_name)[0] + '.txt'
        txt_path = os.path.join(labels_dir, txt_name)
        
        if only_labeled and not os.path.exists(txt_path):
            continue
            
        # Read image to get width and height
        img = cv2.imread(img_path)
        if img is None:
            print(f"⚠️ Could not read image: {img_path}")
            continue
        img_height, img_width = img.shape[:2]
        
        shapes = []
        seen_shapes = set()
        
        if os.path.exists(txt_path):
            with open(txt_path, 'r', encoding='utf-8') as f:
                for line in f.readlines():
                    data = line.strip().split()
                    if len(data) >= 5:
                        class_id = int(data[0])
                        if class_id >= len(classes):
                            print(f"⚠️ Warning: class_id {class_id} in {txt_name} is out of bounds for classes list.")
                            continue
                        coords = data[1:]
                        
                        points = []
                        for i in range(0, len(coords), 2):
                            x = float(coords[i]) * img_width
                            y = float(coords[i+1]) * img_height
                            points.append([x, y])
                        
                        # Deduplicate shapes
                        points_tuple = tuple((round(pt[0], 4), round(pt[1], 4)) for pt in points)
                        shape_key = (classes[class_id], points_tuple)
                        if shape_key in seen_shapes:
                            continue
                        seen_shapes.add(shape_key)
                        
                        shape = {
                            "label": classes[class_id],
                            "points": points,
                            "group_id": None,
                            "shape_type": "polygon",
                            "flags": {}
                        }
                        shapes.append(shape)
                        
        labelme_data = {
            "version": "5.0.1",
            "flags": {},
            "shapes": shapes,
            "imagePath": img_name,
            "imageData": None,
            "imageHeight": img_height,
            "imageWidth": img_width
        }
        
        json_name = os.path.splitext(img_name)[0] + '.json'
        json_path = os.path.join(output_dir, json_name)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(labelme_data, f, ensure_ascii=False, indent=2)
        count += 1
        
    print(f"✅ Converted {count} files to LabelMe JSON format inside {output_dir}")

def labelme_to_yolo(json_dir, output_txt_dir, classes=['pad', 'probemark', 'grain']):
    """
    Converts LabelMe JSON format to YOLO segmentation text files.
    """
    os.makedirs(output_txt_dir, exist_ok=True)
    count = 0
    
    if not os.path.exists(json_dir):
        print(f"❌ JSON directory does not exist: {json_dir}")
        return
        
    for json_name in os.listdir(json_dir):
        if not json_name.endswith('.json'):
            continue
            
        json_path = os.path.join(json_dir, json_name)
        txt_name = json_name.replace('.json', '.txt')
        txt_path = os.path.join(output_txt_dir, txt_name)
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        img_width = data.get('imageWidth')
        img_height = data.get('imageHeight')
        
        if not img_width or not img_height:
            print(f"⚠️ Warning: Missing dimensions in {json_name}. Skipping.")
            continue
            
        with open(txt_path, 'w', encoding='utf-8') as out:
            for shape in data.get('shapes', []):
                label = shape.get('label')
                if label not in classes:
                    continue
                
                class_id = classes.index(label)
                points = shape.get('points', [])
                if len(points) < 3:
                    continue  # Skip lines/points to prevent mixed detect-segment dataset errors in YOLOv8
                
                normalized_points = []
                for point in points:
                    x_norm = point[0] / img_width
                    y_norm = point[1] / img_height
                    normalized_points.extend([f"{x_norm:.6f}", f"{y_norm:.6f}"])
                
                line = f"{class_id} " + " ".join(normalized_points)
                out.write(line + '\n')
            count += 1
            
    print(f"✅ Converted {count} LabelMe JSON files to YOLO TXT format inside {output_txt_dir}")
