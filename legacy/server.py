import os
import sys
import time
import json
import sqlite3
import random
import threading
import http.server
import socketserver
import shutil

# Database connection settings
DB_NAME_SQLITE = "simulation/inspections.db"
POSTGRES_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "password",
    "database": "wafer_inspection"
}

# Directory Paths
INPUT_DIR = "simulation/input"
OUTPUT_DIR = "simulation/output"
JUDGEMENT_DIR = "simulation/judgement"

# Global Live States
latest_inspection = None
history_logs = []
active_alarms = []
inspection_count = 0
db_type = "SQLite"

# Initialize Folders
os.makedirs(INPUT_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(JUDGEMENT_DIR, exist_ok=True)

# ==========================================
# DATABASE CONNECTOR (Postgres / SQLite Fallback)
# ==========================================
def init_database():
    global db_type
    conn = None
    
    # Try connecting to PostgreSQL
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
                    machine_action TEXT
                );
            """)
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
                    probe_marks, grains, confidence, inference_time, rule_time, machine_action
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                record["id"], record["timestamp"], record["decision"], record["padsTotal"],
                record["padsDetected"], record["probeMarks"], record["grains"], record["confidence"],
                record["inferenceTime"], record["ruleTime"], record["machineAction"]
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
                probe_marks, grains, confidence, inference_time, rule_time, machine_action
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            record["id"], record["timestamp"], record["decision"], record["padsTotal"],
            record["padsDetected"], record["probeMarks"], record["grains"], record["confidence"],
            record["inferenceTime"], record["ruleTime"], record["machineAction"]
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
            cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action FROM inspections ORDER BY id ASC")
            rows = cursor.fetchall()
            for r in rows:
                time_parts = r[1].split(" ")
                t_short = time_parts[1] if len(time_parts) > 1 else r[1]
                records.append({
                    "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                    "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                    "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10]
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
        cursor.execute("SELECT wafer_id, timestamp, decision, pads_total, pads_detected, probe_marks, grains, confidence, inference_time, rule_time, machine_action FROM inspections ORDER BY id ASC")
        rows = cursor.fetchall()
        for r in rows:
            time_parts = r[1].split(" ")
            t_short = time_parts[1] if len(time_parts) > 1 else r[1]
            records.append({
                "id": r[0], "timestamp": r[1], "timeShort": t_short, "decision": r[2],
                "padsTotal": r[3], "padsDetected": r[4], "probeMarks": r[5], "grains": r[6],
                "confidence": r[7], "inferenceTime": r[8], "ruleTime": r[9], "machineAction": r[10]
            })
        conn.close()
    except Exception as e:
        print("Failed to read SQLite:", e)
        
    return records


# ==========================================
# EDGE AI SIMULATOR & RULE ENGINE
# ==========================================
def process_new_file(filepath, filename):
    global latest_inspection, inspection_count, active_alarms
    
    # Wait for file lock to release
    time.sleep(0.2)
    
    inspection_count += 1
    anomaly_type = random.choice([0, 0, 0, 1, 2, 3, 4, 5]) # 0=Pass, 1=Miss, 2=Double, 3=Scratch, 4=Dust, 5=Align
    
    confidence = round(97.8 + random.random() * 2.0, 1)
    inf_time = round(15.8 + random.random() * 3.5, 1)
    rule_time = round(0.2 + random.random() * 0.1, 1)
    
    marks_list = []
    grains = []
    alarms = []
    
    if anomaly_type == 1:
        # Missed hit
        alarms.append({"name": "Probe Mark Missing (Missed Hit)", "time": time.strftime("%X")})
    elif anomaly_type == 2:
        # Double hit
        marks_list = [
            {"dx": -25, "dy": -20, "rx": 24, "ry": 16, "rot": 0.2},
            {"dx": 30, "dy": 25, "rx": 20, "ry": 14, "rot": -0.3}
        ]
        alarms.append({"name": "Double Hit Detected", "time": time.strftime("%X")})
    elif anomaly_type == 3:
        # Passivation Scratch
        marks_list = [
            {"dx": -10, "dy": 10, "rx": 24, "ry": 16, "rot": 0.1},
            {"dx": 15, "dy": 15, "isScratch": True}
        ]
        alarms.append({"name": "Critical Passivation Scratch", "time": time.strftime("%X")})
    elif anomaly_type == 5:
        # Misaligned Edge Hit
        marks_list = [
            {"dx": 165, "dy": -140, "rx": 26, "ry": 18, "rot": 0.4}
        ]
        alarms.append({"name": "Probe Mark Misaligned (Border Hit)", "time": time.strftime("%X")})
    else:
        # Normal
        dx = random.randint(-15, 15)
        dy = random.randint(-15, 15)
        marks_list = [{"dx": dx, "dy": dy, "rx": 24, "ry": 16, "rot": 0.1}]
        
    # Generate dust grains
    grain_count = 0
    if anomaly_type == 4:
        grain_count = random.randint(3, 6)
        alarms.append({"name": "Dust Contamination Alert", "time": time.strftime("%X")})
    elif random.random() < 0.2:
        grain_count = random.randint(1, 2)
        
    for _ in range(grain_count):
        grains.append({
            "x": random.randint(180, 420),
            "y": random.randint(180, 420),
            "radius": random.randint(4, 9)
        })
        
    # Decide
    decision = "PASS"
    prober_action = "CONTINUE PROCESS"
    
    if anomaly_type in [1, 3, 4] or len(grains) >= 3:
        decision = "FAIL"
        prober_action = "STOP MACHINE"
    elif anomaly_type in [2, 5] or len(grains) > 0:
        decision = "WARNING"
        prober_action = "WARN OPERATOR"
        
    # Create logs metadata
    wafer_id = f"#WF-{2940 + inspection_count}"
    now = time.strftime("%d-%b-%Y %H:%M:%S")
    
    record = {
        "id": wafer_id,
        "timestamp": now,
        "timeShort": time.strftime("%X"),
        "decision": decision,
        "padsTotal": 1,
        "padsDetected": 1,
        "probeMarks": len(marks_list),
        "grains": len(grains),
        "confidence": confidence,
        "inferenceTime": inf_time,
        "ruleTime": rule_time,
        "machineAction": prober_action,
        "marks": marks_list,
        "grainList": grains,
        "alarms": alarms
    }
    
    # Save files to machine shared folders
    # 1. Save results to output
    out_path = os.path.join(OUTPUT_DIR, filename)
    shutil.copy(filepath, out_path)
    
    # 2. Write Judgement File (JSON) for prober machine interface
    judgement_filename = filename.replace(".", "_") + "_result.json"
    judgement_path = os.path.join(JUDGEMENT_DIR, judgement_filename)
    
    result_data = {
        "filename": filename,
        "decision": decision,
        "action": prober_action,
        "details": [a["name"] for a in alarms]
    }
    
    with open(judgement_path, "w") as f:
        json.dump(result_data, f, indent=4)
        
    # Save to Database
    save_inspection_to_db(record)
    
    # Clean up input folder
    os.remove(filepath)
    
    latest_inspection = record
    active_alarms = alarms
    print(f"[{time.strftime('%X')}] Processed: {filename} -> Decision: {decision} | Save DB: {db_type}")


# ==========================================
# BACK-GROUND MONITOR & AUTO-GENERATOR THREADS
# ==========================================
def folder_watcher_thread():
    print(f"Watcher thread initialized. Monitoring folder: {INPUT_DIR}...")
    while True:
        try:
            files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
            for file in files:
                filepath = os.path.join(INPUT_DIR, file)
                process_new_file(filepath, file)
        except Exception as e:
            print("Error in watcher thread:", e)
        time.sleep(1)


def mock_image_generator_thread():
    """Drops a dummy image to input folder every 15 seconds if empty, keeping the dashboard active"""
    print("Auto mock image generator thread initialized...")
    gen_count = 0
    while True:
        time.sleep(12)
        try:
            files_in_input = os.listdir(INPUT_DIR)
            if not files_in_input:
                gen_count += 1
                mock_filename = f"capture_img_{gen_count}.png"
                mock_filepath = os.path.join(INPUT_DIR, mock_filename)
                
                # Write an empty text file representing an image
                with open(mock_filepath, "w") as f:
                    f.write("MOCK_IMAGE_DATA")
        except Exception as e:
            print("Error in mock generator:", e)


# ==========================================
# WEB SERVER CONTROLLER (Static files & API Router)
# ==========================================
class HMIRequestHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence console log spamming
        return
        
    def do_GET(self):
        global latest_inspection, db_type
        
        # 1. API: Latest Inspection
        if self.path == "/api/latest-inspection":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            data = latest_inspection if latest_inspection else {}
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return
            
        # 2. API: History Logs
        elif self.path == "/api/history":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            records = load_history_from_db()
            self.wfile.write(json.dumps(records).encode("utf-8"))
            return
            
        # 3. API: Hardware Telemetry Stats
        elif self.path == "/api/sys-stats":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            # Simulate CPU/NPU fluctuations
            sys_stats = {
                "cpu": random.randint(45, 62),
                "npu": random.randint(82, 91),
                "ram": random.randint(512, 530),
                "temp": round(54.5 + random.random() * 4.0, 1),
                "db": db_type
            }
            self.wfile.write(json.dumps(sys_stats).encode("utf-8"))
            return
            
        # 4. STATIC FILE ROUTING
        else:
            # Default to index.html
            clean_path = self.path.split("?")[0]
            if clean_path == "/":
                clean_path = "/index.html"
                
            filepath = "." + clean_path
            
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.send_response(200)
                # Set mime types
                if filepath.endswith(".html"):
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                elif filepath.endswith(".css"):
                    self.send_header("Content-Type", "text/css")
                elif filepath.endswith(".js"):
                    self.send_header("Content-Type", "application/javascript")
                elif filepath.endswith(".png"):
                    self.send_header("Content-Type", "image/png")
                self.end_headers()
                
                with open(filepath, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"File Not Found")


# ==========================================
# MAIN EXECUTION ENTRYPOINT
# ==========================================
if __name__ == "__main__":
    print("==============================================")
    print("      WAFER PROBER EDGE HMI DASHBOARD SERVER  ")
    print("==============================================")
    
    # Initialize Databases
    init_database()
    
    # Pre-populate some history items in SQLite if completely empty
    existing = load_history_from_db()
    if not existing:
        print("Pre-populating historical mock logs in SQLite database...")
        for i in range(12):
            wafer_id = f"#WF-{2928 + i}"
            decision = random.choice(["PASS", "PASS", "PASS", "PASS", "WARNING", "FAIL"])
            inf_t = round(15.2 + random.random() * 4, 1)
            rec = {
                "id": wafer_id,
                "timestamp": f"19-Jul-2026 10:20:{10+i}",
                "decision": decision,
                "padsTotal": 1,
                "padsDetected": 1,
                "probeMarks": 0 if decision=="FAIL" and random.random()<0.5 else 1,
                "grains": random.choice([0, 0, 1]) if decision != "FAIL" else random.randint(3, 5),
                "confidence": round(96.5 + random.random() * 3, 1),
                "inferenceTime": inf_t,
                "ruleTime": 0.3,
                "machineAction": "CONTINUE PROCESS" if decision=="PASS" else ("WARN OPERATOR" if decision=="WARNING" else "STOP MACHINE")
            }
            save_inspection_to_db(rec)
            
    # Launch Watcher Daemon Threads
    t_watcher = threading.Thread(target=folder_watcher_thread, daemon=True)
    t_watcher.start()
    
    t_generator = threading.Thread(target=mock_image_generator_thread, daemon=True)
    t_generator.start()
    
    # Start server
    PORT = 8000
    Handler = HMIRequestHandler
    
    # Enable address reuse so restarting is fast
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"HMI local server started at: http://localhost:{PORT}")
        print("Ready for browser connection. Press Ctrl+C to terminate.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            sys.exit(0)
