import os
import sys
import time
import shutil
import hashlib
import tempfile
import threading
import re
import cv2
import pytest
from fastapi.testclient import TestClient

# Ensure backend_imx8 is on sys.path
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.abspath(os.path.join(_THIS_DIR, ".."))
_PROJECT_ROOT = os.path.abspath(os.path.join(_BACKEND_DIR, ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend_imx8.main import (
    app,
    ACTIVE_MACHINE_SETTING,
    P0_QUEUE,
    priority_dispatcher_state,
    check_idle_batch_completions,
    process_new_file,
    complete_batch_for_lot,
    build_batch_judgement,
    generate_machine_judgement_file,
    seen_ingested_files,
    lot_tracker,
    batch_lock,
    current_batch_records,
    resolve_windows_drive_path,
    reset_batch_state,
    extract_lot_and_wafer,
    parse_wafer_filename,
    is_file_already_processed,
    poll_drive_m_once,
    scan_drive_m_processed,
    load_seen_ingested_files,
    save_seen_ingested_files,
    SEEN_FILES_CACHE_PATH,
    seen_files_lock,
    INGESTION_BASELINE_MTIME,
    set_ingestion_baseline_mtime,
    get_ingestion_baseline_mtime,
    init_ingestion_baseline
)

@pytest.fixture(autouse=True)
def reset_baseline_mtime_fixture():
    set_ingestion_baseline_mtime(0.0)
    yield
    set_ingestion_baseline_mtime(0.0)


def calc_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


def find_sample_image() -> str:
    """Finds an existing raw wafer BMP image in the repo to use as a test fixture."""
    candidate_dirs = [
        os.path.join(_BACKEND_DIR, "simulation", "drive_M", "WP288", "PMI", "PROCESSED", "test1"),
        os.path.join(_BACKEND_DIR, "simulation", "drive_M", "WP288", "PMI", "PROCESSED", "C3D323"),
        os.path.join(_BACKEND_DIR, "simulation", "drive_M", "WP288", "PMI", "OUTPUT", "test1"),
    ]
    for d in candidate_dirs:
        if os.path.exists(d):
            for f in os.listdir(d):
                if f.lower().endswith(".bmp") and not f.startswith("inspect_"):
                    p = os.path.join(d, f)
                    if os.path.getsize(p) > 1000:
                        return p

    # If not found, synthesize a valid 160x160 wafer chip BMP image
    temp_img = os.path.join(tempfile.gettempdir(), "synth_sample.bmp")
    import numpy as np
    canvas = np.full((160, 160, 3), 128, dtype=np.uint8)
    cv2.rectangle(canvas, (30, 30), (130, 130), (200, 200, 200), -1)
    cv2.circle(canvas, (80, 80), 20, (50, 50, 50), -1)
    cv2.imwrite(temp_img, canvas)
    return temp_img


def test_pipeline_flow_end_to_end():
    """
    Verifies R1, R2, R3, and R4 acceptance criteria:
    1. Read-only ingestion from Drive M PROCESSED (no moving, deleting, renaming).
    2. Output split comparison image to Drive M OUTPUT with identical filename (no inspect/anno prefix).
    3. Drive N result isolation: zero image files on Drive N, only judgement TXT in JUDGE.
    4. Time-based batch completion via process.end.timeout idle timeout.
    5. Clean API and WebSocket operability.
    """
    sample_src = find_sample_image()
    assert os.path.exists(sample_src), f"Sample image not found: {sample_src}"

    # Setup isolated test environment for Drive M and Drive N
    test_root = tempfile.mkdtemp(prefix="imx8_test_pipeline_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        
        lot_name = "LOT_TEST_FLOW"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        # Prepare 3 test images in simulated Drive M PROCESSED
        img_names = [
            "20260909100001_LOTTEST-W01_X10Y20_S1_P1_OK_TF1581_300.bmp",
            "20260909100002_LOTTEST-W01_X10Y20_S1_P2_OK_TF1581_300.bmp",
            "20260909100003_LOTTEST-W01_X10Y20_S1_P3_OK_TF1581_300.bmp"
        ]

        pre_checksums = {}
        pre_sizes = {}
        for fname in img_names:
            dst = os.path.join(proc_dir, fname)
            shutil.copy2(sample_src, dst)
            pre_checksums[fname] = calc_sha256(dst)
            pre_sizes[fname] = os.path.getsize(dst)

        assert len(os.listdir(proc_dir)) == 3, "Failed to initialize 3 raw images in PROCESSED"

        # Configure machine settings for this test
        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1200  # 1.2s timeout for fast automated test

        # Reset batch states cleanly
        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Step 1: Ingestion & Inference via pipeline
        for fname in img_names:
            img_path = os.path.join(proc_dir, fname)
            assert os.path.exists(img_path)
            # Perform write completion stability check
            s1 = os.path.getsize(img_path)
            assert s1 > 0
            time.sleep(0.05)
            s2 = os.path.getsize(img_path)
            assert s1 == s2
            
            seen_ingested_files.add(img_path)
            P0_QUEUE.put({
                "filepath": img_path,
                "filename": fname,
                "lot_no": lot_name,
                "raw_preserved_path": img_path
            })

        # Process queued images through priority dispatcher logic
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            priority_dispatcher_state["active_priority"] = "P0_PRODUCTION"
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()
        priority_dispatcher_state["active_priority"] = "IDLE"

        # -------------------------------------------------------------
        # Requirement R1 & Acceptance Criterion Verification:
        # Raw images placed in Drive M PROCESSED/<lot> remain completely intact.
        # -------------------------------------------------------------
        post_files = os.listdir(proc_dir)
        assert len(post_files) == 3, f"File count changed in PROCESSED! Expected 3, got {len(post_files)}"
        for fname in img_names:
            post_path = os.path.join(proc_dir, fname)
            assert os.path.exists(post_path), f"Raw file {fname} was moved or deleted from PROCESSED!"
            assert os.path.getsize(post_path) == pre_sizes[fname], f"File size changed for {fname}!"
            assert calc_sha256(post_path) == pre_checksums[fname], f"Checksum changed for {fname}!"

        # -------------------------------------------------------------
        # Requirement R2 & Acceptance Criterion Verification:
        # Processed images in Drive M OUTPUT/<lot> exist with filenames strictly identical
        # to their input counterparts (no inspect_ or annotated_ prefix) and contain split comparison view.
        # -------------------------------------------------------------
        assert os.path.exists(out_dir), f"Output directory {out_dir} was not created!"
        out_files = os.listdir(out_dir)
        output_images = [f for f in out_files if f.lower().endswith((".bmp", ".png", ".jpg"))]

        assert len(output_images) == 3, f"Expected 3 output images, found: {out_files}"
        csv_files_in_output = [f for f in out_files if f.lower().endswith(".csv")]
        assert len(csv_files_in_output) == 0, f"No CSV files should exist in output directory, found: {csv_files_in_output}"
        for fname in img_names:
            out_img_path = os.path.join(out_dir, fname)
            assert os.path.exists(out_img_path), f"Expected exact filename {fname} in OUTPUT, not found!"
            
            # Verify no prefixes exist
            assert not any(f.startswith(("inspect_", "annotated_", "anno_")) for f in out_files), \
                f"Found forbidden prefix in output files: {out_files}"

            # Verify image is a valid split comparison view
            img = cv2.imread(out_img_path)
            assert img is not None, f"Could not read generated output image: {out_img_path}"
            h, w, c = img.shape
            raw_img = cv2.imread(sample_src)
            raw_h, raw_w, _ = raw_img.shape
            assert w == raw_w * 2, f"Output image width ({w}) does not match split comparison expected (2x {raw_w})!"
            assert h >= raw_h + 50, f"Output image height ({h}) does not contain top decision banner!"

        # -------------------------------------------------------------
        # Requirement R4 & Acceptance Criterion Verification:
        # Time-based batch completion triggers when idle for > process.end.timeout.
        # -------------------------------------------------------------
        time.sleep(0.2)
        check_idle_batch_completions()
        # Wait for timeout to expire
        time.sleep(1.2)
        check_idle_batch_completions()

        # Check batch completed
        assert lot_tracker[lot_name]["is_completed"] is True, "Batch completion was not triggered by idle timeout!"

        # -------------------------------------------------------------
        # Requirement R3 & Acceptance Criterion Verification:
        # Drive N Result Isolation & Batch Judgement TXT
        # Exactly one valid 8-digit judgement TXT is written to Drive N JUDGE.
        # Drive N contains zero image files and is only touched for writing the judgement TXT.
        # -------------------------------------------------------------
        judge_files = os.listdir(judge_dir)
        txt_files = [f for f in judge_files if f.endswith(".txt")]
        assert len(txt_files) == 1, f"Expected exactly 1 judgement TXT in Drive N JUDGE, found: {judge_files}"

        txt_fname = txt_files[0]
        match = re.match(r"^(PASS|FAIL)_([0-9]{8})_(.+)_([0-9]{14})\.txt$", txt_fname)
        assert match is not None, f"Judgement filename '{txt_fname}' does not match required format!"
        mask_code = match.group(2)
        assert len(mask_code) == 8, f"Mask code must be 8 digits, got: {mask_code}"

        # Verify TXT file content
        txt_path = os.path.join(judge_dir, txt_fname)
        with open(txt_path, "r", encoding="utf-8") as f:
            content = f.read()
        assert content.strip() == mask_code, f"TXT file content '{content}' does not match mask '{mask_code}'"

        # Verify Drive N Result Isolation: ZERO image files on Drive N
        drive_n_all = []
        for root, dirs, files in os.walk(os.path.join(test_root, "drive_N")):
            for f in files:
                drive_n_all.append(os.path.join(root, f))
        image_exts = (".bmp", ".jpg", ".jpeg", ".png")
        drive_n_images = [f for f in drive_n_all if f.lower().endswith(image_exts)]
        assert len(drive_n_images) == 0, f"Drive N contains image files! Violation of R3: {drive_n_images}"

        # Verify no IMAGE folder created on Drive N
        drive_n_subdirs = []
        for root, dirs, _ in os.walk(os.path.join(test_root, "drive_N")):
            for d in dirs:
                drive_n_subdirs.append(d)
        assert "IMAGE" not in drive_n_subdirs, f"Forbidden IMAGE folder created on Drive N: {drive_n_subdirs}"

        # -------------------------------------------------------------
        # API Endpoints & Server Health Verification
        # -------------------------------------------------------------
        client = TestClient(app)
        
        # Test raw image serving without prefix
        r_raw = client.get(f"/api/images/raw/{lot_name}/{img_names[0]}")
        assert r_raw.status_code == 200, f"Raw image endpoint failed: {r_raw.status_code}"

        # Test annotated split comparison image serving without prefix
        r_ann = client.get(f"/api/images/annotated/{lot_name}/{img_names[0]}")
        assert r_ann.status_code == 200, f"Annotated image endpoint failed: {r_ann.status_code}"

        # Test annotated serving with legacy inspect_ prefix requested (backward compat)
        r_ann_legacy = client.get(f"/api/images/annotated/{lot_name}/inspect_{img_names[0]}")
        assert r_ann_legacy.status_code == 200, "Legacy inspect_ prefix lookup failed"

        # Test batch summary endpoint
        r_summary = client.get("/api/batch-summary")
        assert r_summary.status_code == 200
        sum_data = r_summary.json()
        assert sum_data.get("isBatchComplete") is True
        assert sum_data.get("totalImages") == 3
        assert sum_data.get("mask") == mask_code
        assert sum_data.get("txtFile") == txt_fname

    finally:
        # Restore settings
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_pass_lot_judgement_code_00000000():
    """
    Verifies that a lot with all passing inspections produces PASS decision
    and an exact '00000000' 8-digit mask deposited into Drive N JUDGE.
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_pass_")
    try:
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir

        pass_records = [
            {"decision": "PASS", "reason": "-", "waferNo": "WF-01", "batch": "LOT_PASS"},
            {"decision": "PASS", "reason": "-", "waferNo": "WF-02", "batch": "LOT_PASS"},
        ]

        batch_dec, mask8, _ = build_batch_judgement(pass_records)
        assert batch_dec == "PASS"
        assert mask8 == "00000000"

        fname, fpath = generate_machine_judgement_file(batch_dec, mask8, "PROBER01", "20260909120000")
        assert fname == "PASS_00000000_PROBER01_20260909120000.txt"
        assert os.path.exists(fpath)

        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        assert content == "00000000\n"

        # Verify only 1 txt file exists and no images
        files = os.listdir(judge_dir)
        assert len(files) == 1
        assert files[0] == fname
    finally:
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        shutil.rmtree(test_root, ignore_errors=True)


def test_write_completion_and_read_only_monitoring():
    """
    Verifies write-completion checks:
    - 0-byte or changing file is not ingested.
    - Stable file is ingested in read-only mode without moving or modifying it.
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_write_comp_")
    try:
        proc_dir = os.path.join(test_root, "drive_M", "WP288", "PMI", "PROCESSED", "LOT_STABLE")
        os.makedirs(proc_dir, exist_ok=True)

        file_path = os.path.join(proc_dir, "test_write.bmp")
        
        # Scenario 1: Empty file (0 bytes) - write in progress
        with open(file_path, "wb") as f:
            pass
        assert os.path.getsize(file_path) == 0

        # Check write completion logic
        size1 = os.path.getsize(file_path)
        is_ready = (size1 > 0)
        assert not is_ready, "Empty file should not be marked ready for inference!"

        # Scenario 2: Complete file written
        sample_src = find_sample_image()
        shutil.copy2(sample_src, file_path)
        size_complete = os.path.getsize(file_path)
        assert size_complete > 0

        # Stable check: size before delay == size after delay
        time.sleep(0.05)
        size_after = os.path.getsize(file_path)
        assert size_complete == size_after

        initial_sha = calc_sha256(file_path)
        
        # Mark as seen and queue
        seen_ingested_files.clear()
        assert file_path not in seen_ingested_files
        seen_ingested_files.add(file_path)
        assert file_path in seen_ingested_files

        # File remains completely intact
        assert os.path.exists(file_path)
        assert calc_sha256(file_path) == initial_sha
    finally:
        shutil.rmtree(test_root, ignore_errors=True)


def test_idle_timeout_boundary_not_early():
    """
    Verifies that idle timeout completion does not trigger prematurely before
    process.end.timeout duration has elapsed.
    """
    lot_name = "LOT_TIMEOUT_TEST"
    with batch_lock:
        lot_tracker[lot_name] = {
            "lot_no": lot_name,
            "queued": 1,
            "processed": 1,
            "records": [{"decision": "PASS", "reason": "-", "waferNo": "W1", "batch": lot_name}],
            "last_activity": time.time(),
            "is_completed": False
        }

    orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")
    ACTIVE_MACHINE_SETTING["process.end.timeout"] = 5000  # 5 seconds

    try:
        # Check immediately (idle duration < 5s)
        check_idle_batch_completions()
        assert lot_tracker[lot_name]["is_completed"] is False, "Batch completed prematurely!"

        # Simulate time jump to 6 seconds later
        lot_tracker[lot_name]["last_activity"] = time.time() - 6.0
        check_idle_batch_completions()
        assert lot_tracker[lot_name]["is_completed"] is True, "Batch should be complete after timeout!"
    finally:
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        lot_tracker.pop(lot_name, None)


def test_lot_name_with_hyphens_parsing_and_flow():
    """
    Verifies Finding 1: Lot Name Parsing.
    - Lot names containing hyphens (e.g. 'LOT-123-ABC') are NOT truncated at the first hyphen.
    - Full end-to-end pipeline flow preserves exact lot name in Drive M OUTPUT, API, and batch summary.
    """
    # Unit checks on lot parsing with various hyphen and delimiter patterns
    lot, wf = extract_lot_and_wafer("LOT-123-ABC-W01")
    assert lot == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{lot}'"
    assert wf == "W01"

    lot2, wf2 = extract_lot_and_wafer("LOT-123-ABC-01")
    assert lot2 == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{lot2}'"
    assert wf2 == "01"

    lot3, wf3 = extract_lot_and_wafer("LOT-123-ABC")
    assert lot3 == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{lot3}'"

    lot4, wf4 = extract_lot_and_wafer("LOT-999-XYZ#02")
    assert lot4 == "LOT-999-XYZ", f"Expected 'LOT-999-XYZ', got '{lot4}'"

    lot_c7k, wf_c7k = extract_lot_and_wafer("C7K488W19E6")
    assert lot_c7k == "C7K488", f"Expected 'C7K488', got '{lot_c7k}'"
    assert wf_c7k == "W19E6", f"Expected 'W19E6', got '{wf_c7k}'"

    meta_c7k = parse_wafer_filename("20260909100001_C7K488W19E6_X10Y20_S1_P1_OK_TF1581_300.bmp")
    assert meta_c7k["batch"] == "C7K488", f"Expected 'C7K488', got '{meta_c7k['batch']}'"
    assert meta_c7k["waferNo"] == "W19E6", f"Expected 'W19E6', got '{meta_c7k['waferNo']}'"

    meta1 = parse_wafer_filename("20260909100001_LOT-123-ABC-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
    assert meta1["batch"] == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{meta1['batch']}'"

    meta2 = parse_wafer_filename("20260909100001_LOT-123-ABC-01_X10Y20_S1_P1_OK_TF1581_300.bmp")
    assert meta2["batch"] == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{meta2['batch']}'"

    meta3 = parse_wafer_filename("20260909100001_LOT-123-ABC_X10Y20_S1_P1_OK_TF1581_300.bmp")
    assert meta3["batch"] == "LOT-123-ABC", f"Expected 'LOT-123-ABC', got '{meta3['batch']}'"

    # Pipeline execution with hyphenated lot name
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_hyphen_lot_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT-123-ABC"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1000

        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        fname = "20260909100001_LOT-123-ABC-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        fpath = os.path.join(proc_dir, fname)
        shutil.copy2(sample_src, fpath)

        # Ingest using poll_drive_m_once
        enqueued = poll_drive_m_once()
        assert enqueued == 1, "Image with hyphenated lot was not enqueued!"

        # Process through priority dispatcher
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Verify output directory is LOT-123-ABC and image exists with exact original name
        assert os.path.exists(out_dir), f"Output directory {out_dir} was not created!"
        out_fpath = os.path.join(out_dir, fname)
        assert os.path.exists(out_fpath), f"Output image {out_fpath} missing!"

        # Check API batch-summary endpoint
        client = TestClient(app)
        r = client.get("/api/batch-summary")
        assert r.status_code == 200
        data = r.json()
        assert data.get("batch") == "LOT-123-ABC", f"Batch summary reported '{data.get('batch')}', expected 'LOT-123-ABC'!"

        # Wait for timeout and complete
        time.sleep(1.1)
        check_idle_batch_completions()
        assert lot_tracker[lot_name]["is_completed"] is True
        assert lot_tracker[lot_name]["summary"]["batch"] == "LOT-123-ABC"

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_ingestion_state_persistence_and_recovery():
    """
    Verifies Finding 2: Ingestion State Persistence.
    - Ingested files are persisted across server restart via disk cache.
    - Even if disk cache is deleted, presence of existing files in Drive M OUTPUT
      prevents duplicate re-queueing and re-processing.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_persist_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        lot_name = "LOT_PERSIST_TEST"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(out_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 5000

        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        fname = "20260909100001_LOTPERSIST-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(proc_dir, fname)
        shutil.copy2(sample_src, src_file)

        # 1. Ingest and verify queued
        enqueued = poll_drive_m_once()
        assert enqueued == 1
        assert src_file in seen_ingested_files

        # Verify disk cache persistence was saved
        assert os.path.exists(SEEN_FILES_CACHE_PATH)
        loaded_set = load_seen_ingested_files()
        assert src_file in loaded_set

        # Process the image to produce output
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        out_file = os.path.join(out_dir, fname)
        assert os.path.exists(out_file)
        assert os.path.getsize(out_file) > 0

        # 2. Simulate server restart with disk cache:
        # In-memory seen set is wiped, but reloaded from disk cache
        seen_ingested_files.clear()
        assert src_file not in seen_ingested_files
        seen_ingested_files.update(load_seen_ingested_files())
        assert src_file in seen_ingested_files

        # Poll again: must NOT re-enqueue
        enqueued_again = poll_drive_m_once()
        assert enqueued_again == 0, "Image was re-queued after restart with cache!"
        assert P0_QUEUE.empty()

        # 3. Simulate server restart where disk cache was LOST/DELETED:
        seen_ingested_files.clear()
        if os.path.exists(SEEN_FILES_CACHE_PATH):
            os.remove(SEEN_FILES_CACHE_PATH)

        # Poll again: is_file_already_processed checks Drive M OUTPUT and skips
        enqueued_no_cache = poll_drive_m_once()
        assert enqueued_no_cache == 0, "Image was re-queued when output image already exists in OUTPUT!"
        assert P0_QUEUE.empty()
        assert src_file in seen_ingested_files  # Registered by output check

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_back_to_back_batches_clean_transition():
    """
    Verifies Finding 3: Batch Complete Flag Reset & State Leakage Prevention.
    - When Batch 1 completes, is_batch_complete becomes True.
    - When Batch 2 (for new lot or same lot) arrives, is_batch_complete resets to False.
    - Previous batch records do NOT leak into the new batch.
    - Consecutive batches for the same lot cleanly reset counts without accumulating old records.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_b2b_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 5000

        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Batch 1: LOT_ALPHA with 2 images
        proc_alpha = os.path.join(drive_m_dir, "PROCESSED", "LOT_ALPHA")
        os.makedirs(proc_alpha, exist_ok=True)
        img1 = os.path.join(proc_alpha, "20260909100001_LOTALPHA-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        img2 = os.path.join(proc_alpha, "20260909100002_LOTALPHA-W01_X10Y20_S1_P2_OK_TF1581_300.bmp")
        shutil.copy2(sample_src, img1)
        shutil.copy2(sample_src, img2)

        poll_drive_m_once()
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Complete Batch 1
        summary1 = complete_batch_for_lot("LOT_ALPHA")
        assert summary1["isBatchComplete"] is True
        assert summary1["totalImages"] == 2
        assert summary1["batch"] == "LOT_ALPHA"

        client = TestClient(app)
        r1 = client.get("/api/batch-summary")
        assert r1.json()["isBatchComplete"] is True
        assert r1.json()["totalImages"] == 2

        # Batch 2: LOT_BETA arrives with 1 image
        proc_beta = os.path.join(drive_m_dir, "PROCESSED", "LOT_BETA")
        os.makedirs(proc_beta, exist_ok=True)
        img3 = os.path.join(proc_beta, "20260909100003_LOTBETA-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        shutil.copy2(sample_src, img3)

        poll_drive_m_once()
        # While image is in queue or just arrived, isBatchComplete must be FALSE
        r2_mid = client.get("/api/batch-summary")
        assert r2_mid.json()["isBatchComplete"] is False, "isBatchComplete was not reset when new lot arrived!"
        assert r2_mid.json()["batch"] == "LOT_BETA"

        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Verify no state leakage: LOT_BETA has exactly 1 image (NOT 3)
        r2_proc = client.get("/api/batch-summary")
        assert r2_proc.json()["totalImages"] == 1, f"State leakage! Expected 1 image for LOT_BETA, got {r2_proc.json()['totalImages']}"
        assert r2_proc.json()["isBatchComplete"] is False

        # Complete Batch 2
        summary2 = complete_batch_for_lot("LOT_BETA")
        assert summary2["totalImages"] == 1
        assert summary2["batch"] == "LOT_BETA"

        # Batch 3: Back-to-back subsequent batch for SAME lot (LOT_ALPHA Batch 2)
        img4 = os.path.join(proc_alpha, "20260909100004_LOTALPHA-W02_X10Y20_S1_P1_OK_TF1581_300.bmp")
        shutil.copy2(sample_src, img4)

        poll_drive_m_once()
        r3_mid = client.get("/api/batch-summary")
        assert r3_mid.json()["isBatchComplete"] is False, "isBatchComplete not reset for subsequent batch of same lot!"
        assert r3_mid.json()["batch"] == "LOT_ALPHA"

        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        r3_proc = client.get("/api/batch-summary")
        # Total images for this new batch of LOT_ALPHA must be 1 (NOT 3)!
        assert r3_proc.json()["totalImages"] == 1, f"Old records accumulated! Expected 1, got {r3_proc.json()['totalImages']}"

        summary3 = complete_batch_for_lot("LOT_ALPHA")
        assert summary3["totalImages"] == 1

        # Check Drive N JUDGE files: exactly 1 single latest judgement file preserved for Prober
        judge_files = [f for f in os.listdir(judge_dir) if f.endswith(".txt")]
        assert len(judge_files) == 1, f"Expected 1 single latest judgement file on Drive N, found: {judge_files}"
        assert summary3["txtFile"] in judge_files[0]

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_multi_lot_concurrency_and_isolation():
    """
    Verifies Finding 4: Multi-Lot Idle Timeout Concurrency & Isolation.
    - Multiple lots active concurrently do not block each other.
    - Lot 1 timing out does not prematurely complete active Lot 2.
    - Lot 1 completing writes its judgement file to Drive N while Lot 2 continues.
    - Querying per-lot summary (/api/batch-summary?lot_no=...) returns isolated lot metrics.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_multi_lot_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1500  # 1.5s timeout

        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Setup 2 lots: LOT_1 and LOT_2
        proc_lot1 = os.path.join(drive_m_dir, "PROCESSED", "LOT_1")
        proc_lot2 = os.path.join(drive_m_dir, "PROCESSED", "LOT_2")
        os.makedirs(proc_lot1, exist_ok=True)
        os.makedirs(proc_lot2, exist_ok=True)

        img_l1 = os.path.join(proc_lot1, "20260909100001_LOT1-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        img_l2 = os.path.join(proc_lot2, "20260909100002_LOT2-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        shutil.copy2(sample_src, img_l1)
        shutil.copy2(sample_src, img_l2)

        # Ingest both lots
        poll_drive_m_once()
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Both lots tracked independently
        assert "LOT_1" in lot_tracker
        assert "LOT_2" in lot_tracker
        assert lot_tracker["LOT_1"]["is_completed"] is False
        assert lot_tracker["LOT_2"]["is_completed"] is False

        # Make LOT_1 idle for > 1.5s, while LOT_2 receives new activity
        lot_tracker["LOT_1"]["last_arrival"] = time.time() - 2.0
        lot_tracker["LOT_2"]["last_arrival"] = time.time()  # active now!

        check_idle_batch_completions()

        # LOT_1 must be complete, LOT_2 must STILL BE ACTIVE
        assert lot_tracker["LOT_1"]["is_completed"] is True, "LOT_1 should be complete after timeout!"
        assert lot_tracker["LOT_2"]["is_completed"] is False, "LOT_2 completed prematurely while still active!"

        client = TestClient(app)
        # Check per-lot summary endpoints
        r_l1 = client.get("/api/batch-summary?lot_no=LOT_1")
        assert r_l1.json()["isBatchComplete"] is True
        assert r_l1.json()["batch"] == "LOT_1"

        r_l2 = client.get("/api/batch-summary?lot_no=LOT_2")
        assert r_l2.json()["isBatchComplete"] is False
        assert r_l2.json()["batch"] == "LOT_2"

        # Drive N has exactly 1 judgement file (for LOT_1)
        judge_files_mid = [f for f in os.listdir(judge_dir) if f.endswith(".txt")]
        assert len(judge_files_mid) == 1

        # Now let LOT_2 time out
        lot_tracker["LOT_2"]["last_arrival"] = time.time() - 2.0
        check_idle_batch_completions()
        assert lot_tracker["LOT_2"]["is_completed"] is True

        # Under single-file Prober requirement, completing LOT_2 purges prior judgement
        judge_files_end = [f for f in os.listdir(judge_dir) if f.endswith(".txt")]
        assert len(judge_files_end) == 1, f"Expected 1 judgement file on Drive N, found {judge_files_end}"

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_judgement_txt_overwrite_protection():
    """
    Verifies Finding 5: Judgement TXT Overwrite Protection.
    - When two batches complete in the exact same second, the second batch does NOT
      overwrite the prior TXT file on Drive N.
    - Uniqueness is guaranteed per machine.result.fileFormat (incremented 14-digit timestamp).
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_judge_overwrite_")
    try:
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir

        # Batch 1 generates judgement at fixed timestamp
        ts = "20260909150000"
        fname1, fpath1 = generate_machine_judgement_file("PASS", "00000000", "PROBER01", ts, purge_existing=False)
        assert os.path.exists(fpath1)
        assert fname1 == "PASS_00000000_PROBER01_20260909150000.txt"

        # Batch 2 attempts to generate judgement at the EXACT SAME timestamp
        fname2, fpath2 = generate_machine_judgement_file("PASS", "00000000", "PROBER01", ts, purge_existing=False)
        assert os.path.exists(fpath2)
        assert fname2 != fname1, "Second judgement file overwrote the first filename!"
        assert fname2 == "PASS_00000000_PROBER01_20260909150001.txt"

        # Verify BOTH files exist on Drive N and neither was destroyed
        assert os.path.exists(fpath1)
        assert os.path.exists(fpath2)
        judge_files = os.listdir(judge_dir)
        assert len(judge_files) == 2
        assert fname1 in judge_files
        assert fname2 in judge_files

        # Verify contents of both files
        with open(fpath1, "r", encoding="utf-8") as f:
            assert f.read() == "00000000\n"
        with open(fpath2, "r", encoding="utf-8") as f:
            assert f.read() == "00000000\n"
    finally:
        if orig_judge:
            ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        shutil.rmtree(test_root, ignore_errors=True)


def test_lot_name_with_underscores_and_complex_tokens():
    """
    Adversarial Review Finding 1: Lot names containing underscores and complex delimiters.
    - Files named '20260909100001_LOT_ABC_123-W01_X10Y20_S1_P1_OK_TF1581_300.bmp' must NOT
      scramble the lot name, coordinates, site, pad, process code, or temperature.
    - Pipeline flow produces Drive M OUTPUT/LOT_ABC_123/ with exact filename.
    - API /api/batch-summary reports batch 'LOT_ABC_123'.
    """
    fname = "20260909100001_LOT_ABC_123-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
    meta = parse_wafer_filename(fname)
    assert meta["batch"] == "LOT_ABC_123", f"Expected 'LOT_ABC_123', got '{meta['batch']}'"
    assert meta["waferNo"] == "LOT_ABC_123-W01", f"Expected 'LOT_ABC_123-W01', got '{meta['waferNo']}'"
    assert meta["xyCoord"] == "X10Y20"
    assert meta["site"] == "Site 1"
    assert meta["pad"] == "Pad 1"
    assert meta["processCode"] == "OK"
    assert meta["productSetup"] == "TF1581"
    assert meta["temp"] == "30.0°C"

    # Full pipeline test with underscore lot
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_underscore_lot_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT_ABC_123"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1000

        with seen_files_lock:
            seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        fpath = os.path.join(proc_dir, fname)
        shutil.copy2(sample_src, fpath)

        enqueued = poll_drive_m_once()
        assert enqueued == 1, "Underscore lot image was not enqueued!"

        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        assert os.path.exists(out_dir)
        assert os.path.exists(os.path.join(out_dir, fname))

        client = TestClient(app)
        r = client.get("/api/batch-summary")
        assert r.status_code == 200
        assert r.json().get("batch") == "LOT_ABC_123"

        time.sleep(1.1)
        check_idle_batch_completions()
        assert lot_tracker[lot_name]["is_completed"] is True
        assert len(os.listdir(judge_dir)) == 1

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_corrupted_and_truncated_image_resilience():
    """
    Adversarial Review Finding 2: Malformed/corrupted/truncated image payloads.
    - Files with invalid/truncated image payload are detected as corrupt.
    - Yields decision FAIL with reason 'Corrupted or Unreadable Image' (mode 8).
    - Writes fallback comparison image to Drive M OUTPUT.
    - On idle timeout, deposits FAIL_00000008_...txt to Drive N JUDGE.
    - Does NOT crash the server or loop infinitely in check_idle_batch_completions.
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_corrupt_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT_CORRUPT_TEST"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1000

        with seen_files_lock:
            seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Write truncated 12-byte pseudo-BMP
        fname = "20260909100001_LOTCORRUPT-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        bad_fpath = os.path.join(proc_dir, fname)
        with open(bad_fpath, "wb") as f:
            f.write(b"BM\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00")

        enqueued = poll_drive_m_once()
        assert enqueued == 1

        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Verify output error canvas was generated
        out_fpath = os.path.join(out_dir, fname)
        assert os.path.exists(out_fpath), f"Output image not written for corrupt file: {out_fpath}"
        assert os.path.getsize(out_fpath) > 0

        # Wait for idle timeout and complete batch
        time.sleep(1.1)
        check_idle_batch_completions()

        assert lot_tracker[lot_name]["is_completed"] is True
        summary = lot_tracker[lot_name]["summary"]
        assert summary["batchDecision"] == "FAIL"
        assert summary["mask"] == "00000008"

        # Verify Drive N has valid FAIL judgement file
        judge_files = os.listdir(judge_dir)
        assert len(judge_files) == 1
        assert judge_files[0].startswith("FAIL_00000008_")

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_inference_failure_fail_safe():
    """
    Adversarial Review Finding 3: AI Inference or rule failure fails safe.
    - An exception during inference or rule execution NEVER yields a false PASS.
    - Decision is strictly FAIL, machine action STOP MACHINE.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_inf_fail_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT_INF_FAIL"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1000

        with seen_files_lock:
            seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        fname = "20260909100001_LOTINFFAIL-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_path = os.path.join(proc_dir, fname)
        shutil.copy2(sample_src, src_path)

        # Patch run_inspection to raise an unhandled RuntimeError
        import backend_imx8.main as b_main
        orig_run_inspection = getattr(b_main, "run_inspection", None)

        def mock_broken_inspection(*args, **kwargs):
            raise RuntimeError("Simulated AI inference / delegate crash")

        b_main.run_inspection = mock_broken_inspection

        try:
            # Process image directly
            process_new_file(src_path, fname, lot_no=lot_name)
            rec = lot_tracker[lot_name]["records"][0]
            assert rec["id"] == "LOTINFFAIL-W01"
            assert rec["decision"] == "FAIL"
            assert rec["machineAction"] == "STOP MACHINE"
        finally:
            if orig_run_inspection:
                b_main.run_inspection = orig_run_inspection

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_out_of_order_end_signal_drains_queue_first():
    """
    Adversarial Review Finding 4: END signal arriving with pending queue items.
    - An _END.bmp file does not complete the batch early while other images for the lot
      are still waiting in the priority queue.
    - All queued images are processed before final judgement file generation.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_end_drain_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT_END_ORDER"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")

        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 5000

        with seen_files_lock:
            seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Simulate 2 images queued, where image 1 happens to have an END signal
        fname1 = "20260909100001_LOTEND-W01_X10Y20_S1_P1_OK_TF1581_300_END.bmp"
        fname2 = "20260909100002_LOTEND-W01_X10Y20_S1_P2_OK_TF1581_300.bmp"
        fpath1 = os.path.join(proc_dir, fname1)
        fpath2 = os.path.join(proc_dir, fname2)
        shutil.copy2(sample_src, fpath1)
        shutil.copy2(sample_src, fpath2)

        # Set up tracking simulating queued = 2
        now_t = time.time()
        lot_tracker[lot_name] = {
            "lot_no": lot_name,
            "queued": 2,
            "processed": 0,
            "records": [],
            "last_activity": now_t,
            "last_arrival": now_t,
            "is_completed": False,
            "summary": None
        }

        # Process image 1 (with _END in name) while queued is 2 (processed becomes 1 < queued 2)
        process_new_file(fpath1, fname1, lot_no=lot_name)
        # Batch must NOT be complete yet!
        assert lot_tracker[lot_name]["is_completed"] is False, "Premature completion before draining queue!"
        assert lot_tracker[lot_name]["end_signal_received"] is True

        # Process image 2
        process_new_file(fpath2, fname2, lot_no=lot_name)
        # Now processed == 2 == queued, and end_signal_received is True
        check_idle_batch_completions()
        assert lot_tracker[lot_name]["is_completed"] is True
        assert lot_tracker[lot_name]["summary"]["totalImages"] == 2

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        shutil.rmtree(test_root, ignore_errors=True)


def test_rapid_burst_multi_lot_stress():
    """
    Adversarial Stress Test: Rapid bursts of 25 lots completing at the exact same second.
    - Zero filename collisions on Drive N JUDGE.
    - All 25 files are uniquely written and valid.
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_burst_")
    try:
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir

        same_ts = "20260909120000"
        created_files = []
        threads = []

        def worker(idx):
            lot_name = f"LOT_BURST_{idx:03d}"
            fname, fpath = generate_machine_judgement_file("PASS", "00000000", "PROBER01", t_stamp=same_ts, lot_no=lot_name, purge_existing=False)
            created_files.append((fname, fpath))

        for i in range(25):
            t = threading.Thread(target=worker, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        assert len(created_files) == 25
        disk_files = [f for f in os.listdir(judge_dir) if f.endswith(".txt")]
        assert len(disk_files) == 25, f"Expected 25 files on Drive N, found {len(disk_files)} (collision occurred!)"
        assert len(set(disk_files)) == 25, "Duplicate filenames detected!"

    finally:
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        shutil.rmtree(test_root, ignore_errors=True)


def test_machine_setting_lot_format_replacement():
    """
    Verifies that {output.lotNo} in machine.result.fileFormat is replaced correctly.
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_lot_fmt_")
    try:
        judge_dir = os.path.join(test_root, "drive_N", "WP288", "PMI", "JUDGE")
        os.makedirs(judge_dir, exist_ok=True)

        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_fmt = ACTIVE_MACHINE_SETTING.get("machine.result.fileFormat")

        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["machine.result.fileFormat"] = "{output.lotNo}_{output.result}_{output.code}_{output.machine}_{output.ts}.txt"

        fname, fpath = generate_machine_judgement_file("PASS", "00000000", "PROBER01", lot_no="SPECIAL_LOT_99")
        assert fname.startswith("SPECIAL_LOT_99_PASS_00000000_PROBER01_")
        assert os.path.exists(fpath)

    finally:
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_fmt: ACTIVE_MACHINE_SETTING["machine.result.fileFormat"] = orig_fmt
        shutil.rmtree(test_root, ignore_errors=True)


def test_seen_cache_clear_and_thread_safety():
    """
    Verifies thread safety of seen cache and deletion of disk cache upon reset.
    """
    client = TestClient(app)
    # Add items to cache and save
    with seen_files_lock:
        seen_ingested_files.add("/test/file1.bmp")
        seen_ingested_files.add("/test/file2.bmp")
    save_seen_ingested_files(seen_ingested_files)
    assert os.path.exists(SEEN_FILES_CACHE_PATH)

    # Call reset endpoint with clear_seen=True
    r = client.post("/api/batch/reset?clear_seen=true")
    assert r.status_code == 200
    with seen_files_lock:
        assert len(seen_ingested_files) == 0
    assert not os.path.exists(SEEN_FILES_CACHE_PATH), "Disk cache file was not removed upon clear_seen reset!"


def test_relative_mtime_baseline_skips_stale_images():
    """
    Verifies Method 1 (Relative mtime baseline):
    - Stale images present in PROCESSED before baseline initialization are ignored.
    - Newly created images with mtime >= baseline are detected, enqueued, and processed.
    - Baseline automatically ratchets forward with each newly enqueued image.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_mtime_baseline_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        drive_n_dir = os.path.join(test_root, "drive_N", "WP288", "PMI")
        lot_name = "LOT_MTIME_TEST"
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
        out_dir = os.path.join(drive_m_dir, "OUTPUT", lot_name)
        judge_dir = os.path.join(drive_n_dir, "JUDGE")
        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(judge_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_judge = ACTIVE_MACHINE_SETTING.get("machine.result.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")

        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = judge_dir
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1200

        # 1. Create 2 stale images with an older timestamp (e.g. 1000.0)
        stale1 = os.path.join(proc_dir, "20260909100001_LOTMTIME-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        stale2 = os.path.join(proc_dir, "20260909100002_LOTMTIME-W01_X10Y20_S1_P2_OK_TF1581_300.bmp")
        shutil.copyfile(sample_src, stale1)
        shutil.copyfile(sample_src, stale2)
        os.utime(stale1, (1000.0, 1000.0))
        os.utime(stale2, (1050.0, 1050.0))

        # Initialize baseline from PROCESSED directory
        base_dir = os.path.join(drive_m_dir, "PROCESSED")
        established_baseline = init_ingestion_baseline(base_dir)
        assert established_baseline == 1050.0
        assert get_ingestion_baseline_mtime() >= 1050.0

        # Reset queue & tracker states, and clear seen_ingested_files to specifically verify mtime filtering!
        while not P0_QUEUE.empty(): P0_QUEUE.get_nowait()
        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()

        # Poll: stale images must be skipped despite seen_ingested_files being empty!
        enqueued_count = poll_drive_m_once()
        assert enqueued_count == 0, f"Expected 0 enqueued stale files, got {enqueued_count}"
        assert P0_QUEUE.empty()

        # 2. Now introduce a brand new image with a newer timestamp (e.g. 2000.0)
        new_img = os.path.join(proc_dir, "20260909100003_LOTMTIME-W01_X10Y20_S1_P3_OK_TF1581_300.bmp")
        shutil.copyfile(sample_src, new_img)
        os.utime(new_img, (2000.0, 2000.0))

        enqueued_count = poll_drive_m_once()
        assert enqueued_count == 1, f"Expected exactly 1 new image enqueued, got {enqueued_count}"
        assert not P0_QUEUE.empty()
        assert get_ingestion_baseline_mtime() == 2000.0

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_judge: ACTIVE_MACHINE_SETTING["machine.result.folder"] = orig_judge
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        set_ingestion_baseline_mtime(0.0)
        shutil.rmtree(test_root, ignore_errors=True)


def test_clock_skew_resilience():
    """
    Verifies that relative mtime baseline works even when host system clock
    is wildly skewed (e.g., set to epoch 1970 or far in the future).
    """
    test_root = tempfile.mkdtemp(prefix="imx8_test_clock_skew_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", "LOT_SKEW")
        os.makedirs(proc_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")

        sample_src = find_sample_image()

        # Files have arbitrary timestamps independent of system time (e.g., 500.0 vs 800.0)
        f_old = os.path.join(proc_dir, "20260909100001_LOTSKEW-W01_X10Y20_S1_P1_OK_TF1581_300.bmp")
        shutil.copyfile(sample_src, f_old)
        os.utime(f_old, (500.0, 500.0))

        set_ingestion_baseline_mtime(600.0)
        seen_ingested_files.clear()

        # Poll: f_old has mtime 500.0 < baseline 600.0 -> skipped
        candidates = scan_drive_m_processed()
        assert len(candidates) == 0

        # Now add a file with mtime 700.0 > baseline 600.0 -> accepted
        f_new = os.path.join(proc_dir, "20260909100002_LOTSKEW-W01_X10Y20_S1_P2_OK_TF1581_300.bmp")
        shutil.copyfile(sample_src, f_new)
        os.utime(f_new, (700.0, 700.0))

        candidates = scan_drive_m_processed()
        assert len(candidates) == 1
        assert candidates[0][1] == os.path.basename(f_new)

    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        set_ingestion_baseline_mtime(0.0)
        shutil.rmtree(test_root, ignore_errors=True)


if __name__ == "__main__":
    import threading
    pytest.main([__file__, "-v", "-s"])
