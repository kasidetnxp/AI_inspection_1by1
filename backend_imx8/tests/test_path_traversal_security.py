import os
import sys
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from main import (
    app,
    sanitize_safe_filename,
    is_safe_target_path,
    save_model_recipe_bindings,
    save_config_registry,
    RECIPES_DIR,
    MACHINES_DIR,
    MODELS_DIR
)


class TestPathTraversalSecurity:
    """Security verification test suite for Fix Priority #2 (P0-1, P0-2)."""

    def test_sanitize_safe_filename_basic(self):
        assert sanitize_safe_filename("Product_Setting.txt") == "Product_Setting.txt"
        assert sanitize_safe_filename("model_v1.tflite") == "model_v1.tflite"

    def test_sanitize_safe_filename_strips_traversal(self):
        # Traversal attempts must have directory components stripped
        assert sanitize_safe_filename("../../../../etc/passwd") == "passwd"
        assert sanitize_safe_filename("..\\..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"
        assert sanitize_safe_filename("/var/log/syslog") == "syslog"

    def test_sanitize_safe_filename_rejects_empty_and_dots(self):
        with pytest.raises(HTTPException) as exc1:
            sanitize_safe_filename("")
        assert exc1.value.status_code == 400

        with pytest.raises(HTTPException) as exc2:
            sanitize_safe_filename("..")
        assert exc2.value.status_code == 400

        with pytest.raises(HTTPException) as exc3:
            sanitize_safe_filename(".")
        assert exc3.value.status_code == 400

    def test_sanitize_safe_filename_enforces_allowed_extensions(self):
        # Allowed extension passes
        assert sanitize_safe_filename("recipe.json", allowed_extensions=[".json", ".txt"]) == "recipe.json"
        assert sanitize_safe_filename("recipe.TXT", allowed_extensions=[".json", ".txt"]) == "recipe.TXT"

        # Disallowed extension rejected with 400
        with pytest.raises(HTTPException) as exc:
            sanitize_safe_filename("evil_script.sh", allowed_extensions=[".json", ".txt"])
        assert exc.value.status_code == 400
        assert "not allowed" in exc.value.detail

    def test_is_safe_target_path(self, tmp_path):
        base_dir = str(tmp_path / "sandbox")
        os.makedirs(base_dir, exist_ok=True)

        inside_path = os.path.join(base_dir, "test.txt")
        assert is_safe_target_path(base_dir, inside_path) is True

        outside_path = os.path.join(base_dir, "..", "escape.txt")
        assert is_safe_target_path(base_dir, outside_path) is False

        system_path = "/etc/passwd"
        assert is_safe_target_path(base_dir, system_path) is False

    def test_save_model_recipe_bindings_defined(self):
        # Verify Fix Priority #3 (P0-6): save_model_recipe_bindings must be callable without NameError
        assert callable(save_model_recipe_bindings)
        # Test executing it with dummy dict
        save_model_recipe_bindings({"test": 123})

    def test_delete_config_endpoint_rejects_traversal(self):
        client = TestClient(app)
        # Attempting path traversal should be safely caught
        resp = client.delete("/api/config/product/../../../../etc/passwd")
        # Should return 400 (extension not allowed) or 404 (file not found in recipes), never 500 or deleting /etc/passwd
        assert resp.status_code in (400, 404)

        # Attempting invalid config_type
        resp_type = client.delete("/api/config/malicious/file.txt")
        assert resp_type.status_code == 400
        assert "Invalid config type" in resp_type.json()["detail"]

    def test_delete_models_endpoint_rejects_disallowed_extension(self):
        client = TestClient(app)
        resp = client.delete("/api/models/main.py")
        assert resp.status_code == 400
        assert "not allowed" in resp.json()["detail"]

    def test_upload_product_config_safe_path(self):
        client = TestClient(app)
        file_content = b'{"test_key": "safe_val"}'
        files = {"file": ("../../../../tmp_test_recipe.json", file_content, "application/json")}
        resp = client.post("/api/config/upload-product", files=files)
        assert resp.status_code == 200
        # Check that file was saved inside RECIPES_DIR as tmp_test_recipe.json and NOT in root
        expected_path = os.path.join(RECIPES_DIR, "tmp_test_recipe.json")
        assert os.path.exists(expected_path)
        # Cleanup
        try:
            os.remove(expected_path)
        except Exception:
            pass
