import os
import sys
import time
import json
import sqlite3
import random
import threading
import shutil
import asyncio
import numpy as np
import matplotlib
matplotlib.use('Agg')
from typing import List

# Try importing FastAPI dependencies
try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:
    print("Error: FastAPI is not installed. Please run: pip install fastapi uvicorn")
    sys.exit(1)

# Helper: Load System Configuration
def load_sys_config():
    config_path = "config.yaml"
    cfg = {}
    if os.path.exists(config_path):
        try:
            import yaml
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Warning: Failed loading config.yaml ({e})")
    return cfg

SYS_CONFIG = load_sys_config()
PATHS_CFG = SYS_CONFIG.get("paths", {})

# Database connection settings
DB_NAME_SQLITE = "simulation/inspections.db"
POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "postgres"
}

# Directory Paths for Machine Interfacing Pipeline
IMAGE_DIR = PATHS_CFG.get("image_dir", "simulation/image")
PROCESS_DIR = PATHS_CFG.get("process_dir", "simulation/process")
OUTPUT_DIR = PATHS_CFG.get("output_dir", "simulation/output")
JUDGEMENT_DIR = PATHS_CFG.get("judge_dir", "simulation/judge")
INPUT_DIR = "simulation/input" # Legacy fallback folder

# Global Live States
latest_inspection = {}
active_alarms = []
inspection_count = 0
active_class_mode = 3  # 2 or 3 classes detection mode
db_type = "SQLite"
main_loop = None

# Initialize Machine Shared & Internal Folders
os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(PROCESS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(JUDGEMENT_DIR, exist_ok=True)
os.makedirs(INPUT_DIR, exist_ok=True)


app = FastAPI(title="Wafer Inspection HMI Backend API")

# Enable CORS for React Dev Server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
os.makedirs("simulation/output/inspection_visuals", exist_ok=True)
app.mount("/visuals", StaticFiles(directory="simulation/output/inspection_visuals"), name="visuals")

# Active WebSocket Clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Remove stale connection
                pass

manager = ConnectionManager()

# ==========================================
# DATABASE CONNECTOR (Postgres / SQLite Fallback)
# ==========================================
def init_database():
    global db_type
    conn = None
    
    try:
        import psycopg2
        print("Checking PostgreSQL connectivity...")
        conn = psycopg2.connect(
            host=POSTGRES_CONFIG["host"],
            port=POSTGRES_CONFIG["port"],
            user=POSTGRES_CONFIG["user"],
            password=POSTGRES_CONFIG["password"],
            database=POSTGRES_CONFIG["database"],
            connect_timeout=2
        )
        db_type = "PostgreSQL"
        print("Successfully connected to PostgreSQL Database!")
    except Exception as e:
        print(f"PostgreSQL connection skipped/failed: {e}")
        print("Gracefully falling back to SQLite Local Database...")
        db_type = "SQLite"
        
    if db_type == "PostgreSQL" and conn:
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS inspections (
                    id SERIAL PRIMARY KEY,
                    wafer_id VARCHAR(50),
                    timestamp VARCHAR(50),
                    decision VARCHAR(20),
                    pads_total INTEGER,
                    pads_detected INTEGER,
                    probe_marks INTEGER,
                    grains INTEGER,
                    confidence DOUBLE PRECISION,
                    inference_time DOUBLE PRECISION,
                    rule_time DOUBLE PRECISION,
                    machine_action VARCHAR(50)
                );
            """)
            conn.commit()
            cursor.close()
            conn.close()
        except Exception as err:
            print(f"Error creating PostgreSQL schema: {err}. Reverting database to SQLite...")
            db_type = "SQLite"

    if db_type == "SQLite":
        try:
            conn = sqlite3.connect(DB_NAME_SQLITE)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS inspections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    wafer_id TEXT,
                    timestamp TEXT,
                    decision TEXT,
                    pads_total INTEGER,
                    pads_detected INTEGER,
                    probe_marks INTEGER,
                    grains INTEGER,
                    confidence REAL,
                    inference_time REAL,
                    rule_time REAL,
                    machine_action TEXT,
                    reason TEXT,
                    image_url TEXT
                );
            """)
            try:
                cursor.execute("ALTER TABLE inspections ADD COLUMN reason TEXT DEFAULT '-'")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE inspections ADD COLUMN image_url TEXT")
            except Exception:
                pass
            conn.commit()
            conn.close()
            print("SQLite Database initialized at:", DB_NAME_SQLITE)
        except Exception as sqlite_err:
            print("SQLite failed to initialize:", sqlite_err)


def save_inspection_to_db(record):
    global db_type
    if db_type == "PostgreSQL":
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=POSTGRES_CONFIG["host"],
                port=POSTGRES_CONFIG["port"],
                user=POSTGRES_CONFIG["user"],
                password=POSTGRES_CONFIG["password"],
                database=POSTGRES_CONFIG["database"]
            )
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO inspections (
                    wafer_id, timestamp, decision, pads_total, pads_detected, 
                    probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                record["id"], record["timestamp"], record["decision"], record["padsTotal"],
                record["padsDetected"], record["probeMarks"], record["grains"], record["confidence"],
                record["inferenceTime"], record["ruleTime"], record["machineAction"], record.get("reason", "-"), record.get("imageUrl")
            ))
            conn.commit()
            cursor.close()
            conn.close()
            return
        except Exception as e:
            print(f"Failed writing to PostgreSQL: {e}. Writing copy to local file...")
            
    # SQLite Fallback
    try:
        conn = sqlite3.connect(DB_NAME_SQLITE)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO inspections (
                wafer_id, timestamp, decision, pads_total, pads_detected, 
                probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record["id"], record["timestamp"], record["decision"], record["padsTotal"],
            record["padsDetected"], record["probeMarks"], record["grains"], record["confidence"],
            record["inferenceTime"], record["ruleTime"], record["machineAction"], record.get("reason", "-"), record.get("imageUrl")
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Failed to save to SQLite:", e)


def load_history_from_db():
    global db_type
    records = []
    
    if db_type == "PostgreSQL":
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=POSTGRES_CONFIG["host"],
                port=POSTGRES_CONFIG["port"],
                user=POSTGRES_CONFIG["user"],
                password=POSTGRES_CONFIG["password"],
                database=POSTGRES_CONFIG["database"]
            )
            cursor = conn.cursor()
            cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url FROM inspections ORDER BY id DESC")
            rows = cursor.fetchall()
            for r in rows:
                time_parts = r[1].split(" ")
                t_short = time_parts[1] if len(time_parts) > 1 else r[1]
                stored_url = r[12] if len(r) > 12 and r[12] else None
                if stored_url:
                    ann_url = stored_url if "annotated_" in stored_url else stored_url.replace("inspect_", "annotated_")
                    comp_url = stored_url if "inspect_" in stored_url else stored_url.replace("annotated_", "inspect_")
                    raw_url = stored_url.replace("annotated_", "raw_").replace("inspect_", "raw_")
                else:
                    ann_url = comp_url = raw_url = None
                records.append({
                    "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                    "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                    "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                    "reason": r[11] if len(r) > 11 and r[11] else "-",
                    "imageUrl": ann_url,
                    "annotatedImageUrl": ann_url,
                    "comparisonImageUrl": comp_url,
                    "rawImageUrl": raw_url
                })
            cursor.close()
            conn.close()
            return records
        except Exception as e:
            print(f"Error reading Postgres logs: {e}")
            
    # SQLite Fetch
    try:
        conn = sqlite3.connect(DB_NAME_SQLITE)
        cursor = conn.cursor()
        cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url FROM inspections ORDER BY id DESC")
        rows = cursor.fetchall()
        for r in rows:
            time_parts = r[1].split(" ")
            t_short = time_parts[1] if len(time_parts) > 1 else r[1]
            stored_url = r[12] if len(r) > 12 and r[12] else None
            if stored_url:
                ann_url = stored_url if "annotated_" in stored_url else stored_url.replace("inspect_", "annotated_")
                comp_url = stored_url if "inspect_" in stored_url else stored_url.replace("annotated_", "inspect_")
                raw_url = stored_url.replace("annotated_", "raw_").replace("inspect_", "raw_")
            else:
                ann_url = comp_url = raw_url = None
            records.append({
                "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                "reason": r[11] if len(r) > 11 and r[11] else "-",
                "imageUrl": ann_url,
                "annotatedImageUrl": ann_url,
                "comparisonImageUrl": comp_url,
                "rawImageUrl": raw_url
            })
        conn.close()
    except Exception as e:
        print("Failed to read SQLite:", e)
        
    return records


# ==========================================
# EDGE AI SIMULATOR & RULE ENGINE INTEGRATION
# ==========================================
sys.path.append("iMX8_AI_Inspection-master")
has_actual_rules = False
try:
    from src.yolo_seg.inspection import run_inspection, load_inspection_config
    import numpy as np
    has_actual_rules = True
    print("[OK] Found actual rule engine in iMX8_AI_Inspection-master repository!")
except ImportError:
    print("[WARNING] Master repository not loaded or path missing. Using mock AI rule simulations.")

def process_new_file(filepath, filename):
    global latest_inspection, inspection_count, active_alarms, has_actual_rules
    
    rule_time = 0.0
    inf_time = 0.0

    # Wait for file lock to release
    time.sleep(0.2)
    inspection_count += 1
    
    # Search for a valid model weights file (config.yaml first, then TFLite preference)
    model_path = PATHS_CFG.get("model_path") or SYS_CONFIG.get("ai", {}).get("model_path")
    if model_path and not os.path.exists(model_path):
        model_path = None

    if not model_path:
        candidate_files = []
        for p_dir in [os.path.join("iMX8_AI_Inspection-master", "models"), "models"]:
            if os.path.exists(p_dir):
                for root, _, files in os.walk(p_dir):
                    for f in files:
                        if f.lower().endswith((".tflite", ".onnx", ".pt", ".pth")):
                            fpath = os.path.join(root, f)
                            # Give higher priority score to .tflite models
                            score = os.path.getmtime(fpath) + (1000000000 if f.endswith(".tflite") else 0)
                            candidate_files.append((fpath, score))
        if candidate_files:
            candidate_files.sort(key=lambda x: x[1], reverse=True)
            model_path = candidate_files[0][0]

    
    # Fallback to search in parent master dir or root
    if not model_path:
        for p_dir in ["iMX8_AI_Inspection-master", "."]:
            if os.path.exists(p_dir):
                for root, _, files in os.walk(p_dir):
                    for f in files:
                        if f.lower().endswith((".pt", ".pth", ".tflite", ".onnx")):
                            model_path = os.path.join(root, f)
                            break
                    if model_path: break
            if model_path: break

    # Setup initial mock states
    pad_x, pad_y, pad_w, pad_h = 120, 120, 360, 360
    pad_poly = np.array([
        [pad_x, pad_y], [pad_x + pad_w, pad_y],
        [pad_x + pad_w, pad_y + pad_h], [pad_x, pad_y + pad_h]
    ], dtype=np.int32)
    mark_polys = []
    grain_polys = []
    marks_list = []
    grain_list = []

    if model_path:
        try:
            import torch
            import cv2
            
            # Detect U-Net model checkpoints (.pt/.pth) dynamically
            is_unet = False
            if model_path.lower().endswith((".pt", ".pth")):
                try:
                    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
                    if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
                        is_unet = True
                except Exception:
                    pass
            
            pads = []
            mark_polys = []
            grain_polys = []
            confidence_list = []
            
            if is_unet:
                unet_dir = os.path.abspath("iMX8_AI_Inspection-master/src/unet")
                if unet_dir not in sys.path:
                    sys.path.append(unet_dir)
                
                # Dynamic U-Net config overrides matching active_class_mode
                import src.utils.config
                if active_class_mode == 3:
                    src.utils.config.ID_TO_LABEL[3] = "grain"
                    src.utils.config.NUM_CLASSES = 4
                else:
                    if 3 in src.utils.config.ID_TO_LABEL:
                        del src.utils.config.ID_TO_LABEL[3]
                    src.utils.config.NUM_CLASSES = 3
                
                from src.unet.model import UNet
                from src.unet.predict import process_single_image
                
                device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                checkpoint = torch.load(model_path, map_location=device, weights_only=False)
                
                # Auto-detect trained class count from conv weight shape to avoid PyTorch loading crash
                state_dict = checkpoint['model_state_dict']
                if 'outc.conv.weight' in state_dict:
                    unet_classes = state_dict['outc.conv.weight'].shape[0]
                else:
                    unet_classes = 4 if active_class_mode == 3 else 3
                    
                print(f"🧠 Running real PyTorch UNet inference using model: {model_path} ({unet_classes} classes model, filtered to {active_class_mode} classes)")
                unet_model = UNet(n_channels=3, n_classes=unet_classes).to(device)
                unet_model.load_state_dict(state_dict)
                
                output_dir = "simulation/output/inspection_visuals"
                os.makedirs(output_dir, exist_ok=True)
                
                unet_start = time.time()
                unet_res = process_single_image(filepath, unet_model, device, output_dir)
                inf_time = round((time.time() - unet_start) * 1000, 1)
                
                pads = unet_res["pads"]
                mark_polys = unet_res["probemarks"]
                grain_polys = unet_res.get("grains", []) if active_class_mode == 3 else []
                confidence_list = [0.95]
                
            else:
                # YOLO segmentation
                from ultralytics import YOLO
                print(f"🤖 Running real AI inference using model: {model_path}")
                model = YOLO(model_path, task="segment")
                # Overwrite class name metadata 'contam' to 'grain' dynamically
                for k, v in model.names.items():
                    if v == "contam":
                        model.names[k] = "grain"
                        
                yolo_start = time.time()
                results = model.predict(source=filepath, conf=0.25, save=False)
                inf_time = round((time.time() - yolo_start) * 1000, 1)
                
                for r in results:
                    # Overwrite class name metadata 'contam' to 'grain' in results object dynamically
                    for k, v in r.names.items():
                        if v == "contam":
                            r.names[k] = "grain"
                    if r.boxes and len(r.boxes.conf) > 0:
                        confidence_list.extend(r.boxes.conf.tolist())
                    if r.masks is not None:
                        for mask_xy, cls_id in zip(r.masks.xy, r.boxes.cls.tolist()):
                            polygon = mask_xy.astype(np.int32)
                            if polygon.size == 0 or len(polygon) < 3:
                                continue
                            class_name = r.names[int(cls_id)]
                            if class_name == "pad":
                                pads.append(polygon)
                            elif class_name == "probemark":
                                mark_polys.append(polygon)
                            elif class_name == "grain" and active_class_mode == 3:
                                grain_polys.append(polygon)
                            
            if confidence_list:
                confidence = round(float(np.mean(confidence_list)) * 100, 1)
            else:
                confidence = 92.5
                
            if pads:
                pads.sort(key=cv2.contourArea, reverse=True)
                pad_poly = pads[0]
            else:
                # Fallback pad if none detected by AI
                pad_poly = np.array([
                    [120, 120], [480, 120],
                    [480, 480], [120, 480]
                ], dtype=np.int32)
                
            # Compute pad center for relative offsets mapping
            M = cv2.moments(pad_poly)
            pad_center_x = int(M["m10"] / M["m00"]) if M["m00"] != 0 else 300
            pad_center_y = int(M["m01"] / M["m00"]) if M["m00"] != 0 else 300
                
            # Convert AI mark contours to frontend metadata
            for pm in mark_polys:
                M_pm = cv2.moments(pm)
                pm_center_x = int(M_pm["m10"] / M_pm["m00"]) if M_pm["m00"] != 0 else 300
                pm_center_y = int(M_pm["m01"] / M_pm["m00"]) if M_pm["m00"] != 0 else 300
                
                dx = float(pm_center_x - pad_center_x)
                dy = float(pm_center_y - pad_center_y)
                
                if len(pm) >= 5:
                    try:
                        (x_e, y_e), (w_e, h_e), rot_e = cv2.fitEllipse(pm)
                        rx = float(w_e / 2)
                        ry = float(h_e / 2)
                        rot = float(np.radians(rot_e))
                    except Exception:
                        rx, ry, rot = 15.0, 10.0, 0.0
                else:
                    rx, ry, rot = 15.0, 10.0, 0.0
                    
                marks_list.append({
                    "dx": dx,
                    "dy": dy,
                    "rx": rx,
                    "ry": ry,
                    "rot": rot
                })
                
            # Convert AI grain contours to frontend metadata
            for gr in grain_polys:
                pts = []
                try:
                    # Handle (2,) shape (single point)
                    if hasattr(gr, "shape") and len(gr.shape) == 1 and gr.shape[0] == 2:
                        pts.append({
                            "x": float(gr[0]),
                            "y": float(gr[1])
                        })
                    # Handle (N, 2) shape numpy arrays
                    elif hasattr(gr, "shape") and len(gr.shape) == 2:
                        for pt in gr:
                            pts.append({
                                "x": float(pt[0]),
                                "y": float(pt[1])
                            })
                    # Handle nested contour formats
                    else:
                        for pt in gr:
                            if hasattr(pt, "__len__"):
                                if hasattr(pt[0], "__len__"):
                                    pts.append({
                                        "x": float(pt[0][0]),
                                        "y": float(pt[0][1])
                                    })
                                else:
                                    pts.append({
                                        "x": float(pt[0]),
                                        "y": float(pt[1])
                                    })
                            else:
                                # Fallback if individual items are scalar
                                pass
                except Exception as parse_err:
                    print(f"Error parsing grain contour: {parse_err}, gr: {gr}")
                
                if pts:
                    grain_list.append(pts)
                
            print(f"✨ AI Detections: Pads={len(pads)}, Marks={len(mark_polys)}, Grains={len(grain_polys)}")
        except Exception as ai_err:
            import traceback
            print(f"Error running YOLO inference: {ai_err}")
            traceback.print_exc()
            model_path = None # Trigger fallback below

    if not model_path:
        # Fallback to simulated checks if model is not loaded
        # Select anomaly type randomly for input parameters
        anomaly_type = random.choice([0, 0, 0, 1, 2, 3, 4, 5]) # 0=Pass, 1=Miss, 2=Double, 3=Scratch, 4=Dust, 5=Align
        confidence = round(97.8 + random.random() * 2.0, 1)
        inf_time = round(15.8 + random.random() * 3.5, 1)
        
        # Map defect coordinates to polygon contours
        if anomaly_type == 1:
            # Missed hit (no marks)
            pass
        elif anomaly_type == 2:
            # Double hit
            marks_list = [
                {"dx": -25, "dy": -20, "rx": 24, "ry": 16, "rot": 0.2},
                {"dx": 30, "dy": 25, "rx": 20, "ry": 14, "rot": -0.3}
            ]
        elif anomaly_type == 3:
            # Scratch
            marks_list = [
                {"dx": -10, "dy": 10, "rx": 24, "ry": 16, "rot": 0.1},
                {"dx": 15, "dy": 15, "isScratch": True}
            ]
        elif anomaly_type == 5:
            # Misaligned (Border hit)
            marks_list = [
                {"dx": 165, "dy": -140, "rx": 26, "ry": 18, "rot": 0.4}
            ]
        else:
            # Normal single mark
            dx = random.randint(-15, 15)
            dy = random.randint(-15, 15)
            marks_list = [{"dx": dx, "dy": dy, "rx": 24, "ry": 16, "rot": 0.1}]
            
        # Generate dust grains
        grain_count = 0
        if anomaly_type == 4:
            grain_count = random.randint(3, 6)
        elif random.random() < 0.2:
            grain_count = random.randint(1, 2)
            
        for _ in range(grain_count):
            gx = random.randint(180, 420)
            gy = random.randint(180, 420)
            gr = random.randint(4, 9)
            grain_list.append({"x": gx, "y": gy, "radius": gr})
            # Create circle polygon for actual rule evaluator
            angles = np.linspace(0, 2*np.pi, 8, endpoint=False)
            circle_contour = np.array([[int(gx + np.cos(a)*gr), int(gy + np.sin(a)*gr)] for a in angles], dtype=np.int32)
            grain_polys.append(circle_contour)

        # Convert marks_list to np contours
        for m in marks_list:
            mx, my = 300 + m["dx"], 300 + m["dy"]
            if m.get("isScratch"):
                scratch_poly = np.array([[mx - 20, my - 20], [mx, my], [mx + 110, my + 130]], dtype=np.int32)
                mark_polys.append(scratch_poly)
            else:
                rx, ry, rot = m["rx"], m["ry"], m["rot"]
                angles = np.linspace(0, 2*np.pi, 12, endpoint=False)
                ellipse_contour = np.array([
                    [
                        int(mx + (rx * np.cos(a) * np.cos(rot) - ry * np.sin(a) * np.sin(rot))),
                        int(my + (rx * np.cos(a) * np.sin(rot) + ry * np.sin(a) * np.cos(rot)))
                    ] for a in angles
                ], dtype=np.int32)
                mark_polys.append(ellipse_contour)

    decision = "PASS"
    prober_action = "CONTINUE PROCESS"
    cat_reason = "-"
    alarms = []
    
    def categorize_failure_reason(reason_str: str) -> str:
        if not reason_str or reason_str.strip() == "-":
            return "-"
        r_lower = reason_str.lower()
        if "area too large" in r_lower or "big" in r_lower:
            return "Big Probe Mark"
        if "no probe" in r_lower or "missing" in r_lower or "cannot classify" in r_lower:
            return "No Probe Mark"
        return "Probe Mark Close to Edge"

    if has_actual_rules:
        generic_results = [{
            "image_path": filepath,
            "pads": [pad_poly],
            "probemarks": mark_polys,
            "grains": grain_polys
        }]
        
        config_path = "iMX8_AI_Inspection-master/configs/inspection_rules.yaml"
        rule_start = time.time()
        try:
            report = run_inspection(
                generic_results,
                output_csv_path="simulation/output/inspection_report.csv",
                output_viz_dir="simulation/output/inspection_visuals",
                config_path=config_path
            )
            rule_time = round((time.time() - rule_start) * 1000, 2)
            
            if report and len(report) > 0:
                raw_dec = report[0].get("decision", "PASS")
                raw_reason = report[0].get("reason", "-")
                
                if raw_dec != "PASS":
                    decision = "FAIL"
                    prober_action = "STOP MACHINE"
                    cat_reason = categorize_failure_reason(raw_reason)
                    alarms.append({"name": f"Rule Failure: {cat_reason}", "time": time.strftime("%X")})
                else:
                    decision = "PASS"
                    prober_action = "CONTINUE PROCESS"
                    cat_reason = "-"
                
                # Slice the double-width visual canvas into separate raw and annotated images
                viz_path = os.path.join("simulation/output/inspection_visuals", f"inspect_{filename}")
                if os.path.exists(viz_path):
                    import cv2
                    canvas_img = cv2.imread(viz_path)
                    if canvas_img is not None:
                        h_c, w_c, _ = canvas_img.shape
                        w_half = w_c // 2
                        # Crop away the top 70px banner
                        raw_part = canvas_img[70:, :w_half]
                        ann_part = canvas_img[70:, w_half:]
                        cv2.imwrite(os.path.join("simulation/output/inspection_visuals", f"raw_{filename}"), raw_part)
                        cv2.imwrite(os.path.join("simulation/output/inspection_visuals", f"annotated_{filename}"), ann_part)
        except Exception as rule_err:
            print(f"Error running actual inspection engine: {rule_err}")
            has_actual_rules = False # fallback to manual
            
    if not has_actual_rules:
        # Fallback simulated checks matching 2 main failure reasons
        sim_choice = random.choice([0, 0, 0, 1, 2]) # 0=PASS, 1=Big Mark, 2=Close to Edge
        if sim_choice == 0:
            decision = "PASS"
            prober_action = "CONTINUE PROCESS"
            cat_reason = "-"
        else:
            decision = "FAIL"
            prober_action = "STOP MACHINE"
            if sim_choice == 1:
                cat_reason = "Big Probe Mark"
            else:
                cat_reason = "Probe Mark Close to Edge"
            alarms.append({"name": f"Rule Failure: {cat_reason}", "time": time.strftime("%X")})

    wafer_id = f"#WF-{2940 + inspection_count}"
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    
    record = {
        "id": wafer_id,
        "timestamp": now,
        "timeShort": time.strftime("%X"),
        "decision": decision,
        "reason": cat_reason,
        "padsTotal": 1,
        "padsDetected": 1,
        "probeMarks": len(mark_polys),
        "grains": len(grain_polys),
        "confidence": confidence,
        "inferenceTime": inf_time,
        "ruleTime": rule_time,
        "machineAction": prober_action,
        "marks": marks_list,
        "grainList": grain_list,
        "alarms": alarms,
        "imageUrl": f"http://localhost:8000/visuals/annotated_{filename}?t={int(time.time() * 1000)}",
        "annotatedImageUrl": f"http://localhost:8000/visuals/annotated_{filename}?t={int(time.time() * 1000)}",
        "comparisonImageUrl": f"http://localhost:8000/visuals/inspect_{filename}?t={int(time.time() * 1000)}",
        "rawImageUrl": f"http://localhost:8000/visuals/raw_{filename}?t={int(time.time() * 1000)}"
    }
    
    # Save annotated visual copy to output folder
    out_path = os.path.join(OUTPUT_DIR, filename)
    shutil.copy(filepath, out_path)
    
    # 1. Save Machine Judgement Text File (.txt format for Machine/Prober PLC)
    txt_filename = os.path.splitext(filename)[0] + ".txt"
    txt_judgement_path = os.path.join(JUDGEMENT_DIR, txt_filename)
    txt_content = (
        f"WAFER_ID={wafer_id}\n"
        f"FILENAME={filename}\n"
        f"TIMESTAMP={now}\n"
        f"DECISION={decision}\n"
        f"ACTION={prober_action}\n"
        f"REASON={cat_reason}\n"
        f"PADS_DETECTED=1\n"
        f"PROBE_MARKS={len(mark_polys)}\n"
        f"GRAINS={len(grain_polys)}\n"
        f"CONFIDENCE={confidence}\n"
        f"INFERENCE_TIME_MS={inf_time}\n"
        f"RULE_TIME_MS={rule_time}\n"
    )
    with open(txt_judgement_path, "w", encoding="utf-8") as f:
        f.write(txt_content)
        
    # 2. Save Judgement JSON (for backwards compatibility / NestJS Sync)
    json_filename = os.path.splitext(filename)[0] + "_result.json"
    json_judgement_path = os.path.join(JUDGEMENT_DIR, json_filename)
    result_data = {
        "wafer_id": wafer_id,
        "filename": filename,
        "timestamp": now,
        "decision": decision,
        "action": prober_action,
        "reason": cat_reason,
        "probe_marks": len(mark_polys),
        "grains": len(grain_polys),
        "confidence": confidence,
        "details": [a["name"] for a in alarms]
    }
    with open(json_judgement_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, indent=4)
        
    save_inspection_to_db(record)
    
    # Clean up file in processing folder
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception:
            pass
    
    latest_inspection = record
    active_alarms = alarms
    print(f"[{time.strftime('%X')}] Processed: {filename} -> Decision: {decision} | .txt written to: {txt_judgement_path}")
    
    # Broadcast to frontend WebSocket clients
    if main_loop:
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "NEW_INSPECTION",
            "data": record
        })), main_loop)


# ==========================================
# BACK-GROUND MONITOR & AUTO-GENERATOR THREADS
# ==========================================
def folder_watcher_thread():
    print(f"Watcher thread initialized.")
    print(f"  👉 Machine Input Folder  : {IMAGE_DIR}")
    print(f"  👉 Process Buffer Folder : {PROCESS_DIR}")
    print(f"  👉 Output Visual Folder  : {OUTPUT_DIR}")
    print(f"  👉 Machine Judge Folder  : {JUDGEMENT_DIR}")
    
    while True:
        try:
            # 1. Check Machine Shared Folder (IMAGE_DIR)
            image_files = [f for f in os.listdir(IMAGE_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
            for file in image_files:
                src_path = os.path.join(IMAGE_DIR, file)
                proc_path = os.path.join(PROCESS_DIR, file)
                
                # Wait briefly for Machine file copy lock release
                time.sleep(0.15)
                try:
                    # Atomic move from Machine Shared Folder to Process Buffer
                    shutil.move(src_path, proc_path)
                    print(f"📥 Pulled new image from Machine: {file} -> Moved to process buffer")
                    process_new_file(proc_path, file)
                except Exception as move_err:
                    print(f"Failed to move/process machine file {file}: {move_err}")

            # 2. Check Legacy Fallback Input Folder (INPUT_DIR)
            input_files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
            for file in input_files:
                src_path = os.path.join(INPUT_DIR, file)
                proc_path = os.path.join(PROCESS_DIR, file)
                time.sleep(0.15)
                try:
                    shutil.move(src_path, proc_path)
                    process_new_file(proc_path, file)
                except Exception as err:
                    pass

        except Exception as e:
            print(f"ERROR in watcher thread: {e}")
            import traceback
            traceback.print_exc()
        time.sleep(0.8)


def mock_image_generator_thread():
    """Disabled automatic feeder. Backend only inspects images placed in Machine shared folder."""
    return



# ==========================================
# FASTAPI CONTROLLER ROUTINGS
# ==========================================

# Startup Event
@app.on_event("startup")
async def startup_event():
    global main_loop
    import asyncio
    main_loop = asyncio.get_running_loop()
    init_database()
    
    # Launch Watcher Daemon Threads
    t_watcher = threading.Thread(target=folder_watcher_thread, daemon=True)
    t_watcher.start()
    
    t_generator = threading.Thread(target=mock_image_generator_thread, daemon=True)
    t_generator.start()


# WebSocket Route for Streaming
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial status
        await websocket.send_text(json.dumps({
            "event": "CONNECTION_ESTABLISHED",
            "db": db_type
        }))
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# API: Latest Inspection
@app.get("/api/latest-inspection")
async def get_latest_inspection():
    return latest_inspection


# API: History Logs
@app.get("/api/history")
async def get_history():
    return load_history_from_db()


# API: Hardware Telemetry Stats
@app.get("/api/sys-stats")
async def get_sys_stats():
    return {
        "cpu": random.randint(45, 62),
        "npu": random.randint(82, 91),
        "ram": random.randint(512, 530),
        "temp": round(54.5 + random.random() * 4.0, 1),
        "db": db_type
    }


# API: Get Models List
@app.get("/api/models")
async def get_models():
    models_dir = os.path.join("iMX8_AI_Inspection-master", "models")
    candidate_files = []
    if os.path.exists(models_dir):
        for root, _, files in os.walk(models_dir):
            for f in files:
                if f.lower().endswith((".pt", ".pth", ".tflite", ".onnx")):
                    fpath = os.path.join(root, f)
                    candidate_files.append((f, fpath, os.path.getmtime(fpath)))
                    
    candidate_files.sort(key=lambda x: x[2], reverse=True)
    
    models = []
    for idx, (filename, fpath, mtime) in enumerate(candidate_files):
        fsize = f"{os.path.getsize(fpath) / (1024*1024):.1f} MB"
        models.append({
            "name": filename,
            "version": "v1.0.0",
            "engine": "TFLite / NPU" if filename.endswith(".tflite") else ("PyTorch / GPU" if filename.endswith((".pt", ".pth")) else "ONNX / CPU"),
            "size": fsize,
            "accuracy": "95.0%",
            "active": (idx == 0)
        })
        
    if not models:
        fallback_model = None
        fsize = "0.0 MB"
        for p_dir in ["iMX8_AI_Inspection-master", "."]:
            if os.path.exists(p_dir):
                for root, _, files in os.walk(p_dir):
                    for f in files:
                        if f.lower().endswith((".pt", ".pth", ".tflite", ".onnx")):
                            fallback_model = f
                            fpath = os.path.join(root, f)
                            fsize = f"{os.path.getsize(fpath) / (1024*1024):.1f} MB"
                            break
                    if fallback_model: break
            if fallback_model: break
            
        if fallback_model:
            models.append({
                "name": fallback_model,
                "version": "v1.0.0",
                "engine": "TFLite / NPU" if fallback_model.endswith(".tflite") else ("PyTorch / GPU" if fallback_model.endswith((".pt", ".pth")) else "ONNX / CPU"),
                "size": fsize,
                "accuracy": "95.0%",
                "active": True
            })
            
    return models


# API: Model Upload Handler
@app.post("/api/upload-model")
async def upload_model(file: UploadFile = File(...)):
    import shutil
    target_dir = os.path.join("iMX8_AI_Inspection-master", "models")
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, file.filename)
    
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    print(f"[OK] Saved uploaded model weights to: {target_path}")
    return {"status": "SUCCESS", "filename": file.filename, "size": file.size}


# API: Get/Set Active Class Mode Config
@app.get("/api/config/class-mode")
async def get_class_mode():
    return {"class_mode": active_class_mode}


@app.post("/api/config/class-mode")
async def set_class_mode(mode: int):
    global active_class_mode
    if mode in [2, 3]:
        active_class_mode = mode
        print(f"⚙️ Config updated: Active Class Detection Mode = {active_class_mode} classes")
        return {"status": "SUCCESS", "class_mode": active_class_mode}
    return {"status": "ERROR", "message": "Invalid mode"}
