import os
import sys
import time
import shutil
import pytest
import numpy as np
import cv2

# Set path to import main from backend_imx8
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import main
from main import (
    resolve_windows_drive_path,
    parse_wafer_filename,
    is_device_matching_recipe,
    scan_source_folder_for_candidates,
    verify_and_transfer_candidates,
    poll_source_transfer_once,
    poll_drive_m_once,
    ACTIVE_MACHINE_SETTING,
    ACTIVE_PRODUCT_SETTING,
    P0_QUEUE,
    lot_tracker,
    seen_ingested_files,
    in_flight_files,
    warned_skipped_transfer_files
)

def create_synthetic_bmp(path: str, width: int = 160, height: int = 160):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = np.ones((height, width, 3), dtype=np.uint8) * 128
    # Draw simple pad and mark
    cv2.rectangle(img, (40, 40), (120, 120), (200, 200, 200), -1)
    cv2.circle(img, (80, 80), 10, (50, 50, 50), -1)
    cv2.imwrite(path, img)


class TestSourceTransfer:

    def setup_method(self):
        # Clear queues and tracking sets
        while not P0_QUEUE.empty():
            try:
                P0_QUEUE.get_nowait()
            except Exception:
                break
        lot_tracker.clear()
        seen_ingested_files.clear()
        in_flight_files.clear()
        warned_skipped_transfer_files.clear()

        # Ensure baseline simulation paths exist
        self.sim_n_img = resolve_windows_drive_path("N:\\WP288\\PMI\\IMAGE")
        self.sim_n_judge = resolve_windows_drive_path("N:\\WP288\\PMI\\JUDGE")
        self.sim_t_img = resolve_windows_drive_path("T:\\WP288\\PMI\\IMAGE")
        self.sim_t_judge = resolve_windows_drive_path("T:\\WP288\\PMI\\JUDGE")
        self.sim_m_proc = resolve_windows_drive_path("M:\\WP288\\PMI\\PROCESSED")
        self.sim_m_out = resolve_windows_drive_path("M:\\WP288\\PMI\\OUTPUT")

        for p in [self.sim_n_img, self.sim_n_judge, self.sim_t_img, self.sim_t_judge, self.sim_m_proc, self.sim_m_out]:
            os.makedirs(p, exist_ok=True)

        # Default machine & product setting
        ACTIVE_MACHINE_SETTING["lot.source.folder"] = "N:\\WP288\\PMI\\IMAGE"
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = "N:\\WP288\\PMI\\JUDGE"
        ACTIVE_MACHINE_SETTING["lot.input.folder"] = "M:\\WP288\\PMI\\PROCESSED\\{output.lotNo}"
        ACTIVE_MACHINE_SETTING["lot.output.folder"] = "M:\\WP288\\PMI\\OUTPUT\\{output.lotNo}"
        ACTIVE_MACHINE_SETTING["process.end.timeout"] = 1000

        ACTIVE_PRODUCT_SETTING["devices"] = [
            "T073C3BTAA-PL211",
            "T073C3BTAA-PL2-PS16-PT-1",
            "TF1581"
        ]
        ACTIVE_PRODUCT_SETTING["skipDevices"] = ["SKIP_DEV"]

    def teardown_method(self):
        # Clean up test directories created during tests
        for p in [self.sim_n_img, self.sim_t_img, self.sim_m_proc, self.sim_m_out, self.sim_n_judge, self.sim_t_judge]:
            if os.path.exists(p):
                for item in os.listdir(p):
                    target = os.path.join(p, item)
                    if os.path.isdir(target):
                        shutil.rmtree(target, ignore_errors=True)
                    elif os.path.isfile(target):
                        try:
                            os.remove(target)
                        except Exception:
                            pass

    def test_device_matching_logic(self):
        # 1. Matching allowed device
        assert is_device_matching_recipe("TF1581", "sample_TF1581.bmp") is True
        assert is_device_matching_recipe("T073C3BTAA-PL211", "20260909100001_LOT01-W01_X10Y20_S1_P1_OK_T073C3BTAA-PL211_300.bmp") is True

        # 2. Unknown device
        assert is_device_matching_recipe("UNKNOWN_DEVICE_999", "sample_UNKNOWN_DEVICE_999.bmp") is False

        # 3. Skip device
        assert is_device_matching_recipe("SKIP_DEV", "sample_SKIP_DEV.bmp") is False

        # 4. If devices list is empty, accept all
        ACTIVE_PRODUCT_SETTING["devices"] = []
        assert is_device_matching_recipe("ANY_DEV", "any.bmp") is True

    def test_parse_wafer_filename_extracts_device(self):
        fname = "20260909100001_LOTTEST-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        meta = parse_wafer_filename(fname)
        assert meta["batch"] == "LOTTEST"
        assert meta["waferNo"] == "LOTTEST-W01"
        assert meta["xyCoord"] == "X10Y20"
        assert meta["device"] == "TF1581"
        assert meta["productSetup"] == "TF1581"

    def test_source_transfer_moves_file_and_mirrors_batch_folder(self):
        batch_name = "BATCH_TRANSFER_TEST"
        src_batch_dir = os.path.join(self.sim_n_img, batch_name)
        os.makedirs(src_batch_dir, exist_ok=True)

        fname = "20260909100001_LOTTEST-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(src_batch_dir, fname)
        create_synthetic_bmp(src_file)

        assert os.path.exists(src_file)

        # Run transfer
        moved = poll_source_transfer_once()
        assert moved == 1

        # Check source is moved
        assert not os.path.exists(src_file)

        # Check target in Drive M PROCESSED has mirrored folder and file
        expected_dest_dir = os.path.join(self.sim_m_proc, batch_name)
        expected_dest_file = os.path.join(expected_dest_dir, fname)
        assert os.path.exists(expected_dest_dir)
        assert os.path.exists(expected_dest_file)

    def test_unrecognized_device_is_skipped_and_not_failed(self):
        batch_name = "BATCH_UNKNOWN_DEV"
        src_batch_dir = os.path.join(self.sim_n_img, batch_name)
        os.makedirs(src_batch_dir, exist_ok=True)

        fname = "20260909100001_LOTTEST-W01_X10Y20_S1_P1_OK_UNKNOWN999_300.bmp"
        src_file = os.path.join(src_batch_dir, fname)
        create_synthetic_bmp(src_file)

        moved = poll_source_transfer_once()
        assert moved == 0

        # File must remain untouched in source directory!
        assert os.path.exists(src_file)

        # No judgement file created in Drive N JUDGE
        judge_files = os.listdir(self.sim_n_judge)
        assert len(judge_files) == 0

    def test_drive_t_support_separated_by_machine(self):
        # Configure Machine Setting to use Drive T
        ACTIVE_MACHINE_SETTING["lot.source.folder"] = "T:\\WP288\\PMI\\IMAGE"
        ACTIVE_MACHINE_SETTING["machine.result.folder"] = "T:\\WP288\\PMI\\JUDGE"

        batch_name = "BATCH_DRIVE_T_TEST"
        src_t_batch = os.path.join(self.sim_t_img, batch_name)
        os.makedirs(src_t_batch, exist_ok=True)

        fname = "20260909100001_LOTTEST-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(src_t_batch, fname)
        create_synthetic_bmp(src_file)

        moved = poll_source_transfer_once()
        assert moved == 1

        # Moved from Drive T
        assert not os.path.exists(src_file)

        # Landed in Drive M PROCESSED
        expected_dest = os.path.join(self.sim_m_proc, batch_name, fname)
        assert os.path.exists(expected_dest)

    def test_drive_m_processed_permanent_retention(self):
        batch_name = "BATCH_RETENTION_TEST"
        src_batch_dir = os.path.join(self.sim_n_img, batch_name)
        os.makedirs(src_batch_dir, exist_ok=True)

        fname = "20260909100001_LOTRET-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(src_batch_dir, fname)
        create_synthetic_bmp(src_file)

        # Step 1: Poll will transfer from Source -> Drive M and enqueue to P0
        enqueued = poll_drive_m_once()
        assert enqueued == 1

        # File is now in Drive M
        dest_file = os.path.join(self.sim_m_proc, batch_name, fname)
        assert os.path.exists(dest_file)

        # Verify file is never deleted from Drive M after ingestion or processing
        assert os.path.exists(dest_file)

    def test_judge_file_single_latest_retention(self):
        """
        Verifies that generate_machine_judgement_file purges previous .txt files
        so only 1 single latest judgement file exists for Prober.
        """
        from main import generate_machine_judgement_file
        
        # Batch 1
        fname1, fpath1 = generate_machine_judgement_file("PASS", "00000000", "WP288", t_stamp="20260918100000")
        judge_files1 = [f for f in os.listdir(self.sim_n_judge) if f.endswith(".txt")]
        assert len(judge_files1) == 1
        assert fname1 in judge_files1

        # Batch 2 (completes later)
        fname2, fpath2 = generate_machine_judgement_file("FAIL", "02000000", "WP288", t_stamp="20260918100500")
        judge_files2 = [f for f in os.listdir(self.sim_n_judge) if f.endswith(".txt")]
        assert len(judge_files2) == 1, f"Expected exactly 1 file in JUDGE, found: {judge_files2}"
        assert fname2 in judge_files2
        assert fname1 not in judge_files2

    def test_transferred_file_mtime_touch_allows_immediate_ingestion(self):
        """
        Verifies that files with old historical timestamps have mtime touched
        upon moving to Drive M, ensuring they bypass baseline filters and get ingested.
        """
        from main import set_ingestion_baseline_mtime, get_ingestion_baseline_mtime
        
        batch_name = "BATCH_MTIME_TOUCH_TEST"
        src_batch_dir = os.path.join(self.sim_n_img, batch_name)
        os.makedirs(src_batch_dir, exist_ok=True)

        fname = "20260909100001_LOTMT-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(src_batch_dir, fname)
        create_synthetic_bmp(src_file)

        # Set an old historical mtime on source file (e.g. year 2020)
        os.utime(src_file, (1600000000.0, 1600000000.0))

        # Set baseline to something higher than the historical mtime
        set_ingestion_baseline_mtime(1700000000.0)

        # Transfer and ingest
        enqueued = poll_drive_m_once()
        assert enqueued == 1

        dest_file = os.path.join(self.sim_m_proc, batch_name, fname)
        assert os.path.exists(dest_file)
        # Verify mtime was touched to current time (> 1700000000.0)
        assert os.path.getmtime(dest_file) > 1700000000.0

    def test_output_folder_deletion_does_not_reprocess_processed_images(self):
        """
        Verifies Option 2: When an image has already been ingested/processed,
        deleting the OUTPUT folder on Drive M must NOT cause the system to
        re-enqueue or re-process the image from Drive M PROCESSED.
        """
        from main import P0_QUEUE, process_new_file, seen_ingested_files

        batch_name = "BATCH_OUTPUT_DEL_TEST"
        src_batch_dir = os.path.join(self.sim_n_img, batch_name)
        os.makedirs(src_batch_dir, exist_ok=True)

        fname = "20260909100001_LOTDEL-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
        src_file = os.path.join(src_batch_dir, fname)
        create_synthetic_bmp(src_file)

        # 1. First poll: Transferred from IMAGE -> PROCESSED and enqueued
        enqueued = poll_drive_m_once()
        assert enqueued == 1

        # Process the task to generate output
        dest_file = os.path.join(self.sim_m_proc, batch_name, fname)
        assert os.path.exists(dest_file)
        out_dir = os.path.join(self.sim_m_out, batch_name)
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, fname)
        create_synthetic_bmp(out_file)

        while not P0_QUEUE.empty():
            P0_QUEUE.get_nowait()
            P0_QUEUE.task_done()

        # 2. Simulate User deleting the OUTPUT directory
        shutil.rmtree(out_dir, ignore_errors=True)
        assert not os.path.exists(out_file)

        # 3. Poll again: PROCESSED image must NOT be re-enqueued
        enqueued_after_delete = poll_drive_m_once()
        assert enqueued_after_delete == 0, "Image was re-enqueued after OUTPUT directory was deleted!"
        assert P0_QUEUE.empty()


