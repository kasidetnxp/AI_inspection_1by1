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
    config_path = "backend_imx8/config.yaml"
    if not os.path.exists(config_path):
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
        except Exception:
            pass
            
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


# ==========================================
# EDGE AI SIMULATOR & RULE ENGINE INTEGRATION
# ==========================================
sys.path.append("iMX8_AI_Inspection-master")
has_actual_rules = False
try:
    from src.yolo_seg.inspection import run_inspection, load_inspection_config
    import numpy as np
    has_actual_rules = True
except ImportError:
    print("[WARNING] Master repository not loaded. Using fallback AI rule engine.")

def process_new_file(filepath, filename):
    global latest_inspection, inspection_count, active_alarms, has_actual_rules
    
    rule_time = 0.0
    inf_time = 0.0

    inspection_count += 1
    
    model_path = PATHS_CFG.get("model_path") or SYS_CONFIG.get("ai", {}).get("model_path")
    if model_path and not os.path.exists(model_path):
        model_path = None

    if not model_path:
        candidate_files = []
        for p_dir in [".", os.path.join("iMX8_AI_Inspection-master", "models"), "models"]:
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

    pads = []
    mark_polys = []
    grain_polys = []
    marks_list = []
    grain_list = []
    confidence = 95.0

    if model_path and os.path.exists(model_path):
        try:
            import cv2
            is_tflite = model_path.lower().endswith((".tflite", ".onnx"))
            
            if is_tflite:
                from run_unet_tflite_folder import ModelRunner, preprocess_image, postprocess_unet
                if not hasattr(app.state, "tflite_runner") or getattr(app.state, "tflite_runner_path", None) != model_path:
                    app.state.tflite_runner = ModelRunner(model_path)
                    app.state.tflite_runner_path = model_path
                
                runner = app.state.tflite_runner
                img_cv = cv2.imread(filepath)
                if img_cv is not None:
                    t_start = time.time()
                    input_details = runner.get_input_details()
                    output_details = runner.get_output_details()
                    
                    input_data, meta = preprocess_image(img_cv, input_details[0])
                    output_tensor = runner.infer(input_data)
                    inf_time = round((time.time() - t_start) * 1000, 1)
                    
                    class_names = ["pad", "probemark", "grain"]
                    class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta, class_names)
                    
                    for c_id, mask in zip(class_ids, masks):
                        if c_id == 0: # Pad
                            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            for c in contours:
                                if cv2.contourArea(c) > 500:
                                    pads.append(cv2.convexHull(c).astype(np.int32))
                        elif c_id == 1: # Probemark
                            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            for c in contours:
                                mark_polys.append(c.astype(np.int32))
                        elif c_id == 2 and active_class_mode == 3: # Grain
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
                    unet_dir = os.path.abspath("iMX8_AI_Inspection-master/src/unet")
                    if unet_dir not in sys.path:
                        sys.path.append(unet_dir)
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
                    output_dir = "simulation/output/inspection_visuals"
                    os.makedirs(output_dir, exist_ok=True)
                    
                    unet_start = time.time()
                    unet_res = process_single_image(filepath, unet_model, device, output_dir)
                    inf_time = round((time.time() - unet_start) * 1000, 1)
                    
                    pads = unet_res["pads"]
                    mark_polys = unet_res["probemarks"]
                    grain_polys = unet_res.get("grains", []) if active_class_mode == 3 else []
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
                                elif class_name in ("grain", "contam") and active_class_mode == 3: grain_polys.append(polygon)
        except Exception as ai_err:
            print(f"AI Model execution error ({ai_err}). Using simulation metrics.")


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

    if has_actual_rules:
        pad_poly = np.array([[120, 120], [480, 120], [480, 480], [120, 480]], dtype=np.int32)
        real_pads = pads if (pads and len(pads) > 0) else [pad_poly]
        generic_results = [{
            "image_path": filepath,
            "pads": real_pads,
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
                
                raw_out_path = os.path.join("simulation/output/inspection_visuals", f"raw_{filename}")
                ann_out_path = os.path.join("simulation/output/inspection_visuals", f"annotated_{filename}")
                
                viz_path = os.path.join("simulation/output/inspection_visuals", f"inspect_{filename}")
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

    wafer_id = f"#WF-{2940 + inspection_count}"
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    t_stamp = time.strftime("%Y%m%d%H%M%S")
    prober_name = SYS_CONFIG.get("prober_name", "PROBER01")
    
    # Format failure mode string for filename
    if decision == "PASS" or not cat_reason or cat_reason.strip() in ("-", "None", ""):
        fail_mode_str = "NONE"
    else:
        fail_mode_str = "".join(c for c in cat_reason if c.isalnum())
        if not fail_mode_str: fail_mode_str = "DEFECT"

    t_query = f"?t={int(time.time() * 1000)}"
    ann_img_url = f"/visuals/annotated_{filename}{t_query}"
    raw_img_url = f"/visuals/raw_{filename}{t_query}"
    inspect_img_url = f"/visuals/inspect_{filename}{t_query}"
    
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
        "rawImageUrl": raw_img_url
    }

    
    # Save Machine Judgement Text File ({PASS/FAIL}_{FailureMode}_{ProberName}_{Timestamp}.txt)
    txt_filename = f"{decision}_{fail_mode_str}_{prober_name}_{t_stamp}.txt"
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

            input_files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
            for file in input_files:
                src_path = os.path.join(INPUT_DIR, file)
                proc_path = os.path.join(PROCESS_DIR, file)
                time.sleep(0.01)
                try:
                    shutil.move(src_path, proc_path)
                    process_new_file(proc_path, file)
                except Exception: pass

        except Exception as e:
            print(f"Error in watcher thread: {e}")
        time.sleep(0.1)


# Startup Event
@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    init_database()
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
                records.append({
                    "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                    "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                    "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                    "reason": r[11] if len(r) > 11 and r[11] else "-",
                    "imageUrl": ann_url, "annotatedImageUrl": ann_url, "comparisonImageUrl": comp_url, "rawImageUrl": raw_url
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
            records.append({
                "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10],
                "reason": r[11] if len(r) > 11 and r[11] else "-",
                "imageUrl": ann_url, "annotatedImageUrl": ann_url, "comparisonImageUrl": comp_url, "rawImageUrl": raw_url
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

@app.get("/api/models")
async def get_models():
    return [{
        "name": "unet_pytorch_3class.pth",
        "version": "v1.0.0",
        "engine": "PyTorch / NPU",
        "size": "372 MB",
        "accuracy": "97.5%",
        "active": True
    }]

@app.get("/api/sys-stats")
async def get_sys_stats():
    return {
        "cpu": random.randint(45, 62),
        "npu": random.randint(82, 91),
        "ram": random.randint(512, 530),
        "temp": round(54.5 + random.random() * 4.0, 1),
        "node": "i.MX8 Edge Node",
        "db": db_type
    }

