import os
import sys
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from ultralytics import YOLO
from src.yolo_seg.inspection import run_inspection

def train_model(model_path, data_yaml_path, epochs=200):
    """
    Loads a YOLO model and trains it using the given dataset configuration yaml file.
    """
    if not os.path.exists(model_path):
        print(f"⚠️ Warning: Model weights path '{model_path}' not found. Ultralytics will auto-download/initialize if possible.")
        
    if not os.path.exists(data_yaml_path):
        print(f"❌ Error: YAML config path '{data_yaml_path}' not found.")
        return
        
    print(f"🚀 Training model: {model_path}")
    print(f"📅 Data configuration: {data_yaml_path}")
    print(f"⏱️ Epochs: {epochs}")
    
    # Resolve project path to be inside the active workspace (runs/segment)
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    project_path = os.path.join(project_root, "runs/segment")
    
    model = YOLO(model_path)
    results = model.train(
        data=data_yaml_path,
        epochs=epochs,
        imgsz=640,
        batch=16,
        device=0,
        patience=0,
        optimizer='auto',
        cos_lr=True,
        lr0=0.001,
        lrf=0.001,
        close_mosaic=15,
        flipud=0.5,
        fliplr=0.5,
        degrees=0.0,
        copy_paste=0.15,
        mosaic=1.0,
        project=project_path
    )
    print("✅ Model training process has finished.")
    
    # --- Auto Export YOLO results to models folder ---
    try:
        import shutil
        from src.utils.config import CLASSES
        
        save_dir = None
        if hasattr(results, 'save_dir'):
            save_dir = results.save_dir
        elif hasattr(model, 'trainer') and hasattr(model.trainer, 'save_dir'):
            save_dir = model.trainer.save_dir
            
        if not save_dir and os.path.exists(project_path):
            subdirs = [os.path.join(project_path, d) for d in os.listdir(project_path) 
                       if os.path.isdir(os.path.join(project_path, d))]
            if subdirs:
                save_dir = max(subdirs, key=os.path.getmtime)
                
        if save_dir and os.path.exists(save_dir):
            print(f"📦 Auto-exporting YOLO weights and history from {save_dir}...")
            class_folder = f"{len(CLASSES)}class"
            weights_dir = os.path.join(project_root, "models", class_folder, "weights")
            history_dir = os.path.join(project_root, "models", class_folder, "history")
            os.makedirs(weights_dir, exist_ok=True)
            os.makedirs(history_dir, exist_ok=True)
            
            # Best weights
            src_best = os.path.join(save_dir, "weights/best.pt")
            dest_best = os.path.join(weights_dir, f"yolov8n_seg_{len(CLASSES)}class.pt")
            if os.path.exists(src_best):
                shutil.copy2(src_best, dest_best)
                print(f"➡️ Copied best weights to {dest_best}")
                
            # Results CSV
            src_csv = os.path.join(save_dir, "results.csv")
            dest_csv = os.path.join(history_dir, f"yolov8n_seg_{len(CLASSES)}class_history.csv")
            if os.path.exists(src_csv):
                shutil.copy2(src_csv, dest_csv)
                print(f"➡️ Copied history CSV to {dest_csv}")
                
            # Results PNG
            src_png = os.path.join(save_dir, "results.png")
            dest_png = os.path.join(history_dir, f"yolov8n_seg_{len(CLASSES)}class_history.png")
            if os.path.exists(src_png):
                shutil.copy2(src_png, dest_png)
                print(f"➡️ Copied history PNG to {dest_png}")
    except Exception as e:
        print(f"Warning: Auto-exporting YOLO results failed: {e}")

def predict_segmentation(
    model_path, source_path, project="outputs/yolo", name="predict_result", conf=0.4,
    pad_width_um=None, warning_distance_um=0.5, warning_occurrence_threshold=1,
    config_path=None, compare_raw=False,
):
    """
    Runs YOLO prediction/inference on a folder or image and outputs txt labels and visualization.
    Then runs inspection with the provided calibration and warning parameters.
    """
    if not os.path.exists(model_path):
        print(f"❌ Error: Model weights file not found at '{model_path}'")
        return
        
    if not os.path.exists(source_path):
        print(f"❌ Error: Inference source path '{source_path}' does not exist.")
        return
 
    # Resolve project to absolute path anchored at the project root
    # This prevents YOLO from creating a nested folder when model_path is inside runs/
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    abs_project = os.path.join(project_root, project)
        
    print(f"🔍 Running inference on source: {source_path}")
    print(f"🤖 Using model weights: {model_path}")
    print(f"🎯 Threshold confidence: {conf}")
    if pad_width_um is not None:
        print(f"📐 Pad width (real): {pad_width_um} um → auto-calibration enabled")
    print(f"⚠️ Warning distance: {warning_distance_um} um | Threshold: {warning_occurrence_threshold} occurrence(s)")
    
    model = YOLO(model_path)
    
    # Override YOLO plotting colors for raw detection masks to be high-contrast:
    # 0 (pad): Orange, 1 (probemark): Cyan, 2 (grain): Hot Pink
    from ultralytics.utils.plotting import colors
    colors.palette[0] = (255, 128, 0)
    colors.palette[1] = (0, 255, 255)
    colors.palette[2] = (255, 0, 255)
 
    results = model.predict(
        source=source_path,
        conf=conf,
        save=True,
        project=abs_project,
        name=name,
        exist_ok=True,
        save_txt=True,
        show_labels=False,
        show_conf=False,
        show_boxes=False
    )
    
    if compare_raw:
        import cv2
        import numpy as np
        print("📊 Creating side-by-side comparisons for raw prediction...")
        for r in results:
            annotated = r.plot(labels=False, conf=False, boxes=False)
            h, w = r.orig_img.shape[:2]
            comparison = np.zeros((h, w * 2, 3), dtype=np.uint8)
            comparison[:, :w] = r.orig_img
            comparison[:, w:] = annotated
            cv2.line(comparison, (w, 0), (w, h), (255, 255, 255), 2)
            out_path = os.path.join(abs_project, name, os.path.basename(r.path))
            cv2.imwrite(out_path, comparison)
    # Convert YOLO Results objects to model-agnostic generic polygons with dynamic name mapping
    import numpy as np
    generic_results = []
    for r in results:
        pads, probemarks, grains = [], [], []
        if r.masks is not None:
            for mask_xy, cls_id in zip(r.masks.xy, r.boxes.cls.tolist()):
                polygon = mask_xy.astype(np.int32)
                # Map using names dict from Ultralytics results to prevent index-shift bugs
                class_name = r.names[int(cls_id)]
                if class_name == "pad":
                    pads.append(polygon)
                elif class_name == "probemark":
                    probemarks.append(polygon)
                elif class_name == "grain":
                    grains.append(polygon)
        
        generic_results.append({
            "image_path": r.path,
            "pads": pads,
            "probemarks": probemarks,
            "grains": grains
        })

    # Run inspection on the generic prediction results and generate visual reports & CSV log
    run_inspection(
        generic_results,
        output_csv_path=os.path.join(abs_project, name, "inspection_report.csv"),
        output_viz_dir=os.path.join(abs_project, name, "inspection_visuals"),
        pad_width_um=pad_width_um,
        warning_distance_um=warning_distance_um,
        warning_occurrence_threshold=warning_occurrence_threshold,
        config_path=config_path,   # YAML rules file (takes priority over direct params)
    )
    
    # Auto-labeling: convert YOLO predictions to LabelMe JSON format and save in original image directory
    if os.path.isdir(source_path):
        output_dir = source_path
    else:
        output_dir = os.path.dirname(os.path.abspath(source_path))
        
    labels_dir = os.path.join(abs_project, name, "labels")
    if os.path.exists(labels_dir):
        print(f"🔄 Auto-labeling: converting predicted labels to LabelMe JSON format inside: {output_dir}")
        from src.utils.converter import yolo_to_labelme
        yolo_to_labelme(source_path, labels_dir, output_dir, only_labeled=True)
        
    print(f"✅ Inference finished. Output saved to {os.path.join(abs_project, name)}")
    return results

