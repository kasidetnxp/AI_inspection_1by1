"""
Full end-to-end test with REAL images + REAL unet.tflite model.
Mirrors exactly what main.py does (minus FastAPI wrapper).
"""
import os, sys, cv2, numpy as np

ROOT = "/home/nxp1/Desktop/PUNPUNJA/PROJECT/testbackendimx8na"
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "backend_imx8", "iMX8_AI_Inspection-master"))

from run_unet_tflite_folder import ModelRunner, preprocess_image, postprocess_unet
from src.yolo_seg.inspection import run_inspection

MODEL   = os.path.join(ROOT, "unet.tflite")
IMG_DIR = os.path.join(ROOT, "Inspection")
OUT_DIR = os.path.join(ROOT, "test_output", "real_run")
CONFIG  = os.path.join(ROOT, "backend_imx8", "iMX8_AI_Inspection-master", "configs", "inspection_rules.yaml")

os.makedirs(OUT_DIR, exist_ok=True)

print(f"Loading model: {MODEL}")
runner = ModelRunner(MODEL)
inp_d  = runner.get_input_details()
out_d  = runner.get_output_details()
print(f"Input  shape={inp_d[0]['shape']} dtype={inp_d[0]['dtype']}")
print(f"Output shape={out_d[0]['shape']} dtype={out_d[0]['dtype']}\n")

# Pick first 3 images
images = sorted(f for f in os.listdir(IMG_DIR) if f.lower().endswith(".bmp"))[:3]
print(f"Testing {len(images)} images from Inspection/\n")

generic_results = []
for fname in images:
    fpath = os.path.join(IMG_DIR, fname)
    img_cv = cv2.imread(fpath)
    if img_cv is None:
        print(f"  SKIP (cannot read): {fname}")
        continue

    H, W = img_cv.shape[:2]
    print(f"  {fname}  ({W}×{H})")

    # Preprocess → infer → postprocess  (mirrors main.py lines 340-361)
    input_data, meta = preprocess_image(img_cv, inp_d[0])
    output_tensor    = runner.infer(input_data)
    class_ids, masks = postprocess_unet(output_tensor, out_d[0], meta, ["pad","probemark","grain"])

    pads, marks, grains = [], [], []
    for c_id, mask in zip(class_ids, masks):
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            area = cv2.contourArea(c)
            if c_id == 0 and area > 50:
                pads.append(cv2.convexHull(c).astype(np.int32))
            elif c_id == 1:
                marks.append(c.astype(np.int32))
            elif c_id == 2:
                grains.append(c.astype(np.int32))

    print(f"    pads={len(pads)}  marks={len(marks)}  grains={len(grains)}")
    generic_results.append({
        "image_path": fpath,
        "pads": pads,
        "probemarks": marks,
        "grains": grains
    })

print()
print("Running inspection rule engine...")
report = run_inspection(
    generic_results,
    output_csv_path=os.path.join(OUT_DIR, "report.csv"),
    output_viz_dir=OUT_DIR,
    config_path=CONFIG,
)

print("\n── Results ──────────────────────────────────────")
for r in report:
    print(f"  {r['image_name']}")
    print(f"    decision={r['decision']}  dist={r['min_dist']}  ratio={r['ratio']}  reason={r['reason']}")

# Split inspect_ canvas → raw + annotated (same as main.py)
print("\n── Saving annotated images ──────────────────────")
for r in report:
    fname = r["image_name"]
    inspect_path = os.path.join(OUT_DIR, f"inspect_{fname}")
    raw_path     = os.path.join(OUT_DIR, f"raw_{fname}")
    ann_path     = os.path.join(OUT_DIR, f"annotated_{fname}")
    if os.path.exists(inspect_path):
        canvas = cv2.imread(inspect_path)
        h_c, w_c = canvas.shape[:2]
        w2 = w_c // 2
        cv2.imwrite(raw_path, canvas[70:, :w2])
        cv2.imwrite(ann_path, canvas[70:, w2:])
        print(f"  ✅ {fname} → annotated saved")
    else:
        print(f"  ❌ inspect image missing: {inspect_path}")

print(f"\nOutput folder: {OUT_DIR}")
