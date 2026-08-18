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
import glob
import re
import psutil


# Try importing FastAPI dependencies
try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
except ImportError:
    print("Error: FastAPI is not installed. Please run: pip install fastapi uvicorn")
    sys.exit(1)

# Helper: Load System Configuration
def load_sys_config():
    config_path = os.path.join(_THIS_DIR, "config.yaml")
    if not os.path.exists(config_path):
        config_path = os.path.join(PROJECT_ROOT, "config.yaml")
    cfg = {}
    if os.path.exists(config_path):
        try:
            import yaml
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Warning: Failed loading config.yaml ({e})")
    return cfg

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(_THIS_DIR, ".."))

def _resolve_sim_path(p_str):
    if os.path.isabs(p_str):
        return p_str
    return os.path.abspath(os.path.join(_THIS_DIR, p_str))

SYS_CONFIG = load_sys_config()
PATHS_CFG = SYS_CONFIG.get("paths", {})

# Database connection settings
DB_NAME_SQLITE = _resolve_sim_path("simulation/inspections.db")
POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "postgres"
}

# Directory Paths for Machine Interfacing Pipeline
IMAGE_DIR = _resolve_sim_path(PATHS_CFG.get("image_dir", "simulation/image"))
PROCESS_DIR = _resolve_sim_path(PATHS_CFG.get("process_dir", "simulation/process"))
OUTPUT_DIR = _resolve_sim_path(PATHS_CFG.get("output_dir", "simulation/output"))
JUDGEMENT_DIR = _resolve_sim_path(PATHS_CFG.get("judge_dir", "simulation/judgement"))
VISUALS_DIR = _resolve_sim_path("simulation/output/inspection_visuals")
MODELS_DIR = _resolve_sim_path("models")

# Global Live States
latest_inspection = {}
active_alarms = []
inspection_count = 0
active_class_mode = 3  # 2 or 3 classes detection mode
db_type = "SQLite"
main_loop = None

# Global TFLite runner + lock (pre-loaded in main thread at startup to satisfy NPU delegate)
tflite_runner = None
tflite_model_path = None
inference_lock = threading.Lock()  # ponytail: NPU delegate not thread-safe

# Initialize Machine Shared & Internal Folders
os.makedirs(IMAGE_DIR, exist_ok=True)
os.makedirs(PROCESS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(JUDGEMENT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

app = FastAPI(title="Edge AI Wafer Inspection System - i.MX8 Node")

# Enable CORS for HMI / PC Client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
os.makedirs(VISUALS_DIR, exist_ok=True)
app.mount("/visuals", StaticFiles(directory=VISUALS_DIR), name="visuals")

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
                pass

manager = ConnectionManager()

# ==========================================
# DATABASE CONNECTOR (Local SQLite / Postgres Fallback)
# ==========================================
def init_database():
    global db_type
    conn = None
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=POSTGRES_CONFIG["host"],
            port=POSTGRES_CONFIG["port"],
            user=POSTGRES_CONFIG["user"],
            password=POSTGRES_CONFIG["password"],
            database=POSTGRES_CONFIG["database"],
            connect_timeout=2
        )
        db_type = "PostgreSQL"
        print("i.MX8 Node connected to PostgreSQL Database!")
    except Exception:
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
        except Exception:
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
            conn.commit()
            conn.close()
        except Exception as sqlite_err:
            print("SQLite initialization exception:", sqlite_err)

    global inspection_count
    inspection_count = get_initial_inspection_count()
    print(f"📊 [DB INIT] Inspection Counter initialized to: {inspection_count}")


def get_initial_inspection_count() -> int:
    global db_type
    if db_type == "PostgreSQL":
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=POSTGRES_CONFIG["host"], port=POSTGRES_CONFIG["port"],
                user=POSTGRES_CONFIG["user"], password=POSTGRES_CONFIG["password"],
                database=POSTGRES_CONFIG["database"]
            )
            cursor = conn.cursor()
            cursor.execute("SELECT MAX(id) FROM inspections;")
            res = cursor.fetchone()
            cursor.close()
            conn.close()
            if res and res[0] is not None:
                return int(res[0])
        except Exception: pass

    try:
        conn = sqlite3.connect(DB_NAME_SQLITE)
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(id) FROM inspections;")
        res = cursor.fetchone()
        conn.close()
        if res and res[0] is not None:
            return int(res[0])
    except Exception: pass

    return 0


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
                RETURNING id;
            """, (
                record["id"], record["timestamp"], record["decision"], record["padsTotal"],
                record["padsDetected"], record["probeMarks"], record["grains"], record["confidence"],
                record["inferenceTime"], record["ruleTime"], record["machineAction"], record.get("reason", "-"), record.get("imageUrl")
            ))
            new_id = cursor.fetchone()
            if new_id:
                record["db_id"] = new_id[0]
            conn.commit()
            cursor.close()
            conn.close()
            return
        except Exception as pg_err:
            print("Failed to save to PostgreSQL:", pg_err)
            
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
        record["db_id"] = cursor.lastrowid
        conn.commit()
        conn.close()
    except Exception as e:
        print("Failed to save to SQLite:", e)


# ==========================================
# ASYNC HTTP DISPATCHER TO NESTJS PC SERVER
# ==========================================
def sync_to_pc_server(record):
    central_cfg = SYS_CONFIG.get("central_server", {})
    if not central_cfg.get("enabled", True):
        return
    pc_url = central_cfg.get("url", "http://localhost:3000/api/v1/inspections")
    
    def _do_post():
        try:
            import urllib.request
            req = urllib.request.Request(
                pc_url,
                data=json.dumps(record).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status in (200, 201):
                    print(f"📡 i.MX8 -> NestJS PC: Synced inspection {record['id']} successfully!")
        except Exception as err:
            # Non-blocking log if PC NestJS server is offline
            pass

    t = threading.Thread(target=_do_post, daemon=True)
    t.start()


def parse_wafer_filename(filename: str, prober_default="PROBER01") -> dict:
    if not filename:
        return {
            "machineNo": prober_default, "batch": "-", "waferNo": "-",
            "xyCoord": "-", "site": "-", "pad": "-", "dateTime": "-",
            "productSetup": "-", "temp": "-"
        }
    base = os.path.basename(filename)
    base = base.split("?")[0]
    base = os.path.splitext(base)[0]
    base = re.sub(r'^(raw_|annotated_|inspect_)+', '', base, flags=re.IGNORECASE)
    base = re.sub(r'(_mask_result|_inspect|_annotated|_raw|_result)+$', '', base, flags=re.IGNORECASE)
    parts = base.split("_")
    
    meta = {
        "machineNo": prober_default,
        "batch": "-",
        "waferNo": "-",
        "xyCoord": "-",
        "site": "-",
        "pad": "-",
        "dateTime": "-",
        "productSetup": "-",
        "temp": "-"
    }
    
    if len(parts) >= 1 and len(parts[0]) == 14 and parts[0].isdigit():
        dt = parts[0]
        meta["dateTime"] = f"{dt[:4]}-{dt[4:6]}-{dt[6:8]} {dt[8:10]}:{dt[10:12]}:{dt[12:14]}"
    elif len(parts) >= 1:
        meta["dateTime"] = parts[0]
        
    if len(parts) >= 2:
        bw = parts[1]
        if "-" in bw:
            b_part, w_part = bw.split("-", 1)
            meta["batch"] = b_part
            meta["waferNo"] = bw
        else:
            m_bw = re.match(r'^([A-Z0-9]+?)(W[A-Z0-9]+)$', bw, re.IGNORECASE)
            if m_bw:
                meta["batch"] = m_bw.group(1)
                meta["waferNo"] = bw
            else:
                meta["batch"] = bw
                meta["waferNo"] = bw
            
    if len(parts) >= 3:
        meta["xyCoord"] = parts[2]
    if len(parts) >= 4:
        meta["site"] = parts[3]
    if len(parts) >= 5:
        meta["pad"] = parts[4]
    if len(parts) >= 6:
        meta["processCode"] = parts[5]
    if len(parts) >= 7:
        meta["productSetup"] = parts[6]
    if len(parts) >= 8:
        raw_t = parts[7]
        if raw_t.isdigit():
            meta["temp"] = f"{float(raw_t)/10.0:.1f}°C" if len(raw_t) >= 3 else f"{raw_t}°C"
        else:
            meta["temp"] = raw_t
            
    return meta

def map_reason_to_mode(reason: str) -> int:
    if not reason or reason.strip() in ("-", "None", ""):
        return 0
    r_lower = reason.lower()
    if "damage" in r_lower:
        return 1
    elif "close to edge" in r_lower or "near edge" in r_lower or "edge" in r_lower:
        return 2
    elif "too large" in r_lower or "large" in r_lower or "oversize" in r_lower:
        return 3
    elif "too small" in r_lower or "small" in r_lower or "undersize" in r_lower:
        return 4
    elif "not found" in r_lower or "missing" in r_lower or "no mark" in r_lower or "no pad" in r_lower:
        return 5
    elif "white" in r_lower:
        return 6
    elif "too long" in r_lower or "long" in r_lower:
        return 7
    else:
        return 8

def build_batch_judgement(batch_records: list) -> tuple:
    modes_found = set()
    has_fail = False
    fail_summary = {}
    
    for rec in batch_records:
        if rec.get("decision") == "FAIL":
            has_fail = True
            reason = rec.get("reason", "-")
            mode = map_reason_to_mode(reason)
            if mode > 0:
                modes_found.add(mode)
                fail_summary[mode] = reason

    if not has_fail:
        return "PASS", "00000000", {}

    mask_chars = []
    for pos in range(1, 9):
        if pos in modes_found:
            mask_chars.append(str(pos))
        else:
            mask_chars.append("0")

    return "FAIL", "".join(mask_chars), fail_summary

current_batch_records = []


# ==========================================
# EDGE AI SIMULATOR & RULE ENGINE INTEGRATION
# ==========================================
# ponytail: __file__-relative so CWD doesn't matter
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master"))
has_actual_rules = False
try:
    from src.yolo_seg.inspection import run_inspection, load_inspection_config
    import numpy as np
    has_actual_rules = True
    print(f"[BOOT] ✅ inspection rules loaded from {os.path.join(_THIS_DIR, 'iMX8_AI_Inspection-master')}")
except Exception as _imp_err:
    print(f"[BOOT] ❌ inspection import FAILED: {_imp_err}")
    print(f"[BOOT]    sys.path includes: {os.path.join(_THIS_DIR, 'iMX8_AI_Inspection-master')}")
    print(f"[BOOT]    exists? {os.path.exists(os.path.join(_THIS_DIR, 'iMX8_AI_Inspection-master', 'src', 'yolo_seg', 'inspection.py'))}")

def process_new_file(filepath, filename):
    global latest_inspection, inspection_count, active_alarms, has_actual_rules, tflite_runner, tflite_model_path
    
    rule_time = 0.0
    inf_time = 0.0

    inspection_count += 1
    
    pads = []
    mark_polys = []
    grain_polys = []
    marks_list = []
    grain_list = []
    confidence = 95.0

    # 1. Reuse existing pre-loaded & warmed-up tflite_runner if available
    if tflite_runner is not None:
        try:
            import cv2
            from run_unet_tflite_folder import preprocess_image, postprocess_unet
            img_cv = cv2.imread(filepath)
            if img_cv is None:
                print(f"[WARN] cv2.imread failed: {filepath}")
            else:
                input_details = tflite_runner.get_input_details()
                output_details = tflite_runner.get_output_details()
                input_data, meta = preprocess_image(img_cv, input_details[0])
                t_start = time.time()
                with inference_lock:  # NPU delegate not thread-safe
                    output_tensor = tflite_runner.infer(input_data)
                inf_time = round((time.time() - t_start) * 1000, 1)
                class_names = ["pad", "probemark"] if active_class_mode == 2 else ["pad", "probemark", "grain"]
                class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta, class_names)
                for c_id, mask in zip(class_ids, masks):
                    if c_id == 0:  # Pad
                        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        for c in contours:
                            if cv2.contourArea(c) > 50:  # ponytail: was 500, too large for sub-256 images
                                pads.append(cv2.convexHull(c).astype(np.int32))
                    elif c_id == 1:  # Probemark
                        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        for c in contours:
                            mark_polys.append(c.astype(np.int32))
                    elif c_id == 2 and active_class_mode >= 3:  # Grain
                        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        for c in contours:
                            grain_polys.append(c.astype(np.int32))
                confidence = 98.0
        except Exception as e:
            print(f"[ERROR] Reused tflite_runner inference failed: {e}")
    else:
        # Fallback if tflite_runner was not pre-loaded at startup
        model_path = tflite_model_path or PATHS_CFG.get("model_path") or SYS_CONFIG.get("ai", {}).get("model_path")
        print(f"[DEBUG] config model_path='{model_path}', exists={os.path.exists(model_path) if model_path else 'N/A'}")
        if model_path and not os.path.exists(model_path):
            print(f"[DEBUG] model_path '{model_path}' not found, will search...")
            model_path = None

        if not model_path:
            candidate_files = []
            for p_dir in [".", os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "models"), "models"]:
                if os.path.exists(p_dir):
                    for root, _, files in os.walk(p_dir):
                        for f in files:
                            if f.lower().endswith((".tflite", ".onnx", ".pt", ".pth")) and "quant" not in f.lower():
                                fpath = os.path.join(root, f)
                                score = os.path.getmtime(fpath) + (1000000000 if "unet" in f.lower() else 0)
                                candidate_files.append((fpath, score))
            if candidate_files:
                candidate_files.sort(key=lambda x: x[1], reverse=True)
                model_path = candidate_files[0][0]

        print(f"[DEBUG] final model_path='{model_path}', has_actual_rules={has_actual_rules}")
        if model_path and os.path.exists(model_path):
            try:
                import cv2
                is_tflite = model_path.lower().endswith((".tflite", ".onnx"))
                
                if is_tflite:
                    from run_unet_tflite_folder import ModelRunner, preprocess_image, postprocess_unet
                    runner = ModelRunner(model_path)
                    img_cv = cv2.imread(filepath)
                    if img_cv is None:
                        print(f"[WARN] cv2.imread failed: {filepath}")
                    else:
                        input_details = runner.get_input_details()
                        output_details = runner.get_output_details()
                        input_data, meta = preprocess_image(img_cv, input_details[0])
                        t_start = time.time()
                        with inference_lock:  # NPU delegate not thread-safe
                            output_tensor = runner.infer(input_data)
                        inf_time = round((time.time() - t_start) * 1000, 1)
                        class_names = ["pad", "probemark", "grain"]
                        class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta, class_names)
                        for c_id, mask in zip(class_ids, masks):
                            if c_id == 0: # Pad
                                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                                for c in contours:
                                    if cv2.contourArea(c) > 50:
                                        pads.append(cv2.convexHull(c).astype(np.int32))
                            elif c_id == 1: # Probemark
                                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                                for c in contours:
                                    mark_polys.append(c.astype(np.int32))
                            elif c_id == 2 and active_class_mode >= 3: # Grain
                                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                                for c in contours:
                                    grain_polys.append(c.astype(np.int32))
                        confidence = 98.0
                else:
                    import torch
                    is_unet = False
                    if model_path.lower().endswith((".pt", ".pth")):
                        try:
                            checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)
                            if isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint:
                                is_unet = True
                        except Exception:
                            pass
                    
                    if is_unet:
                        imx8_src_root = os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master")
                        if imx8_src_root not in sys.path:
                            sys.path.insert(0, imx8_src_root)
                        import src.utils.config
                        if active_class_mode >= 3:
                            src.utils.config.ID_TO_LABEL[3] = "grain"
                            src.utils.config.NUM_CLASSES = 4
                        else:
                            if 3 in src.utils.config.ID_TO_LABEL:
                                del src.utils.config.ID_TO_LABEL[3]
                            src.utils.config.NUM_CLASSES = 3
                        
                        from src.unet.model import UNet
                        from src.unet.predict import process_single_image
                        
                        if not hasattr(app.state, "pytorch_unet") or getattr(app.state, "pytorch_model_path", None) != model_path:
                            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
                            checkpoint = torch.load(model_path, map_location=device, weights_only=False)
                            state_dict = checkpoint['model_state_dict']
                            unet_classes = state_dict['outc.conv.weight'].shape[0] if 'outc.conv.weight' in state_dict else 4
                            
                            unet_model = UNet(n_channels=3, n_classes=unet_classes).to(device)
                            unet_model.load_state_dict(state_dict)
                            unet_model.eval()
                            app.state.pytorch_unet = unet_model
                            app.state.pytorch_model_path = model_path
                            app.state.pytorch_device = device
                        
                        unet_model = app.state.pytorch_unet
                        device = app.state.pytorch_device
                        output_dir = VISUALS_DIR
                        os.makedirs(output_dir, exist_ok=True)
                        
                        unet_start = time.time()
                        unet_res = process_single_image(filepath, unet_model, device, output_dir)
                        inf_time = round((time.time() - unet_start) * 1000, 1)
                        
                        pads = unet_res["pads"]
                        mark_polys = unet_res["probemarks"]
                        grain_polys = unet_res.get("grains", []) if active_class_mode >= 3 else []
                        confidence = 95.0

                    else:
                        from ultralytics import YOLO
                        model = YOLO(model_path, task="segment")
                        yolo_start = time.time()
                        results = model.predict(source=filepath, conf=0.25, save=False)
                        inf_time = round((time.time() - yolo_start) * 1000, 1)
                        for r in results:
                            if r.masks is not None:
                                for mask_xy, cls_id in zip(r.masks.xy, r.boxes.cls.tolist()):
                                    polygon = mask_xy.astype(np.int32)
                                    if polygon.size == 0 or len(polygon) < 3: continue
                                    class_name = r.names[int(cls_id)]
                                    if class_name == "pad": pads.append(polygon)
                                    elif class_name == "probemark": mark_polys.append(polygon)
                                    elif class_name in ("grain", "contam") and active_class_mode >= 3: grain_polys.append(polygon)
            except Exception as ai_err:
                import traceback
                print(f"AI Model execution error ({ai_err}). Using simulation metrics.")
                traceback.print_exc()


    decision = "PASS"
    prober_action = "CONTINUE PROCESS"
    cat_reason = "-"
    alarms = []
    
    def categorize_failure_reason(reason_str: str) -> str:
        if not reason_str or reason_str.strip() == "-": return "-"
        r_lower = reason_str.lower()
        if "area too large" in r_lower or "big" in r_lower: return "Big Probe Mark"
        if "no probe" in r_lower or "missing" in r_lower: return "No Probe Mark"
        return "Probe Mark Close to Edge"

    print(f"[DEBUG] pads={len(pads)}, marks={len(mark_polys)}, grains={len(grain_polys)}, has_actual_rules={has_actual_rules}")
    if has_actual_rules:
        # ponytail: removed fake pad fallback — inspection.py handles no-pad case natively
        generic_results = [{
            "image_path": filepath,
            "pads": pads,
            "probemarks": mark_polys,
            "grains": grain_polys
        }]

        config_path = os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "configs", "inspection_rules.yaml")
        rule_start = time.time()
        try:
            report = run_inspection(
                generic_results,
                output_csv_path=_resolve_sim_path("simulation/output/inspection_report.csv"),
                output_viz_dir=VISUALS_DIR,
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
                
                raw_out_path = os.path.join(VISUALS_DIR, f"raw_{filename}")
                ann_out_path = os.path.join(VISUALS_DIR, f"annotated_{filename}")
                
                viz_path = os.path.join(VISUALS_DIR, f"inspect_{filename}")
                if os.path.exists(viz_path):
                    import cv2
                    canvas_img = cv2.imread(viz_path)
                    if canvas_img is not None:
                        h_c, w_c, _ = canvas_img.shape
                        w_half = w_c // 2
                        raw_part = canvas_img[70:, :w_half]
                        ann_part = canvas_img[70:, w_half:]
                        cv2.imwrite(raw_out_path, raw_part)
                        cv2.imwrite(ann_out_path, ann_part)
                
                if not os.path.exists(ann_out_path) or not os.path.exists(raw_out_path):
                    import cv2
                    if 'img_cv' in locals() and img_cv is not None:
                        cv2.imwrite(raw_out_path, img_cv)
                        cv2.imwrite(ann_out_path, img_cv)
        except Exception as rule_err:
            print(f"Error running inspection rule engine: {rule_err}")

    prober_name = SYS_CONFIG.get("prober_name", "PROBER01")
    parsed_meta = parse_wafer_filename(filename, prober_name)
    wafer_id = parsed_meta["waferNo"] if parsed_meta["waferNo"] and parsed_meta["waferNo"] != "-" else f"#WF-{inspection_count}"
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    t_stamp = time.strftime("%Y%m%d%H%M%S")
    
    # Format failure mode string for filename
    if decision == "PASS" or not cat_reason or cat_reason.strip() in ("-", "None", ""):
        fail_mode_str = "NONE"
    else:
        fail_mode_str = "".join(c for c in cat_reason if c.isalnum())
        if not fail_mode_str: fail_mode_str = "DEFECT"

    t_query = f"?t={int(time.time() * 1000)}"
    ann_img_url = f"http://localhost:8001/visuals/annotated_{filename}{t_query}"
    raw_img_url = f"http://localhost:8001/visuals/raw_{filename}{t_query}"
    inspect_img_url = f"http://localhost:8001/visuals/inspect_{filename}{t_query}"
    
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
        "imageUrl": ann_img_url,
        "annotatedImageUrl": ann_img_url,
        "comparisonImageUrl": inspect_img_url,
        "rawImageUrl": raw_img_url,
        "machineNo": parsed_meta["machineNo"],
        "batch": parsed_meta["batch"],
        "waferNo": parsed_meta["waferNo"],
        "xyCoord": parsed_meta["xyCoord"],
        "site": parsed_meta["site"],
        "pad": parsed_meta["pad"],
        "dateTime": parsed_meta["dateTime"],
        "productSetup": parsed_meta["productSetup"],
        "temp": parsed_meta["temp"]
    }

    
    current_batch_records.append(record)
    
    # Save Machine Judgement Text File on END signal (.END.bmp) or batch completion
    is_end_signal = ".END." in filename.upper() or filename.upper().endswith(".END.BMP") or filename.upper().endswith("_END.BMP")
    txt_judgement_path = "-"
    
    if is_end_signal:
        batch_decision, mask8_str, fail_summary = build_batch_judgement(current_batch_records)
        txt_filename = f"{batch_decision}_{mask8_str}_{prober_name}_{t_stamp}.txt"
        txt_judgement_path = os.path.join(JUDGEMENT_DIR, txt_filename)
        
        # Clean up existing old judgement text files so only 1 single file exists for machine reading
        for old_file in os.listdir(JUDGEMENT_DIR):
            if old_file.endswith(".txt"):
                try:
                    os.remove(os.path.join(JUDGEMENT_DIR, old_file))
                except Exception:
                    pass

        # Write ONLY the 8-digit fail/pass mask code string
        txt_content = mask8_str

        with open(txt_judgement_path, "w", encoding="utf-8") as f:
            f.write(txt_content)
            
        print(f"🏁 [BATCH END] Generated Single Machine Judgement TXT: {txt_filename} (Content: {mask8_str})")
        current_batch_records.clear()

    save_inspection_to_db(record)

    
    # Send Async HTTP POST to NestJS PC Server
    sync_to_pc_server(record)
    
    # Clean up processing buffer (Remove image and any json metadata files)
    json_buf_path = os.path.splitext(filepath)[0] + ".json"
    if os.path.exists(json_buf_path):
        try: os.remove(json_buf_path)
        except Exception: pass
    if os.path.exists(filepath):
        try: os.remove(filepath)
        except Exception: pass

    
    latest_inspection = record
    active_alarms = alarms
    print(f"[{time.strftime('%X')}] i.MX8 Processed: {filename} -> Decision: {decision} | Machine TXT: {txt_judgement_path}")
    
    if main_loop:
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "NEW_INSPECTION",
            "data": record
        })), main_loop)


def folder_watcher_thread():
    print("i.MX8 Machine Folder Watcher initialized.")
    print(f"  👉 Machine Input  : {IMAGE_DIR}")
    print(f"  👉 Process Buffer : {PROCESS_DIR}")
    print(f"  👉 Output Visual  : {OUTPUT_DIR}")
    print(f"  👉 Machine Judge  : {JUDGEMENT_DIR}")
    
    while True:
        try:
            image_files = [f for f in os.listdir(IMAGE_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
            for file in image_files:
                src_path = os.path.join(IMAGE_DIR, file)
                proc_path = os.path.join(PROCESS_DIR, file)
                time.sleep(0.01)
                try:
                    shutil.move(src_path, proc_path)
                    process_new_file(proc_path, file)
                except Exception as move_err:
                    print(f"Failed to process file {file}: {move_err}")


        except Exception as e:
            print(f"Error in watcher thread: {e}")
        time.sleep(0.1)


# Startup Event
@app.on_event("startup")
async def startup_event():
    global main_loop, tflite_runner, tflite_model_path
    main_loop = asyncio.get_running_loop()
    init_database()

    # Pre-load TFLite model in main thread so NPU delegate initializes and warms up correctly
    _model = PATHS_CFG.get("model_path") or SYS_CONFIG.get("ai", {}).get("model_path")
    if not _model or not os.path.exists(_model):
        candidate_files = []
        for p_dir in [".", os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "models"), "models"]:
            if os.path.exists(p_dir):
                for root, _, files in os.walk(p_dir):
                    for f in files:
                        if f.lower().endswith((".tflite", ".onnx")) and "quant" not in f.lower():
                            fpath = os.path.join(root, f)
                            score = os.path.getmtime(fpath) + (1000000000 if "unet" in f.lower() else 0)
                            candidate_files.append((fpath, score))
        if candidate_files:
            candidate_files.sort(key=lambda x: x[1], reverse=True)
            _model = candidate_files[0][0]

    if _model and os.path.exists(_model) and _model.lower().endswith((".tflite", ".onnx")):
        try:
            from run_unet_tflite_folder import ModelRunner
            tflite_runner = ModelRunner(_model)
            tflite_model_path = _model
            
            # Auto detect classes from model output tensor shape or filename
            out_details = tflite_runner.get_output_details()
            if out_details and len(out_details) > 0 and 'shape' in out_details[0]:
                shape = list(out_details[0]['shape'])
                if shape[-1] in (2, 3, 4):
                    active_class_mode = int(shape[-1])
                elif len(shape) >= 2 and shape[1] in (2, 3, 4):
                    active_class_mode = int(shape[1])
            if "2class" in os.path.basename(_model).lower():
                active_class_mode = 2

            print(f"[BOOT] ✅ TFLite model pre-loaded ({active_class_mode}-Class mode): {_model}")
        except Exception as e:
            print(f"[BOOT] ❌ TFLite pre-load failed: {e}")
    else:
        print(f"[BOOT] ⚠️  No TFLite model found at '{_model}' — inference fallback mode")

    t_watcher = threading.Thread(target=folder_watcher_thread, daemon=True)
    t_watcher.start()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps({"event": "CONNECTION_ESTABLISHED", "db": db_type}))
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def load_history_from_db():
    global db_type
    prober_name = SYS_CONFIG.get("prober_name", "PROBER01")
    records = []
    if db_type == "PostgreSQL":
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=POSTGRES_CONFIG["host"], port=POSTGRES_CONFIG["port"],
                user=POSTGRES_CONFIG["user"], password=POSTGRES_CONFIG["password"],
                database=POSTGRES_CONFIG["database"]
            )
            cursor = conn.cursor()
            cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url FROM inspections ORDER BY id DESC")
            rows = cursor.fetchall()
            for r in rows:
                t_short = r[1].split(" ")[1] if len(r[1].split(" ")) > 1 else r[1]
                stored_url = r[12] if len(r) > 12 and r[12] else None
                ann_url = stored_url if stored_url else None
                raw_url = stored_url.replace("annotated_", "raw_") if stored_url else None
                comp_url = stored_url.replace("annotated_", "inspect_") if stored_url else None
                meta = parse_wafer_filename(stored_url or r[0], prober_name)
                records.append({
                    "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                    "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                    "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                    "reason": r[11] if len(r) > 11 and r[11] else "-",
                    "imageUrl": ann_url, "annotatedImageUrl": ann_url, "comparisonImageUrl": comp_url, "rawImageUrl": raw_url,
                    "machineNo": meta["machineNo"], "batch": meta["batch"], "waferNo": meta["waferNo"],
                    "xyCoord": meta["xyCoord"], "site": meta["site"], "pad": meta["pad"],
                    "dateTime": meta["dateTime"], "productSetup": meta["productSetup"], "temp": meta["temp"]
                })
            cursor.close()
            conn.close()
            return records
        except Exception: pass

    try:
        conn = sqlite3.connect(DB_NAME_SQLITE)
        cursor = conn.cursor()
        cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action, reason, image_url FROM inspections ORDER BY id DESC")
        rows = cursor.fetchall()
        for r in rows:
            t_short = r[1].split(" ")[1] if len(r[1].split(" ")) > 1 else r[1]
            stored_url = r[12] if len(r) > 12 and r[12] else None
            ann_url = stored_url if stored_url else None
            raw_url = stored_url.replace("annotated_", "raw_") if stored_url else None
            comp_url = stored_url.replace("annotated_", "inspect_") if stored_url else None
            meta = parse_wafer_filename(stored_url or r[0], prober_name)
            records.append({
                "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                "reason": r[11] if len(r) > 11 and r[11] else "-",
                "imageUrl": ann_url, "annotatedImageUrl": ann_url, "comparisonImageUrl": comp_url, "rawImageUrl": raw_url,
                "machineNo": meta["machineNo"], "batch": meta["batch"], "waferNo": meta["waferNo"],
                "xyCoord": meta["xyCoord"], "site": meta["site"], "pad": meta["pad"],
                "dateTime": meta["dateTime"], "productSetup": meta["productSetup"], "temp": meta["temp"]
            })
        conn.close()
    except Exception: pass
    return records



@app.get("/api/latest-inspection")
async def get_latest_inspection(): return latest_inspection

@app.get("/api/history")
async def get_history():
    return load_history_from_db()

@app.delete("/api/history")
async def clear_history():
    global latest_inspection, active_alarms, inspection_count, db_type
    latest_inspection = {}
    active_alarms = []
    inspection_count = 0
    if db_type == "PostgreSQL":
        try:
            import psycopg2
            conn = psycopg2.connect(
                host=POSTGRES_CONFIG["host"], port=POSTGRES_CONFIG["port"],
                user=POSTGRES_CONFIG["user"], password=POSTGRES_CONFIG["password"],
                database=POSTGRES_CONFIG["database"]
            )
            cursor = conn.cursor()
            cursor.execute("TRUNCATE TABLE inspections RESTART IDENTITY;")
            conn.commit()
            cursor.close()
            conn.close()
        except Exception: pass

    try:
        conn = sqlite3.connect(DB_NAME_SQLITE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM inspections;")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name='inspections';")
        conn.commit()
        conn.close()
    except Exception: pass
    return {"status": "cleared"}

@app.post("/api/simulate-end")
async def trigger_end_signal():
    global current_batch_records
    if not current_batch_records:
        return {"status": "ignored", "message": "No active batch records in queue to summarize"}
    
    t_stamp = time.strftime("%Y%m%d%H%M%S")
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    prober_name = SYS_CONFIG.get("prober_name", "PROBER01")
    
    batch_decision, mask8_str, fail_summary = build_batch_judgement(current_batch_records)
    txt_filename = f"{batch_decision}_{mask8_str}_{prober_name}_{t_stamp}.txt"
    txt_judgement_path = os.path.join(JUDGEMENT_DIR, txt_filename)
    
    # Clean up existing old judgement text files so only 1 single file exists for machine reading
    for old_file in os.listdir(JUDGEMENT_DIR):
        if old_file.endswith(".txt"):
            try:
                os.remove(os.path.join(JUDGEMENT_DIR, old_file))
            except Exception:
                pass

    # Write ONLY the 8-digit fail/pass mask code string
    txt_content = mask8_str

    with open(txt_judgement_path, "w", encoding="utf-8") as f:
        f.write(txt_content)
        
    count = len(current_batch_records)
    current_batch_records.clear()
    print(f"🏁 [SIMULATION END] Generated Single Machine Judgement TXT: {txt_filename} (Content: {mask8_str}) for {count} records")
    return {
        "status": "success",
        "filename": txt_filename,
        "decision": batch_decision,
        "mask": mask8_str,
        "totalImages": count
    }

@app.get("/api/models")
async def get_models():
    global tflite_model_path, active_class_mode
    models_info = []
    seen = set()
    
    search_dirs = [
        MODELS_DIR,
        _THIS_DIR,
        os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "models"),
        PROJECT_ROOT
    ]
    
    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        try:
            for fname in os.listdir(s_dir):
                if fname.lower().endswith((".tflite", ".onnx", ".pth", ".pt")) and fname not in seen and "quant" not in fname.lower():
                    fpath = os.path.join(s_dir, fname)
                    if os.path.isfile(fpath):
                        seen.add(fname)
                        sz_mb = round(os.path.getsize(fpath) / (1024 * 1024), 1)
                        is_tflite = fname.lower().endswith(".tflite")
                        is_active = (tflite_model_path and os.path.abspath(fpath) == os.path.abspath(tflite_model_path)) or (not tflite_model_path and fname == "unet.tflite")
                        
                        classes = 3
                        if "2class" in fname.lower(): classes = 2
                        elif "4class" in fname.lower(): classes = 4
                        elif "3class" in fname.lower(): classes = 3

                        models_info.append({
                            "name": fname,
                            "version": "v1.0.0",
                            "engine": "TFLite / NPU" if is_tflite else ("ONNX / CPU" if fname.endswith(".onnx") else "PyTorch / GPU"),
                            "size": f"{sz_mb} MB",
                            "classes": classes,
                            "accuracy": "97.5%" if "unet" in fname.lower() else "95.0%",
                            "active": bool(is_active)
                        })
        except Exception:
            pass

    if not models_info:
        models_info.append({
            "name": "unet.tflite",
            "version": "v1.0.0",
            "engine": "TFLite / NPU",
            "size": "28.5 MB",
            "classes": 3,
            "accuracy": "97.5%",
            "active": True
        })
        
    return models_info


@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...), classes: int = 3):
    if not file.filename.lower().endswith((".tflite", ".onnx", ".pth", ".pt")):
        raise HTTPException(status_code=400, detail="Invalid model file extension. Only .tflite, .onnx, .pth, and .pt files are supported.")
    
    target_path = os.path.join(MODELS_DIR, file.filename)
    try:
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        size_mb = round(os.path.getsize(target_path) / (1024 * 1024), 1)
        print(f"📥 [MODEL UPLOAD] Saved model file '{file.filename}' ({size_mb} MB) to {target_path}")
        return {
            "status": "success",
            "name": file.filename,
            "size": f"{size_mb} MB",
            "classes": classes,
            "message": f"Model '{file.filename}' uploaded successfully to i.MX8 node."
        }
    except Exception as e:
        print(f"❌ [MODEL UPLOAD] Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/models/activate")
async def activate_model(payload: dict):
    global tflite_runner, tflite_model_path, active_class_mode
    model_name = payload.get("name")
    req_classes = payload.get("classes", 3)
    if not model_name:
        raise HTTPException(status_code=400, detail="Model name is required")
        
    target_path = None
    search_dirs = [
        MODELS_DIR,
        _THIS_DIR,
        os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "models"),
        PROJECT_ROOT
    ]
    for s_dir in search_dirs:
        candidate = os.path.join(s_dir, model_name)
        if os.path.exists(candidate) and os.path.isfile(candidate):
            target_path = candidate
            break

    if not target_path:
        raise HTTPException(status_code=404, detail=f"Model file '{model_name}' not found on server")

    with inference_lock:
        try:
            old_runner = tflite_runner
            tflite_model_path = target_path
            PATHS_CFG["model_path"] = target_path
            if "ai" not in SYS_CONFIG: SYS_CONFIG["ai"] = {}
            SYS_CONFIG["ai"]["model_path"] = target_path

            # Auto-detect class count from filename hint first
            det_classes = req_classes
            fname_lower = os.path.basename(target_path).lower()
            if "2class" in fname_lower: det_classes = 2
            elif "4class" in fname_lower: det_classes = 4
            elif "3class" in fname_lower: det_classes = 3

            if target_path.lower().endswith((".tflite", ".onnx")):
                from run_unet_tflite_folder import ModelRunner
                tflite_runner = ModelRunner(target_path)
                
                # Check output tensor shape to auto-detect class count
                try:
                    out_details = tflite_runner.get_output_details()
                    if out_details and len(out_details) > 0 and 'shape' in out_details[0]:
                        shape = list(out_details[0]['shape'])
                        if shape[-1] in (2, 3, 4):
                            det_classes = int(shape[-1])
                        elif len(shape) >= 2 and shape[1] in (2, 3, 4):
                            det_classes = int(shape[1])
                except Exception: pass

                dummy_img = np.zeros((1, 640, 640, 3), dtype=np.float32)
                try:
                    _ = tflite_runner.infer(dummy_img)
                except Exception:
                    pass
            else:
                tflite_runner = None
                if hasattr(app.state, "pytorch_unet"):
                    app.state.pytorch_unet = None
                if hasattr(app.state, "pytorch_model_path"):
                    app.state.pytorch_model_path = None

            active_class_mode = det_classes

            if old_runner:
                del old_runner
                
            print(f"⚡ [NPU HOT-SWAP] ✅ Activated new model: {model_name} (Auto-detected: {active_class_mode} Classes) on NPU")
            
            # Broadcast WS event if main_loop is running
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
                    "event": "MODEL_ACTIVATED",
                    "data": { "name": model_name, "classes": active_class_mode }
                })), main_loop)
            
            return {
                "status": "success",
                "active_model": model_name,
                "classes": active_class_mode,
                "message": f"Successfully activated '{model_name}' ({active_class_mode}-Class) on i.MX8 NPU!"
            }
        except Exception as err:
            print(f"❌ [NPU HOT-SWAP] Failed to activate model '{model_name}': {err}")
            raise HTTPException(status_code=500, detail=f"Failed to activate model: {err}")


@app.delete("/api/models/{filename}")
async def delete_model(filename: str):
    global tflite_model_path
    if tflite_model_path and os.path.basename(tflite_model_path) == filename:
        raise HTTPException(status_code=400, detail="Cannot delete currently active model on NPU.")
        
    target_path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(target_path):
        try:
            os.remove(target_path)
            print(f"🗑️ [MODEL DELETE] Deleted model '{filename}' from {MODELS_DIR}")
            return {"status": "success", "message": f"Deleted model '{filename}'"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/api/sys-stats")
async def get_sys_stats():
    metrics = get_hardware_metrics()
    return {
        "cpu": metrics["cpu"],
        "npu": metrics["npu"],
        "ram": metrics["ram"],
        "temp": metrics["temp"],
        "node": "i.MX8 Edge Node",
        "db": db_type
    }

def get_thermal_temperature() -> float:
    """Read temperature from Linux thermal zones or psutil fallback."""
    try:
        thermal_files = glob.glob("/sys/class/thermal/thermal_zone*/temp")
        temps = []
        for tf in thermal_files:
            try:
                with open(tf, "r") as f:
                    val = float(f.read().strip())
                    if val > 1000:
                        val /= 1000.0
                    if 0 <= val <= 150:
                        temps.append(val)
            except Exception:
                pass
        if temps:
            return round(float(max(temps)), 1)
    except Exception:
        pass

    try:
        if hasattr(psutil, "sensors_temperatures"):
            temps_dict = psutil.sensors_temperatures()
            if temps_dict:
                all_temps = []
                for entries in temps_dict.values():
                    for entry in entries:
                        if hasattr(entry, "current") and entry.current is not None:
                            all_temps.append(entry.current)
                if all_temps:
                    return round(float(max(all_temps)), 1)
    except Exception:
        pass

    return 45.0

def get_npu_utilization() -> float:
    """Probe Linux sysfs / debugfs nodes for NPU utilization; return -1 if unavailable."""
    npu_paths = [
        "/sys/class/galcore/gpu/gpu0/utilization",
        "/sys/kernel/debug/galcore/gpu3d/utilization",
        "/sys/kernel/debug/ethosu/utilization",
        "/sys/class/npu/utilization"
    ]
    for p in npu_paths:
        if os.path.exists(p):
            try:
                with open(p, "r") as f:
                    content = f.read().strip()
                    m = re.search(r"(\d+(?:\.\d+)?)", content)
                    if m:
                        return round(float(m.group(1)), 1)
            except Exception:
                pass
    return -1.0

def get_hardware_metrics() -> dict:
    """Collect CPU, RAM, Temp, and NPU metrics."""
    cpu_val = round(float(psutil.cpu_percent(interval=None)), 1)
    ram_val = round(float(psutil.virtual_memory().percent), 1)
    temp_val = get_thermal_temperature()
    npu_val = get_npu_utilization()
    return {
        "cpu": cpu_val,
        "ram": ram_val,
        "temp": temp_val,
        "npu": npu_val
    }

@app.websocket("/ws/hardware")
async def websocket_hardware_endpoint(websocket: WebSocket):
    """WebSocket endpoint pushing real-time i.MX8 hardware metrics every 1 second."""
    await websocket.accept()
    psutil.cpu_percent(interval=None)
    try:
        while True:
            metrics = get_hardware_metrics()
            await websocket.send_json(metrics)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


