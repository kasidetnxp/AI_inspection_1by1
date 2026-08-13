import os
import sys
import subprocess
import argparse
import random
import json
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Subset
from tqdm import tqdm
import matplotlib.pyplot as plt
import numpy as np

# Auto re-execute using virtual environment python if not already running under it
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
VENV_PYTHON = os.path.join(PROJECT_ROOT, ".venv/bin/python")

if os.path.exists(VENV_PYTHON) and os.path.abspath(sys.executable) != os.path.abspath(VENV_PYTHON):
    result = subprocess.run([VENV_PYTHON] + sys.argv)
    sys.exit(result.returncode)

sys.path.append(PROJECT_ROOT)
sys.path.append(SCRIPT_DIR)
from model_resnet import ResNet34UNet
from dataset import SegmentationDataset

def parse_args():
    parser = argparse.ArgumentParser(description="Analyze ResNet-UNet training trends and extrapolate dataset needs.")
    parser.add_argument("--epochs", type=int, default=30, help="Number of epochs to train for each subset.")
    parser.add_argument("--batch_size", type=int, default=64, help="Batch size for training and validation.")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate.")
    parser.add_argument("--subsets", type=float, nargs="+", default=[0.1, 0.2, 0.4, 0.6, 0.8, 1.0],
                        help="Fractions of the training set to train on.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    parser.add_argument("--image_size", type=int, nargs=2, default=[256, 256], help="Image size (H, W).")
    parser.add_argument("--num_classes", type=int, default=4, help="Number of classes in the dataset.")
    parser.add_argument("--device", type=str, default="cuda", help="Device to use for training (cuda or cpu).")
    return parser.parse_args()

def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

def calculate_pixel_accuracy(outputs, targets):
    with torch.no_grad():
        preds = torch.argmax(outputs, dim=1)
        correct = (preds == targets).sum().item()
        total = targets.numel()
        return correct / total

def calculate_miou(outputs, targets, num_classes=4):
    with torch.no_grad():
        preds = torch.argmax(outputs, dim=1)
        iou_list = []
        for c in range(num_classes):
            pred_c = (preds == c)
            target_c = (targets == c)
            intersection = torch.logical_and(pred_c, target_c).sum().item()
            union = torch.logical_or(pred_c, target_c).sum().item()
            if union > 0:
                iou_list.append(intersection / union)
            else:
                iou_list.append(float('nan'))
        return np.nanmean(iou_list)

def calculate_confidence(outputs):
    with torch.no_grad():
        probs = torch.softmax(outputs, dim=1)
        max_probs, _ = torch.max(probs, dim=1)
        return max_probs.mean().item()

def evaluate_loss_and_metrics(model, dataloader, criterion, device, num_classes=4):
    model.eval()
    running_loss = 0.0
    running_acc = 0.0
    running_miou = 0.0
    running_conf = 0.0
    total_samples = 0
    
    with torch.no_grad():
        for images, masks in dataloader:
            images = images.to(device)
            masks = masks.to(device)
            
            outputs = model(images)
            loss = criterion(outputs, masks)
            
            batch_size = images.size(0)
            acc = calculate_pixel_accuracy(outputs, masks)
            miou = calculate_miou(outputs, masks, num_classes)
            conf = calculate_confidence(outputs)
            
            running_loss += loss.item() * batch_size
            running_acc += acc * batch_size
            running_miou += miou * batch_size
            running_conf += conf * batch_size
            total_samples += batch_size
            
    return (
        running_loss / total_samples,
        running_acc / total_samples,
        running_miou / total_samples,
        running_conf / total_samples
    )

def train_model(train_loader, val_loader, num_epochs, device, num_classes=4, lr=1e-4):
    model = ResNet34UNet(n_classes=num_classes, pretrained=True).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    best_val_loss = float('inf')
    best_metrics = {}
    
    for epoch in range(1, num_epochs + 1):
        model.train()
        for images, masks in train_loader:
            images = images.to(device)
            masks = masks.to(device)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, masks)
            loss.backward()
            optimizer.step()
            
        val_loss, val_acc, val_miou, val_conf = evaluate_loss_and_metrics(
            model, val_loader, criterion, device, num_classes
        )
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_metrics = {
                'loss': val_loss,
                'accuracy': val_acc,
                'miou': val_miou,
                'confidence': val_conf
            }
            
    return best_metrics

def fit_power_law(sizes, values, maximize=True):
    sizes = np.array(sizes)
    values = np.array(values)
    
    if maximize:
        errors = 1.0 - values
    else:
        errors = values
        
    errors = np.clip(errors, 1e-6, None)
    
    log_sizes = np.log(sizes)
    log_errors = np.log(errors)
    
    try:
        slope, intercept = np.polyfit(log_sizes, log_errors, 1)
        b = -slope
        a = np.exp(intercept)
    except Exception as e:
        print(f"Warning: Failed to fit power law: {e}")
        return None, None, None
        
    if maximize:
        pred_fn = lambda N: 1.0 - a * (N ** (-b))
    else:
        pred_fn = lambda N: a * (N ** (-b))
        
    return pred_fn, a, b

def predict_required_size(target_val, a, b, maximize=True):
    if b is None or b <= 0:
        return None
    if maximize:
        if target_val >= 1.0:
            return None
        return int(np.ceil((a / (1.0 - target_val)) ** (1.0 / b)))
    else:
        return int(np.ceil((a / target_val) ** (1.0 / b)))

def main():
    args = parse_args()
    set_seed(args.seed)
    
    device = torch.device(args.device if torch.cuda.is_available() and args.device == "cuda" else "cpu")
    print(f"Using device: {device}")
    
    # 1. Load entire datasets
    DATA_TRAIN_IMG = os.path.join(PROJECT_ROOT, "data/2_processed_unet/train/images")
    DATA_TRAIN_MSK = os.path.join(PROJECT_ROOT, "data/2_processed_unet/train/masks")
    DATA_VAL_IMG = os.path.join(PROJECT_ROOT, "data/2_processed_unet/val/images")
    DATA_VAL_MSK = os.path.join(PROJECT_ROOT, "data/2_processed_unet/val/masks")
    
    train_dataset = SegmentationDataset(DATA_TRAIN_IMG, DATA_TRAIN_MSK, image_size=tuple(args.image_size))
    val_dataset = SegmentationDataset(DATA_VAL_IMG, DATA_VAL_MSK, image_size=tuple(args.image_size))
    
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)
    
    total_train_samples = len(train_dataset)
    print(f"Total training dataset size: {total_train_samples}")
    print(f"Total validation dataset size: {len(val_dataset)}")
    
    # Prepare subsets indices
    indices = list(range(total_train_samples))
    random.shuffle(indices)
    
    results = []
    
    print("\n--- Starting Subset Training Sim (ResNet34-UNet) ---")
    for fraction in sorted(args.subsets):
        subset_size = max(1, int(fraction * total_train_samples))
        print(f"\nTraining on subset: {fraction * 100:.1f}% ({subset_size} images)")
        
        # Select nested subset indices
        subset_indices = indices[:subset_size]
        train_subset = Subset(train_dataset, subset_indices)
        train_loader = DataLoader(train_subset, batch_size=args.batch_size, shuffle=True, num_workers=0)
        
        # Train and evaluate
        metrics = train_model(train_loader, val_loader, args.epochs, device, args.num_classes, args.lr)
        metrics['subset_fraction'] = fraction
        metrics['sample_size'] = subset_size
        results.append(metrics)
        
        print(f"ResNet-UNet Results for size {subset_size}:")
        print(f"  Val Loss: {metrics['loss']:.4f}")
        print(f"  Val Accuracy: {metrics['accuracy']*100:.2f}%")
        print(f"  Val mIoU: {metrics['miou']*100:.2f}%")
        print(f"  Mean Confidence: {metrics['confidence']:.4f}")
        
    # Extract results for fitting
    sample_sizes = [r['sample_size'] for r in results]
    accuracies = [r['accuracy'] for r in results]
    mious = [r['miou'] for r in results]
    confidences = [r['confidence'] for r in results]
    
    # 2. Fit curves
    conf_pred_fn, conf_a, conf_b = fit_power_law(sample_sizes, confidences, maximize=True)
    miou_pred_fn, miou_a, miou_b = fit_power_law(sample_sizes, mious, maximize=True)
    acc_pred_fn, acc_a, acc_b = fit_power_law(sample_sizes, accuracies, maximize=True)
    
    # 3. Predict required sizes
    targets = [0.90, 0.95, 0.98, 0.99, 0.995]
    projections = {}
    
    for t in targets:
        proj_conf = predict_required_size(t, conf_a, conf_b, maximize=True)
        proj_miou = predict_required_size(t, miou_a, miou_b, maximize=True)
        proj_acc = predict_required_size(t, acc_a, acc_b, maximize=True)
        projections[f"target_{t:.3f}"] = {
            'confidence': proj_conf,
            'miou': proj_miou,
            'accuracy': proj_acc
        }
        
    # 4. Save results to disk
    from src.utils.config import CLASSES
    class_folder = f"{len(CLASSES)}class"
    OUTPUT_DIR = os.path.join(PROJECT_ROOT, "outputs/learning_curve", class_folder)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    data_log = {
        'parameters': vars(args),
        'results': results,
        'curve_fit_parameters': {
            'confidence': {'a': float(conf_a) if conf_a else None, 'b': float(conf_b) if conf_b else None},
            'miou': {'a': float(miou_a) if miou_a else None, 'b': float(miou_b) if miou_b else None},
            'accuracy': {'a': float(acc_a) if acc_a else None, 'b': float(acc_b) if acc_b else None}
        },
        'projections': projections
    }
    
    with open(os.path.join(OUTPUT_DIR, "learning_curve_resnet_data.json"), "w") as f:
        json.dump(data_log, f, indent=4)
        
    # Load old scratch data if exists
    scratch_data = None
    scratch_path = os.path.join(OUTPUT_DIR, "learning_curve_data.json")
    if os.path.exists(scratch_path):
        try:
            with open(scratch_path, "r") as f:
                scratch_data = json.load(f)
        except Exception as e:
            print(f"Could not load scratch data: {e}")
            
    # Build text report
    report_lines = [
        "="*70,
        "   LEARNING CURVE AND DATA SCALING REPORT (RESNET34-UNet Pretrained)",
        "="*70,
        f"Training config: epochs={args.epochs}, lr={args.lr}, batch_size={args.batch_size}",
        f"Dataset size: Train={total_train_samples}, Val={len(val_dataset)}",
        "-"*70,
        f"{'Subset Size':<12} | {'Accuracy (%)':<15} | {'mIoU (%)':<12} | {'Mean Confidence':<15}",
        "-"*70,
    ]
    for r in results:
        report_lines.append(
            f"{r['sample_size']:<12} | {r['accuracy']*100:<15.2f} | {r['miou']*100:<12.2f} | {r['confidence']:<15.4f}"
        )
    report_lines.append("-"*70)
    
    if scratch_data:
        report_lines.append("\n" + "="*70)
        report_lines.append("        COMPARISON: PRETRAINED vs. SCRATCH REQUIRED SAMPLE SIZES")
        report_lines.append("="*70)
        report_lines.append(f"{'Target Conf':<12} | {'Required (Scratch U-Net)':<26} | {'Required (ResNet34-UNet)':<26}")
        report_lines.append("-"*70)
        
        for t in targets:
            scratch_proj = scratch_data['projections'][f"target_{t:.3f}"]['confidence']
            resnet_proj = projections[f"target_{t:.3f}"]['confidence']
            
            s_val = str(scratch_proj) if scratch_proj else "N/A"
            r_val = str(resnet_proj) if resnet_proj else "N/A"
            
            report_lines.append(f"{t*100:<11.1f}% | {s_val:<26} | {r_val:<26}")
        report_lines.append("-"*70)
        
    report_content = "\n".join(report_lines)
    print("\n" + report_content)
    
    with open(os.path.join(OUTPUT_DIR, "learning_curve_resnet_report.txt"), "w") as f:
        f.write(report_content)
    print(f"\nSaved text report to: {os.path.join(OUTPUT_DIR, 'learning_curve_resnet_report.txt')}")
    
    # 5. Plot comparison curves
    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    
    max_size = max(sample_sizes)
    plot_sizes = np.linspace(min(sample_sizes), max_size * 5, 200)
    
    # Left Plot: mIoU Comparison
    axes[0].scatter(sample_sizes, [m*100 for m in mious], color="#2ECC71", s=50, label="ResNet-UNet (Measured)", zorder=3)
    if miou_pred_fn:
        axes[0].plot(plot_sizes, [miou_pred_fn(n)*100 for n in plot_sizes], color="#2ECC71", linestyle="--", label="ResNet-UNet (Fitted)")
        
    if scratch_data:
        s_sizes = [r['sample_size'] for r in scratch_data['results']]
        s_mious = [r['miou'] for r in scratch_data['results']]
        axes[0].scatter(s_sizes, [m*100 for m in s_mious], color="#E74C3C", s=50, label="Scratch UNet (Measured)", zorder=3)
        
        # Fit scratch miou for plotting
        s_miou_pred_fn, _, _ = fit_power_law(s_sizes, s_mious, maximize=True)
        if s_miou_pred_fn:
            axes[0].plot(plot_sizes, [s_miou_pred_fn(n)*100 for n in plot_sizes], color="#E74C3C", linestyle="--", label="Scratch UNet (Fitted)")
            
    axes[0].set_xlabel("Number of Training Images (N)")
    axes[0].set_ylabel("Validation mIoU (%)")
    axes[0].set_title("Pretrained vs. Scratch: mIoU Scaling Trend")
    axes[0].grid(True, linestyle=":", alpha=0.6)
    axes[0].legend(loc="lower right")
    
    # Right Plot: Confidence Comparison
    axes[1].scatter(sample_sizes, confidences, color="#2ECC71", s=50, label="ResNet-UNet (Measured)", zorder=3)
    if conf_pred_fn:
        axes[1].plot(plot_sizes, [conf_pred_fn(n) for n in plot_sizes], color="#2ECC71", linestyle="--", label="ResNet-UNet (Fitted)")
        
    if scratch_data:
        s_confs = [r['confidence'] for r in scratch_data['results']]
        axes[1].scatter(s_sizes, s_confs, color="#E74C3C", s=50, label="Scratch UNet (Measured)", zorder=3)
        
        s_conf_pred_fn, _, _ = fit_power_law(s_sizes, s_confs, maximize=True)
        if s_conf_pred_fn:
            axes[1].plot(plot_sizes, [s_conf_pred_fn(n) for n in plot_sizes], color="#E74C3C", linestyle="--", label="Scratch UNet (Fitted)")
            
    axes[1].set_xlabel("Number of Training Images (N)")
    axes[1].set_ylabel("Mean Confidence")
    axes[1].set_title("Pretrained vs. Scratch: Confidence Scaling Trend")
    axes[1].grid(True, linestyle=":", alpha=0.6)
    
    # Target lines on Confidence plot
    colors = ["#9B59B6", "#1ABC9C", "#34495E"]
    for i, t in enumerate([0.95, 0.98, 0.99]):
        axes[1].axhline(y=t, color=colors[i], linestyle=":", alpha=0.8, label=f"Target {t*100:.0f}%")
        
    axes[1].legend(loc="lower right")
    
    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, "learning_curve_resnet_plot.png")
    plt.savefig(plot_path, dpi=150)
    plt.close()
    print(f"Saved comparison trend visualization to: {plot_path}")
    print("\nPretrained trend analysis simulation completed successfully!")

if __name__ == "__main__":
    main()
