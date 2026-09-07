import os
import sys
import time
import json
import random
import threading
import shutil
import asyncio
import queue
import numpy as np
import psycopg2
import matplotlib
matplotlib.use('Agg')
from typing import List, Optional
import glob
import re
import psutil
import zipfile


# Try importing FastAPI dependencies
try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Query, Body
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, FileResponse
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

# ==============================================================================
# Product & Machine Configuration State (Direct integration with Product_Settine.txt & Machine_Setting.txt)
# ==============================================================================
def resolve_windows_drive_path(raw_path: str, sim_root: str = None) -> str:
    """
    Translates Windows network drive paths (N:, M:, T:) to Linux mount points (/mnt/N, /mnt/M, /mnt/T)
    or local simulation directories.
    e.g. 'N:\\WP288\\PMI\\IMAGE' -> '/mnt/N/WP288/PMI/IMAGE' (if /mnt/N exists on i.MX8 Linux)
         or './simulation/drive_N/WP288/PMI/IMAGE' (in simulation mode).
    """
    if not raw_path:
        return ""
    if sim_root is None:
        sim_root = os.path.join(_THIS_DIR, "simulation")
    clean = raw_path.replace("\\", "/")
    
    # Check for Windows Drive format (e.g. N:/..., M:/..., T:/...)
    match = re.match(r"^([A-Za-z]):/(.*)$", clean)
    if match:
        drive_upper = match.group(1).upper()
        drive_lower = match.group(1).lower()
        rest = match.group(2)
        
        linux_mount_upper = f"/mnt/{drive_upper}/{rest}"
        linux_mount_lower = f"/mnt/{drive_lower}/{rest}"
        
        # Primary check: Uppercase mount path on i.MX8 (e.g. /mnt/N, /mnt/M, /mnt/T)
        if os.path.exists(f"/mnt/{drive_upper}"):
            return linux_mount_upper
        # Secondary check: Lowercase mount path
        elif os.path.exists(f"/mnt/{drive_lower}"):
            return linux_mount_lower
            
        # Fallback to local simulation workspace
        return os.path.abspath(os.path.join(sim_root, f"drive_{drive_upper}", rest))
        
    if os.path.isabs(clean):
        return clean
    return os.path.abspath(os.path.join(sim_root, clean.lstrip("/")))

DEFAULT_PRODUCT_SETTING = {
    "scriptName": "unet-inferencer.py",
    "algorithm": "unet",
    "classNames": ["pad", "probemark"],
    "padShape": "rectangle",
    "thingColors": ["#FF0000", "#00FF00"],
    "minAreaSizes": [300, 10],
    "targetWidth": 160,
    "targetHeight": 160,
    "badLabels": ["bad", "defect"],
    "skipDevices": [],
    "padIndex": 0,
    "generateOutput": True,
    "combineOutput": True,
    "greyscaleThreshold": 0,
    "verticalRoi": 0.7,
    "horizontalRoi": 0.7,
    "edgeThreshold": 8.0,
    "edgeConversionFactor": 1.0,
    "areaRatioThreshold": 25.0,
    "devices": [
        "T073C3BTAA-PL211",
        "T073C3BTAA-PL2-PS16-PT-1",
        "T073352TAG-PL2-PS16-PT-1",
        "T073352TAH-PL2-PS16-PT-1",
        "T073C3ATAD-PL2-PS16-PT-1"
    ]
}

DEFAULT_MACHINE_SETTING = {
    "input.index.machine": -1,
    "input.index.lotNo": -1,
    "input.index.processTime": 0,
    "input.index.waferId": 1,
    "input.index.siteCoordinate": 2,
    "input.index.probecardSite": 3,
    "input.index.padNo": 4,
    "input.index.detailInfo": 5,
    "input.index.device": 6,
    "input.index.temperature": 7,
    "machine.result.folder": "N:\\WP288\\PMI\\JUDGE",
    "machine.result.fileFormat": "{output.result}_{output.code}_{output.machine}_{output.ts}.txt",
    "process.end.timeout": 10000,
    "lot.source.folder": "N:\\WP288\\PMI\\IMAGE",
    "lot.input.folder": "M:\\WP288\\PMI\\PROCESSED\\{output.lotNo}",
    "lot.output.folder": "M:\\WP288\\PMI\\OUTPUT\\{output.lotNo}",
    "xadapter.url": "http://www.google.coxxxxx",
    "postpad.enable": False,
    "postwafer.enable": False,
    "outputpad.enable": False,
    "outputwafer.enable": True,
    "hume.url": "http://twgkhhf5-eit01.tw-khh01.nxp.com/PMT/EIINquire.asmx",
    "output.format": "jpg"
}

def load_initial_product_setting():
    for candidate in [
        os.path.join(PROJECT_ROOT, "Product_Settine.txt"),
        os.path.join(_THIS_DIR, "active_product_setting.json"),
        os.path.join(PROJECT_ROOT, "Product_Setting.txt"),
    ]:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    print(f"[CONFIG] Loaded Product Recipe from: {candidate}")
                    return data
            except Exception as e:
                print(f"[CONFIG] Warning loading {candidate}: {e}")
    return DEFAULT_PRODUCT_SETTING.copy()

def load_initial_machine_setting():
    for candidate in [
        os.path.join(PROJECT_ROOT, "Machine_Setting.txt"),
        os.path.join(_THIS_DIR, "active_machine_setting.json"),
    ]:
        if os.path.exists(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    print(f"[CONFIG] Loaded Machine Setting from: {candidate}")
                    return data
            except Exception as e:
                print(f"[CONFIG] Warning loading {candidate}: {e}")
    return DEFAULT_MACHINE_SETTING.copy()

ACTIVE_PRODUCT_SETTING = load_initial_product_setting()
ACTIVE_MACHINE_SETTING = load_initial_machine_setting()

def extract_machine_from_path(folder_path: str) -> str:
    """
    Extracts machine/station identifier from configured folder paths.
    Supports Windows drive patterns (e.g. 'N:\\WP288\\PMI\\JUDGE' -> 'WP288'),
    Linux mount points (e.g. '/mnt/N/WP288/PMI/...' -> 'WP288'),
    simulation paths (e.g. 'simulation/drive_N/WP288/...' -> 'WP288'),
    and UNC network paths (e.g. '//server/WP288/...' -> 'WP288').
    """
    if not folder_path or not isinstance(folder_path, str):
        return ""
    clean = folder_path.replace("\\", "/").strip()
    
    # 1. Windows drive format: N:/WP288/PMI/...
    m_win = re.match(r"^[a-zA-Z]:/([^/]+)", clean)
    if m_win:
        candidate = m_win.group(1).strip()
        if candidate and candidate.upper() not in ("PMI", "IMAGE", "JUDGE", "PROCESSED", "OUTPUT"):
            return candidate
            
    # 2. Linux mount format: /mnt/N/WP288/PMI/... or /mnt/drive_n/WP288/...
    m_mnt = re.match(r"^/mnt/[^/]+/([^/]+)", clean)
    if m_mnt:
        candidate = m_mnt.group(1).strip()
        if candidate and candidate.upper() not in ("PMI", "IMAGE", "JUDGE", "PROCESSED", "OUTPUT"):
            return candidate
            
    # 3. Simulation path format: simulation/drive_N/WP288/...
    m_sim = re.search(r"simulation/drive_[^/]+/([^/]+)", clean)
    if m_sim:
        candidate = m_sim.group(1).strip()
        if candidate and candidate.upper() not in ("PMI", "IMAGE", "JUDGE", "PROCESSED", "OUTPUT"):
            return candidate

    # 4. UNC network share format: //server/WP288/...
    m_unc = re.match(r"^//[^/]+/([^/]+)", clean)
    if m_unc:
        candidate = m_unc.group(1).strip()
        if candidate and candidate.upper() not in ("PMI", "IMAGE", "JUDGE", "PROCESSED", "OUTPUT"):
            return candidate
            
    return ""

def get_current_prober_name() -> str:
    """
    Determines current Prober / Machine Name by checking:
    1. Direct key in ACTIVE_MACHINE_SETTING ('machine.name', 'prober_name', 'machineNo', etc.)
    2. Auto-extraction from folder paths in ACTIVE_MACHINE_SETTING ('machine.result.folder', 'lot.source.folder', etc.)
    3. Explicit SYS_CONFIG override ('prober_name') if configured
    4. Fallback to 'PROBER01'
    """
    # 1. Direct key in Machine Setting if present
    for k in ["machine.name", "prober_name", "machineNo", "machine_name", "prober.name"]:
        val = ACTIVE_MACHINE_SETTING.get(k)
        if val and isinstance(val, str) and val.strip():
            return val.strip()

    # 2. Auto-extract from folder paths in ACTIVE_MACHINE_SETTING
    folder_keys = [
        "machine.result.folder",
        "lot.source.folder",
        "lot.input.folder",
        "lot.output.folder"
    ]
    for k in folder_keys:
        p = ACTIVE_MACHINE_SETTING.get(k)
        extracted = extract_machine_from_path(p)
        if extracted:
            return extracted

    # 3. Explicit SYS_CONFIG override (e.g. from config.yaml)
    cfg_name = SYS_CONFIG.get("prober_name")
    if cfg_name and isinstance(cfg_name, str) and cfg_name.strip():
        return cfg_name.strip()

    # 4. Default fallback
    return "PROBER01"


# ==============================================================================
# CONFIG & RECIPE LIBRARY MANAGEMENT
# ==============================================================================
CONFIGS_DIR = os.path.join(_THIS_DIR, "configs")
RECIPES_DIR = os.path.join(CONFIGS_DIR, "recipes")
MACHINES_DIR = os.path.join(CONFIGS_DIR, "machines")
BINDINGS_FILE = os.path.join(CONFIGS_DIR, "model_recipe_bindings.json")

os.makedirs(RECIPES_DIR, exist_ok=True)
os.makedirs(MACHINES_DIR, exist_ok=True)

def load_config_registry():
    default_reg = {
        "active_recipe": "Product_Settine.txt",
        "active_machine_config": "Machine_Setting.txt",
        "bindings": {}
    }
    if os.path.exists(BINDINGS_FILE):
        try:
            with open(BINDINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as err:
            print(f"[CONFIG] Error loading bindings: {err}")
    return default_reg

def save_config_registry(data):
    try:
        with open(BINDINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as err:
        print(f"[CONFIG] Error saving bindings: {err}")

def apply_recipe_by_filename(filename: str):
    global ACTIVE_PRODUCT_SETTING
    fpath = os.path.join(RECIPES_DIR, filename)
    if not os.path.exists(fpath):
        fpath = os.path.join(PROJECT_ROOT, filename)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    ACTIVE_PRODUCT_SETTING.update(parsed)
                    reg = load_config_registry()
                    reg["active_recipe"] = filename
                    save_config_registry(reg)
                    print(f"[CONFIG] Applied Recipe: {filename}")
                    return True
        except Exception as e:
            print(f"[CONFIG] Error applying recipe {filename}: {e}")
    return False

def apply_machine_by_filename(filename: str):
    global ACTIVE_MACHINE_SETTING
    fpath = os.path.join(MACHINES_DIR, filename)
    if not os.path.exists(fpath):
        fpath = os.path.join(PROJECT_ROOT, filename)
    if os.path.exists(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    ACTIVE_MACHINE_SETTING.update(parsed)
                    reg = load_config_registry()
                    reg["active_machine_config"] = filename
                    save_config_registry(reg)
                    for k in ["lot.source.folder", "machine.result.folder"]:
                        if k in ACTIVE_MACHINE_SETTING:
                            sim_path = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING[k])
                            os.makedirs(sim_path, exist_ok=True)
                    print(f"[CONFIG] Applied Machine Setting: {filename} (Detected Machine: {get_current_prober_name()})")
                    return True
        except Exception as e:
            print(f"[CONFIG] Error applying machine setting {filename}: {e}")
    return False

# Global Live States
latest_inspection = {}
active_alarms = []
inspection_count = 0
active_class_mode = 3  # 2 or 3 classes detection mode
db_type = "PostgreSQL"
main_loop = None

# Global TFLite runner + lock (pre-loaded in main thread at startup to satisfy NPU delegate)
tflite_runner = None
tflite_model_path = None
inference_lock = threading.Lock()  # ponytail: NPU delegate not thread-safe

# ==============================================================================
# Task Priority Queues & Dispatcher State
# P0 = High Priority Real-time Production (Prober Machine Image drops)
# P1 = Low Priority Batch Model Validation / Benchmark Testing (Web HMI)
# ==============================================================================
P0_QUEUE = queue.Queue()
P1_QUEUE = queue.Queue()
dispatcher_running = True
priority_dispatcher_state = {
    "active_priority": "IDLE",     # "P0_PRODUCTION" | "P1_BENCHMARK" | "IDLE"
    "p0_pending": 0,
    "p1_pending": 0,
    "p1_total": 0,
    "p1_processed": 0,
    "p1_current": "",
    "active_session_id": None,
    "status": "IDLE",              # "IDLE" | "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED"
    "last_kpis": {}
}

# Batch records accumulator for Prober .END signal
current_batch_records = []
is_batch_complete = False
latest_batch_summary = {
    "isBatchComplete": False,
    "batchDecision": "PASS",
    "totalImages": 0,
    "failCount": 0,
    "failedRecords": [],
    "batch": "-",
    "waferNo": "-"
}

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
# ==========================================
# DATABASE CONNECTOR (PostgreSQL Exclusively)
# ==========================================
def get_pg_connection():
    return psycopg2.connect(
        host=POSTGRES_CONFIG["host"],
        port=POSTGRES_CONFIG["port"],
        user=POSTGRES_CONFIG["user"],
        password=POSTGRES_CONFIG["password"],
        database=POSTGRES_CONFIG["database"],
        connect_timeout=3
    )

def init_database():
    global db_type, inspection_count
    db_type = "PostgreSQL"
    try:
        conn = get_pg_connection()
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
                machine_action VARCHAR(50),
                reason TEXT,
                image_url TEXT
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS benchmark_sessions (
                id VARCHAR(64) PRIMARY KEY,
                name VARCHAR(255),
                model_name VARCHAR(255),
                status VARCHAR(50),
                dataset_name VARCHAR(255),
                total_images INTEGER DEFAULT 0,
                processed_images INTEGER DEFAULT 0,
                rule_config TEXT,
                created_at VARCHAR(50),
                completed_at VARCHAR(50),
                metrics TEXT
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS benchmark_results (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(64),
                image_name VARCHAR(255),
                image_url TEXT,
                annotated_image_url TEXT,
                raw_image_url TEXT,
                ai_decision VARCHAR(20),
                ai_confidence DOUBLE PRECISION,
                ai_reason TEXT,
                inference_time_ms DOUBLE PRECISION,
                rule_time_ms DOUBLE PRECISION,
                min_edge_distance_um DOUBLE PRECISION,
                mark_area_ratio_pct DOUBLE PRECISION,
                pads_count INTEGER,
                marks_count INTEGER,
                grains_count INTEGER,
                human_decision VARCHAR(20) DEFAULT 'UNREVIEWED',
                human_reviewer VARCHAR(100),
                reviewed_at VARCHAR(50),
                notes TEXT
            );
        """)
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ i.MX8 Node connected to PostgreSQL Database exclusively!")
    except Exception as e:
        print("❌ PostgreSQL initialization error:", e)

    inspection_count = get_initial_inspection_count()
    print(f"📊 [DB INIT] Inspection Counter initialized to: {inspection_count}")


def get_initial_inspection_count() -> int:
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(id) FROM inspections;")
        res = cursor.fetchone()
        cursor.close()
        conn.close()
        if res and res[0] is not None:
            return int(res[0])
    except Exception as e:
        print("[DB] Failed to get initial inspection count from PostgreSQL:", e)
    return 0


def save_inspection_to_db(record):
    try:
        conn = get_pg_connection()
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
    except Exception as pg_err:
        print("Failed to save to PostgreSQL:", pg_err)


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


def is_end_filename(filename: str) -> bool:
    """
    Detects if an image file signifies the end of a wafer inspection batch.
    Handles prober naming formats e.g.
    '20260818112106_..._END.bmp', '..._END.jpg', '...END.BMP', 'END_...bmp', etc.
    """
    if not filename:
        return False
    base = os.path.basename(filename).split("?")[0]
    base_no_ext, ext = os.path.splitext(base)
    upper_base = base_no_ext.upper()
    upper_full = base.upper()
    
    return (
        "_END" in upper_full or
        ".END" in upper_full or
        upper_base.endswith("END") or
        upper_base.startswith("END") or
        any(upper_full.endswith(sfx) for sfx in [
            "END.BMP", "_END.BMP", ".END.BMP",
            "END.JPG", "_END.JPG", ".END.JPG",
            "END.JPEG", "_END.JPEG", ".END.JPEG",
            "END.PNG", "_END.PNG", ".END.PNG",
            ".END"
        ])
    )


def parse_wafer_filename(filename: str, prober_default=None) -> dict:
    if prober_default is None:
        prober_default = get_current_prober_name()
    if not filename:
        return {
            "machineNo": prober_default, "batch": "-", "waferNo": "-",
            "xyCoord": "-", "site": "-", "pad": "-", "dateTime": "-",
            "productSetup": "-", "temp": "-", "processCode": "-"
        }
    base = os.path.basename(filename).split("?")[0]
    base = os.path.splitext(base)[0]
    base = re.sub(r"^(raw_|annotated_|inspect_)+", "", base, flags=re.IGNORECASE)
    base = re.sub(r"(_mask_result|_inspect|_annotated|_raw|_result)+$", "", base, flags=re.IGNORECASE)
    
    # Strip trailing _END or .END if present for token analysis
    is_end = is_end_filename(base)
    if base.upper().endswith("_END"):
        base = base[:-4]
    elif base.upper().endswith(".END"):
        base = base[:-4]

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
        "temp": "-",
        "processCode": "-"
    }

    # If input.index.machine is explicitly configured (>= 0) in Machine_Setting.txt
    try:
        mach_idx = ACTIVE_MACHINE_SETTING.get("input.index.machine", -1)
        if isinstance(mach_idx, int) and 0 <= mach_idx < len(parts):
            meta["machineNo"] = parts[mach_idx]
    except Exception:
        pass

    # Standard 8-part format: [Date][Time]_[Batch-Wafer]_[XY]_[Site]_[Pad]_[Status]_[ProductSetup]_[Temp]
    if len(parts) >= 8:
        p0 = parts[0]
        if len(p0) >= 14:
            meta["dateTime"] = f"{p0[:4]}-{p0[4:6]}-{p0[6:8]} {p0[8:10]}:{p0[10:12]}:{p0[12:14]}"
        else:
            meta["dateTime"] = p0

        p1 = parts[1]
        meta["waferNo"] = p1
        if "-" in p1:
            meta["batch"] = p1.split("-", 1)[0]
        else:
            m_bw = re.match(r"^([A-Z0-9]+?)(W[A-Z0-9]+)$", p1, re.IGNORECASE)
            meta["batch"] = m_bw.group(1) if m_bw else p1

        meta["xyCoord"] = parts[2]
        p3 = parts[3]
        meta["site"] = f"Site {p3[1:]}" if p3.upper().startswith("S") and p3[1:].isdigit() else p3
        p4 = parts[4]
        meta["pad"] = f"Pad {p4[1:]}" if p4.upper().startswith("P") and p4[1:].isdigit() else p4
        meta["processCode"] = parts[5]
        meta["productSetup"] = parts[6]

        p7 = parts[7]
        if p7.isdigit():
            val = int(p7)
            meta["temp"] = f"{val / 10.0:.1f}°C" if len(p7) in (3, 4) else f"{val}°C"
        else:
            meta["temp"] = p7
            
        return meta

    # Fallback pattern for irregular token lengths:
    for i, part in enumerate(parts):
        if not part:
            continue
        if re.match(r"^\d{14}$", part):
            meta["dateTime"] = f"{part[:4]}-{part[4:6]}-{part[6:8]} {part[8:10]}:{part[10:12]}:{part[12:14]}"
        elif re.match(r"^\d{8}$", part) and i == 0:
            meta["dateTime"] = f"{part[:4]}-{part[4:6]}-{part[6:8]}"
        elif re.match(r"^X-?\d+Y-?\d+$", part, re.IGNORECASE):
            meta["xyCoord"] = part
        elif re.match(r"^S\d+$", part, re.IGNORECASE):
            meta["site"] = f"Site {part[1:]}"
        elif re.match(r"^P\d+$", part, re.IGNORECASE):
            meta["pad"] = f"Pad {part[1:]}"
        elif re.match(r"^(OK|NG|PASS|FAIL|REJECT|PO|PO\d+)$", part, re.IGNORECASE):
            meta["processCode"] = part
        elif re.match(r"^\d{2,4}$", part) and (i == len(parts) - 1 or (i == len(parts) - 2 and is_end)):
            val = int(part)
            meta["temp"] = f"{val/10.0:.1f}°C" if len(part) in (3, 4) else f"{val}°C"
        elif meta["batch"] == "-":
            meta["waferNo"] = part
            if "-" in part:
                meta["batch"] = part.split("-", 1)[0]
            else:
                m_bw = re.match(r"^([A-Z0-9]+?)(W[A-Z0-9]+)$", part, re.IGNORECASE)
                meta["batch"] = m_bw.group(1) if m_bw else part
        elif meta["productSetup"] == "-":
            meta["productSetup"] = part

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

def generate_machine_judgement_file(batch_decision: str, mask8_str: str, prober_name: str, t_stamp: str) -> tuple:
    """
    Generates single 8-digit Machine Judgement text file e.g.
    'FAIL_02000008_PROBER01_20260818112106.txt' (Content: '02000008\\n')
    'PASS_00000000_PROBER01_20260818112106.txt' (Content: '00000000\\n')
    
    Adheres strictly to the 8-digit code format requested by factory specification.
    Writes simultaneously to JUDGEMENT_DIR and simulated factory drive (e.g. simulation/drive_N/WP288/PMI/JUDGE).
    """
    if len(mask8_str) < 8:
        mask8_str = mask8_str.ljust(8, "0")
    elif len(mask8_str) > 8:
        mask8_str = mask8_str[:8]

    file_fmt = ACTIVE_MACHINE_SETTING.get("machine.result.fileFormat", "{output.result}_{output.code}_{output.machine}_{output.ts}.txt")
    txt_filename = file_fmt.replace("{output.result}", batch_decision) \
                           .replace("{output.code}", mask8_str) \
                           .replace("{output.machine}", prober_name) \
                           .replace("{output.ts}", t_stamp)
    txt_content = f"{mask8_str}\n"

    target_dirs = set()
    if JUDGEMENT_DIR:
        target_dirs.add(JUDGEMENT_DIR)
    
    sim_judge = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING.get("machine.result.folder", ""))
    if sim_judge:
        target_dirs.add(sim_judge)

    written_paths = []
    for d in target_dirs:
        try:
            os.makedirs(d, exist_ok=True)
            for old_file in os.listdir(d):
                if old_file.endswith(".txt"):
                    try:
                        os.remove(os.path.join(d, old_file))
                    except Exception:
                        pass
            out_file = os.path.join(d, txt_filename)
            with open(out_file, "w", encoding="utf-8") as f:
                f.write(txt_content)
            written_paths.append(out_file)
        except Exception as e:
            print(f"[JUDGE] Warning writing judgement to {d}: {e}")

    primary_path = written_paths[0] if written_paths else "-"
    print(f"[JUDGE] Generated 8-digit Machine Judgement: {txt_filename} (Content: {mask8_str}) -> {written_paths}")
    return txt_filename, primary_path


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

    prober_name = get_current_prober_name()
    parsed_meta = parse_wafer_filename(filename, prober_name)
    wafer_id = parsed_meta["waferNo"] if parsed_meta["waferNo"] and parsed_meta["waferNo"] != "-" else f"#WF-{inspection_count}"
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    t_stamp = time.strftime("%Y%m%d%H%M%S")

    raw_lot = parsed_meta.get("batch") or parsed_meta.get("waferNo") or "UNKNOWN_LOT"
    lot_no_str = raw_lot.split("-")[0].strip() if raw_lot and raw_lot != "-" else "UNKNOWN_LOT"
    
    inp_tmpl = ACTIVE_MACHINE_SETTING.get("lot.input.folder", "M:\\WP288\\PMI\\PROCESSED\\{output.lotNo}")
    proc_lot_dir = resolve_windows_drive_path(inp_tmpl.replace("{output.lotNo}", lot_no_str))
    
    out_tmpl = ACTIVE_MACHINE_SETTING.get("lot.output.folder", "M:\\WP288\\PMI\\OUTPUT\\{output.lotNo}")
    output_lot_dir = resolve_windows_drive_path(out_tmpl.replace("{output.lotNo}", lot_no_str))
    
    if proc_lot_dir:
        os.makedirs(proc_lot_dir, exist_ok=True)
    if output_lot_dir:
        os.makedirs(output_lot_dir, exist_ok=True)

    print(f"[DEBUG] pads={len(pads)}, marks={len(mark_polys)}, grains={len(grain_polys)}, has_actual_rules={has_actual_rules}")
    if has_actual_rules:
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
                output_viz_dir=output_lot_dir or VISUALS_DIR,
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
                
                # Save directly into Drive M
                raw_target_dir = proc_lot_dir or VISUALS_DIR
                ann_target_dir = output_lot_dir or VISUALS_DIR
                raw_out_path = os.path.join(raw_target_dir, filename)
                ann_out_path = os.path.join(ann_target_dir, filename)
                
                viz_path = os.path.join(ann_target_dir, f"inspect_{filename}")
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

    # Format failure mode string for filename
    if decision == "PASS" or not cat_reason or cat_reason.strip() in ("-", "None", ""):
        fail_mode_str = "NONE"
    else:
        fail_mode_str = "".join(c for c in cat_reason if c.isalnum())
        if not fail_mode_str: fail_mode_str = "DEFECT"

    t_query = f"?t={int(time.time() * 1000)}"
    ann_img_url = f"/api/images/annotated/{lot_no_str}/{filename}{t_query}"
    raw_img_url = f"/api/images/raw/{lot_no_str}/{filename}{t_query}"
    inspect_img_url = f"/api/images/annotated/{lot_no_str}/inspect_{filename}{t_query}"
    
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

    global current_batch_records, is_batch_complete, latest_batch_summary

    # Auto-reset batch records when starting a new batch after previous batch completed
    if is_batch_complete:
        current_batch_records.clear()
        is_batch_complete = False
        latest_batch_summary = {
            "isBatchComplete": False,
            "batchDecision": "PASS",
            "totalImages": 0,
            "failCount": 0,
            "failedRecords": [],
            "batch": parsed_meta.get("batch", "-"),
            "waferNo": parsed_meta.get("waferNo", "-")
        }

    # Append the current record immediately into the batch so current inspection is counted
    current_batch_records.append(record)

    # Save Machine Judgement Text File on END signal (.END.bmp / _END.bmp) or batch completion
    is_end_signal = is_end_filename(filename)
    txt_judgement_path = "-"
    
    if is_end_signal:
        batch_decision, mask8_str, fail_summary = build_batch_judgement(current_batch_records)
        txt_filename, txt_judgement_path = generate_machine_judgement_file(batch_decision, mask8_str, prober_name, t_stamp)
        failed_list = [r for r in current_batch_records if r.get("decision") == "FAIL"]
        is_batch_complete = True
        latest_batch_summary = {
            "isBatchComplete": True,
            "batchDecision": batch_decision,
            "totalImages": len(current_batch_records),
            "failCount": len(failed_list),
            "failedRecords": failed_list,
            "batch": parsed_meta.get("batch", "-"),
            "waferNo": parsed_meta.get("waferNo", "-"),
            "mask": mask8_str,
            "txtFile": txt_filename,
            "path": txt_judgement_path
        }
        if main_loop:
            asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
                "event": "BATCH_COMPLETE",
                "data": latest_batch_summary
            })), main_loop)

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


# ==============================================================================
# Priority Queue Dispatcher & Benchmark Evaluation Engine
# ==============================================================================

def save_benchmark_result_to_db(record: dict):
    global db_type
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO benchmark_results (
                session_id, image_name, image_url, annotated_image_url, raw_image_url,
                ai_decision, ai_confidence, ai_reason, inference_time_ms, rule_time_ms,
                min_edge_distance_um, mark_area_ratio_pct, pads_count, marks_count, grains_count,
                human_decision, human_reviewer, reviewed_at, notes
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id;
        """, (
            record["session_id"], record["image_name"], record["image_url"],
            record["annotated_image_url"], record["raw_image_url"],
            record["ai_decision"], record["ai_confidence"], record["ai_reason"],
            record["inference_time_ms"], record["rule_time_ms"],
            record["min_edge_distance_um"], record["mark_area_ratio_pct"],
            record["pads_count"], record["marks_count"], record["grains_count"],
            record.get("human_decision", "UNREVIEWED"), record.get("human_reviewer", "-"),
            record.get("reviewed_at", "-"), record.get("notes", "")
        ))
        new_id = cursor.fetchone()
        if new_id:
            record["id"] = new_id[0]
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as pg_err:
        print("Failed to save benchmark result to PostgreSQL:", pg_err)


def compute_session_kpis(session_id: str) -> dict:
    """Calculates real-time quality KPIs, Agreement, Overkill, Underkill, Yield, and Confusion Matrix."""
    rows = []
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ai_decision, human_decision, inference_time_ms, rule_time_ms
            FROM benchmark_results WHERE session_id = %s;
        """, (session_id,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
    except Exception:
        pass

    total_tested = len(rows)
    if total_tested == 0:
        return {
            "total_tested": 0, "total_reviewed": 0, "unreviewed_count": 0,
            "human_pass_count": 0, "human_fail_count": 0,
            "ai_pass_count": 0, "ai_fail_count": 0,
            "overkill_count": 0, "underkill_count": 0, "agreement_count": 0,
            "overkill_rate": 0.0, "underkill_rate": 0.0, "agreement_rate": 0.0,
            "true_yield": 0.0, "ai_yield": 0.0,
            "avg_inference_time_ms": 0.0, "min_inference_time_ms": 0.0, "max_inference_time_ms": 0.0,
            "avg_rule_time_ms": 0.0,
            "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
        }

    total_reviewed = 0
    human_pass = 0
    human_fail = 0
    ai_pass = 0
    ai_fail = 0
    overkill_fp = 0    # AI = FAIL, Human = PASS (wasting good dies)
    underkill_fn = 0   # AI = PASS, Human = FAIL (escaped defects)
    agree_tp = 0       # AI = FAIL, Human = FAIL (defect correctly identified)
    agree_tn = 0       # AI = PASS, Human = PASS (good die correctly passed)

    inf_times = []
    rule_times = []

    for ai_dec, human_dec, inf_t, r_t in rows:
        if inf_t is not None: inf_times.append(float(inf_t))
        if r_t is not None: rule_times.append(float(r_t))

        ai_is_pass = (ai_dec == "PASS")
        if ai_is_pass: ai_pass += 1
        else: ai_fail += 1

        if human_dec and human_dec in ("PASS", "FAIL"):
            total_reviewed += 1
            human_is_pass = (human_dec == "PASS")
            if human_is_pass: human_pass += 1
            else: human_fail += 1

            if not human_is_pass and not ai_is_pass:
                agree_tp += 1
            elif human_is_pass and ai_is_pass:
                agree_tn += 1
            elif human_is_pass and not ai_is_pass:
                overkill_fp += 1
            elif not human_is_pass and ai_is_pass:
                underkill_fn += 1

    unreviewed = total_tested - total_reviewed
    agreement_count = agree_tp + agree_tn

    overkill_rate = round((overkill_fp / total_reviewed * 100.0), 2) if total_reviewed > 0 else 0.0
    underkill_rate = round((underkill_fn / total_reviewed * 100.0), 2) if total_reviewed > 0 else 0.0
    agreement_rate = round((agreement_count / total_reviewed * 100.0), 2) if total_reviewed > 0 else 0.0
    true_yield = round((human_pass / total_reviewed * 100.0), 2) if total_reviewed > 0 else 0.0
    ai_yield = round((ai_pass / total_tested * 100.0), 2) if total_tested > 0 else 0.0

    avg_inf = round(sum(inf_times) / len(inf_times), 1) if inf_times else 0.0
    min_inf = round(min(inf_times), 1) if inf_times else 0.0
    max_inf = round(max(inf_times), 1) if inf_times else 0.0
    avg_rule = round(sum(rule_times) / len(rule_times), 2) if rule_times else 0.0

    return {
        "total_tested": total_tested,
        "total_reviewed": total_reviewed,
        "unreviewed_count": unreviewed,
        "human_pass_count": human_pass,
        "human_fail_count": human_fail,
        "ai_pass_count": ai_pass,
        "ai_fail_count": ai_fail,
        "overkill_count": overkill_fp,
        "underkill_count": underkill_fn,
        "agreement_count": agreement_count,
        "overkill_rate": overkill_rate,
        "underkill_rate": underkill_rate,
        "agreement_rate": agreement_rate,
        "true_yield": true_yield,
        "ai_yield": ai_yield,
        "avg_inference_time_ms": avg_inf,
        "min_inference_time_ms": min_inf,
        "max_inference_time_ms": max_inf,
        "avg_rule_time_ms": avg_rule,
        "confusion_matrix": {
            "tp": agree_tp,
            "fp": overkill_fp,
            "tn": agree_tn,
            "fn": underkill_fn
        }
    }


def update_benchmark_session_progress(session_id: str, processed_count: int, kpis: dict):
    global db_type
def update_benchmark_session_progress(session_id: str, processed_count: int, kpis: dict):
    metrics_str = json.dumps(kpis)
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE benchmark_sessions
            SET processed_images = %s, metrics = %s
            WHERE id = %s;
        """, (processed_count, metrics_str, session_id))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("Error updating benchmark session progress:", e)


def finalize_benchmark_session(session_id: str):
    kpis = compute_session_kpis(session_id)
    metrics_str = json.dumps(kpis)
    now_str = time.strftime("%d-%b-%Y %H:%M:%S")
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE benchmark_sessions
            SET status = 'COMPLETED', completed_at = %s, metrics = %s
            WHERE id = %s;
        """, (now_str, metrics_str, session_id))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("Error finalizing benchmark session:", e)


def process_benchmark_image(task: dict):
    """
    Processes a single P1 validation image on the i.MX8 node with custom rule thresholds.
    Generates annotated split comparison and logs to benchmark_results table.
    """
    global main_loop, tflite_runner, tflite_model_path, active_class_mode, has_actual_rules
    
    session_id = task["session_id"]
    image_path = task["image_path"]
    filename = task["filename"]
    rules = task.get("rules", {})
    
    fail_dist_um = float(rules.get("fail_distance_um", 8.0))
    max_ratio_pct = float(rules.get("max_area_ratio_pct", 25.0))
    min_ratio_pct = float(rules.get("min_area_ratio_pct", 0.5))
    missing_action = rules.get("missing_mark_action", "fail").lower()
    
    import cv2
    img_cv = cv2.imread(image_path)
    if img_cv is None:
        print(f"⚠️ [BENCHMARK] Could not read image: {image_path}")
        return
        
    h_orig, w_orig = img_cv.shape[:2]
    pads = []
    mark_polys = []
    grain_polys = []
    inf_time = 0.0
    confidence = 95.0
    
    # 1. AI Model Inference under thread-safe inference lock
    t_start = time.time()
    with inference_lock:
        req_model = task.get("model_name") or tflite_model_path or PATHS_CFG.get("model_path") or SYS_CONFIG.get("ai", {}).get("model_path") or "unet.tflite"
        
        # Resolve target model path
        model_path = None
        for cand in [
            req_model,
            os.path.join(_THIS_DIR, req_model),
            os.path.join(_THIS_DIR, "models", req_model),
            os.path.join(PROJECT_ROOT, req_model),
            os.path.join(PROJECT_ROOT, "models", req_model),
            tflite_model_path,
        ]:
            if cand and os.path.exists(cand):
                model_path = cand
                break
                
        if not model_path:
            for p_dir in [".", os.path.join(_THIS_DIR, "iMX8_AI_Inspection-master", "models"), "models", _THIS_DIR, PROJECT_ROOT]:
                if os.path.exists(p_dir):
                    for root, _, files in os.walk(p_dir):
                        for f in files:
                            if f.lower().endswith((".tflite", ".onnx", ".pt", ".pth")) and "quant" not in f.lower():
                                if os.path.basename(req_model).lower() in f.lower():
                                    model_path = os.path.join(root, f)
                                    break
                        if model_path: break
                if model_path: break

        is_tflite = model_path and model_path.lower().endswith((".tflite", ".onnx"))
        
        if is_tflite:
            try:
                from run_unet_tflite_folder import ModelRunner, preprocess_image, postprocess_unet
                if tflite_runner is None or getattr(tflite_runner, "_model_path", None) != model_path:
                    tflite_runner = ModelRunner(model_path)
                    tflite_runner._model_path = model_path
                    tflite_model_path = model_path
                    out_details = tflite_runner.get_output_details()
                    if out_details and len(out_details) > 0 and 'shape' in out_details[0]:
                        shape = list(out_details[0]['shape'])
                        if shape[-1] in (2, 3, 4):
                            active_class_mode = int(shape[-1])
                        elif len(shape) >= 2 and shape[1] in (2, 3, 4):
                            active_class_mode = int(shape[1])
                    if "2class" in os.path.basename(model_path).lower():
                        active_class_mode = 2

                input_details = tflite_runner.get_input_details()
                output_details = tflite_runner.get_output_details()
                input_data, meta = preprocess_image(img_cv, input_details[0])
                output_tensor = tflite_runner.infer(input_data)
                inf_time = round((time.time() - t_start) * 1000, 1)
                
                class_names = ["pad", "probemark"] if active_class_mode == 2 else ["pad", "probemark", "grain"]
                class_ids, masks = postprocess_unet(output_tensor, output_details[0], meta, class_names)
                for c_id, mask in zip(class_ids, masks):
                    if c_id == 0:  # Pad
                        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        for c in contours:
                            if cv2.contourArea(c) > 50:
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
            except Exception as inf_err:
                print(f"[BENCHMARK] TFLite inference error: {inf_err}")
                inf_time = round((time.time() - t_start) * 1000, 1)
        elif model_path and model_path.lower().endswith((".pt", ".pth")):
            try:
                import torch
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
                    state_dict = checkpoint['model_state_dict'] if (isinstance(checkpoint, dict) and 'model_state_dict' in checkpoint) else checkpoint
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
                unet_res = process_single_image(image_path, unet_model, device, output_dir)
                inf_time = round((time.time() - unet_start) * 1000, 1)
                
                pads = unet_res.get("pads", [])
                mark_polys = unet_res.get("probemarks", [])
                grain_polys = unet_res.get("grains", []) if active_class_mode >= 3 else []
                confidence = 95.0
            except Exception as pt_err:
                print(f"[BENCHMARK] PyTorch inference error: {pt_err}")
                inf_time = round((time.time() - t_start) * 1000, 1)
        else:
            inf_time = 15.0

    # 2. Rule Evaluation
    t_rule_start = time.time()
    decision = "PASS"
    cat_reason = "-"
    min_dist_um = 999.0
    calc_max_ratio_pct = 0.0
    rule_time = 0.0
    
    raw_fname = f"raw_bm_{session_id}_{filename}"
    ann_fname = f"ann_bm_{session_id}_{filename}"
    inspect_fname = f"inspect_bm_{session_id}_{filename}"
    raw_out_path = os.path.join(VISUALS_DIR, raw_fname)
    ann_out_path = os.path.join(VISUALS_DIR, ann_fname)
    inspect_out_path = os.path.join(VISUALS_DIR, inspect_fname)

    if has_actual_rules:
        generic_results = [{
            "image_path": image_path,
            "pads": pads,
            "probemarks": mark_polys,
            "grains": grain_polys
        }]
        custom_cfg = {
            "fail_distance_um": fail_dist_um,
            "warning_distance_um": 0.0,
            "warning_occurrence_threshold": 1,
            "max_area_ratio_pct": max_ratio_pct,
            "min_area_ratio_pct": min_ratio_pct,
            "missing_mark_action": missing_action,
        }
        try:
            report = run_inspection(
                generic_results,
                output_csv_path=_resolve_sim_path("simulation/output/benchmark_inspection_report.csv"),
                output_viz_dir=VISUALS_DIR,
                config_path=custom_cfg
            )
            rule_time = round((time.time() - t_rule_start) * 1000, 2)
            if report and len(report) > 0:
                rep = report[0]
                decision = rep.get("decision", "PASS")
                cat_reason = rep.get("reason", "-")
                try:
                    min_dist_um = float(rep.get("min_dist", 999.0)) if rep.get("min_dist") != "N/A" else 0.0
                except (ValueError, TypeError):
                    min_dist_um = 0.0
                try:
                    calc_max_ratio_pct = float(rep.get("ratio", "0.0").replace("%", ""))
                except (ValueError, TypeError):
                    calc_max_ratio_pct = 0.0

                viz_path = rep.get("viz_path") or os.path.join(VISUALS_DIR, f"inspect_{filename}")
                if os.path.exists(viz_path):
                    canvas_img = cv2.imread(viz_path)
                    if canvas_img is not None:
                        h_c, w_c, _ = canvas_img.shape
                        w_half = w_c // 2
                        raw_part = canvas_img[70:, :w_half]
                        ann_part = canvas_img[70:, w_half:]
                        
                        cv2.imwrite(raw_out_path, raw_part)
                        cv2.imwrite(ann_out_path, ann_part)
                        cv2.imwrite(inspect_out_path, canvas_img)
        except Exception as rule_err:
            print(f"[BENCHMARK] Error running rule engine: {rule_err}")

    if not os.path.exists(ann_out_path) or not os.path.exists(raw_out_path) or (os.path.exists(ann_out_path) and os.path.getsize(ann_out_path) == 0) or (os.path.exists(raw_out_path) and os.path.getsize(raw_out_path) == 0):
        # Fallback if rule engine not available
        canvas = np.zeros((h_orig + 70, w_orig * 2, 3), dtype=np.uint8)
        canvas[70:, :w_orig] = img_cv.copy()
        ann_part = img_cv.copy()
        reasons = []

        if len(pads) == 0:
            decision = "FAIL"
            reasons.append("No Pad Detected")
        else:
            for pad in pads:
                pad_poly = pad.astype(np.int32)
                cv2.polylines(ann_part, [pad_poly], isClosed=True, color=(255, 100, 0), thickness=1)
                overlay = ann_part.copy()
                cv2.fillPoly(overlay, [pad_poly], (255, 0, 0))
                cv2.addWeighted(overlay, 0.2, ann_part, 0.8, 0, ann_part)
                
            main_pad = max(pads, key=cv2.contourArea)
            pad_hull = cv2.convexHull(main_pad)
            pad_mask = np.zeros((h_orig, w_orig), dtype=np.uint8)
            cv2.fillPoly(pad_mask, [pad_hull], 255)
            pad_area = cv2.countNonZero(pad_mask)
            pad_dist_map = cv2.distanceTransform(pad_mask, cv2.DIST_L2, 5)
            
            if len(mark_polys) == 0:
                if missing_action == "fail":
                    decision = "FAIL"
                    reasons.append("No Probe Mark (Strict Fail)")
                else:
                    decision = "PASS"
            else:
                combined_pm_mask = np.zeros((h_orig, w_orig), dtype=np.uint8)
                for pm in mark_polys:
                    pm_poly = pm.astype(np.int32)
                    cv2.fillPoly(combined_pm_mask, [pm_poly], 255)
                    
                pm_area = cv2.countNonZero(combined_pm_mask)
                if pad_area > 0:
                    calc_max_ratio_pct = round((pm_area / pad_area) * 100.0, 1)
                
                pm_pixels = np.where(combined_pm_mask > 0)
                if len(pm_pixels[0]) > 0:
                    distances = pad_dist_map[pm_pixels]
                    if len(distances) > 0:
                        min_dist_um = round(float(np.min(distances)), 1)

                if calc_max_ratio_pct > max_ratio_pct:
                    decision = "FAIL"
                    reasons.append(f"Area Ratio Too Large ({calc_max_ratio_pct}% > {max_ratio_pct}%)")
                elif min_ratio_pct > 0 and calc_max_ratio_pct < min_ratio_pct:
                    decision = "FAIL"
                    reasons.append(f"Area Ratio Too Small ({calc_max_ratio_pct}% < {min_ratio_pct}%)")
                    
                if min_dist_um < fail_dist_um:
                    decision = "FAIL"
                    reasons.append(f"Mark Close to Edge ({min_dist_um}um < {fail_dist_um}um)")
                    
                pm_color = (0, 0, 255) if decision == "FAIL" else (0, 255, 0)
                for pm in mark_polys:
                    pm_poly = pm.astype(np.int32)
                    cv2.polylines(ann_part, [pm_poly], isClosed=True, color=pm_color, thickness=1)
                    overlay = ann_part.copy()
                    cv2.fillPoly(overlay, [pm_poly], pm_color)
                    cv2.addWeighted(overlay, 0.35, ann_part, 0.65, 0, ann_part)
                    
        for gr in grain_polys:
            gr_poly = gr.astype(np.int32)
            cv2.polylines(ann_part, [gr_poly], isClosed=True, color=(255, 0, 255), thickness=1)
            
        rule_time = round((time.time() - t_rule_start) * 1000, 2)
        cat_reason = " & ".join(reasons) if reasons else "-"
        
        canvas[70:, w_orig:] = ann_part
        banner_color = (0, 0, 220) if decision == "FAIL" else (0, 180, 0)
        cv2.rectangle(canvas, (0, 0), (w_orig * 2, 70), banner_color, -1)
        cv2.putText(canvas, f"AI {decision}", (w_orig - 50, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        sub_txt = f"Dist: {min_dist_um if min_dist_um < 900 else 'N/A'}um | Area: {calc_max_ratio_pct}% | {cat_reason}"
        cv2.putText(canvas, sub_txt, (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (230, 230, 230), 1)
        cv2.line(canvas, (w_orig, 70), (w_orig, h_orig + 70), (255, 255, 255), 1)
        
        cv2.imwrite(raw_out_path, img_cv)
        cv2.imwrite(ann_out_path, ann_part)
        cv2.imwrite(inspect_out_path, canvas)
    
    t_query = f"?t={int(time.time() * 1000)}"
    raw_url = f"/visuals/{raw_fname}{t_query}"
    ann_url = f"/visuals/{ann_fname}{t_query}"
    inspect_url = f"/visuals/{inspect_fname}{t_query}"
    
    # Save to Database
    result_record = {
        "session_id": session_id,
        "image_name": filename,
        "image_url": ann_url,
        "annotated_image_url": ann_url,
        "raw_image_url": raw_url,
        "comparison_image_url": inspect_url,
        "ai_decision": decision,
        "ai_confidence": confidence,
        "ai_reason": cat_reason,
        "inference_time_ms": inf_time,
        "rule_time_ms": rule_time,
        "min_edge_distance_um": min_dist_um if min_dist_um < 900 else 0.0,
        "mark_area_ratio_pct": calc_max_ratio_pct,
        "pads_count": len(pads),
        "marks_count": len(mark_polys),
        "grains_count": len(grain_polys),
        "human_decision": "UNREVIEWED",
        "human_reviewer": "-",
        "reviewed_at": "-",
        "notes": ""
    }
    
    save_benchmark_result_to_db(result_record)
    
    # Recompute live KPIs & update session
    kpis = compute_session_kpis(session_id)
    update_benchmark_session_progress(session_id, priority_dispatcher_state["p1_processed"], kpis)
    
    priority_dispatcher_state["last_kpis"] = kpis
    
    # Broadcast WebSocket update
    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BENCHMARK_PROGRESS",
            "data": {
                "status": priority_dispatcher_state.get("status", "RUNNING"),
                "session_id": session_id,
                "p1_processed": priority_dispatcher_state["p1_processed"],
                "p1_total": priority_dispatcher_state["p1_total"],
                "processed": priority_dispatcher_state["p1_processed"],
                "total": priority_dispatcher_state["p1_total"],
                "current_image": filename,
                "latest_result": result_record,
                "kpis": kpis,
                "p0_pending": priority_dispatcher_state["p0_pending"],
                "p1_pending": priority_dispatcher_state["p1_pending"],
                "active_priority": priority_dispatcher_state["active_priority"]
            }
        })), main_loop)


def folder_watcher_thread():
    """
    Monitors machine input folders (Drive N: IMAGE and local simulation/image).
    When an image arrives:
      1. Parses filename to extract lot/batch number ({output.lotNo}).
      2. Creates target Drive M: PROCESSED/{output.lotNo} folder if it doesn't exist.
      3. Moves the raw image to Drive M: PROCESSED/{output.lotNo}/ (raw file remains preserved).
      4. Dispatches the image into High-Priority P0 Queue for AI inference.
    """
    print("i.MX8 Machine Folder Watcher initialized.")
    print(f"  👉 Machine Input  : {IMAGE_DIR}")
    print(f"  👉 Process Buffer : {PROCESS_DIR}")
    print(f"  👉 Output Visual  : {OUTPUT_DIR}")
    print(f"  👉 Machine Judge  : {JUDGEMENT_DIR}")
    
    while True:
        try:
            source_dirs = set()
            if IMAGE_DIR and os.path.exists(IMAGE_DIR):
                source_dirs.add(IMAGE_DIR)
            
            sim_src = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING.get("lot.source.folder", ""))
            if sim_src:
                os.makedirs(sim_src, exist_ok=True)
                source_dirs.add(sim_src)

            for s_dir in source_dirs:
                try:
                    image_files = [f for f in os.listdir(s_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
                    # Ensure _END files are processed strictly at the end of the batch
                    image_files.sort(key=lambda f: (1 if is_end_filename(f) else 0, f))
                except Exception:
                    image_files = []

                for file in image_files:
                    src_path = os.path.join(s_dir, file)
                    try:
                        # Ensure camera/network has finished writing the file
                        if not os.path.exists(src_path):
                            continue
                        size1 = os.path.getsize(src_path)
                        if size1 == 0:
                            continue
                        time.sleep(0.02)
                        if not os.path.exists(src_path) or os.path.getsize(src_path) != size1:
                            continue  # Still being written by camera, process next loop

                        meta = parse_wafer_filename(file, get_current_prober_name())
                        raw_lot = meta.get("batch") or meta.get("waferNo") or "UNKNOWN_LOT"
                        lot_no_str = raw_lot.split("-")[0].strip() if raw_lot and raw_lot != "-" else "UNKNOWN_LOT"
                        
                        inp_tmpl = ACTIVE_MACHINE_SETTING.get("lot.input.folder", "M:\\WP288\\PMI\\PROCESSED\\{output.lotNo}")
                        processed_lot_dir = resolve_windows_drive_path(inp_tmpl.replace("{output.lotNo}", lot_no_str))
                        os.makedirs(processed_lot_dir, exist_ok=True)
                        
                        raw_preserved_path = os.path.join(processed_lot_dir, file)
                        proc_work_path = os.path.join(PROCESS_DIR, file)
                        
                        # Move raw image to Drive M: PROCESSED/{lotNo} (stays preserved)
                        shutil.move(src_path, raw_preserved_path)
                        # Copy a working copy to PROCESS_DIR buffer for AI
                        shutil.copy2(raw_preserved_path, proc_work_path)
                        
                        P0_QUEUE.put({
                            "filepath": proc_work_path,
                            "filename": file,
                            "lot_no": lot_no_str,
                            "raw_preserved_path": raw_preserved_path
                        })
                        priority_dispatcher_state["p0_pending"] = P0_QUEUE.qsize()
                        print(f"[INGEST] Moved raw image to Drive M: {raw_preserved_path} -> Queued P0")
                    except Exception as move_err:
                        print(f"Failed to ingest file {file}: {move_err}")
        except Exception as e:
            print(f"Error in watcher thread: {e}")
        time.sleep(0.08)


def priority_dispatcher_thread():
    """
    Unified Dispatcher Worker Thread.
    Executes P0 real-time machine tasks with top priority.
    Executes P1 model validation tasks when P0 is empty.
    Preemption Safety: checks P0 immediately after each single P1 image execution.
    """
    global dispatcher_running, priority_dispatcher_state
    print("⚡ i.MX8 Task Priority Dispatcher Worker Thread initialized (P0: Machine > P1: Model Validation).")
    
    while dispatcher_running:
        try:
            # 1. P0 Preemption Check: Highest Priority (Live Machine Prober)
            try:
                p0_task = P0_QUEUE.get_nowait()
                priority_dispatcher_state["active_priority"] = "P0_PRODUCTION"
                priority_dispatcher_state["p0_pending"] = P0_QUEUE.qsize()
                try:
                    process_new_file(p0_task["filepath"], p0_task["filename"])
                except Exception as p0_err:
                    print(f"❌ [P0 EXEC ERROR] {p0_err}")
                finally:
                    P0_QUEUE.task_done()
                    priority_dispatcher_state["p0_pending"] = P0_QUEUE.qsize()
                continue
            except queue.Empty:
                pass

            # 2. P1 Processing: Low Priority (Model Validation Lab)
            if priority_dispatcher_state.get("status") == "PAUSED":
                time.sleep(0.1)
                continue

            try:
                p1_task = P1_QUEUE.get_nowait()
                priority_dispatcher_state["active_priority"] = "P1_BENCHMARK"
                priority_dispatcher_state["p1_pending"] = P1_QUEUE.qsize()
                priority_dispatcher_state["p1_current"] = p1_task["filename"]
                try:
                    process_benchmark_image(p1_task)
                except Exception as p1_err:
                    print(f"❌ [P1 EXEC ERROR] {p1_err}")
                finally:
                    P1_QUEUE.task_done()
                    priority_dispatcher_state["p1_pending"] = P1_QUEUE.qsize()
                    priority_dispatcher_state["p1_processed"] += 1
                    
                    if P1_QUEUE.qsize() == 0:
                        priority_dispatcher_state["status"] = "COMPLETED"
                        priority_dispatcher_state["active_priority"] = "IDLE"
                        priority_dispatcher_state["p1_current"] = ""
                        sess_id = priority_dispatcher_state.get("active_session_id")
                        if sess_id:
                            finalize_benchmark_session(sess_id)
                        if main_loop and main_loop.is_running():
                            asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
                                "event": "BENCHMARK_PROGRESS",
                                "data": {
                                    "status": "COMPLETED",
                                    "session_id": sess_id,
                                    "p1_processed": priority_dispatcher_state["p1_processed"],
                                    "p1_total": priority_dispatcher_state["p1_total"],
                                    "p0_pending": 0,
                                    "p1_pending": 0,
                                    "active_priority": "IDLE"
                                }
                            })), main_loop)
                continue
            except queue.Empty:
                if priority_dispatcher_state["active_priority"] == "P1_BENCHMARK":
                    priority_dispatcher_state["active_priority"] = "IDLE"
                    priority_dispatcher_state["p1_current"] = ""
                time.sleep(0.05)
        except Exception as disp_err:
            print(f"Dispatcher thread error: {disp_err}")
            time.sleep(0.1)


# Startup Event
@app.on_event("startup")
async def startup_event():
    global main_loop, tflite_runner, tflite_model_path, active_class_mode
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

    t_dispatcher = threading.Thread(target=priority_dispatcher_thread, daemon=True)
    t_dispatcher.start()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        await websocket.send_text(json.dumps({"event": "CONNECTION_ESTABLISHED", "db": db_type}))
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

def load_history_from_db():
    prober_name = get_current_prober_name()
    records = []
    try:
        conn = get_pg_connection()
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
    except Exception as e:
        print("[DB] Failed to load history from PostgreSQL:", e)
    return records



@app.get("/api/images/raw/{lot_no}/{filename}")
async def get_raw_image_from_drive(lot_no: str, filename: str):
    inp_tmpl = ACTIVE_MACHINE_SETTING.get("lot.input.folder", "M:\\WP288\\PMI\\PROCESSED\\{output.lotNo}")
    proc_dir = resolve_windows_drive_path(inp_tmpl.replace("{output.lotNo}", lot_no))
    if proc_dir:
        for fname in [filename, f"raw_{filename}"]:
            fpath = os.path.join(proc_dir, fname)
            if os.path.exists(fpath):
                return FileResponse(fpath)
    
    # Check source folder as fallback
    src_dir = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING.get("lot.source.folder", "N:\\WP288\\PMI\\IMAGE"))
    if src_dir:
        fpath = os.path.join(src_dir, filename)
        if os.path.exists(fpath):
            return FileResponse(fpath)
            
    raise HTTPException(status_code=404, detail="Raw image not found in Drive M/N")

@app.get("/api/images/annotated/{lot_no}/{filename}")
async def get_annotated_image_from_drive(lot_no: str, filename: str):
    out_tmpl = ACTIVE_MACHINE_SETTING.get("lot.output.folder", "M:\\WP288\\PMI\\OUTPUT\\{output.lotNo}")
    out_dir = resolve_windows_drive_path(out_tmpl.replace("{output.lotNo}", lot_no))
    if out_dir:
        for fname in [filename, f"annotated_{filename}", f"inspect_{filename}"]:
            fpath = os.path.join(out_dir, fname)
            if os.path.exists(fpath):
                return FileResponse(fpath)
                
    raise HTTPException(status_code=404, detail="Annotated image not found in Drive M")

@app.get("/api/latest-inspection")
@app.get("/api/v1/latest-inspection")
async def get_latest_inspection():
    return latest_inspection

@app.get("/api/batch-summary")
@app.get("/api/v1/batch-summary")
async def get_batch_summary():
    global is_batch_complete, latest_batch_summary, current_batch_records
    if is_batch_complete and latest_batch_summary:
        return latest_batch_summary
    
    failed = [r for r in current_batch_records if r.get("decision") == "FAIL"]
    active_batch = current_batch_records[0].get("batch", "-") if current_batch_records else "-"
    active_wafer = current_batch_records[0].get("waferNo", "-") if current_batch_records else "-"
    return {
        "isBatchComplete": False,
        "batchDecision": "FAIL" if len(failed) > 0 else "PASS",
        "totalImages": len(current_batch_records),
        "failCount": len(failed),
        "failedRecords": failed,
        "batch": active_batch,
        "waferNo": active_wafer
    }

@app.post("/api/batch/reset")
@app.post("/api/v1/batch/reset")
async def reset_batch_state():
    global is_batch_complete, latest_batch_summary, current_batch_records
    current_batch_records.clear()
    is_batch_complete = False
    latest_batch_summary = {
        "isBatchComplete": False,
        "batchDecision": "PASS",
        "totalImages": 0,
        "failCount": 0,
        "failedRecords": [],
        "batch": "-",
        "waferNo": "-"
    }
    return {"status": "success", "message": "Batch state reset successfully"}

@app.get("/api/history")
@app.get("/api/v1/history")
async def get_history():
    return load_history_from_db()

@app.delete("/api/history")
@app.delete("/api/v1/history")
async def clear_history():
    global latest_inspection, active_alarms, inspection_count
    latest_inspection = {}
    active_alarms = []
    inspection_count = 0
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("TRUNCATE TABLE inspections RESTART IDENTITY;")
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("[DB] Failed to clear history from PostgreSQL:", e)
    return {"status": "cleared"}

@app.post("/api/simulate-end")
@app.post("/api/v1/simulate-end")
async def trigger_end_signal():
    global current_batch_records, is_batch_complete, latest_batch_summary
    if not current_batch_records:
        return {"status": "ignored", "message": "No active batch records in queue to summarize"}
    
    t_stamp = time.strftime("%Y%m%d%H%M%S")
    prober_name = get_current_prober_name()
    
    batch_decision, mask8_str, fail_summary = build_batch_judgement(current_batch_records)
    txt_filename, txt_judgement_path = generate_machine_judgement_file(batch_decision, mask8_str, prober_name, t_stamp)
    failed_list = [r for r in current_batch_records if r.get("decision") == "FAIL"]
    
    is_batch_complete = True
    latest_batch_summary = {
        "isBatchComplete": True,
        "batchDecision": batch_decision,
        "totalImages": len(current_batch_records),
        "failCount": len(failed_list),
        "failedRecords": failed_list,
        "machineNo": prober_name,
        "batch": current_batch_records[0].get("batch", "-") if current_batch_records else "-",
        "waferNo": current_batch_records[0].get("waferNo", "-") if current_batch_records else "-",
        "mask": mask8_str,
        "txtFile": txt_filename,
        "path": txt_judgement_path
    }
    
    if main_loop:
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BATCH_COMPLETE",
            "data": latest_batch_summary
        })), main_loop)
        
    return {
        "status": "success",
        "filename": txt_filename,
        "path": txt_judgement_path,
        "decision": batch_decision,
        "mask": mask8_str,
        "totalImages": len(current_batch_records),
        "failCount": len(failed_list),
        "failedRecords": failed_list
    }

# ==============================================================================
# Configuration Management Endpoints (Product_Settine & Machine_Setting)
# ==============================================================================
@app.get("/api/config/active")
async def get_active_config():
    global ACTIVE_PRODUCT_SETTING, ACTIVE_MACHINE_SETTING
    
    edge_thresh = float(ACTIVE_PRODUCT_SETTING.get("edgeThreshold", 8.0))
    edge_factor = float(ACTIVE_PRODUCT_SETTING.get("edgeConversionFactor", 1.0))
    fail_dist_um = edge_thresh / edge_factor if edge_factor > 0 else edge_thresh
    max_area_ratio = float(ACTIVE_PRODUCT_SETTING.get("areaRatioThreshold", 25.0))
    
    sim_source = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING.get("lot.source.folder", ""))
    sim_judge = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING.get("machine.result.folder", ""))
    
    return {
        "status": "success",
        "product": ACTIVE_PRODUCT_SETTING,
        "machine": ACTIVE_MACHINE_SETTING,
        "prober_name": get_current_prober_name(),
        "computed": {
            "failDistanceUm": fail_dist_um,
            "maxAreaRatioPct": max_area_ratio,
            "targetWidth": ACTIVE_PRODUCT_SETTING.get("targetWidth", 160),
            "targetHeight": ACTIVE_PRODUCT_SETTING.get("targetHeight", 160),
            "minAreaSizes": ACTIVE_PRODUCT_SETTING.get("minAreaSizes", [300, 10]),
            "hRoi": ACTIVE_PRODUCT_SETTING.get("horizontalRoi", 0.7),
            "vRoi": ACTIVE_PRODUCT_SETTING.get("verticalRoi", 0.7),
            "simulatedSourceFolder": sim_source,
            "simulatedJudgeFolder": sim_judge,
        }
    }

@app.get("/api/configs")
async def get_all_configs():
    reg = load_config_registry()
    active_rec = reg.get("active_recipe", "Product_Settine.txt")
    active_mach = reg.get("active_machine_config", "Machine_Setting.txt")
    bindings = reg.get("bindings", {})

    recipes = []
    if os.path.exists(RECIPES_DIR):
        for fname in sorted(os.listdir(RECIPES_DIR)):
            if fname.lower().endswith((".txt", ".json")):
                fp = os.path.join(RECIPES_DIR, fname)
                sz_kb = round(os.path.getsize(fp) / 1024, 1)
                mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(fp)))
                bound_m = [m for m, b in bindings.items() if b.get("recipe") == fname]
                recipes.append({
                    "name": fname,
                    "size": f"{sz_kb} KB",
                    "updatedAt": mtime,
                    "active": (fname == active_rec),
                    "boundModels": bound_m
                })

    machines = []
    if os.path.exists(MACHINES_DIR):
        for fname in sorted(os.listdir(MACHINES_DIR)):
            if fname.lower().endswith((".txt", ".json")):
                fp = os.path.join(MACHINES_DIR, fname)
                sz_kb = round(os.path.getsize(fp) / 1024, 1)
                mtime = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(os.path.getmtime(fp)))
                machines.append({
                    "name": fname,
                    "size": f"{sz_kb} KB",
                    "updatedAt": mtime,
                    "active": (fname == active_mach)
                })

    return {
        "status": "success",
        "active_recipe": active_rec,
        "active_machine": active_mach,
        "prober_name": get_current_prober_name(),
        "recipes": recipes,
        "machines": machines,
        "bindings": bindings,
        "current_product": ACTIVE_PRODUCT_SETTING,
        "current_machine": ACTIVE_MACHINE_SETTING
    }

@app.post("/api/config/upload-product")
async def upload_product_config(file: UploadFile = File(...)):
    global ACTIVE_PRODUCT_SETTING
    try:
        content = await file.read()
        parsed = json.loads(content.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise ValueError("Config content must be a valid JSON object.")
        
        # Save to persistent recipe library
        os.makedirs(RECIPES_DIR, exist_ok=True)
        dest_path = os.path.join(RECIPES_DIR, file.filename)
        with open(dest_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)
            
        ACTIVE_PRODUCT_SETTING.update(parsed)
        
        reg = load_config_registry()
        reg["active_recipe"] = file.filename
        save_config_registry(reg)
        
        # Save active copy
        with open(os.path.join(_THIS_DIR, "active_product_setting.json"), "w", encoding="utf-8") as f:
            json.dump(ACTIVE_PRODUCT_SETTING, f, indent=2)
            
        print(f"[CONFIG] Stored and activated Product Recipe from '{file.filename}'")
        return {
            "status": "success",
            "message": f"Successfully stored and activated Product Recipe '{file.filename}'",
            "name": file.filename,
            "product": ACTIVE_PRODUCT_SETTING
        }
    except Exception as e:
        print(f"[CONFIG] Error uploading product config: {e}")
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/config/upload-machine")
async def upload_machine_config(file: UploadFile = File(...)):
    global ACTIVE_MACHINE_SETTING
    try:
        content = await file.read()
        parsed = json.loads(content.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise ValueError("Config content must be a valid JSON object.")
        
        # Save to persistent machine configs library
        os.makedirs(MACHINES_DIR, exist_ok=True)
        dest_path = os.path.join(MACHINES_DIR, file.filename)
        with open(dest_path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2)

        ACTIVE_MACHINE_SETTING.update(parsed)
        
        reg = load_config_registry()
        reg["active_machine_config"] = file.filename
        save_config_registry(reg)
        
        with open(os.path.join(_THIS_DIR, "active_machine_setting.json"), "w", encoding="utf-8") as f:
            json.dump(ACTIVE_MACHINE_SETTING, f, indent=2)
            
        for k in ["lot.source.folder", "machine.result.folder"]:
            if k in ACTIVE_MACHINE_SETTING:
                sim_path = resolve_windows_drive_path(ACTIVE_MACHINE_SETTING[k])
                os.makedirs(sim_path, exist_ok=True)
                
        print(f"[CONFIG] Stored and activated Machine Setting from '{file.filename}'")
        return {
            "status": "success",
            "message": f"Successfully stored and activated Machine Setting '{file.filename}'",
            "name": file.filename,
            "machine": ACTIVE_MACHINE_SETTING
        }
    except Exception as e:
        print(f"[CONFIG] Error uploading machine config: {e}")
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/config/activate-recipe")
async def activate_recipe_endpoint(payload: dict = Body(...)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Recipe name is required")
    success = apply_recipe_by_filename(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Recipe file '{name}' not found")
    return {"status": "success", "message": f"Activated Recipe '{name}'", "product": ACTIVE_PRODUCT_SETTING}

@app.post("/api/config/activate-machine")
async def activate_machine_endpoint(payload: dict = Body(...)):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Machine config name is required")
    success = apply_machine_by_filename(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Machine config '{name}' not found")
    return {"status": "success", "message": f"Activated Machine Setting '{name}'", "machine": ACTIVE_MACHINE_SETTING}

@app.post("/api/config/bind")
async def bind_model_config(payload: dict = Body(...)):
    model_name = payload.get("model_name")
    recipe = payload.get("recipe")
    machine_config = payload.get("machine_config")
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name is required")
    reg = load_config_registry()
    if "bindings" not in reg: reg["bindings"] = {}
    if model_name not in reg["bindings"]: reg["bindings"][model_name] = {}
    if recipe:
        reg["bindings"][model_name]["recipe"] = recipe
    if machine_config:
        reg["bindings"][model_name]["machine_config"] = machine_config
    save_config_registry(reg)
    
    if tflite_model_path and os.path.basename(tflite_model_path) == model_name:
        if recipe: apply_recipe_by_filename(recipe)
        if machine_config: apply_machine_by_filename(machine_config)
        
    print(f"[CONFIG] Bound model '{model_name}' to recipe '{recipe}'")
    return {"status": "success", "message": f"Bound model '{model_name}' to recipe '{recipe}'", "bindings": reg["bindings"]}

@app.delete("/api/config/{config_type}/{filename}")
async def delete_config_file(config_type: str, filename: str):
    base_dir = RECIPES_DIR if config_type == "product" else MACHINES_DIR
    target = os.path.join(base_dir, filename)
    reg = load_config_registry()
    if config_type == "product" and reg.get("active_recipe") == filename:
        raise HTTPException(status_code=400, detail="Cannot delete currently active recipe")
    if config_type == "machine" and reg.get("active_machine_config") == filename:
        raise HTTPException(status_code=400, detail="Cannot delete currently active machine setting")
        
    if os.path.exists(target):
        try:
            os.remove(target)
            return {"status": "success", "message": f"Deleted {config_type} config '{filename}'"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=404, detail="File not found")

@app.post("/api/config/apply-preset")
async def apply_config_preset(preset_name: str = Body(..., embed=True)):
    global ACTIVE_PRODUCT_SETTING, ACTIVE_MACHINE_SETTING
    try:
        if preset_name == "default_factory":
            ACTIVE_PRODUCT_SETTING = load_initial_product_setting()
            ACTIVE_MACHINE_SETTING = load_initial_machine_setting()
        elif preset_name == "strict_quality":
            ACTIVE_PRODUCT_SETTING.update({
                "edgeThreshold": 10.0,
                "areaRatioThreshold": 20.0,
                "verticalRoi": 0.8,
                "horizontalRoi": 0.8
            })
        elif preset_name == "relaxed_quality":
            ACTIVE_PRODUCT_SETTING.update({
                "edgeThreshold": 5.0,
                "areaRatioThreshold": 35.0,
                "verticalRoi": 0.6,
                "horizontalRoi": 0.6
            })
        return {
            "status": "success",
            "message": f"Applied preset '{preset_name}'",
            "product": ACTIVE_PRODUCT_SETTING,
            "machine": ACTIVE_MACHINE_SETTING
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.post("/api/config/update-thresholds")
async def update_thresholds(payload: dict = Body(...)):
    global ACTIVE_PRODUCT_SETTING
    try:
        fail_dist = float(payload.get("fail_distance_um", 8.0))
        max_area = float(payload.get("max_area_ratio_pct", 25.0))
        ACTIVE_PRODUCT_SETTING["edgeThreshold"] = fail_dist
        ACTIVE_PRODUCT_SETTING["areaRatioThreshold"] = max_area
        with open(os.path.join(_THIS_DIR, "active_product_setting.json"), "w", encoding="utf-8") as f:
            json.dump(ACTIVE_PRODUCT_SETTING, f, indent=2)
        return {
            "status": "success",
            "message": f"Updated thresholds: Fail Dist={fail_dist}µm, Max Area={max_area}%",
            "product": ACTIVE_PRODUCT_SETTING
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={"status": "error", "message": str(e)})

@app.get("/api/models")
async def get_models():
    global tflite_model_path
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
                if fname.lower().endswith(".tflite") and fname not in seen and "quant" not in fname.lower() and "temp" not in fname.lower():
                    fpath = os.path.join(s_dir, fname)
                    if os.path.isfile(fpath):
                        seen.add(fname)
                        sz_mb = round(os.path.getsize(fpath) / (1024 * 1024), 1)
                        is_active = (tflite_model_path and os.path.abspath(fpath) == os.path.abspath(tflite_model_path)) or (not tflite_model_path and fname == "unet.tflite")

                        models_info.append({
                            "name": fname,
                            "version": "v1.0.0",
                            "size": f"{sz_mb} MB",
                            "active": bool(is_active)
                        })
        except Exception:
            pass

    if not models_info:
        models_info.append({
            "name": "unet.tflite",
            "version": "v1.0.0",
            "size": "28.5 MB",
            "active": True
        })
        
    return models_info


@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...)):
    fname_lower = file.filename.lower()
    if not (fname_lower.endswith(".tflite") or fname_lower.endswith(".pth") or fname_lower.endswith(".pt")):
        raise HTTPException(status_code=400, detail="Invalid model file extension. Only .pth and .tflite files are supported.")
    
    os.makedirs(MODELS_DIR, exist_ok=True)
    temp_upload_path = os.path.join(MODELS_DIR, file.filename)
    try:
        with open(temp_upload_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        final_filename = file.filename
        if fname_lower.endswith((".pth", ".pt")):
            stem = os.path.splitext(file.filename)[0]
            final_filename = f"{stem}.tflite"
            target_tflite_path = os.path.join(MODELS_DIR, final_filename)
            
            print(f"📥 [MODEL UPLOAD] Uploaded PyTorch model '{file.filename}'. Starting auto-conversion to TFLite INT8...")
            
            from convert_model import convert_pth_to_tflite
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, convert_pth_to_tflite, temp_upload_path, target_tflite_path)
            
            # Remove original .pth file per Option B
            if os.path.exists(temp_upload_path) and temp_upload_path != target_tflite_path:
                try: os.remove(temp_upload_path)
                except Exception: pass
            
            target_path = target_tflite_path
        else:
            target_path = temp_upload_path
            
        size_mb = round(os.path.getsize(target_path) / (1024 * 1024), 1)
        print(f"📥 [MODEL UPLOAD] Ready TFLite model '{final_filename}' ({size_mb} MB) in {MODELS_DIR}")
        return {
            "status": "success",
            "name": final_filename,
            "size": f"{size_mb} MB",
            "message": f"Model '{final_filename}' uploaded and ready on i.MX8 node."
        }
    except Exception as e:
        print(f"❌ [MODEL UPLOAD] Upload failed: {e}")
        if os.path.exists(temp_upload_path):
            try: os.remove(temp_upload_path)
            except Exception: pass
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/models/activate")
async def activate_model(payload: dict):
    global tflite_runner, tflite_model_path, active_class_mode
    model_name = payload.get("name")
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

            if target_path.lower().endswith((".tflite", ".onnx")):
                from run_unet_tflite_folder import ModelRunner
                tflite_runner = ModelRunner(target_path)

                dummy_img = np.zeros((1, 640, 640, 3), dtype=np.float32)
                try:
                    _ = tflite_runner.infer(dummy_img)
                except Exception:
                    pass
            else:
                tflite_runner = None

            active_class_mode = 3

            if old_runner:
                del old_runner
                
            print(f"[NPU HOT-SWAP] Activated new model: {model_name} on NPU")
            
            # Automatically apply bound recipe and machine config for this model
            reg = load_config_registry()
            model_b = reg.get("bindings", {}).get(model_name, {})
            bound_rec = model_b.get("recipe")
            if bound_rec:
                applied = apply_recipe_by_filename(bound_rec)
                if applied:
                    print(f"[MODEL-RECIPE BIND] Auto-applied recipe '{bound_rec}' for model '{model_name}'")
            bound_mach = model_b.get("machine_config")
            if bound_mach:
                applied_mach = apply_machine_by_filename(bound_mach)
                if applied_mach:
                    print(f"[MODEL-RECIPE BIND] Auto-applied machine config '{bound_mach}' for model '{model_name}'")

            # Broadcast WS event if main_loop is running
            if main_loop and main_loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
                    "event": "MODEL_ACTIVATED",
                    "data": { "name": model_name, "classes": 3, "recipe": bound_rec }
                })), main_loop)
            
            return {
                "status": "success",
                "active_model": model_name,
                "bound_recipe": bound_rec,
                "message": f"Successfully activated '{model_name}' on i.MX8 node."
            }
        except Exception as err:
            print(f"[NPU HOT-SWAP] Failed to activate model '{model_name}': {err}")
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

# ==============================================================================
# MODEL VALIDATION LAB & HUMAN REVIEW BENCHMARK API ENDPOINTS
# ==============================================================================

@app.get("/api/model/benchmark/datasets")
async def get_benchmark_datasets():
    """Lists all available preset test wafer datasets."""
    datasets_list = []
    
    # 1. Defect Dataset (Bad)
    bad_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Bad")
    if os.path.exists(bad_dir):
        files = [f for f in os.listdir(bad_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
        datasets_list.append({
            "key": "bad_wafers",
            "name": "Defective Wafer Dataset (Bad Samples)",
            "description": "500+ Defective dies with probe mark defects & grain contamination",
            "count": len(files),
            "ground_truth_hint": "FAIL",
            "path": bad_dir
        })
        
    # 2. Good Dataset
    good_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Good")
    if os.path.exists(good_dir):
        files = [f for f in os.listdir(good_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
        datasets_list.append({
            "key": "good_wafers",
            "name": "Good Wafer Dataset (Pass Samples)",
            "description": "500+ Golden/Pass dies within normal tolerance limits",
            "count": len(files),
            "ground_truth_hint": "PASS",
            "path": good_dir
        })
        
    # 3. Full Combined Dataset
    if os.path.exists(bad_dir) and os.path.exists(good_dir):
        b_files = len([f for f in os.listdir(bad_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))])
        g_files = len([f for f in os.listdir(good_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))])
        datasets_list.append({
            "key": "all_wafers",
            "name": "Full Production Accuracy Dataset (Good + Bad)",
            "description": "1,000+ Full balanced dataset for overall Yield & Accuracy benchmark",
            "count": b_files + g_files,
            "ground_truth_hint": "MIXED",
            "path": os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy")
        })

    # 4. Real Wafer Dataset
    real_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy_real")
    if os.path.exists(real_dir):
        r_files = []
        for r, _, fs in os.walk(real_dir):
            for f in fs:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                    r_files.append(f)
        if r_files:
            datasets_list.append({
                "key": "real_wafers",
                "name": "Real Fab Wafer Accuracy Dataset",
                "description": "Physical fab verification dataset with calibrated pad metrics",
                "count": len(r_files),
                "ground_truth_hint": "MIXED",
                "path": real_dir
            })
            
    return datasets_list


@app.post("/api/model/benchmark/start")
async def start_benchmark(payload: dict):
    """Initializes a new benchmark session and queues images to Priority 1."""
    global priority_dispatcher_state, P1_QUEUE, db_type
    
    model_name = payload.get("model_name", "unet.tflite")
    dataset_key = payload.get("dataset_key", "all_wafers")
    custom_folder = payload.get("custom_folder")
    rules = payload.get("rules", {
        "fail_distance_um": 8.0,
        "max_area_ratio_pct": 25.0,
        "min_area_ratio_pct": 0.5,
        "missing_mark_action": "fail"
    })
    limit = payload.get("limit", 50)
    
    # 1. Resolve image list
    image_paths = []
    dataset_name = "Custom Selection"
    
    if custom_folder and os.path.exists(custom_folder):
        dataset_name = f"Folder: {os.path.basename(custom_folder)}"
        for f in os.listdir(custom_folder):
            if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                image_paths.append(os.path.join(custom_folder, f))
    elif dataset_key == "bad_wafers":
        dataset_name = "Defective Wafer Dataset (Bad)"
        bad_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Bad")
        if os.path.exists(bad_dir):
            for f in os.listdir(bad_dir):
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                    image_paths.append(os.path.join(bad_dir, f))
    elif dataset_key == "good_wafers":
        dataset_name = "Good Wafer Dataset (Pass)"
        good_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Good")
        if os.path.exists(good_dir):
            for f in os.listdir(good_dir):
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                    image_paths.append(os.path.join(good_dir, f))
    elif dataset_key == "all_wafers":
        dataset_name = "Full Accuracy Dataset (Good + Bad)"
        bad_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Bad")
        good_dir = os.path.join(PROJECT_ROOT, "datasets", "Pun_for_Accuracy", "Good")
        b_list = [os.path.join(bad_dir, f) for f in os.listdir(bad_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))] if os.path.exists(bad_dir) else []
        g_list = [os.path.join(good_dir, f) for f in os.listdir(good_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))] if os.path.exists(good_dir) else []
        max_len = max(len(b_list), len(g_list))
        for i in range(max_len):
            if i < len(b_list): image_paths.append(b_list[i])
            if i < len(g_list): image_paths.append(g_list[i])
    else:
        for root_dir in [os.path.join(PROJECT_ROOT, "datasets"), IMAGE_DIR]:
            for r, _, fs in os.walk(root_dir):
                for f in fs:
                    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                        image_paths.append(os.path.join(r, f))
                        
    if not image_paths:
        raise HTTPException(status_code=400, detail="No valid test images found in selected dataset.")

    if limit and isinstance(limit, int) and limit > 0:
        image_paths = image_paths[:limit]

    session_id = payload.get("session_id") or f"BM-{time.strftime('%Y%m%d-%H%M%S')}"
    created_at = time.strftime("%d-%b-%Y %H:%M:%S")
    rules_json = json.dumps(rules)
    initial_metrics = json.dumps({
        "total_tested": 0, "total_reviewed": 0, "overkill_rate": 0.0,
        "underkill_rate": 0.0, "agreement_rate": 0.0, "true_yield": 0.0, "ai_yield": 0.0,
        "avg_inference_time_ms": 0.0, "confusion_matrix": {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    })

    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO benchmark_sessions (
                id, name, model_name, status, dataset_name, total_images,
                processed_images, rule_config, created_at, completed_at, metrics
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
        """, (
            session_id, f"Validation Run ({model_name})", model_name,
            "RUNNING", dataset_name, len(image_paths), 0, rules_json,
            created_at, "-", initial_metrics
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("Failed to insert session into PG:", e)

    # Reset P1 Queue
    while not P1_QUEUE.empty():
        try: P1_QUEUE.get_nowait()
        except queue.Empty: break

    priority_dispatcher_state["active_session_id"] = session_id
    priority_dispatcher_state["p1_total"] = len(image_paths)
    priority_dispatcher_state["p1_processed"] = 0
    priority_dispatcher_state["status"] = "RUNNING"
    priority_dispatcher_state["p1_current"] = ""

    # Enqueue tasks into Priority 1
    for img_p in image_paths:
        P1_QUEUE.put({
            "session_id": session_id,
            "image_path": img_p,
            "filename": os.path.basename(img_p),
            "model_name": model_name,
            "rules": rules
        })

    priority_dispatcher_state["p1_pending"] = P1_QUEUE.qsize()

    print(f"🚀 [BENCHMARK STARTED] Session '{session_id}' | {len(image_paths)} images enqueued to P1 Queue (Auto-yields to P0).")

    return {
        "status": "success",
        "session_id": session_id,
        "model_name": model_name,
        "dataset_name": dataset_name,
        "total_images": len(image_paths),
        "rules": rules,
        "message": f"Benchmark session '{session_id}' initialized with {len(image_paths)} images on P1 priority."
    }


@app.post("/api/model/benchmark/upload-images")
async def upload_benchmark_images(
    files: List[UploadFile] = File(...),
    model_name: str = Form("unet.tflite"),
    fail_distance_um: float = Form(8.0),
    max_area_ratio_pct: float = Form(25.0),
    min_area_ratio_pct: float = Form(0.5),
    missing_mark_action: str = Form("fail")
):
    """Uploads batch wafer images or a ZIP archive, extracts images, and immediately starts a validation benchmark run."""
    global priority_dispatcher_state, P1_QUEUE
    
    session_id = f"BM-{time.strftime('%Y%m%d-%H%M%S')}"
    upload_dir = os.path.join(_THIS_DIR, "simulation", "benchmark_uploads", session_id)
    os.makedirs(upload_dir, exist_ok=True)
    
    saved_paths = []
    for f in files:
        fname = f.filename.lower()
        if fname.endswith('.zip'):
            zip_temp = os.path.join(upload_dir, "uploaded_archive.zip")
            with open(zip_temp, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            try:
                with zipfile.ZipFile(zip_temp, 'r') as z:
                    for member in z.infolist():
                        basename = os.path.basename(member.filename)
                        if not basename or basename.startswith('.'):
                            continue
                        if basename.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp')):
                            extracted_path = os.path.join(upload_dir, basename)
                            with z.open(member) as src, open(extracted_path, "wb") as dst:
                                shutil.copyfileobj(src, dst)
                            saved_paths.append(extracted_path)
            except Exception as e:
                print(f"Error extracting ZIP archive {f.filename}: {e}")
            finally:
                if os.path.exists(zip_temp):
                    try:
                        os.remove(zip_temp)
                    except:
                        pass
        elif fname.endswith(('.png', '.jpg', '.jpeg', '.bmp')):
            target = os.path.join(upload_dir, f.filename)
            with open(target, "wb") as buffer:
                shutil.copyfileobj(f.file, buffer)
            saved_paths.append(target)
            
    if not saved_paths:
        raise HTTPException(status_code=400, detail="No valid wafer images found in uploaded file(s) or ZIP archive.")

    rules = {
        "fail_distance_um": fail_distance_um,
        "max_area_ratio_pct": max_area_ratio_pct,
        "min_area_ratio_pct": min_area_ratio_pct,
        "missing_mark_action": missing_mark_action
    }

    return await start_benchmark({
        "session_id": session_id,
        "model_name": model_name,
        "dataset_key": "custom",
        "custom_folder": upload_dir,
        "rules": rules,
        "limit": len(saved_paths)
    })


@app.get("/api/model/benchmark/progress")
async def get_benchmark_progress():
    """Returns real-time queue dispatcher stats, preemption status, and live KPIs."""
    sess_id = priority_dispatcher_state.get("active_session_id")
    kpis = compute_session_kpis(sess_id) if sess_id else {}
    
    return {
        "status": priority_dispatcher_state.get("status", "IDLE"),
        "active_priority": priority_dispatcher_state.get("active_priority", "IDLE"),
        "p0_pending": P0_QUEUE.qsize(),
        "p1_pending": P1_QUEUE.qsize(),
        "p1_total": priority_dispatcher_state.get("p1_total", 0),
        "p1_processed": priority_dispatcher_state.get("p1_processed", 0),
        "p1_current_image": priority_dispatcher_state.get("p1_current", ""),
        "active_session_id": sess_id,
        "kpis": kpis
    }


@app.get("/api/model/benchmark/results")
async def get_benchmark_results(
    session_id: Optional[str] = None,
    filter: Optional[str] = "ALL"
):
    """Fetches benchmarked image rows for a session with filtering support."""
    global db_type
    target_session = session_id or priority_dispatcher_state.get("active_session_id")
    if not target_session:
        try:
            conn = get_pg_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM benchmark_sessions ORDER BY created_at DESC LIMIT 1;")
            r = cursor.fetchone()
            if r: target_session = r[0]
            cursor.close()
            conn.close()
        except Exception: pass

    if not target_session:
        return {"session_id": None, "results": [], "kpis": compute_session_kpis("")}

    results = []
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, session_id, image_name, image_url, annotated_image_url, raw_image_url,
                   ai_decision, ai_confidence, ai_reason, inference_time_ms, rule_time_ms,
                   min_edge_distance_um, mark_area_ratio_pct, pads_count, marks_count, grains_count,
                   human_decision, human_reviewer, reviewed_at, notes
            FROM benchmark_results
            WHERE session_id = %s
            ORDER BY id ASC;
        """, (target_session,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        for row in rows:
            results.append({
                "id": row[0], "session_id": row[1], "image_name": row[2],
                "image_url": row[3], "annotated_image_url": row[4], "raw_image_url": row[5],
                "ai_decision": row[6], "ai_confidence": row[7], "ai_reason": row[8],
                "inference_time_ms": row[9], "rule_time_ms": row[10],
                "min_edge_distance_um": row[11], "mark_area_ratio_pct": row[12],
                "pads_count": row[13], "marks_count": row[14], "grains_count": row[15],
                "human_decision": row[16], "human_reviewer": row[17],
                "reviewed_at": row[18], "notes": row[19]
            })
    except Exception as e:
        print("Error fetching PG benchmark results:", e)

    # Filter results
    if filter == "DISAGREEMENT":
        results = [r for r in results if r["human_decision"] in ("PASS", "FAIL") and r["human_decision"] != r["ai_decision"]]
    elif filter == "HUMAN_PASS":
        results = [r for r in results if r["human_decision"] == "PASS"]
    elif filter == "HUMAN_FAIL":
        results = [r for r in results if r["human_decision"] == "FAIL"]
    elif filter == "UNREVIEWED":
        results = [r for r in results if r["human_decision"] == "UNREVIEWED"]

    kpis = compute_session_kpis(target_session)

    return {
        "session_id": target_session,
        "results": results,
        "kpis": kpis
    }


@app.post("/api/model/benchmark/save-review")
async def save_human_review(payload: dict):
    """Saves Human Review grading (PASS / FAIL) and updates real-time quality KPIs."""
    global db_type, main_loop
    
    session_id = payload.get("session_id")
    result_id = payload.get("result_id")
    human_decision = payload.get("human_decision", "PASS").upper()
    reviewer = payload.get("reviewer", "QA Engineer")
    notes = payload.get("notes", "")
    reviewed_at = time.strftime("%d-%b-%Y %H:%M:%S")

    if not result_id or human_decision not in ("PASS", "FAIL", "UNREVIEWED"):
        raise HTTPException(status_code=400, detail="Invalid review payload.")

    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE benchmark_results
            SET human_decision = %s, human_reviewer = %s, reviewed_at = %s, notes = %s
            WHERE id = %s RETURNING session_id;
        """, (human_decision, reviewer, reviewed_at, notes, result_id))
        row = cursor.fetchone()
        if row and not session_id:
            session_id = row[0]
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("Error updating PG review:", e)

    kpis = compute_session_kpis(session_id) if session_id else {}
    if session_id:
        update_benchmark_session_progress(session_id, priority_dispatcher_state["p1_processed"], kpis)

    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BENCHMARK_REVIEW_UPDATED",
            "data": {
                "session_id": session_id,
                "result_id": result_id,
                "human_decision": human_decision,
                "kpis": kpis
            }
        })), main_loop)

    return {
        "status": "success",
        "result_id": result_id,
        "human_decision": human_decision,
        "kpis": kpis
    }


@app.post("/api/model/benchmark/batch-review")
async def batch_human_review(payload: dict):
    """Performs bulk action on human review decisions."""
    global db_type
    
    session_id = payload.get("session_id")
    action = payload.get("action", "CONFIRM_ALL_AI")
    reviewer = payload.get("reviewer", "QA Engineer")
    reviewed_at = time.strftime("%d-%b-%Y %H:%M:%S")

    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID is required.")

    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        if action == "CONFIRM_ALL_AI":
            cursor.execute("""
                UPDATE benchmark_results
                SET human_decision = ai_decision, human_reviewer = %s, reviewed_at = %s
                WHERE session_id = %s;
            """, (reviewer, reviewed_at, session_id))
        elif action == "RESET_ALL":
            cursor.execute("""
                UPDATE benchmark_results
                SET human_decision = 'UNREVIEWED', human_reviewer = '-', reviewed_at = '-'
                WHERE session_id = %s;
            """, (session_id,))
        elif action == "MARK_UNREVIEWED_PASS":
            cursor.execute("""
                UPDATE benchmark_results
                SET human_decision = 'PASS', human_reviewer = %s, reviewed_at = %s
                WHERE session_id = %s AND human_decision = 'UNREVIEWED';
            """, (reviewer, reviewed_at, session_id))
        elif action == "MARK_UNREVIEWED_FAIL":
            cursor.execute("""
                UPDATE benchmark_results
                SET human_decision = 'FAIL', human_reviewer = %s, reviewed_at = %s
                WHERE session_id = %s AND human_decision = 'UNREVIEWED';
            """, (reviewer, reviewed_at, session_id))
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        print("Error in PG batch review:", e)

    kpis = compute_session_kpis(session_id)
    update_benchmark_session_progress(session_id, priority_dispatcher_state["p1_processed"], kpis)

    return {
        "status": "success",
        "action": action,
        "session_id": session_id,
        "kpis": kpis
    }


@app.get("/api/model/benchmark/report/{session_id}")
async def get_benchmark_report(session_id: str):
    """Generates analytical report with confusion matrix, Overkill %, Underkill %, and full metrics."""
    global db_type
    
    session_data = None
    try:
        conn = get_pg_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, name, model_name, status, dataset_name, total_images,
                   processed_images, rule_config, created_at, completed_at
            FROM benchmark_sessions WHERE id = %s;
        """, (session_id,))
        row = cursor.fetchone()
        if row:
            session_data = {
                "id": row[0], "name": row[1], "model_name": row[2],
                "status": row[3], "dataset_name": row[4], "total_images": row[5],
                "processed_images": row[6], "rules": json.loads(row[7]) if row[7] else {},
                "created_at": row[8], "completed_at": row[9]
            }
        cursor.close()
        conn.close()
    except Exception as e:
        print("[DB] Failed to fetch benchmark report from PostgreSQL:", e)

    if not session_data:
        raise HTTPException(status_code=404, detail="Benchmark session not found.")

    kpis = compute_session_kpis(session_id)

    total_rev = kpis.get("total_reviewed", 0)
    uk_rate = kpis.get("underkill_rate", 0.0)
    ok_rate = kpis.get("overkill_rate", 0.0)
    agr_rate = kpis.get("agreement_rate", 0.0)

    if total_rev == 0:
        verdict = "PENDING HUMAN REVIEW"
    elif uk_rate == 0.0 and ok_rate <= 3.0 and agr_rate >= 95.0:
        verdict = "PRODUCTION READY"
    elif uk_rate > 0.0:
        verdict = "DEFECT ESCAPE RISK (CRITICAL)"
    elif ok_rate > 3.0 or agr_rate < 95.0:
        verdict = "TUNING REQUIRED"
    else:
        verdict = "REVIEW IN PROGRESS"

    return {
        "session": session_data,
        "kpis": kpis,
        "summary": {
            "title": f"Wafer Defect AI Inspection Benchmark Report - {session_data['model_name']}",
            "generated_at": time.strftime("%d-%b-%Y %H:%M:%S"),
            "verdict": verdict
        }
    }


@app.post("/api/model/benchmark/pause")
async def pause_benchmark():
    """Pauses the active benchmark without losing queued items."""
    global priority_dispatcher_state, P1_QUEUE
    
    if priority_dispatcher_state.get("status") != "RUNNING":
        return {"status": "ignored", "message": "Benchmark is not currently running."}
        
    priority_dispatcher_state["status"] = "PAUSED"
    sess_id = priority_dispatcher_state.get("active_session_id")
    
    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BENCHMARK_PROGRESS",
            "data": {
                "status": "PAUSED",
                "session_id": sess_id,
                "p1_processed": priority_dispatcher_state.get("p1_processed", 0),
                "p1_total": priority_dispatcher_state.get("p1_total", 0),
                "p0_pending": priority_dispatcher_state.get("p0_pending", 0),
                "p1_pending": P1_QUEUE.qsize(),
                "active_priority": "IDLE"
            }
        })), main_loop)

    print("⏸️ [BENCHMARK PAUSED] Validation execution temporarily suspended.")
    return {"status": "success", "message": "Benchmark paused."}


@app.post("/api/model/benchmark/resume")
async def resume_benchmark():
    """Resumes a paused benchmark session."""
    global priority_dispatcher_state, P1_QUEUE
    
    if priority_dispatcher_state.get("status") != "PAUSED":
        return {"status": "ignored", "message": "Benchmark is not currently paused."}
        
    priority_dispatcher_state["status"] = "RUNNING"
    sess_id = priority_dispatcher_state.get("active_session_id")
    
    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BENCHMARK_PROGRESS",
            "data": {
                "status": "RUNNING",
                "session_id": sess_id,
                "p1_processed": priority_dispatcher_state.get("p1_processed", 0),
                "p1_total": priority_dispatcher_state.get("p1_total", 0),
                "p0_pending": priority_dispatcher_state.get("p0_pending", 0),
                "p1_pending": P1_QUEUE.qsize(),
                "active_priority": "P1_BENCHMARK"
            }
        })), main_loop)

    print("▶️ [BENCHMARK RESUMED] Continuing validation queue execution.")
    return {"status": "success", "message": "Benchmark resumed."}


@app.post("/api/model/benchmark/stop")
async def stop_benchmark():
    """Stops the active benchmark validation job."""
    global priority_dispatcher_state, P1_QUEUE
    
    drained = 0
    while not P1_QUEUE.empty():
        try:
            P1_QUEUE.get_nowait()
            P1_QUEUE.task_done()
            drained += 1
        except queue.Empty:
            break
            
    priority_dispatcher_state["status"] = "STOPPED"
    priority_dispatcher_state["active_priority"] = "IDLE"
    priority_dispatcher_state["p1_pending"] = 0
    priority_dispatcher_state["p1_current"] = ""

    sess_id = priority_dispatcher_state.get("active_session_id")
    if sess_id:
        finalize_benchmark_session(sess_id)

    if main_loop and main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(json.dumps({
            "event": "BENCHMARK_PROGRESS",
            "data": {
                "status": "STOPPED",
                "session_id": sess_id,
                "p1_processed": priority_dispatcher_state.get("p1_processed", 0),
                "p1_total": priority_dispatcher_state.get("p1_total", 0),
                "p0_pending": 0,
                "p1_pending": 0,
                "active_priority": "IDLE"
            }
        })), main_loop)

    print(f"🛑 [BENCHMARK STOPPED] Drained {drained} remaining validation items from P1 Queue.")
    return {"status": "success", "message": f"Benchmark stopped. {drained} items cleared."}


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


