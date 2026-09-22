import os
import sys
import shutil
import tempfile
import time
import pytest
from fastapi.testclient import TestClient

# Ensure backend_imx8 is in sys.path
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.abspath(os.path.join(_THIS_DIR, ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from main import (
    app,
    ACTIVE_MACHINE_SETTING,
    P0_QUEUE,
    lot_tracker,
    current_batch_records,
    seen_ingested_files,
    in_flight_files,
    is_file_already_processed,
    poll_drive_m_once,
    scan_drive_m_processed,
    process_new_file,
    check_idle_batch_completions,
    complete_batch_for_lot,
    set_ingestion_baseline_mtime,
    get_ingestion_baseline_mtime
)


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
    import cv2
    import numpy as np
    temp_img = os.path.join(tempfile.gettempdir(), "synth_sample.bmp")
    canvas = np.full((160, 160, 3), 128, dtype=np.uint8)
    cv2.rectangle(canvas, (30, 30), (130, 130), (200, 200, 200), -1)
    cv2.circle(canvas, (80, 80), 20, (50, 50, 50), -1)
    cv2.imwrite(temp_img, canvas)
    return temp_img


def test_non_monotonic_mtime_production_scenario():
    """
    Verifies that when files have mixed, non-monotonic timestamps (e.g. Sep 18 and Sep 21),
    100% of images are discovered and enqueued, without dropping older-timestamped files.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_non_monotonic_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", "SUC720")
        os.makedirs(proc_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")

        set_ingestion_baseline_mtime(0.0)
        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()
        while not P0_QUEUE.empty():
            P0_QUEUE.get_nowait()

        # Create 5 images with timestamps alternating between older and newer (simulating Sep 18 and Sep 21)
        files = []
        timestamps = [1758412800.0, 1758153600.0, 1758413000.0, 1758154000.0, 1758412900.0]
        for i, ts in enumerate(timestamps):
            fpath = os.path.join(proc_dir, f"2026092110000{i}_SUC720-W01_X10Y20_S1_P{i}_OK_TF1581_300.bmp")
            shutil.copyfile(sample_src, fpath)
            os.utime(fpath, (ts, ts))
            files.append(fpath)

        # First scan
        candidates = scan_drive_m_processed()
        assert len(candidates) == 5, f"Expected all 5 candidates regardless of mtime, got {len(candidates)}"

        # Enqueue files
        enqueued = poll_drive_m_once()
        assert enqueued == 5, f"Expected all 5 files to be enqueued, got {enqueued}"
        assert P0_QUEUE.qsize() == 5

        # Process all queued files
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Next poll: all files are processed, should enqueue 0
        enqueued_again = poll_drive_m_once()
        assert enqueued_again == 0
    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        set_ingestion_baseline_mtime(0.0)
        shutil.rmtree(test_root, ignore_errors=True)


def test_accidental_output_deletion_does_not_loop():
    """
    Verifies that if an output image is accidentally deleted from Drive M OUTPUT:
    1. is_file_already_processed continues to return True because of seen_ingested_files.
    2. The scanner does not repeatedly re-enqueue and re-inspect the image.
    3. The API endpoint gracefully falls back to the raw image instead of failing with 404.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_deleted_output_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", "LOT_DEL")
        out_dir = os.path.join(drive_m_dir, "OUTPUT", "LOT_DEL")
        os.makedirs(proc_dir, exist_ok=True)
        os.makedirs(out_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")

        set_ingestion_baseline_mtime(0.0)
        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()
        while not P0_QUEUE.empty():
            P0_QUEUE.get_nowait()

        # Place 1 image in PROCESSED
        fname = "20260921100001_LOTDEL-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        raw_fpath = os.path.join(proc_dir, fname)
        shutil.copyfile(sample_src, raw_fpath)

        # Enqueue and process
        poll_drive_m_once()
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        out_fpath = os.path.join(out_dir, fname)
        assert os.path.exists(out_fpath), "Output image should have been generated"

        # ACCIDENTALLY DELETE the output image!
        os.remove(out_fpath)
        assert not os.path.exists(out_fpath)

        # Poll again: because raw_fpath is in seen_ingested_files, it should NOT re-enqueue!
        assert is_file_already_processed(raw_fpath, fname, "LOT_DEL") is True
        enqueued_after_delete = poll_drive_m_once()
        assert enqueued_after_delete == 0, "Accidentally deleted output image caused duplicate re-enqueue!"

        # Check API graceful fallback: querying annotated image serves the raw image instead of 404
        client = TestClient(app)
        res = client.get(f"/api/images/annotated/LOT_DEL/{fname}")
        assert res.status_code == 200, f"Expected 200 fallback to raw, got {res.status_code}"
        assert len(res.content) > 0
    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        set_ingestion_baseline_mtime(0.0)
        shutil.rmtree(test_root, ignore_errors=True)


def test_idle_batch_completion_waits_for_unprocessed_disk_files():
    """
    Verifies that check_idle_batch_completions does NOT complete the lot if there
    are still uninspected images sitting in PROCESSED/<lot>.
    """
    sample_src = find_sample_image()
    test_root = tempfile.mkdtemp(prefix="imx8_test_idle_wait_")
    try:
        drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
        proc_dir = os.path.join(drive_m_dir, "PROCESSED", "LOT_WAIT")
        os.makedirs(proc_dir, exist_ok=True)

        orig_input = ACTIVE_MACHINE_SETTING.get("lot.input.folder")
        orig_output = ACTIVE_MACHINE_SETTING.get("lot.output.folder")
        orig_timeout = ACTIVE_MACHINE_SETTING.get("process.end.timeout")
        ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 500  # 0.5s timeout

        set_ingestion_baseline_mtime(0.0)
        seen_ingested_files.clear()
        lot_tracker.clear()
        current_batch_records.clear()
        while not P0_QUEUE.empty():
            P0_QUEUE.get_nowait()

        # Image 1 is processed
        fname1 = "20260921100001_LOTWAIT-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        fpath1 = os.path.join(proc_dir, fname1)
        shutil.copyfile(sample_src, fpath1)

        poll_drive_m_once()
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Now Image 2 arrives on disk in PROCESSED, but has NOT been polled/processed yet
        fname2 = "20260921100002_LOTWAIT-W01_X10Y20_S1_P2_OK_TF1581_300.bmp"
        fpath2 = os.path.join(proc_dir, fname2)
        shutil.copyfile(sample_src, fpath2)

        # Force idle time past timeout
        lot_tracker["LOT_WAIT"]["last_arrival"] = time.time() - 5.0
        lot_tracker["LOT_WAIT"]["last_activity"] = time.time() - 5.0

        # Run check_idle_batch_completions: since fname2 is still pending on disk, do NOT complete
        check_idle_batch_completions()
        assert lot_tracker["LOT_WAIT"].get("is_completed") is not True, "Batch completed despite pending image on disk!"

        # Now let poll_drive_m_once pick up Image 2 and process it
        enqueued = poll_drive_m_once()
        assert enqueued == 1
        while not P0_QUEUE.empty():
            task = P0_QUEUE.get_nowait()
            process_new_file(task["filepath"], task["filename"], lot_no=task.get("lot_no"))
            P0_QUEUE.task_done()

        # Now all disk files are processed; advance idle time and verify it completes
        lot_tracker["LOT_WAIT"]["last_arrival"] = time.time() - 5.0
        lot_tracker["LOT_WAIT"]["last_activity"] = time.time() - 5.0
        check_idle_batch_completions()
        assert lot_tracker["LOT_WAIT"].get("is_completed") is True, "Batch should now be complete!"
    finally:
        if orig_input: ACTIVE_MACHINE_SETTING["lot.input.folder"] = orig_input
        if orig_output: ACTIVE_MACHINE_SETTING["lot.output.folder"] = orig_output
        if orig_timeout: ACTIVE_MACHINE_SETTING["process.end.timeout"] = orig_timeout
        set_ingestion_baseline_mtime(0.0)
        shutil.rmtree(test_root, ignore_errors=True)
