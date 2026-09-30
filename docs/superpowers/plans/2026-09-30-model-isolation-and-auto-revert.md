# Model Isolation, Dual Runner & Auto-Revert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate the Benchmark/Validation model runner from the Live Production inspection pipeline on i.MX8, ensuring that testing models never overrides production inspection, and the hardware runtime automatically reverts to the production model immediately when testing ends or when live factory frames arrive.

**Architecture:** Introduce a unified `ModelContextManager` in `backend_imx8` that separates the runtime instances into `production_runner` and `benchmark_runner`. When a benchmark run starts (P1), it loads the test model into `benchmark_runner` under thread-safe inference locks. When the benchmark finishes or stops, an auto-revert routine restores the active production model to the hardware. When live camera images (P0) arrive, a runtime guard strictly ensures the inference engine executes the production model, preventing any test model contamination.

**Tech Stack:** Python 3.10+, FastAPI, TensorFlow Lite Runtime (`tflite_runtime.interpreter`), VeriSilicon Vivante NPU Delegate (`libvx_delegate.so`), React 19, WebSocket.

**Spec:** `docs/superpowers/plans/2026-09-30-model-isolation-and-auto-revert.md`

## Global Constraints

- Never break or delay real-time factory camera inspection (P0 production latency < 200 ms).
- Preserve hardware safety on NXP i.MX8 Plus: NPU delegate (`libvx_delegate.so`) cannot run concurrent inferences; all inferences must synchronize through `inference_lock`.
- Production model configuration must always match `backend_imx8/configs/model_recipe_bindings.json` and `active_model_info.json`.
- Do not execute this plan until explicitly requested by the user.

---

### Task 1: Create `ModelContextManager` for Isolated Production & Benchmark Execution

**Files:**
- Create: `backend_imx8/model_manager.py`
- Test: `backend_imx8/tests/test_model_manager.py`

**Interfaces:**
- Consumes: `run_unet_tflite_folder.ModelRunner`
- Produces:
  - `ModelContextManager.get_production_runner() -> ModelRunner`
  - `ModelContextManager.get_benchmark_runner(model_path: str) -> ModelRunner`
  - `ModelContextManager.revert_to_production() -> None`
  - `ModelContextManager.get_status() -> dict`

- [ ] **Step 1: Write the failing unit test**

Create `backend_imx8/tests/test_model_manager.py`:
```python
import os
import pytest
from unittest.mock import MagicMock, patch
from model_manager import ModelContextManager

def test_model_context_manager_isolation():
    manager = ModelContextManager()
    
    with patch("model_manager.ModelRunner") as mock_runner:
        mock_prod = MagicMock()
        mock_bench = MagicMock()
        mock_runner.side_effect = [mock_prod, mock_bench]
        
        # 1. Initialize production runner
        prod_runner = manager.get_production_runner(prod_path="models/unet.tflite")
        assert prod_runner == mock_prod
        assert manager.get_active_production_path() == "models/unet.tflite"
        
        # 2. Benchmark model loads separately
        bench_runner = manager.get_benchmark_runner(bench_path="models/test_model.tflite")
        assert bench_runner == mock_bench
        assert manager.is_benchmark_active() is True
        
        # 3. Production runner remains intact and untouched
        assert manager.get_production_runner(prod_path="models/unet.tflite") == mock_prod
        
        # 4. Reverting benchmark cleans up benchmark context
        manager.revert_to_production()
        assert manager.is_benchmark_active() is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest backend_imx8/tests/test_model_manager.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'model_manager'`

- [ ] **Step 3: Implement `ModelContextManager`**

Create `backend_imx8/model_manager.py`:
```python
import os
import time
import threading
from typing import Optional, Dict, Any
from run_unet_tflite_folder import ModelRunner

class ModelContextManager:
    """
    Manages TFLite/ONNX inference runners with strict isolation
    between live factory production (P0) and model validation labs (P1).
    """
    def __init__(self):
        self._lock = threading.Lock()
        self._prod_runner: Optional[ModelRunner] = None
        self._prod_path: Optional[str] = None
        
        self._bench_runner: Optional[ModelRunner] = None
        self._bench_path: Optional[str] = None
        self._is_benchmark_active: bool = False
        self._last_loaded_time: float = 0.0

    def get_production_runner(self, prod_path: str) -> ModelRunner:
        with self._lock:
            if self._prod_runner is None or self._prod_path != prod_path:
                print(f"[MODEL_MANAGER] 🚀 Loading Production Model: {prod_path}")
                self._prod_runner = ModelRunner(prod_path)
                self._prod_path = prod_path
                self._last_loaded_time = time.time()
            return self._prod_runner

    def get_benchmark_runner(self, bench_path: str) -> ModelRunner:
        with self._lock:
            if self._bench_runner is None or self._bench_path != bench_path:
                print(f"[MODEL_MANAGER] 🔬 Loading Benchmark Test Model: {bench_path}")
                self._bench_runner = ModelRunner(bench_path)
                self._bench_path = bench_path
            self._is_benchmark_active = True
            return self._bench_runner

    def revert_to_production(self) -> None:
        """Cleans up benchmark instance and ensures production model is ready."""
        with self._lock:
            print("[MODEL_MANAGER] 🔄 Auto-reverting runtime to Production Model...")
            self._bench_runner = None
            self._bench_path = None
            self._is_benchmark_active = False

    def is_benchmark_active(self) -> bool:
        return self._is_benchmark_active

    def get_active_production_path(self) -> Optional[str]:
        return self._prod_path

    def get_status(self) -> Dict[str, Any]:
        return {
            "production_model": os.path.basename(self._prod_path) if self._prod_path else None,
            "benchmark_model": os.path.basename(self._bench_path) if self._bench_path else None,
            "is_benchmark_active": self._is_benchmark_active,
            "last_loaded": self._last_loaded_time
        }

model_context_manager = ModelContextManager()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest backend_imx8/tests/test_model_manager.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend_imx8/model_manager.py backend_imx8/tests/test_model_manager.py
git commit -m "feat(backend_imx8): add ModelContextManager for production and benchmark runner isolation"
```

---

### Task 2: Connect `ModelContextManager` to P0 Production Inspection

**Files:**
- Modify: `backend_imx8/main.py:1520-1610`
- Test: `backend_imx8/tests/test_p0_production_guard.py`

**Interfaces:**
- Consumes: `model_context_manager.get_production_runner(target_path)`
- Produces: Production inference strictly isolated from any benchmark run.

- [ ] **Step 1: Write integration test for P0 Production Guard**

Create `backend_imx8/tests/test_p0_production_guard.py`:
```python
from unittest.mock import patch, MagicMock
from model_manager import model_context_manager

def test_production_guard_always_uses_production_path():
    with patch("model_manager.ModelRunner") as mock_runner:
        mock_instance = MagicMock()
        mock_runner.return_value = mock_instance
        
        # Set benchmark active
        model_context_manager.get_benchmark_runner("models/test.tflite")
        assert model_context_manager.is_benchmark_active() is True
        
        # When production demands runner, it receives its own production runner
        prod = model_context_manager.get_production_runner("models/active_model.tflite")
        assert model_context_manager.get_active_production_path() == "models/active_model.tflite"
```

- [ ] **Step 2: Update `process_new_file` in `backend_imx8/main.py`**

In `backend_imx8/main.py`, replace direct reliance on global `tflite_runner` inside `process_new_file`:
```python
    # 1. Resolve Production Model via ModelContextManager
    prod_model_path = resolve_active_production_model_path()
    runner = model_context_manager.get_production_runner(prod_model_path)
    
    if not is_corrupt and runner is not None:
        try:
            from run_unet_tflite_folder import preprocess_image, postprocess_unet
            input_details = runner.get_input_details()
            output_details = runner.get_output_details()
            input_data, meta = preprocess_image(img_cv, input_details[0])
            t_start = time.time()
            with inference_lock:
                output_tensor = runner.infer(input_data)
            inf_time = round((time.time() - t_start) * 1000, 1)
            # ... process contours
```

- [ ] **Step 3: Run integration test**

Run: `python3 -m pytest backend_imx8/tests/test_p0_production_guard.py -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend_imx8/main.py backend_imx8/tests/test_p0_production_guard.py
git commit -m "refactor(backend_imx8): guard P0 factory inspection with isolated production runner"
```

---

### Task 3: Update P1 Benchmark Worker with Auto-Revert on Completion

**Files:**
- Modify: `backend_imx8/main.py:2170-2260`
- Modify: `backend_imx8/main.py:2910-2945`
- Test: `backend_imx8/tests/test_benchmark_auto_revert.py`

**Interfaces:**
- Consumes: `model_context_manager.get_benchmark_runner()`, `model_context_manager.revert_to_production()`
- Produces: Benchmark worker uses benchmark runner; triggers `revert_to_production()` on `COMPLETED` or `STOPPED`.

- [ ] **Step 1: Write test for benchmark completion auto-revert**

Create `backend_imx8/tests/test_benchmark_auto_revert.py`:
```python
from unittest.mock import patch, MagicMock
from model_manager import model_context_manager

def test_benchmark_auto_revert_flow():
    with patch("model_manager.ModelRunner"):
        # 1. Benchmark runs
        model_context_manager.get_benchmark_runner("models/candidate.tflite")
        assert model_context_manager.is_benchmark_active() is True
        
        # 2. Benchmark completes -> triggers revert
        model_context_manager.revert_to_production()
        assert model_context_manager.is_benchmark_active() is False
        assert model_context_manager.get_status()["benchmark_model"] is None
```

- [ ] **Step 2: Update `process_benchmark_image` in `backend_imx8/main.py`**

In `backend_imx8/main.py` line 2253:
```python
        if is_tflite:
            try:
                from run_unet_tflite_folder import preprocess_image, postprocess_unet
                bench_runner = model_context_manager.get_benchmark_runner(model_path)
                out_details = bench_runner.get_output_details()
                input_details = bench_runner.get_input_details()
                input_data, meta = preprocess_image(img_cv, input_details[0])
                with inference_lock:
                    output_tensor = bench_runner.infer(input_data)
                inf_time = round((time.time() - t_start) * 1000, 1)
```

- [ ] **Step 3: Trigger `revert_to_production()` in priority dispatcher completion hooks**

In `backend_imx8/main.py` lines 2912 & 2931:
```python
                if P1_QUEUE.qsize() == 0:
                    sess_id = priority_dispatcher_state.get("active_session_id")
                    # Revert runtime back to production model
                    model_context_manager.revert_to_production()
                    if priority_dispatcher_state.get("status") == "STOPPED":
                        # ... finalize STOPPED
```

- [ ] **Step 4: Run tests**

Run: `python3 -m pytest backend_imx8/tests/test_benchmark_auto_revert.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend_imx8/main.py backend_imx8/tests/test_benchmark_auto_revert.py
git commit -m "feat(backend_imx8): auto-revert to production model on benchmark completion or stop"
```

---

### Task 4: Add Backend Status Endpoint & Broadcast Events

**Files:**
- Modify: `backend_imx8/main.py:4300-4350`
- Test: `curl -s http://localhost:8001/api/models/runner-status | jq .`

**Interfaces:**
- Produces: `GET /api/models/runner-status` returning:
  `{ "production_model": "unet_pytorch_new.tflite", "benchmark_model": null, "is_benchmark_active": false }`
- WebSocket event: `MODEL_RUNNER_STATUS_CHANGED`

- [ ] **Step 1: Add `/api/models/runner-status` endpoint in `backend_imx8/main.py`**

```python
@app.get("/api/models/runner-status")
def get_model_runner_status():
    return {
        "status": "success",
        "data": model_context_manager.get_status()
    }
```

- [ ] **Step 2: Test endpoint with curl**

Run: `curl -s http://localhost:8001/api/models/runner-status`
Expected output:
```json
{"status":"success","data":{"production_model":"unet_pytorch_new.tflite","benchmark_model":null,"is_benchmark_active":false}}
```

- [ ] **Step 3: Commit**

```bash
git add backend_imx8/main.py
git commit -m "feat(backend_imx8): add /api/models/runner-status endpoint"
```

---

### Task 5: Add Frontend Visual Indicators for NPU Status & Auto-Revert

**Files:**
- Modify: `frontend/src/context/InspectionContext.jsx`
- Modify: `frontend/src/pages/ModelsPage.jsx`
- Modify: `frontend/src/components/ModelTestingSubTab.jsx`

**Interfaces:**
- Consumes: WebSocket `BENCHMARK_PROGRESS`, `MODEL_RUNNER_STATUS_CHANGED`
- Produces: Visual toast / badge showing:
  - `[NPU: Active - unet_pytorch_new.tflite]`
  - `[NPU: Testing - candidate.tflite (Temporary)]`
  - `[NPU: Auto-reverted to unet_pytorch_new.tflite]`

- [ ] **Step 1: Update `InspectionContext.jsx` to listen for runner status**

In `InspectionContext.jsx`:
- Add state: `const [modelRunnerStatus, setModelRunnerStatus] = useState({ production_model: "", benchmark_model: null, is_benchmark_active: false });`
- Listen for `MODEL_RUNNER_STATUS_CHANGED` in WebSocket handler and update state.

- [ ] **Step 2: Add visual badge in `ModelTestingSubTab.jsx`**

Render status chip above benchmark controls:
```jsx
<div className="runner-status-chip">
  <span className="dot dot-active"></span>
  <span>Production Guard: <strong>{modelRunnerStatus.production_model}</strong></span>
  {modelRunnerStatus.is_benchmark_active && (
    <span className="badge-testing">Testing: {modelRunnerStatus.benchmark_model} (Auto-Reverts on Finish)</span>
  )}
</div>
```

- [ ] **Step 3: Build frontend and verify**

Run: `npm --prefix frontend run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/InspectionContext.jsx frontend/src/pages/ModelsPage.jsx
git commit -m "feat(frontend): display active NPU runner status and auto-revert indicator"
```

---

### Task 6: End-to-End Verification of Model Isolation & Auto-Revert

**Files:**
- Create: `backend_imx8/tests/e2e_model_isolation_test.py`

- [ ] **Step 1: Write E2E simulation script**

```python
import time
import requests

BASE_URL = "http://localhost:8001"

def test_e2e_isolation():
    # 1. Verify initial status
    r = requests.get(f"{BASE_URL}/api/models/runner-status").json()
    assert r["data"]["is_benchmark_active"] is False
    prod_model = r["data"]["production_model"]

    # 2. Trigger benchmark on alternate model
    bench_payload = {
        "model_name": "best_converter.tflite",
        "dataset_key": "good_wafers",
        "limit": 5
    }
    r = requests.post(f"{BASE_URL}/api/benchmark/start", json=bench_payload).json()
    assert r["status"] == "success"

    # Wait for completion
    time.sleep(3)

    # 3. Verify auto-revert occurred
    r_after = requests.get(f"{BASE_URL}/api/models/runner-status").json()
    assert r_after["data"]["is_benchmark_active"] is False
    assert r_after["data"]["production_model"] == prod_model
    print("✅ E2E Model Isolation & Auto-Revert successfully verified!")

if __name__ == "__main__":
    test_e2e_isolation()
```

- [ ] **Step 2: Execute test script**

Run: `python3 backend_imx8/tests/e2e_model_isolation_test.py`
Expected: `✅ E2E Model Isolation & Auto-Revert successfully verified!`

- [ ] **Step 3: Final Commit**

```bash
git add backend_imx8/tests/e2e_model_isolation_test.py
git commit -m "test(backend_imx8): add e2e verification script for model isolation and auto-revert"
```
