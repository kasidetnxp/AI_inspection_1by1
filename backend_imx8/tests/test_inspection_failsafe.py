import os
import sys
import tempfile
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
    process_new_file,
    lot_tracker,
    ACTIVE_MACHINE_SETTING,
    seen_files_lock,
    seen_ingested_files,
    current_batch_records,
)
from core.src.rules.inspection import run_inspection


def create_dummy_bmp(path: str, width: int = 160, height: int = 160):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img = np.ones((height, width, 3), dtype=np.uint8) * 128
    cv2.imwrite(path, img)


class TestInspectionFailSafe:

    def test_unreadable_image_in_rule_engine_returns_fail_report(self):
        """Verify that when an image cannot be read, run_inspection returns a FAIL report, not empty."""
        non_existent_path = "/tmp/definitely_not_a_real_image_12345.bmp"
        results = [{
            "image_path": non_existent_path,
            "pads": [],
            "probemarks": [],
            "grains": []
        }]
        report = run_inspection(results, config_path={"missing_mark_action": "fail"})
        assert len(report) == 1
        assert report[0]["decision"] == "FAIL"
        assert "Corrupted or Unreadable Image" in report[0]["reason"]

    def test_missing_probe_mark_is_strict_fail(self):
        """Verify missing probe mark yields FAIL and never WARNING."""
        with tempfile.NamedTemporaryFile(suffix=".bmp", delete=False) as f:
            temp_path = f.name
        try:
            create_dummy_bmp(temp_path)
            # 1 pad, 0 probemarks
            pad_poly = np.array([[20, 20], [80, 20], [80, 80], [20, 80]], dtype=np.int32)
            results = [{
                "image_path": temp_path,
                "pads": [pad_poly],
                "probemarks": [],
                "grains": []
            }]
            report = run_inspection(results, config_path={"missing_mark_action": "fail"})
            assert len(report) == 1
            assert report[0]["decision"] == "FAIL"
            assert "No probemark detected on pad" in report[0]["reason"]
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_close_to_edge_is_strict_fail(self):
        """Verify probemark close to edge yields FAIL and never WARNING."""
        with tempfile.NamedTemporaryFile(suffix=".bmp", delete=False) as f:
            temp_path = f.name
        try:
            create_dummy_bmp(temp_path)
            # Pad from (20,20) to (80,80)
            pad_poly = np.array([[20, 20], [80, 20], [80, 80], [20, 80]], dtype=np.int32)
            # Probemark very close to edge (x=21)
            pm_poly = np.array([[21, 30], [25, 30], [25, 35], [21, 35]], dtype=np.int32)
            results = [{
                "image_path": temp_path,
                "pads": [pad_poly],
                "probemarks": [pm_poly],
                "grains": []
            }]
            report = run_inspection(results, config_path={"fail_distance_um": 8.0})
            assert len(report) == 1
            assert report[0]["decision"] == "FAIL"
            assert "Probemark too close to edge" in report[0]["reason"]
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def test_process_new_file_ai_error_fails_safe(self, monkeypatch):
        """Verify that when AI inference fails, decision is strictly FAIL with STOP MACHINE."""
        test_root = tempfile.mkdtemp(prefix="imx8_test_fs_")
        try:
            drive_m_dir = os.path.join(test_root, "drive_M", "WP288", "PMI")
            lot_name = "LOT_FAILSAFE_TEST"
            proc_dir = os.path.join(drive_m_dir, "PROCESSED", lot_name)
            os.makedirs(proc_dir, exist_ok=True)

            fname = "20260909100001_LOTFAILSAFE-W01_X10Y20_S1_P1_OK_TF1581_300.bmp"
            src_path = os.path.join(proc_dir, fname)
            create_dummy_bmp(src_path)

            ACTIVE_MACHINE_SETTING["lot.input.folder"] = os.path.join(drive_m_dir, "PROCESSED", "{output.lotNo}")
            ACTIVE_MACHINE_SETTING["lot.output.folder"] = os.path.join(drive_m_dir, "OUTPUT", "{output.lotNo}")

            with seen_files_lock:
                seen_ingested_files.clear()
            lot_tracker.clear()
            current_batch_records.clear()

            # Break tflite_runner infer method
            if main.tflite_runner is not None:
                monkeypatch.setattr(main.tflite_runner, "infer", lambda *args: (_ for _ in ()).throw(RuntimeError("NPU crash")))

            # Also force fallback to fail if reached
            monkeypatch.setattr(main, "tflite_model_path", "/nonexistent/model.tflite")

            process_new_file(src_path, fname, lot_no=lot_name)

            rec = lot_tracker[lot_name]["records"][0]
            assert rec["decision"] == "FAIL"
            assert rec["machineAction"] == "STOP MACHINE"
        finally:
            shutil.rmtree(test_root, ignore_errors=True)

    def test_pad_boundary_does_not_bulge_around_edge_defect(self):
        """
        Verify that when a defect lies on or outside the right edge of a pad,
        the pad polygon maintains its true straight boundary and does not bulge outwards.
        """
        with tempfile.NamedTemporaryFile(suffix=".bmp", delete=False) as f:
            temp_path = f.name
        try:
            create_dummy_bmp(temp_path, width=200, height=200)
            # Rectangular pad from x=30 to x=100, y=30 to y=100 (right boundary at x=100)
            pad_poly = np.array([[30, 30], [100, 30], [100, 100], [30, 100]], dtype=np.int32)
            # Defect on the right border sticking out to x=120 (well beyond x=100)
            defect_pm = np.array([[95, 50], [120, 50], [120, 70], [95, 70]], dtype=np.int32)

            results = [{
                "image_path": temp_path,
                "pads": [pad_poly],
                "probemarks": [defect_pm],
                "grains": []
            }]
            report = run_inspection(results, config_path={"fail_distance_um": 8.0})
            assert len(report) == 1
            # Must still detect defect and FAIL
            assert report[0]["decision"] == "FAIL"
            # Visual inspection canvas must exist
            assert report[0]["viz_path"] is not None
            assert os.path.exists(report[0]["viz_path"])
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
