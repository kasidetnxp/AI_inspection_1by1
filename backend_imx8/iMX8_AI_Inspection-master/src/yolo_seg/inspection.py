import os
import csv
import numpy as np
import cv2
import yaml
from datetime import datetime
from collections import defaultdict


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def find_closest_contour_point(point, contour):
    """
    Finds the point on the contour that is closest to the given point.
    Used for drawing the distance-helper line in visualizations.
    """
    min_dist_sq = float('inf')
    closest_pt = None
    for pt in contour:
        # Flatten point to ensure we have a (x, y) tuple regardless of shape
        pt_coords = pt.ravel()
        px, py = int(pt_coords[0]), int(pt_coords[1])
        dist_sq = (px - point[0])**2 + (py - point[1])**2
        if dist_sq < min_dist_sq:
            min_dist_sq = dist_sq
            closest_pt = (px, py)
    return closest_pt


def scale_polygon(polygon: np.ndarray, src_shape: tuple, dest_shape: tuple) -> np.ndarray:
    """
    Scales a polygon from src_shape (H_src, W_src) to dest_shape (H_dest, W_dest).
    """
    h_src, w_src = src_shape[:2]
    h_dest, w_dest = dest_shape[:2]
    if h_src == h_dest and w_src == w_dest:
        return polygon
        
    scale_x = w_dest / w_src
    scale_y = h_dest / h_src
    
    scaled = polygon.copy().astype(np.float32)
    scaled[..., 0] *= scale_x
    scaled[..., 1] *= scale_y
    return scaled.astype(np.int32)


def polygon_to_mask(polygon: np.ndarray, shape: tuple) -> np.ndarray:
    """
    Rasterises a polygon (N, 2) int32 array into a binary uint8 mask.
    Parameters
    ----------
    polygon : np.ndarray
        Polygon vertices with shape (N, 2), dtype int32.
    shape : tuple
        Image shape (H, W) or (H, W, C) — only the first two dims are used.
    Returns
    -------
    mask : np.ndarray, uint8
        Binary mask (255 = inside, 0 = outside) with shape (H, W).
    """
    mask = np.zeros(shape[:2], dtype=np.uint8)
    cv2.fillPoly(mask, [polygon], 255)
    return mask


def compute_pm_distance_to_pad(
    pm_polygon: np.ndarray,
    pad_polygon: np.ndarray,
    img_shape: tuple,
) -> tuple:
    """
    Computes the minimum distance (in pixels) from **any pixel** of the probe
    mark mask to the boundary of the pad mask, using cv2.distanceTransform.

    Key improvements over a contour-loop approach
    ---------------------------------------------
    * All pixels inside the probe mark are evaluated — not just polygon vertices.
    * Pixels that are outside the pad immediately return distance = 0 (FAIL).
    * Uses cv2.distanceTransform O(H*W) — faster than O(N_pm * N_pad).
    * Works for any pad shape: rectangle, hexagon, or arbitrary polygon.

    Returns
    -------
    min_dist_px  : float          — 0.0 if any PM pixel is outside the pad
    closest_pm_pt: (int,int)|None — PM pixel closest to pad edge (for viz)
    """
    H, W = img_shape[:2]
    pad_mask = polygon_to_mask(pad_polygon, (H, W))
    pm_mask  = polygon_to_mask(pm_polygon,  (H, W))

    if cv2.countNonZero(pm_mask) == 0:
        return 0.0, None

    inv_pad = cv2.bitwise_not(pad_mask)
    dist_from_edge = cv2.distanceTransform(
        pad_mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE
    )

    # Check for probe mark pixels that lie OUTSIDE the pad
    outside_pm = cv2.bitwise_and(pm_mask, inv_pad)
    if cv2.countNonZero(outside_pm) > 0:
        ys, xs = np.where(outside_pm > 0)
        closest_pm_pt = (int(xs[0]), int(ys[0]))
        return 0.0, closest_pm_pt

    # All probe mark pixels are inside the pad — find the one closest to edge
    dist_pm_only = dist_from_edge.copy().astype(np.float64)
    dist_pm_only[pm_mask == 0] = np.inf
    min_dist_px = float(dist_pm_only[pm_mask > 0].min())

    flat_idx = int(np.argmin(dist_pm_only))
    ry, rx = np.unravel_index(flat_idx, dist_pm_only.shape)
    closest_pm_pt = (int(rx), int(ry))
    return min_dist_px, closest_pm_pt


# ---------------------------------------------------------------------------
# Config loader
# ---------------------------------------------------------------------------

def load_inspection_config(config_path: str) -> dict:
    """
    Loads inspection thresholds from a YAML or JSON config file.
    Falls back to built-in defaults if the file is missing or a key is absent.
    """
    defaults = {
        "fail_distance_um": 8.0,
        "warning_distance_um": 3.0,
        "warning_occurrence_threshold": 1,
        "max_area_ratio_pct": 25.0,
        "min_area_ratio_pct": 1.0,
        "missing_mark_action": "warning",
        "min_overlap_pct": 0.5,
        "pad_width_um": None,
        "default_px_per_um": 1.0,
        "target_width": None,
        "target_height": None,
        "v_roi": 1.0,
        "h_roi": 1.0,
        "min_area_sizes": [0, 0, 0],
        "greyscale_threshold": 0.0,
    }

    if config_path is None or not os.path.exists(config_path):
        if config_path is not None:
            print(f"[CONFIG] ⚠️  '{config_path}' not found — using built-in defaults.")
        return defaults

    # Handle JSON format (old configuration keys)
    if config_path.endswith(".json"):
        import json
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Map old JSON keys to internal config keys
            edge_factor = data.get("edgeConversionFactor", 1.0)
            default_px_per_um = 1.0 / edge_factor if edge_factor > 0 else 1.0
            
            t_w = data.get("targetWidth")
            t_h = data.get("targetHeight")
            
            cfg = {
                "fail_distance_um":             float(data.get("edgeThreshold", 8.0)),
                "warning_distance_um":          0.0,  # No warning in old config
                "warning_occurrence_threshold": 1,
                "max_area_ratio_pct":           float(data.get("areaRatioThreshold", 25.0)),
                "min_area_ratio_pct":           0.0,  # Disabled
                "missing_mark_action":          "warning",
                "min_overlap_pct":              float(data.get("minOverlapPct", 0.5)),
                "pad_width_um":                 None,  # No auto-calibration in old config
                "default_px_per_um":            default_px_per_um,
                "target_width":                 int(t_w) if t_w is not None else None,
                "target_height":                int(t_h) if t_h is not None else None,
                "v_roi":                        float(data.get("verticalRoi", 1.0)),
                "h_roi":                        float(data.get("horizontalRoi", 1.0)),
                "min_area_sizes":               data.get("minAreaSizes", [0, 0, 0]),
                "greyscale_threshold":          float(data.get("greyscaleThreshold", 0.0)),
            }
            print(f"[CONFIG] Loaded JSON config '{config_path}' (Mapped old keys: target={t_w}x{t_h})")
            return cfg
        except Exception as e:
            print(f"[CONFIG] ❌ Error loading JSON config: {e}. Falling back to defaults.")
            return defaults

    # Handle YAML format
    with open(config_path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    rules = data.get("rules", {})
    calib = data.get("calibration", {})

    cfg = {
        "fail_distance_um":             rules.get("fail_distance_um",             rules.get("fail_distance_mm", defaults["fail_distance_um"])),
        "warning_distance_um":          rules.get("warning_distance_um",           rules.get("warning_distance_mm", defaults["warning_distance_um"])),
        "warning_occurrence_threshold": rules.get("warning_occurrence_threshold",  defaults["warning_occurrence_threshold"]),
        "max_area_ratio_pct":           rules.get("max_area_ratio_pct",            defaults["max_area_ratio_pct"]),
        "min_area_ratio_pct":           rules.get("min_area_ratio_pct",            defaults["min_area_ratio_pct"]),
        "missing_mark_action":          rules.get("missing_mark_action",           defaults["missing_mark_action"]),
        "min_overlap_pct":              rules.get("min_overlap_pct",              defaults["min_overlap_pct"]),
        "pad_width_um":                 calib.get("pad_width_um",                  calib.get("pad_width_mm", defaults["pad_width_um"])),
        "default_px_per_um":            calib.get("default_px_per_um",             calib.get("default_px_per_mm", defaults["default_px_per_um"])),
        "target_width":                 calib.get("target_width",                  defaults["target_width"]),
        "target_height":                calib.get("target_height",                 defaults["target_height"]),
        "v_roi":                        rules.get("v_roi",                         defaults["v_roi"]),
        "h_roi":                        rules.get("h_roi",                         defaults["h_roi"]),
        "min_area_sizes":               rules.get("min_area_sizes",               defaults["min_area_sizes"]),
        "greyscale_threshold":          rules.get("greyscale_threshold",          defaults["greyscale_threshold"]),
    }

    print(
        f"[CONFIG] Loaded '{config_path}'\n"
        f"         fail_dist={cfg['fail_distance_um']}  |  "
        f"warn_dist={cfg['warning_distance_um']}  |  "
        f"area_ratio: {cfg['min_area_ratio_pct']}%–{cfg['max_area_ratio_pct']}%  |  "
        f"px_per_um={cfg['default_px_per_um']}  |  "
        f"ROI: v_roi={cfg['v_roi']}, h_roi={cfg['h_roi']}"
    )
    return cfg


# ---------------------------------------------------------------------------
# Main inspection function
# ---------------------------------------------------------------------------

def run_inspection(image_results,
                   output_csv_path="outputs/inspection_report.csv",
                   output_viz_dir="outputs/inspection_visuals",
                   # Legacy direct parameters (still accepted for backward compat)
                   pad_width_um=None,
                   px_per_um=1.0,
                   warning_distance_um=3.0,
                   warning_occurrence_threshold=1,
                   # Config file path (takes priority over direct params above)
                   config_path=None):
    """
    Evaluates pass/fail inspection rules on model segmentation outputs.

    Rules
    -----
    1. Distance of probemark to pad boundary < fail_distance_um  → FAIL
    2. Area ratio of probemark to pad        > max_area_ratio_pct → FAIL
    3. Area ratio of probemark to pad        < min_area_ratio_pct → FAIL
    4. Distance in [fail_dist, fail_dist+warn_dist)              → WARNING
    5. No probemark detected (pad exists) → WARNING or FAIL (missing_mark_action)
    6. No pad and no probemark detected                          → WARNING
    7. Grain                                                     → visual only

    Distance measurement uses a mask-based distance-transform approach.
    """

    # ------------------------------------------------------------------
    # Resolve configuration (YAML file takes priority)
    # ------------------------------------------------------------------
    cfg = load_inspection_config(config_path)

    FAIL_DIST_UM        = cfg.get("fail_distance_um", cfg.get("fail_distance_mm", 8.0))
    WARN_DIST_UM        = cfg.get("warning_distance_um", cfg.get("warning_distance_mm", 3.0))
    WARN_THRESHOLD      = cfg["warning_occurrence_threshold"]
    MAX_RATIO_PCT       = cfg["max_area_ratio_pct"]
    MIN_RATIO_PCT       = cfg["min_area_ratio_pct"]
    MISSING_MARK_ACTION = cfg["missing_mark_action"].lower()
    MIN_OVERLAP_PCT     = cfg["min_overlap_pct"]
    # Calibration: YAML > direct param > default
    _pad_width_um  = cfg.get("pad_width_um", cfg.get("pad_width_mm")) if cfg.get("pad_width_um", cfg.get("pad_width_mm")) is not None else pad_width_um
    _default_px_um = cfg.get("default_px_per_um", cfg.get("default_px_per_mm")) if cfg.get("default_px_per_um", cfg.get("default_px_per_mm")) is not None else px_per_um

    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    os.makedirs(output_viz_dir, exist_ok=True)

    csv_exists = os.path.exists(output_csv_path)
    results_logged = []
    _warning_counter = defaultdict(int)

    for r in image_results:
        image_path = r["image_path"]
        image_name = os.path.basename(image_path)
        img = cv2.imread(image_path)
        if img is None:
            print(f"⚠️ Could not read image for inspection visualization: {image_path}")
            continue

        h, w = img.shape[:2]

        # Extract polygons from generic dict
        pads = r.get("pads", [])
        probemarks = r.get("probemarks", [])
        grains = r.get("grains", [])

        # Apply min area filtering to remove noise (Min Area Size Filter)
        min_areas = cfg.get("min_area_sizes", [0, 0, 0])
        if len(min_areas) > 0 and min_areas[0] > 0:
            pads = [p for p in pads if cv2.contourArea(p) >= min_areas[0]]
        if len(min_areas) > 1 and min_areas[1] > 0:
            probemarks = [pm for pm in probemarks if cv2.contourArea(pm) >= min_areas[1]]
        if len(min_areas) > 2 and min_areas[2] > 0:
            grains = [gr for gr in grains if cv2.contourArea(gr) >= min_areas[2]]

        decision = "PASS"
        reasons = []
        min_dist_um = float('inf')
        max_ratio_pct = 0.0
        img_viz = img.copy()

        # 1. Filter pads by ROI (to ignore pads cut off at the edge of the image)
        V_ROI = cfg["v_roi"]
        H_ROI = cfg["h_roi"]
        if V_ROI < 1.0 or H_ROI < 1.0:
            roi_x1 = int(w / 2 - w * H_ROI / 2)
            roi_y1 = int(h / 2 - h * V_ROI / 2)
            roi_x2 = int(w / 2 + w * H_ROI / 2)
            roi_y2 = int(h / 2 + h * V_ROI / 2)
            
            # Draw ROI box on visual image if constrained
            cv2.rectangle(img_viz, (roi_x1, roi_y1), (roi_x2, roi_y2), (255, 255, 255), 1)
            
            valid_pads = []
            for pad in pads:
                px, py, pw, ph = cv2.boundingRect(pad)
                if roi_x1 <= px and py >= roi_y1 and (px + pw) <= roi_x2 and (py + ph) <= roi_y2:
                    valid_pads.append(pad)
                else:
                    print(f"[ROI] {image_name}: Skipping pad outside ROI (bbox: {[px, py, px+pw, py+ph]}, ROI: {[roi_x1, roi_y1, roi_x2, roi_y2]})")
            pads = valid_pads

        # 2. Auto-calibration: compute px_per_um from real pad size (per image) using filtered pads
        img_px_per_um = _default_px_um
        if _pad_width_um is not None and len(pads) > 0:
            main_pad = max(pads, key=cv2.contourArea)
            target_w = cfg.get("target_width")
            target_h = cfg.get("target_height")
            if target_w is not None and target_h is not None:
                main_pad_calc = scale_polygon(main_pad, img.shape, (target_h, target_w))
            else:
                main_pad_calc = main_pad
            _, _, pad_w_px, _ = cv2.boundingRect(main_pad_calc)
            if pad_w_px > 0:
                img_px_per_um = pad_w_px / _pad_width_um
                print(
                    f"[CALIBRATION] {image_name}: Pad width {_pad_width_um:.2f} um → "
                    f"{pad_w_px} px  ⇒  px_per_um = {img_px_per_um:.2f}"
                )
            else:
                print(f"[WARNING] {image_name}: Detected pad has 0-pixel width — using default px_per_um.")

        # ------------------------------------------------------------------
        # Inspection Logic
        # ------------------------------------------------------------------
        if len(pads) == 0:
            decision = "FAIL"
            if len(probemarks) > 0:
                reasons.append("Unknown (Cannot classify pad)")
                for pm in probemarks:
                    cv2.drawContours(img_viz, [pm], -1, (0, 0, 255), 2)
            else:
                reasons.append("Unknown (Cannot classify pad and probe mark)")
        else:
            # We have at least 1 pad. Match each probemark to its best pad based on overlap
            pad_to_pms = defaultdict(list)
            for pm in probemarks:
                pm_mask = polygon_to_mask(pm, img.shape)
                pm_area_px = cv2.countNonZero(pm_mask)
                best_pad = None
                max_overlap_px = 0
                best_pad_idx = -1
                
                for pad_idx, pad in enumerate(pads):
                    # Use convex hull of the pad for matching to bridge any predicted gaps/channels (e.g. from semantic segmentation)
                    pad_hull = cv2.convexHull(pad)
                    pad_mask = polygon_to_mask(pad_hull, img.shape)
                    intersection = cv2.bitwise_and(pm_mask, pad_mask)
                    overlap_px = cv2.countNonZero(intersection)
                    if overlap_px > max_overlap_px:
                        max_overlap_px = overlap_px
                        best_pad = pad
                        best_pad_idx = pad_idx
                        
                overlap_ratio = max_overlap_px / pm_area_px if pm_area_px > 0 else 0.0
                if best_pad is not None and overlap_ratio >= MIN_OVERLAP_PCT:
                    pad_to_pms[best_pad_idx].append(pm)
                else:
                    print(
                        f"[INSPECTION] {image_name}: Skipping a probemark with low overlap "
                        f"({overlap_ratio*100:.1f}% < {MIN_OVERLAP_PCT*100:.1f}%)"
                    )
            
            # Match grains to pads as well so their overlapping masks can restore pad indentations
            pad_to_grains = defaultdict(list)
            for gr in grains:
                gr_mask = polygon_to_mask(gr, img.shape)
                gr_area_px = cv2.countNonZero(gr_mask)
                best_pad = None
                max_overlap_px = 0
                best_pad_idx = -1
                for pad_idx, pad in enumerate(pads):
                    pad_hull = cv2.convexHull(pad)
                    pad_mask = polygon_to_mask(pad_hull, img.shape)
                    intersection = cv2.bitwise_and(gr_mask, pad_mask)
                    overlap_px = cv2.countNonZero(intersection)
                    if overlap_px > max_overlap_px:
                        max_overlap_px = overlap_px
                        best_pad = pad
                        best_pad_idx = pad_idx
                overlap_ratio = max_overlap_px / gr_area_px if gr_area_px > 0 else 0.0
                if best_pad is not None and overlap_ratio >= 0.2:
                    pad_to_grains[best_pad_idx].append(gr)

            # Inspect each pad individually
            for pad_idx, pad in enumerate(pads):
                matched_pms = pad_to_pms[pad_idx]
                matched_grains_raw = pad_to_grains[pad_idx]

                # Filter out grains that overlap with probemarks — these are
                # duplicate detections of the same feature and must NOT inflate
                # the pad area via convex-hull correction.
                if matched_pms and matched_grains_raw:
                    pm_union = np.zeros(img.shape[:2], dtype=np.uint8)
                    for pm in matched_pms:
                        cv2.fillPoly(pm_union, [pm], 255)
                    matched_grains = []
                    for gr in matched_grains_raw:
                        gr_mask = polygon_to_mask(gr, img.shape)
                        gr_area = cv2.countNonZero(gr_mask)
                        if gr_area == 0:
                            continue
                        overlap = cv2.countNonZero(cv2.bitwise_and(gr_mask, pm_union))
                        if overlap / gr_area < 0.3:
                            matched_grains.append(gr)
                        else:
                            print(f"[GRAIN-FILTER] {image_name}: Skipping grain overlapping PM "
                                  f"({overlap/gr_area*100:.0f}% overlap)")
                else:
                    matched_grains = matched_grains_raw

                matched_defects = matched_pms + matched_grains
                
                # Correct pad shape: Logical OR pad mask with matched probe marks AND grains,
                # followed by Convex Hull to perfectly restore straight boundaries for any convex Pad shapes
                # (rectangles, hexagons, octagons, etc.) eliminating all indentations/dents.
                pad_mask = polygon_to_mask(pad, img.shape)
                if len(matched_defects) > 0:
                    defect_mask_combined = np.zeros(img.shape[:2], dtype=np.uint8)
                    for df in matched_defects:
                        cv2.fillPoly(defect_mask_combined, [df], 255)
                    merged_mask = cv2.bitwise_or(pad_mask, defect_mask_combined)
                else:
                    merged_mask = pad_mask.copy()
                    
                contours, _ = cv2.findContours(merged_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
                if len(contours) > 0:
                    raw_pad = max(contours, key=cv2.contourArea)
                    pad = cv2.convexHull(raw_pad)
                
                # Draw pad outline
                overlay = img_viz.copy()
                cv2.fillPoly(overlay, [pad], (255, 0, 0))
                cv2.addWeighted(overlay, 0.2, img_viz, 0.8, 0, img_viz)
                cv2.drawContours(img_viz, [pad], -1, (255, 100, 0), 2)
                
                if len(matched_pms) == 0:
                    # Missing probe mark on this pad!
                    if MISSING_MARK_ACTION == "fail":
                        decision = "FAIL"
                        reasons.append("No probemark detected on pad (strict mode)")
                        # Draw pad contour in Red (0, 0, 255) for missing fail
                        cv2.drawContours(img_viz, [pad], -1, (0, 0, 255), 2)
                    else:
                        if decision != "FAIL":
                            decision = "WARNING"
                        reasons.append("[WARNING] No probemark detected — please verify")
                        # Draw pad contour in Yellow (0, 255, 255) for missing warning
                        cv2.drawContours(img_viz, [pad], -1, (0, 255, 255), 2)
                else:
                    # Run checks for each probe mark matched to this pad
                    # Create a combined binary mask for all matched probe marks to get the true union area
                    # This prevents double-counting if YOLO predicts overlapping/redundant probe marks
                    h_orig, w_orig = img.shape[:2]
                    combined_pm_mask = np.zeros((h_orig, w_orig), dtype=np.uint8)
                    for pm in matched_pms:
                        cv2.fillPoly(combined_pm_mask, [pm], 255)
                        
                    target_w = cfg.get("target_width")
                    target_h = cfg.get("target_height")
                    
                    if target_w is not None and target_h is not None:
                        # Scale pad to target size to compute its target area
                        pad_calc = scale_polygon(pad, img.shape, (target_h, target_w))
                        pad_mask_calc = np.zeros((target_h, target_w), dtype=np.uint8)
                        cv2.fillPoly(pad_mask_calc, [pad_calc], 255)
                        pad_area = cv2.countNonZero(pad_mask_calc)
                        
                        # Scale PM polygons to target size and rasterize (same method as pad)
                        pm_mask_calc = np.zeros((target_h, target_w), dtype=np.uint8)
                        for pm in matched_pms:
                            pm_calc = scale_polygon(pm, img.shape, (target_h, target_w))
                            cv2.fillPoly(pm_mask_calc, [pm_calc], 255)
                        total_pm_area = cv2.countNonZero(pm_mask_calc)
                    else:
                        pad_mask = np.zeros((h_orig, w_orig), dtype=np.uint8)
                        cv2.fillPoly(pad_mask, [pad], 255)
                        pad_area = cv2.countNonZero(pad_mask)
                        total_pm_area = cv2.countNonZero(combined_pm_mask)
                        
                    ratio = (total_pm_area / pad_area) * 100.0 if pad_area > 0 else 0.0
                    if ratio > max_ratio_pct:
                        max_ratio_pct = ratio
                        
                    if ratio > MAX_RATIO_PCT:
                        decision = "FAIL"
                        reasons.append(
                            f"Probemark area too large ({ratio:.1f}% > {MAX_RATIO_PCT:.1f}%)"
                        )
                    if MIN_RATIO_PCT > 0.0 and ratio < MIN_RATIO_PCT:
                        decision = "FAIL"
                        reasons.append(
                            f"Probemark area too small ({ratio:.1f}% < {MIN_RATIO_PCT:.1f}%)"
                        )
                        
                    for pm in matched_pms:
                        # ② Distance to Boundary Check
                        target_w = cfg.get("target_width")
                        target_h = cfg.get("target_height")
                        if target_w is not None and target_h is not None:
                            pm_calc = scale_polygon(pm, img.shape, (target_h, target_w))
                            pad_calc = scale_polygon(pad, img.shape, (target_h, target_w))
                            calc_shape = (target_h, target_w)
                        else:
                            pm_calc = pm
                            pad_calc = pad
                            calc_shape = img.shape
                            
                        pm_min_dist_px, closest_pm_pt_calc = compute_pm_distance_to_pad(
                            pm_calc, pad_calc, calc_shape
                        )
                        
                        if closest_pm_pt_calc is not None:
                            if target_w is not None and target_h is not None:
                                closest_pm_pt = (
                                    int(closest_pm_pt_calc[0] * (w / target_w)),
                                    int(closest_pm_pt_calc[1] * (h / target_h))
                                )
                            else:
                                closest_pm_pt = closest_pm_pt_calc
                        else:
                            closest_pm_pt = None
                            
                        dist_um = pm_min_dist_px / img_px_per_um if pm_min_dist_px != float('inf') else 0.0
                        if dist_um < min_dist_um:
                            min_dist_um = dist_um
                            
                        # ③ FAIL / WARNING / PASS decision (distance-based)
                        if dist_um < FAIL_DIST_UM:
                            decision = "FAIL"
                            reasons.append(
                                f"Probemark too close to edge ({dist_um:.2f}um < {FAIL_DIST_UM}um)"
                            )
                            _warning_counter[image_name] = 0
                        elif WARN_DIST_UM > 0.0 and dist_um < (FAIL_DIST_UM + WARN_DIST_UM):
                            _warning_counter[image_name] += 1
                            if _warning_counter[image_name] >= WARN_THRESHOLD:
                                if decision != "FAIL":
                                    decision = "WARNING"
                                reasons.append(
                                    f"[WARNING] Probemark near edge ({dist_um:.2f}um) – "
                                    f"occurred {_warning_counter[image_name]} time(s)"
                                )
                        else:
                            _warning_counter[image_name] = 0

                        # ③.2 Greyscale Check (intensity check)
                        GREYSCALE_THRESHOLD = cfg.get("greyscale_threshold", 0.0)
                        if GREYSCALE_THRESHOLD > 0.0:
                            pm_mask = polygon_to_mask(pm, img.shape)
                            mean_bgr = cv2.mean(img, mask=pm_mask)[:3]
                            avg_intensity = sum(mean_bgr) / 3.0
                            greyscale_val = 255.0 - avg_intensity
                            if greyscale_val < GREYSCALE_THRESHOLD:
                                decision = "FAIL"
                                reasons.append(
                                    f"Probemark too light (intensity {greyscale_val:.1f} < {GREYSCALE_THRESHOLD})"
                                )
                            
                        # ④ Visualization
                        is_fail = (dist_um < FAIL_DIST_UM or ratio > MAX_RATIO_PCT or
                                   (MIN_RATIO_PCT > 0.0 and ratio < MIN_RATIO_PCT))
                        is_warn = any("[WARNING]" in r_txt for r_txt in reasons)
                        
                        pm_color = (0, 0, 255) if is_fail else (0, 255, 255) if is_warn else (0, 255, 0)
                        overlay = img_viz.copy()
                        cv2.fillPoly(overlay, [pm], pm_color)
                        cv2.addWeighted(overlay, 0.35, img_viz, 0.65, 0, img_viz)
                        cv2.drawContours(img_viz, [pm], -1, pm_color, 2)
                        
                        # Distance line color
                        is_dist_fail = (dist_um < FAIL_DIST_UM)
                        is_dist_warn = (WARN_DIST_UM > 0.0) and (dist_um >= FAIL_DIST_UM) and (dist_um < FAIL_DIST_UM + WARN_DIST_UM)
                        dist_line_color = (0, 0, 255) if is_dist_fail else (0, 255, 255) if is_dist_warn else (0, 255, 0)
                        
                        # Distance helper line drawing
                        if closest_pm_pt is not None and pm_min_dist_px != float('inf') and pm_min_dist_px > 0:
                            pad_mask = polygon_to_mask(pad, img.shape)
                            contours, _ = cv2.findContours(pad_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
                            if len(contours) > 0:
                                detailed_contour = max(contours, key=cv2.contourArea)
                                closest_pad_pt = find_closest_contour_point(closest_pm_pt, detailed_contour)
                            else:
                                closest_pad_pt = find_closest_contour_point(closest_pm_pt, pad)
                                
                            if closest_pad_pt is not None:
                                cv2.line(img_viz, closest_pm_pt, closest_pad_pt, dist_line_color, 2)
                                cv2.circle(img_viz, closest_pm_pt, 4, dist_line_color, -1)
                                cv2.circle(img_viz, closest_pad_pt, 4, dist_line_color, -1)
                                label_pos = (
                                    (closest_pm_pt[0] + closest_pad_pt[0]) // 2 + 5,
                                    (closest_pm_pt[1] + closest_pad_pt[1]) // 2 - 5,
                                )
                                cv2.putText(img_viz, f"{dist_um:.2f}um", label_pos,
                                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, dist_line_color, 1)

        # ------------------------------------------------------------------
        # Grain — visual only, does NOT affect pass/fail
        # ------------------------------------------------------------------
        if len(grains) > 0:
            # Build union mask of all probemarks to prevent drawing grain over probemarks
            all_pm_mask = np.zeros(img.shape[:2], dtype=np.uint8)
            for pm in probemarks:
                cv2.fillPoly(all_pm_mask, [pm], 255)

            for gr in grains:
                gr_mask = polygon_to_mask(gr, img.shape)
                # Subtract probemark area from grain mask so grain never draws over PM
                gr_clean_mask = cv2.bitwise_and(gr_mask, cv2.bitwise_not(all_pm_mask))
                if cv2.countNonZero(gr_clean_mask) > 0:
                    cnts, _ = cv2.findContours(gr_clean_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    if cnts:
                        cv2.drawContours(img_viz, cnts, -1, (255, 0, 255), 2)

        # ------------------------------------------------------------------
        # Total Probemark % Area Badge (Bottom-Right Corner)
        # ------------------------------------------------------------------
        if max_ratio_pct > 0 or len(probemarks) > 0:
            area_str = f"Area : {max_ratio_pct:.1f}%"
            font_scale = 0.55
            thickness = 2
            (t_w, t_h), _ = cv2.getTextSize(area_str, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
            margin = 10
            box_x1 = max(5, w - t_w - margin * 2)
            box_y1 = max(5, h - t_h - margin * 2)
            box_x2 = min(w - 2, w - margin // 2)
            box_y2 = min(h - 2, h - margin // 2)

            sub_overlay = img_viz.copy()
            cv2.rectangle(sub_overlay, (box_x1, box_y1), (box_x2, box_y2), (0, 0, 0), -1)
            cv2.addWeighted(sub_overlay, 0.65, img_viz, 0.35, 0, img_viz)
            cv2.rectangle(img_viz, (box_x1, box_y1), (box_x2, box_y2), (255, 255, 0), 1)

            cv2.putText(img_viz, area_str, (box_x1 + margin, box_y2 - margin + 2),
                        cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)

        # ------------------------------------------------------------------
        # Build visualization canvas
        # ------------------------------------------------------------------
        # Deduplicate reasons list preserving order
        unique_reasons = []
        for r_txt in reasons:
            if r_txt not in unique_reasons:
                unique_reasons.append(r_txt)
        reason_str   = " & ".join(unique_reasons) if unique_reasons else "-"
        min_dist_str = f"{min_dist_um:.2f}" if min_dist_um != float('inf') else "N/A"
        has_warning  = any("[WARNING]" in r_txt for r_txt in reasons)
 
        banner_h = 70
        canvas = np.zeros((h + banner_h, w * 2, 3), dtype=np.uint8)
        canvas[banner_h:, :w] = img
        canvas[banner_h:, w:] = img_viz
 
        if decision == "FAIL":
            banner_color = (0, 0, 255)       # Red
            text_color_main = (255, 255, 255) # White
            text_color_sub = (220, 220, 255)  # Light pink/white
        else:
            banner_color = (0, 200, 0)       # Green
            text_color_main = (255, 255, 255) # White
            text_color_sub = (220, 255, 220)  # Light green
 
        cv2.rectangle(canvas, (0, 0), (w * 2, banner_h), banner_color, -1)

        font = cv2.FONT_HERSHEY_SIMPLEX
        total_width = w * 2

        # Center-align Main Decision text (PASS / FAIL)
        banner_text = f"{decision}"
        (t_w_main, _), _ = cv2.getTextSize(banner_text, font, 0.85, 2)
        x_main = max(10, (total_width - t_w_main) // 2)
        cv2.putText(canvas, banner_text, (x_main, 30), font, 0.85, text_color_main, 2)

        # Determine subtext (reason or status) including Probemark Area %
        if decision == "FAIL":
            import re
            clean_reasons = [re.sub(r'\s*\([^)]*\)', '', r_txt) for r_txt in unique_reasons]
            sub_text = f"PM Area: {max_ratio_pct:.1f}% | " + " & ".join(clean_reasons)
        else:
            sub_text = f"PM Area: {max_ratio_pct:.1f}% | Meets all inspection criteria."

        # Center-align Subtext
        (t_w_sub, _), _ = cv2.getTextSize(sub_text, font, 0.55, 1)
        x_sub = max(10, (total_width - t_w_sub) // 2)
        cv2.putText(canvas, sub_text, (x_sub, 55), font, 0.55, text_color_sub, 1)
 
        cv2.line(canvas, (w, banner_h), (w, h + banner_h), (255, 255, 255), 2)
 
        viz_path = os.path.join(output_viz_dir, f"inspect_{image_name}")
        cv2.imwrite(viz_path, canvas)
 
        # ------------------------------------------------------------------
        # CSV log
        # ------------------------------------------------------------------
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            with open(output_csv_path, 'a', newline='', encoding='utf-8') as f_csv:
                writer = csv.writer(f_csv)
                if not csv_exists:
                    writer.writerow([
                        "Timestamp", "Image Name", "Result",
                        "Min Distance (um)", "Area Ratio (%)", "Fail Reason"
                    ])
                    csv_exists = True
                writer.writerow([
                    timestamp, image_name, decision,
                    min_dist_str, f"{max_ratio_pct:.1f}", reason_str
                ])
        except PermissionError:
            print(f"⚠️ [WARNING] Permission denied to write to '{output_csv_path}'. "
                  f"Please make sure the file is not open in Excel or another program.")
 
        results_logged.append({
            "image_name": image_name,
            "decision":   decision,
            "min_dist":   min_dist_str,
            "ratio":      f"{max_ratio_pct:.1f}%",
            "reason":     reason_str,
            "viz_path":   viz_path,
        })

    print(f"✅ Inspection complete. Report → {output_csv_path}")
    print(f"🖼️  Visuals saved → {output_viz_dir}")
    return results_logged
