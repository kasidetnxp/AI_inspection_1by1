#!/usr/bin/env python3
"""
Semiconductor Wafer Defect Segmentation Pipeline — Main Menu.

Run via: ./run.sh  (handles venv + CUDA setup)
"""
import os
import sys
import subprocess
import importlib
import yaml

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Add project root to path for src imports
if SCRIPT_DIR not in sys.path:
    sys.path.append(SCRIPT_DIR)

from src.utils.config import (
    PROJECT_ROOT, CLASSES, NUM_CLASSES,
    get_path, MODEL_PATHS, TRAINING,
    interactive_select_paths,
)
from src.utils.converter import yolo_to_labelme, labelme_to_yolo
from src.utils.dataset_split import split_dataset
from src.yolo_seg.model import train_model, predict_segmentation


def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_header():
    print("""
========================================================================
       🔬 SEMICONDUCTOR WAFER DEFECT SEGMENTATION PIPELINE
========================================================================""")


def run_script(script_path, *args):
    """Run a Python script as a subprocess."""
    full_path = os.path.join(SCRIPT_DIR, script_path)
    if not os.path.exists(full_path):
        print(f"\033[91m❌ Error: Script not found at {script_path}\033[0m")
        input("\nPress Enter to return to menu...")
        return

    script_dir = os.path.dirname(full_path)
    cmd = [sys.executable, full_path] + list(args)
    print(f"⏳ Running: {' '.join(cmd)}\n")
    try:
        subprocess.run(cmd, check=True, cwd=script_dir)
    except subprocess.CalledProcessError as e:
        print(f"\n\033[91m❌ Script exited with an error (code {e.returncode})\033[0m")
    except KeyboardInterrupt:
        print("\n\033[93m⚠️ Process interrupted by user.\033[0m")
    input("\nPress Enter to return to menu...")


def show_dataset_tools():
    default_raw = "data/1_raw"
    default_processed = "data/3_processed_yolo"

    while True:
        clear_screen()
        print_header()
        print("""[1] DATASET & LABELS TOOLS / เครื่องมือจัดการชุดข้อมูลและแผ่นป้ายกำกับ
------------------------------------------------------------------------
  1. Convert YOLO TXT -> LabelMe JSON (แปลงฉลาก YOLO เป็น LabelMe)
  2. Convert LabelMe JSON -> YOLO TXT (แปลงฉลาก LabelMe เป็น YOLO)
  3. Split Raw Dataset (Train/Val) (แบ่งชุดข้อมูลเป็น Train/Val)
  4. Back to Main Menu (กลับเมนูหลัก)
------------------------------------------------------------------------""")
        choice = input("Select an option (1-4): ").strip()
        if choice == '1':
            print("\n--- [YOLO TXT -> LabelMe JSON] ---")
            img_dir = input(f"Raw Images folder [{default_raw}]: ").strip() or default_raw
            lbl_dir = input(f"YOLO TXT Labels folder [{default_raw}]: ").strip() or default_raw
            out_dir = input(f"Output JSON folder [{default_raw}]: ").strip() or default_raw
            yolo_to_labelme(img_dir, lbl_dir, out_dir, CLASSES)
            input("\nPress Enter to return to menu...")
        elif choice == '2':
            print("\n--- [LabelMe JSON -> YOLO TXT] ---")
            json_dir = input(f"LabelMe JSON folder [{default_raw}]: ").strip() or default_raw
            out_dir = input(f"Output YOLO TXT folder [{default_raw}]: ").strip() or default_raw
            labelme_to_yolo(json_dir, out_dir, CLASSES)
            input("\nPress Enter to return to menu...")
        elif choice == '3':
            print("\n--- [Split Raw Dataset (Train/Val)] ---")
            img_dir = input(f"Source Images folder [{default_raw}]: ").strip() or default_raw
            lbl_dir = input(f"Source Labels folder [{default_raw}]: ").strip() or default_raw
            out_dir = input(f"Output processed dataset [{default_processed}]: ").strip() or default_processed
            ratio_str = input("Train ratio (0.0 to 1.0) [0.8]: ").strip()
            train_ratio = float(ratio_str) if ratio_str else 0.8
            split_dataset(img_dir, lbl_dir, out_dir, train_ratio)
            input("\nPress Enter to return to menu...")
        elif choice == '4':
            break


def show_unet_tools():
    while True:
        clear_screen()
        print_header()
        print("""[2] STANDARD U-NET TOOLS / โมเดล Standard U-Net (PyTorch & Keras)
------------------------------------------------------------------------
  1. Train Standard U-Net (PyTorch) (เริ่มเทรนโมเดล PyTorch U-Net)
  2. Train Standard U-Net (Keras/TF) (เริ่มเทรนโมเดล Keras U-Net)
  3. Predict using Standard U-Net (PyTorch) (ทำนายผลภาพใหม่ด้วย PyTorch U-Net)
  4. Predict using Standard U-Net (Keras) (ทำนายผลภาพใหม่ด้วย Keras U-Net)
  5. Back to Main Menu (กลับเมนูหลัก)
------------------------------------------------------------------------""")
        choice = input("Select an option (1-5): ").strip()
        if choice == '1':
            run_script("src/unet/train.py")
        elif choice == '2':
            run_script("src/unet/train_keras.py")
        elif choice == '3':
            run_script("src/unet/predict.py")
        elif choice == '4':
            run_script("src/unet/predict_keras.py")
        elif choice == '5':
            break


def show_resnet_tools():
    while True:
        clear_screen()
        print_header()
        print("""[3] RESNET-UNet (PRETRAINED BACKBONE) / โมเดล ResNet-34 U-Net
------------------------------------------------------------------------
  1. Train ResNet-UNet (เทรนโมเดล ResNet34-UNet)
  2. Predict using ResNet-UNet (ทำนายผลภาพใหม่ด้วย ResNet34-UNet)
  3. Back to Main Menu (กลับเมนูหลัก)
------------------------------------------------------------------------""")
        choice = input("Select an option (1-3): ").strip()
        if choice == '1':
            run_script("src/resnet_unet/train_resnet.py")
        elif choice == '2':
            run_script("src/resnet_unet/predict_resnet.py")
        elif choice == '3':
            break


def show_yolo_tools():
    default_config = "configs/data_seg.yaml"
    default_pretrain = get_path("yolo_pretrained", "models")
    best_pt = get_path("yolo_best", "models")
    default_weights = best_pt if os.path.exists(best_pt) else default_pretrain
    default_source = "data/test"
    default_rules = "configs/inspection_rules.yaml"

    while True:
        clear_screen()
        print_header()
        print("""[4] YOLOv8-seg & INSPECTION / โมเดล YOLOv8 และกฎการตรวจสอบทางกายภาพ
------------------------------------------------------------------------
  1. Train YOLOv8-seg (เริ่มเทรนโมเดล YOLOv8 Segmentation)
  2. Run Wafer Inspection (Predict & Apply rules: Edge Dist, Area Ratio, ROI)
     (ทำนายผลพร้อมประเมินผลตามกฎตรวจวัดจริง: ระยะห่างเข็ม, อัตราส่วนพื้นที่, ขอบภาพ)
  3. Back to Main Menu (กลับเมนูหลัก)
------------------------------------------------------------------------""")
        choice = input("Select an option (1-3): ").strip()
        if choice == '1':
            print("\n--- [Train YOLO Segmentation Model] ---")
            model_path = input(f"Model weights path [{default_weights}]: ").strip() or default_weights
            config_path = input(f"Data config yaml [{default_config}]: ").strip() or default_config
            epochs_str = input("Number of epochs [200]: ").strip()
            epochs = int(epochs_str) if epochs_str else 200
            train_model(model_path, config_path, epochs)
            input("\nPress Enter to return to menu...")
        elif choice == '2':
            print("\n--- [Run Wafer Inspection (Predict)] ---")
            model_path = input(f"Model weights path [{default_weights}]: ").strip() or default_weights
            source_path, name = interactive_select_paths("yolo", default_source)
            if not os.path.exists(source_path):
                print(f"Error: Path '{source_path}' does not exist.")
                input("\nPress Enter to return to menu...")
                continue
            config_input = input(f"Inspection config yaml [{default_rules}]: ").strip()
            config_path = config_input if config_input else default_rules
            compare_input = input("Compare raw mask with original side-by-side? (y/n) [n]: ").strip().lower()
            compare_raw = compare_input in ('y', 'yes')

            predict_segmentation(
                model_path, source_path, name=name,
                config_path=config_path,
                compare_raw=compare_raw
            )
            input("\nPress Enter to return to menu...")
        elif choice == '3':
            break


def show_evaluation_tools():
    while True:
        clear_screen()
        print_header()
        print("""[5] ACCURACY EVALUATION & COMPARISON / วัดคะแนนความแม่นยำและการเปรียบเทียบ
------------------------------------------------------------------------
  1. Visual Comparison of All Models (เปรียบเทียบภาพผลลัพธ์ทุกโมเดลแบบภาพพล็อต)
  2. Compare Metrics of All Models (เปรียบเทียบความแม่นยำ mIoU, F1 ทุกโมเดล)
  3. Analyze Data Scaling Trend / Learning Curve (Standard U-Net)
     (จำลองแนวโน้มและวิเคราะห์ปริมาณภาพที่ต้องการเทรน U-Net)
  4. Analyze Data Scaling Trend / Learning Curve (ResNet34-UNet)
     (จำลองแนวโน้มและวิเคราะห์ปริมาณภาพที่ต้องการเทรน ResNet-UNet)
  5. Back to Main Menu (กลับเมนูหลัก)
------------------------------------------------------------------------""")
        choice = input("Select an option (1-5): ").strip()
        if choice == '1':
            run_script("src/evaluation/compare_all_visual.py")
        elif choice == '2':
            run_script("src/evaluation/compare_all_metrics.py")
        elif choice == '3':
            run_script("src/unet/learning_curve.py")
        elif choice == '4':
            run_script("src/resnet_unet/learning_curve_resnet.py")
        elif choice == '5':
            break


def reload_config_globals():
    global CLASSES, NUM_CLASSES, MODEL_PATHS
    import src.utils.config
    importlib.reload(src.utils.config)
    CLASSES = src.utils.config.CLASSES
    NUM_CLASSES = src.utils.config.NUM_CLASSES
    MODEL_PATHS = src.utils.config.MODEL_PATHS


def sync_data_seg(cfg):
    data_seg_path = os.path.join(PROJECT_ROOT, "configs/data_seg.yaml")
    if not os.path.exists(data_seg_path):
        return
    try:
        with open(data_seg_path, "r") as f:
            data_seg = yaml.safe_load(f)
        
        active_classes = [c for c in cfg.get("classes", []) if c.get("enabled", True)]
        new_names = {}
        for idx, c in enumerate(active_classes):
            new_names[idx] = c["name"]
            
        data_seg["names"] = new_names
        with open(data_seg_path, "w") as f:
            yaml.safe_dump(data_seg, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        print(f"Warning: Could not sync configs/data_seg.yaml: {e}")


def select_model_file(active_count, model_key):
    class_folder = f"{active_count}class"

    mapping = {
        "unet": (f"models/{class_folder}/weights", [".pth"]),
        "unet_keras": (f"models/{class_folder}/weights", [".keras"]),
        "resnet_unet": (f"models/{class_folder}/weights", [".pth"]),
        "yolo_pretrained": ("models/pretrained", [".pt"]),
        "yolo_best": (f"models/{class_folder}/weights", [".pt"])
    }

    rel_dir, exts = mapping.get(model_key, ("models", [".pth", ".keras", ".pt"]))
    abs_dir = os.path.join(PROJECT_ROOT, rel_dir)

    if not os.path.exists(abs_dir):
        print(f"\n\033[91m❌ Folder does not exist: {rel_dir}\033[0m")
        input("\nPress Enter to continue...")
        return None

    files = sorted([f for f in os.listdir(abs_dir)
                    if any(f.lower().endswith(ext) for ext in exts)])

    if not files:
        print(f"\n\033[93m⚠ No matching files found in {rel_dir}\033[0m")
        input("\nPress Enter to continue...")
        return None

    while True:
        clear_screen()
        print_header()
        print(f"\033[94mSelect Weights File for {model_key} in {rel_dir}:\033[0m")
        print("-" * 72)
        for idx, f in enumerate(files):
            print(f"  [{idx + 1}] {f}")
        print("-" * 72)

        val = input(f"Select file (1-{len(files)}) or Enter to cancel: ").strip()
        if not val:
            return None
        if val.isdigit():
            idx = int(val) - 1
            if 0 <= idx < len(files):
                return os.path.join(rel_dir, files[idx])
    return None


def show_config_menu():
    config_path = os.path.join(PROJECT_ROOT, "configs/project.yaml")

    # Load initial state from file
    class_states = {}
    model_states = {}
    try:
        with open(config_path, "r") as f:
            cfg = yaml.safe_load(f)
        for c in cfg.get("classes", []):
            class_states[c["name"]] = c.get("enabled", True)
        for k, v in cfg.get("models", {}).items():
            model_states[k] = v
    except Exception as e:
        print(f"Error loading initial config: {e}")
        input("\nPress Enter to continue...")
        return

    while True:
        # Load configs from file to capture external changes
        try:
            with open(config_path, "r") as f:
                cfg = yaml.safe_load(f)
        except Exception as e:
            print(f"Error reloading config: {e}")
            input("\nPress Enter to continue...")
            break

        # Override cfg values with our dynamic state
        for c in cfg.get("classes", []):
            if c["name"] in class_states:
                c["enabled"] = class_states[c["name"]]

        # Automatically update model paths based on the active class count
        active_count = sum(1 for v in class_states.values() if v)
        class_folder = f"{active_count}class"
        
        model_states["unet"] = f"models/{class_folder}/weights/unet_pytorch_{active_count}class.pth"
        model_states["unet_keras"] = f"models/{class_folder}/weights/unet_keras_{active_count}class.keras"
        model_states["resnet_unet"] = f"models/{class_folder}/weights/resnet34_unet_{active_count}class.pth"
        model_states["yolo_best"] = f"models/{class_folder}/weights/yolov8n_seg_{active_count}class.pt"

        if "models" not in cfg:
            cfg["models"] = {}
        for k, v in model_states.items():
            cfg["models"][k] = v

        clear_screen()
        print_header()
        print("""[0] PIPELINE CONFIGURATION / ตั้งค่าคลาสใช้งานและไฟล์โมเดล
------------------------------------------------------------------------""")

        # Active classes configuration (checkbox-style)
        print("\033[1m1. Active Classes (Checkbox) / ตั้งค่าการใช้งานคลาส:\033[0m")
        classes = cfg.get("classes", [])
        for idx, c in enumerate(classes):
            status = "[X]" if c.get("enabled", True) else "[ ]"
            # Highlight pad and probemark as locked (always enabled)
            suffix = " (Locked)" if c["name"] in ["pad", "probemark"] else ""
            print(f"   [{idx + 1}] {status} {c['name']} (ID: {c['id']}){suffix}")
        print()

        # Active model weight file selector
        print("\033[1m2. Active Model Weights (Auto-resolved) / โมเดลที่ใช้งาน (เลือกให้อัตโนมัติ):\033[0m")
        models = cfg.get("models", {})
        model_keys = ["unet", "unet_keras", "resnet_unet", "yolo_pretrained", "yolo_best"]
        model_labels = {
            "unet": "PyTorch U-Net Checkpoint",
            "unet_keras": "Keras U-Net Checkpoint",
            "resnet_unet": "PyTorch ResNet-UNet Checkpoint",
            "yolo_pretrained": "YOLOv8-seg Pretrained Base",
            "yolo_best": "YOLOv8-seg Best Weights"
        }
        for idx, key in enumerate(model_keys):
            path = models.get(key, "Not set")
            label = model_labels.get(key, key)
            if key == "yolo_pretrained":
                print(f"   [4] {label} (Option 4 to change manually):")
                print(f"       -> {path}")
            else:
                print(f"       {label}:")
                print(f"       -> {path}")
        print()

        print("""------------------------------------------------------------------------
  [S] Save & Sync configs (บันทึกและซิงค์การตั้งค่า)
  [C] Discard & Exit (ยกเลิกและย้อนกลับ)
------------------------------------------------------------------------""")

        choice = input("Enter option to toggle/change (1-4 or S/C): ").strip().lower()

        if choice == 'c':
            break
        elif choice == 's':
            try:
                with open(config_path, "w") as f:
                    yaml.safe_dump(cfg, f, default_flow_style=False, sort_keys=False)
                sync_data_seg(cfg)
                reload_config_globals()
                print("\n\033[92m✔ Configuration saved and synced successfully!\033[0m")
            except Exception as e:
                print(f"Error saving config: {e}")
            input("\nPress Enter to return to main menu...")
            break

        elif choice.isdigit():
            val = int(choice)
            if 1 <= val <= len(classes):
                target_class = classes[val - 1]
                name = target_class["name"]
                if name in ["pad", "probemark"]:
                    print(f"\n\033[93m⚠ Class '{name}' is required for Wafer Inspection and cannot be disabled!\033[0m")
                    input("\nPress Enter to continue...")
                else:
                    class_states[name] = not class_states.get(name, True)
            elif val == 4:
                new_file = select_model_file(active_count, "yolo_pretrained")
                if new_file is not None:
                    model_states["yolo_pretrained"] = new_file


def main():
    while True:
        clear_screen()
        print_header()
        print(f"  Classes: {CLASSES} | NUM_CLASSES: {NUM_CLASSES}")
        print("""\033[1mMAIN MENU / เมนูควบคุมหลัก
------------------------------------------------------------------------\033[0m
  0. Wafer Pipeline Configuration (ตั้งค่าคลาสใช้งาน และ เลือกโมเดลที่ใช้งาน)
  1. Dataset & Annotations Tools (จัดการภาพป้ายกำกับ JSON/TXT, เปลี่ยนชื่อคลาส)
  2. Run U-Net Models (Standard PyTorch / Keras) (เทรน/ทำนาย U-Net)
  3. Run ResNet-UNet (Pretrained Backbone) (เทรน/ทำนาย ResNet-UNet)
  4. Run YOLOv8-seg & Inspection Rules (เทรน YOLO / รันกฎเกณฑ์ตรวจวัดแผ่น)
  5. Accuracy Evaluation & Comparison (วัดและพล็อตกราฟเปรียบเทียบ IoU)
  6. Exit (ออกจากโปรแกรม)
------------------------------------------------------------------------""")
        choice = input("Select a category (0-6): ").strip()
        if choice == '0':
            show_config_menu()
        elif choice == '1':
            show_dataset_tools()
        elif choice == '2':
            show_unet_tools()
        elif choice == '3':
            show_resnet_tools()
        elif choice == '4':
            show_yolo_tools()
        elif choice == '5':
            show_evaluation_tools()
        elif choice == '6':
            print("\nExiting pipeline tool. Good luck with your model training!\n")
            break


if __name__ == "__main__":
    main()
