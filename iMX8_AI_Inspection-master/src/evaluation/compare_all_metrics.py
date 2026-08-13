"""Quantitative Evaluation and Comparison of All Models."""
import os
import sys
import torch
import numpy as np
from PIL import Image
import torchvision.transforms.functional as TF

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from src.unet.model import UNet
from src.resnet_unet.model_resnet import ResNet34UNet
from src.utils.config import (
    CLASSES, NUM_CLASSES, COLOR_MAP, ID_TO_LABEL, IMAGE_SIZE,
    get_path
)

# Configuration
UNET_MODEL_PATH = get_path("unet", "models")
KERAS_MODEL_PATH = get_path("unet_keras", "models")
RESNET_MODEL_PATH = get_path("resnet_unet", "models")
YOLO_MODEL_PATH = get_path("yolo_best", "models")

VAL_IMAGES_DIR = os.path.join(get_path("processed_unet"), "val/images")
VAL_MASKS_DIR = os.path.join(get_path("processed_unet"), "val/masks")
class_folder = f"{len(CLASSES)}class"
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "outputs/evaluation", class_folder)

CLASS_NAMES = {0: "Background"}
for cid, label in ID_TO_LABEL.items():
    CLASS_NAMES[cid] = label.capitalize()


def compute_pixel_confusion_matrix(gt, pred, num_classes):
    mask = (gt >= 0) & (gt < num_classes)
    hist = np.bincount(
        num_classes * gt[mask].astype(int) + pred[mask].astype(int),
        minlength=num_classes ** 2
    ).reshape(num_classes, num_classes)
    return hist


def get_yolo_predictions_as_mask(yolo_model, img_path, image_size):
    import cv2
    h, w = image_size
    unified_mask = np.zeros((h, w), dtype=np.uint8)

    results = yolo_model(img_path, verbose=False)[0]

    if results.masks is not None:
        masks_data = results.masks.data.cpu().numpy()
        classes = results.boxes.cls.cpu().numpy().astype(int)
        confidences = results.boxes.conf.cpu().numpy()

        sorted_indices = np.argsort(confidences)

        for idx in sorted_indices:
            mask = masks_data[idx]
            yolo_class = classes[idx]
            unet_class_id = yolo_class + 1

            if unet_class_id >= NUM_CLASSES:
                continue

            resized_mask = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
            unified_mask[resized_mask > 0.5] = unet_class_id

    return unified_mask


def preprocess_pytorch(img_path, image_size):
    image = Image.open(img_path).convert("RGB")
    image_resized = TF.resize(image, image_size, interpolation=TF.InterpolationMode.BILINEAR)
    image_tensor = TF.to_tensor(image_resized)
    image_tensor = TF.normalize(image_tensor, mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    return image_tensor.unsqueeze(0)


def predict_pytorch(model, img_tensor, device):
    model.eval()
    with torch.no_grad():
        outputs = model(img_tensor.to(device))
        preds = torch.argmax(outputs, dim=1)
        pred_mask = preds.squeeze(0).cpu().numpy()
    return pred_mask


def load_keras_prediction_mask(img_name, image_size):
    class_folder = f"{len(CLASSES)}class"
    keras_mask_path = os.path.join(PROJECT_ROOT, f"outputs/unet_keras/{class_folder}/val", f"{os.path.splitext(img_name)[0]}_mask.png")
    if not os.path.exists(keras_mask_path):
        return np.zeros(image_size, dtype=np.uint8)

    mask_img = Image.open(keras_mask_path).convert("RGB").resize(image_size, Image.NEAREST)
    mask_np = np.array(mask_img)

    mask_2d = np.zeros(image_size, dtype=np.uint8)
    # Map unified colors back to class IDs:
    # pad=1: [255, 128, 0], probemark=2: [0, 255, 255], grain=3: [255, 0, 255]
    mask_2d[np.all(mask_np == [255, 128, 0], axis=-1)] = 1
    mask_2d[np.all(mask_np == [0, 255, 255], axis=-1)] = 2
    mask_2d[np.all(mask_np == [255, 0, 255], axis=-1)] = 3
    return mask_2d


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(VAL_IMAGES_DIR) or not os.listdir(VAL_IMAGES_DIR):
        print(f"Error: Validation directory missing or empty at {VAL_IMAGES_DIR}")
        return

    # Load models
    models = {}

    print("Loading PyTorch U-Net...")
    if os.path.exists(UNET_MODEL_PATH):
        model = UNet(n_channels=3, n_classes=NUM_CLASSES).to(device)
        checkpoint = torch.load(UNET_MODEL_PATH, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        models['unet_pytorch'] = model
        print("PyTorch U-Net loaded.")

    print("Checking Keras U-Net model...")
    if os.path.exists(KERAS_MODEL_PATH):
        models['unet_keras'] = True
        print("Keras U-Net marked for evaluation.")
        keras_val_dir = os.path.join(PROJECT_ROOT, f"outputs/unet_keras/{class_folder}/val")
        
        # Check for prediction cache mismatch (e.g. grain color [255, 0, 255] in 2-class mode)
        if os.path.exists(keras_val_dir) and os.listdir(keras_val_dir):
            sample_files = [os.path.join(keras_val_dir, f) for f in os.listdir(keras_val_dir) if f.endswith('_mask.png')][:5]
            found_grain_in_cache = False
            for fpath in sample_files:
                try:
                    img = Image.open(fpath).convert("RGB")
                    img_np = np.array(img)
                    if np.any(np.all(img_np == [255, 0, 255], axis=-1)):
                        found_grain_in_cache = True
                        break
                except Exception:
                    pass
            
            # If 2class mode (NUM_CLASSES == 3) but found grain, or 3class mode (NUM_CLASSES == 4) but no grain
            if (NUM_CLASSES == 3 and found_grain_in_cache) or (NUM_CLASSES == 4 and not found_grain_in_cache and len(CLASSES) == 3):
                print("\n⚠️ [WARNING] Keras U-Net prediction cache class mismatch detected!")
                print(f"The cached masks in outputs/unet_keras/{class_folder}/val do not match the current {len(CLASSES)}-class config.")
                print("Regenerating the validation masks to ensure accuracy...")
                import shutil
                shutil.rmtree(keras_val_dir, ignore_errors=True)

        if not os.path.exists(keras_val_dir) or not os.listdir(keras_val_dir):
            print("Keras U-Net validation masks not found. Generating them in a subprocess...")
            import subprocess
            subprocess.run([
                sys.executable,
                os.path.join(PROJECT_ROOT, "src/unet/predict_keras.py"),
                VAL_IMAGES_DIR,
                f"{class_folder}/val"
            ], check=True)
            print("Keras U-Net predictions generated.")

    print("Loading ResNet34-UNet...")
    if os.path.exists(RESNET_MODEL_PATH):
        model = ResNet34UNet(n_classes=NUM_CLASSES, pretrained=False).to(device)
        checkpoint = torch.load(RESNET_MODEL_PATH, map_location=device, weights_only=False)
        model.load_state_dict(checkpoint['model_state_dict'])
        models['resnet_unet'] = model
        print("ResNet34-UNet loaded.")

    print("Loading YOLOv8-seg...")
    if os.path.exists(YOLO_MODEL_PATH):
        try:
            from ultralytics import YOLO
            models['yolo'] = YOLO(YOLO_MODEL_PATH)
            print("YOLOv8-seg loaded.")
        except Exception as e:
            print(f"YOLO load error: {e}")

    image_files = sorted([f for f in os.listdir(VAL_IMAGES_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))])
    print(f"Found {len(image_files)} validation images. Starting evaluation...")

    # Initialize confusion matrices
    confusion_matrices = {name: np.zeros((NUM_CLASSES, NUM_CLASSES), dtype=np.int64) for name in models}

    for idx, fname in enumerate(image_files):
        img_path = os.path.join(VAL_IMAGES_DIR, fname)
        mask_path = os.path.join(VAL_MASKS_DIR, fname)

        if not os.path.exists(mask_path):
            name_only, _ = os.path.splitext(fname)
            mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.png")
            if not os.path.exists(mask_path):
                mask_path = os.path.join(VAL_MASKS_DIR, f"{name_only}.bmp")
                if not os.path.exists(mask_path):
                    continue

        gt_mask_256 = np.array(Image.open(mask_path).convert("L").resize(IMAGE_SIZE, Image.NEAREST), dtype=np.int64)
        if NUM_CLASSES == 3:
            gt_mask_256[gt_mask_256 == 3] = 1

        img_tensor = preprocess_pytorch(img_path, IMAGE_SIZE)

        # PyTorch U-Net
        if 'unet_pytorch' in models:
            pred = predict_pytorch(models['unet_pytorch'], img_tensor, device)
            confusion_matrices['unet_pytorch'] += compute_pixel_confusion_matrix(gt_mask_256, pred, NUM_CLASSES)

        # Keras U-Net
        if 'unet_keras' in models:
            pred = load_keras_prediction_mask(fname, IMAGE_SIZE)
            confusion_matrices['unet_keras'] += compute_pixel_confusion_matrix(gt_mask_256, pred, NUM_CLASSES)

        # ResNet34-UNet
        if 'resnet_unet' in models:
            pred = predict_pytorch(models['resnet_unet'], img_tensor, device)
            confusion_matrices['resnet_unet'] += compute_pixel_confusion_matrix(gt_mask_256, pred, NUM_CLASSES)

        # YOLOv8-seg
        if 'yolo' in models:
            pred = get_yolo_predictions_as_mask(models['yolo'], img_path, IMAGE_SIZE)
            confusion_matrices['yolo'] += compute_pixel_confusion_matrix(gt_mask_256, pred, NUM_CLASSES)

        if (idx + 1) % 20 == 0 or (idx + 1) == len(image_files):
            print(f"Evaluated {idx + 1}/{len(image_files)} images...")

    # Calculate metrics from confusion matrices
    model_metrics = {}
    for name, cm in confusion_matrices.items():
        class_iou = {}
        class_prec = {}
        class_rec = {}
        class_f1 = {}

        for c in range(NUM_CLASSES):
            true_pos = cm[c, c]
            actual_pos = cm[c, :].sum()
            pred_pos = cm[:, c].sum()
            union = actual_pos + pred_pos - true_pos

            iou = true_pos / union if union > 0 else 0.0
            rec = true_pos / actual_pos if actual_pos > 0 else 0.0
            prec = true_pos / pred_pos if pred_pos > 0 else 0.0
            f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0.0

            class_iou[c] = iou
            class_prec[c] = prec
            class_rec[c] = rec
            class_f1[c] = f1

        miou = np.mean(list(class_iou.values()))
        mprec = np.mean(list(class_prec.values()))
        mrec = np.mean(list(class_rec.values()))
        mf1 = np.mean(list(class_f1.values()))
        
        # Calculate Global Pixel Accuracy
        total_correct = np.diag(cm).sum()
        total_pixels = cm.sum()
        global_acc = total_correct / total_pixels if total_pixels > 0 else 0.0
        
        model_metrics[name] = {
            'iou': class_iou,
            'precision': class_prec,
            'recall': class_rec,
            'f1': class_f1,
            'miou': miou,
            'mprec': mprec,
            'mrec': mrec,
            'mf1': mf1,
            'global_acc': global_acc
        }

    # Format output text report
    report = [
        "="*85,
        "              COMPREHENSIVE PERFORMANCE EVALUATION REPORT",
        "="*85,
        f"Evaluated on {len(image_files)} validation images.",
        "",
        "="*85,
        "  METRIC DEFINITIONS & INTERPRETATION (คำอธิบายตัวชี้วัดความแม่นยำ)",
        "="*85,
        "1. Global Pixel Accuracy (ความถูกต้องพิกเซลรวม):",
        "   - TH: อัตราส่วนพิกเซลที่ทำนายถูกทั้งหมดต่อพิกเซลทั้งหมดในภาพเฉลย (ไม่แยกคลาส)",
        "         สูตร: Global Acc = True Positives (ทุกคลาสรวมกัน) / Pixels (ทั้งหมด)",
        "   - EN: Overall proportion of correctly classified pixels across the entire validation dataset.",
        "",
        "2. IoU (Intersection over Union) / Jaccard Index:",
        "   - TH: วัดอัตราส่วนพื้นที่ทับซ้อนระหว่างการทำนายของโมเดลกับภาพเฉลยจริง (Ground Truth)",
        "         คิดจาก (พื้นที่ที่ทับซ้อนกัน) หารด้วย (พื้นที่ทั้งหมดที่โมเดลและเฉลยครอบคลุม)",
        "         สูตร: IoU = TP / (TP + FP + FN)",
        "   - EN: Measures the overlap between model predictions and ground truth.",
        "         Calculated as: Overlap Area / Union Area.",
        "",
        "3. Precision (ความแม่นยำในการทำนายคลาสนั้น ๆ):",
        "   - TH: สัดส่วนความถูกต้องเมื่อโมเดลทายพิกเซลว่าเป็นคลาสนั้น ๆ (ทายมาแล้วใช่จริงไหม)",
        "         มีความสำคัญเพื่อลดการทำนายผิดพลาดแบบเสียน้อยเสียยาก (False Positives)",
        "         สูตร: Precision = TP / (TP + FP)",
        "   - EN: Proportion of predicted positive pixels that are actually correct.",
        "",
        "4. Recall (ความสามารถในการตรวจจับพิกเซลของคลาสนั้น ๆ):",
        "   - TH: สัดส่วนการตรวจจับพิกเซลจริงว่าทายมาได้ครบถ้วนแค่ไหน (หาเจอครบไหม)",
        "         มีความสำคัญเพื่อไม่ให้พลาดชิ้นงานเสีย (False Negatives)",
        "         สูตร: Recall = TP / (TP + FN)",
        "   - EN: Proportion of actual positive pixels that were correctly identified.",
        "",
        "5. F1-Score (ค่าเฉลี่ยฮาร์มอนิกของ Precision และ Recall):",
        "   - TH: ค่าเฉลี่ยที่ช่วยปรับสมดุลระหว่าง Precision และ Recall ไม่ให้เอนเอียงไปด้านใดด้านหนึ่ง",
        "         สูตร: F1 = 2 * (Precision * Recall) / (Precision + Recall)",
        "   - EN: The harmonic mean of Precision and Recall, balancing both metrics.",
        "",
        "6. Mean (เฉลี่ย) / Macro-Average:",
        "   - TH: ค่าเฉลี่ยของทุกคลาสมารวมกันอย่างเท่าเทียม (Background, Pad, Probemark, Grain)",
        "   - EN: The average value of the metrics across all evaluated classes.",
        "",
        "="*85,
        "              OVERALL MODEL COMPARISON (AVERAGE %)",
        "="*85,
        f"{'Model Name':<20} | {'Global Acc (%)':<15} | {'mIoU (%)':<10} | {'Mean Prec (%)':<13} | {'Mean Rec (%)':<12} | {'Mean F1 (%)':<12}",
        "-"*83
    ]

    for name in models:
        miou_val = model_metrics[name]['miou'] * 100
        mprec_val = model_metrics[name]['mprec'] * 100
        mrec_val = model_metrics[name]['mrec'] * 100
        mf1_val = model_metrics[name]['mf1'] * 100
        global_acc_val = model_metrics[name]['global_acc'] * 100
        display_name = {
            'unet_pytorch': 'U-Net (PyTorch)',
            'unet_keras': 'U-Net (Keras/TF)',
            'resnet_unet': 'ResNet34-UNet',
            'yolo': 'YOLOv8-seg'
        }.get(name, name)
        report.append(f"{display_name:<20} | {global_acc_val:<15.2f}% | {miou_val:<10.2f}% | {mprec_val:<13.2f}% | {mrec_val:<12.2f}% | {mf1_val:<12.2f}%")

    report.append("="*85)
    report.append("              DETAILED CLASS-LEVEL METRICS")
    report.append("="*85)
    
    headers = f"{'Class Name':<15} |"
    for name in models:
        short_name = {'unet_pytorch': 'U-Net(Py)', 'unet_keras': 'U-Net(Ke)', 'resnet_unet': 'ResNet', 'yolo': 'YOLOv8'}[name]
        headers += f" {short_name:<11} |"
    
    # 1. IoU Table
    report.append("1. IoU (Intersection over Union) Comparison:")
    report.append("-" * len(headers))
    report.append(headers)
    report.append("-" * len(headers))
    for c in range(NUM_CLASSES):
        cname = CLASS_NAMES[c]
        row = f"{cname:<15} |"
        for name in models:
            val = model_metrics[name]['iou'][c] * 100
            row += f" {val:<11.2f}% |"
        report.append(row)
    report.append("-" * len(headers))
    row_mean = f"{'Mean (เฉลี่ย)':<15} |"
    for name in models:
        val = model_metrics[name]['miou'] * 100
        row_mean += f" {val:<11.2f}% |"
    report.append(row_mean)
    report.append("-" * len(headers))
    report.append("")

    # 2. Precision Table
    report.append("2. Precision Comparison:")
    report.append("-" * len(headers))
    report.append(headers)
    report.append("-" * len(headers))
    for c in range(NUM_CLASSES):
        cname = CLASS_NAMES[c]
        row = f"{cname:<15} |"
        for name in models:
            val = model_metrics[name]['precision'][c] * 100
            row += f" {val:<11.2f}% |"
        report.append(row)
    report.append("-" * len(headers))
    row_mean = f"{'Mean (เฉลี่ย)':<15} |"
    for name in models:
        val = model_metrics[name]['mprec'] * 100
        row_mean += f" {val:<11.2f}% |"
    report.append(row_mean)
    report.append("-" * len(headers))
    report.append("")

    # 3. Recall Table
    report.append("3. Recall Comparison:")
    report.append("-" * len(headers))
    report.append(headers)
    report.append("-" * len(headers))
    for c in range(NUM_CLASSES):
        cname = CLASS_NAMES[c]
        row = f"{cname:<15} |"
        for name in models:
            val = model_metrics[name]['recall'][c] * 100
            row += f" {val:<11.2f}% |"
        report.append(row)
    report.append("-" * len(headers))
    row_mean = f"{'Mean (เฉลี่ย)':<15} |"
    for name in models:
        val = model_metrics[name]['mrec'] * 100
        row_mean += f" {val:<11.2f}% |"
    report.append(row_mean)
    report.append("-" * len(headers))
    report.append("")

    # 4. F1-Score Table
    report.append("4. F1-Score Comparison:")
    report.append("-" * len(headers))
    report.append(headers)
    report.append("-" * len(headers))
    for c in range(NUM_CLASSES):
        cname = CLASS_NAMES[c]
        row = f"{cname:<15} |"
        for name in models:
            val = model_metrics[name]['f1'][c] * 100
            row += f" {val:<11.2f}% |"
        report.append(row)
    report.append("-" * len(headers))
    row_mean = f"{'Mean (เฉลี่ย)':<15} |"
    for name in models:
        val = model_metrics[name]['mf1'] * 100
        row_mean += f" {val:<11.2f}% |"
    report.append(row_mean)
    report.append("-" * len(headers))
    report.append("")

    # Confusion Matrix Section
    report.append("="*85)
    report.append("              DETAILED PIXEL CONFUSION MATRICES (RAW COUNT)")
    report.append("="*85)
    for name in models:
        display_name = {
            'unet_pytorch': 'U-Net (PyTorch)',
            'unet_keras': 'U-Net (Keras/TF)',
            'resnet_unet': 'ResNet34-UNet',
            'yolo': 'YOLOv8-seg'
        }.get(name, name)
        cm = confusion_matrices[name]
        
        report.append(f"Model: {display_name}")
        report.append(f"{'True \\ Pred':<15} |" + "".join([f" {CLASS_NAMES[col]:<12} |" for col in range(NUM_CLASSES)]))
        report.append("-" * (18 + 15 * NUM_CLASSES))
        for row_idx in range(NUM_CLASSES):
            row_str = f"{CLASS_NAMES[row_idx]:<15} |"
            for col_idx in range(NUM_CLASSES):
                pixel_val = cm[row_idx, col_idx]
                row_str += f" {pixel_val:<12,d} |"
            report.append(row_str)
        report.append("")

    report.append("="*85)

    report_content = "\n".join(report)
    print("\n" + report_content)

    report_path = os.path.join(OUTPUT_DIR, "all_models_metrics_comparison.txt")
    with open(report_path, "w") as f:
        f.write(report_content)
    print(f"\nSaved metrics comparison report to: {report_path}")

    # Plot Comparison Chart
    import matplotlib.pyplot as plt
    
    names_display = {
        'unet_pytorch': 'U-Net (Py)',
        'unet_keras': 'U-Net (Ke)',
        'resnet_unet': 'ResNet-UNet',
        'yolo': 'YOLOv8-seg'
    }
    
    model_labels = [names_display[name] for name in models]
    mious = [model_metrics[name]['miou'] * 100 for name in models]
    
    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(model_labels, mious, color=['#0078FF', '#34C759', '#5856D6', '#FF9500'], width=0.5)
    ax.set_ylabel('Mean IoU (mIoU %)')
    ax.set_title('Overall Segmentation Accuracy (mIoU %) Comparison')
    ax.set_ylim(0, 110)
    ax.grid(True, linestyle=":", alpha=0.6, axis='y')
    
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{height:.2f}%',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom', weight='bold')
                    
    plt.tight_layout()
    chart_path = os.path.join(OUTPUT_DIR, "all_models_miou_comparison.png")
    plt.savefig(chart_path, dpi=150)
    plt.close()
    print(f"Saved mIoU Comparison Chart to: {chart_path}")

    # Save visual confusion matrix heatmaps
    class_names_list = [CLASS_NAMES[c] for c in range(NUM_CLASSES)]
    for name in models:
        cm = confusion_matrices[name]
        display_name = {
            'unet_pytorch': 'U-Net (PyTorch)',
            'unet_keras': 'U-Net (Keras/TF)',
            'resnet_unet': 'ResNet34-UNet',
            'yolo': 'YOLOv8-seg'
        }.get(name, name)
        
        # Calculate normalized matrix for colors
        cm_sum = cm.sum(axis=1, keepdims=True)
        cm_normalized = np.zeros_like(cm, dtype=float)
        # Avoid zero division
        with np.errstate(divide='ignore', invalid='ignore'):
            cm_normalized = np.where(cm_sum > 0, cm.astype(float) / cm_sum, 0.0)
        
        fig, ax = plt.subplots(figsize=(7, 6))
        # Draw matrix
        im = ax.imshow(cm_normalized, cmap='Blues', vmin=0, vmax=1)
        
        ax.set_xticks(np.arange(NUM_CLASSES))
        ax.set_yticks(np.arange(NUM_CLASSES))
        ax.set_xticklabels(class_names_list)
        ax.set_yticklabels(class_names_list)
        
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
        
        # Overlay normalized values exactly like YOLO (0.00 to 1.00 format, no pixel counts inside cell)
        for i in range(NUM_CLASSES):
            for j in range(NUM_CLASSES):
                val = cm_normalized[i, j]
                text_color = "white" if val > 0.5 else "black"
                ax.text(j, i, f"{val:.2f}",
                        ha="center", va="center", color=text_color, fontsize=12, weight='bold')
                
        ax.set_title(f"Confusion Matrix ({display_name})", fontsize=13, pad=15, weight='bold')
        ax.set_xlabel('Predicted Label', fontsize=11, labelpad=10)
        ax.set_ylabel('True Label', fontsize=11, labelpad=10)
        
        # Color bar
        cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
        cbar.ax.tick_params(labelsize=10)
        
        plt.tight_layout()
        
        cm_img_path = os.path.join(OUTPUT_DIR, f"confusion_matrix_{name}.png")
        plt.savefig(cm_img_path, dpi=180)
        plt.close()
        print(f"Saved Confusion Matrix Heatmap to: {cm_img_path}")


if __name__ == "__main__":
    main()
