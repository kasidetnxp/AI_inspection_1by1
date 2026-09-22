# Kuy_PanPan — Code Audit Report

**Date:** 2026-09-18
**Scope:** Full audit of `/media/nxp1/Data/Kuy_PanPan` (i.MX8 edge-AI wafer/probe-mark inspection backend)
**Method:** Full read of all source files + dependency cross-check via Context7 (FastAPI, opencv-python docs)
**Mode:** Read-only. No files modified.

---

## Files audited

| File | Lines | Status |
|---|---|---|
| `main.py` | 4786 | Fully read |
| `run_unet_tflite_folder.py` | 503 | Fully read |
| `core/src/rules/inspection.py` | 782 | Fully read |
| `core/src/unet/predict.py`, `model.py`, `core/src/utils/config.py` | — | Read |
| `setup_autostart_imx8.sh`, `mount_prober_shares.sh` | — | Read |
| `tests/test_source_transfer.py`, `tests/test_audit_log.py`, `tests/test_pipeline_flow.py` | — | Read |
| `requirements.txt`, `config.yaml`, `configs/*`, `models/active_model_info.json` | — | Read |

---

# P0 — Security

## 1. Arbitrary file deletion via `:path` route converter
**`main.py:3496`** — `@app.delete("/api/config/{config_type}/{filename:path}")`
**`main.py:4005`** — `@app.delete("/api/models/{filename:path}")`

Starlette's `:path` converter accepts `/`. The handlers do `os.path.join(base_dir, filename)` then `os.remove(...)`.
Any client can craft a path like `../../../../etc/cron.d/evil` to delete arbitrary files on the host.
**Fix:** `filename = os.path.basename(filename)`, reject `..`, allowlist extensions.

## 2. Path-traversal writes on all upload endpoints
**`main.py:3381`, `3418`, `3898`** — `os.path.join(RECIPES_DIR | MACHINES_DIR | MODELS_DIR, file.filename)`
**`main.py:3819`, `3834`** — `deploy_active_model`: `os.path.join(RECIPES_DIR, recipe_name)` / `os.path.join(MACHINES_DIR, machine_config_name)` (both user-controlled request bodies)
**`main.py:4291`** — `upload_benchmark_images`: `os.path.join(upload_dir, f.filename)` (not basenamed; the zip path at 4278 IS basenamed and safe)
**`main.py:2178`** — benchmark session dir built from `payload.get("session_id")` (see `start_benchmark`, `main.py:4183`)

Context7 verification: FastAPI docs define `UploadFile.filename` as "The original file name" — client-controlled, no sanitization promise. Multipart filenames of `..%2f..%2f..` write files anywhere the process can write. Service runs as **root** (see §3) → arbitrary root file overwrite.
**Fix:** `os.path.basename()` on every user-supplied filename; validate session_id against `^[A-Za-z0-9_-]+$`.

## 3. No authentication + CORS `*` + root user + LAN-wide bind
**`main.py:587`** — `CORSMiddleware(allow_origins=["*"], ...)`
**`setup_autostart_imx8.sh:41,43`** — `User=root`, `--host 0.0.0.0 --port 8001`

Zero auth on any endpoint. Combined with §1/§2: any device on the factory LAN can delete models/recipes, swap the active model, and stop/start the machine line.
**Fix:** at minimum a static bearer token middleware + `allow_origins` restricted to the HMI host; non-root service user; bind to the specific NIC if possible.

## 4. CIFS password on the command line
**`mount_prober_shares.sh:21`** — `MOUNT_OPTS="...password=$SMB_PASS"`; also echoed to console at line 30.
Visible to all local users via `ps aux` / `/proc/<pid>/cmdline`.
**Fix:** `credentials=/etc/cifs-creds` file (chmod 600) instead of `-o password=...`.

## 5. `torch.load(..., weights_only=False)` — pickle deserialization
**`main.py:1510`, `1534`, `2147`**

Model weights are read from the shared Drive M / models directory. A tampered or swapped `.pt` file executes arbitrary code at load time.
**Fix:** `weights_only=True` (PyTorch ≥2.6), or migrate fully to TFLite/ONNX.

---

# P0 — Hard Crashes (app cannot run / cannot be deployed)

## 6. `save_model_recipe_bindings` is called but never defined
**Called:** `main.py:3517` (config delete) and `main.py:4043` (model delete)
**Defined:** never. Grep confirms only `def save_config_registry` exists (`main.py:361`).

`NameError` on every recipe or model deletion that has bindings — the delete endpoint 500s.
**Fix:** define `save_model_recipe_bindings` or call the existing `save_config_registry`.

## 7. Entire pipeline test suite broken at import
**`tests/test_pipeline_flow.py:22`** — `from backend_imx8.main import (app, ...)`

No `backend_imx8` package exists anywhere in the repo (verified: `main.py` sits at repo root; no `__init__.py`; no `backend_imx8` directory in project or parent). The whole 1378-line suite dies with `ModuleNotFoundError` before a single test runs.
**Fix:** change to `import main` (sys.path is already prepared at lines 13–20).

## 8. `requirements.txt` missing every ML/database dependency
`requirements.txt` (6 lines): `fastapi, uvicorn, numpy, opencv-python-headless, pyyaml, psutil`.
Actually imported by the code:

| Missing package | Where used |
|---|---|
| `matplotlib` | `main.py:15` — **unconditional top-level import = ImportError, app never boots on clean install** |
| `torch` | `main.py:1510/1534/2147`, PyTorch UNet fallback |
| `tflite-runtime` (or `tensorflow`) | primary inference path (`main.py` TFLite runner) |
| `onnxruntime` | ONNX inference path |
| `ultralytics` | YOLO fallback |
| `psycopg2` | Postgres audit/persistence path + `tests/test_audit_log.py` |

A clean i.MX8 deployment from this requirements file cannot start the service at all.
**Fix:** add all six; or make matplotlib/torch/psycopg2 lazy imports with graceful fallback.

## 9. Setup script swallows dependency-install failure
**`setup_autostart_imx8.sh:25`** — `pip3 install -r requirements.txt --quiet || true`

Install fails → service still starts → crashes on import → `Restart=always` crash-loops invisibly.
**Fix:** drop `|| true`, let the script abort on failure.

---

# P1 — Correctness / Logic Bugs

## 10. Silent PASS when inspection fails (safety-critical)
**`main.py:1574–1586`** — AI inference exception is caught; `pads`/`marks` left empty; if `has_actual_rules` is False, `decision` stays at its default `"PASS"`.
**`core/src/rules/inspection.py:292–294`** — unreadable image → `continue` → zero results → upstream reads an empty report as pass.

A dead camera, corrupt BMP, or model failure produces **PASS**, not FAIL. On a wafer probe line this is the worst failure mode.
**Fix:** any inference exception, or zero-detection when detection is expected, must yield FAIL (or HOLD) — never PASS.

## 11. WARNING flattened to FAIL
**`main.py:1650`** — `if raw_dec != "PASS": decision = "FAIL"`

The rule engine distinguishes PASS / WARNING / FAIL (see `inspection.py:490–504, 584–600`), and `core/configs/inspection_rules.yaml` sets `missing_mark_action: "warning"`. The backend discards WARNING and stops the machine anyway — contradicting the configured intent.
**Fix:** map WARNING → dedicated warning verdict (log + report, machine continues).

## 12. Double batch-completion race (END signal vs idle timeout)
**`main.py:1353–1363`** (`check_idle_batch_completions`) vs **`main.py:1806`** (`.END` signal path)

`is_completed` is checked *outside* the lock, then `complete_batch_for_lot` (`main.py:1254–1324`) runs. Both threads can pass the check concurrently. `generate_machine_judgement_file` first purges existing judge files (`main.py:1193–1203`) — the losing thread deletes the winner's just-written verdict file. Prober ends up with no (or stale) judge TXT.
**Fix:** re-check `is_completed` inside `batch_lock`; make purge+write a single critical section.

## 13. TFLite runner hot-swap race
**`main.py:1420–1425`** — `tflite_runner` global read + `get_input_details()` happen *before* `inference_lock` is acquired, while deploy/activate replaces the runner *under* the lock. An in-flight inference can hold a stale runner. NPU (VX) delegates are not documented as thread-safe (no Context7 library for `tflite-runtime` exists; vendor docs must be the reference).
**Fix:** read the runner reference inside the lock.

## 14. Non-atomic counters / lost benchmark accounting
- `main.py:1390` — `inspection_count += 1` from multiple worker threads (read-modify-write, not atomic).
- `main.py:4649–4687` (`stop_benchmark`) — drains P1 queue but never increments `p1_processed` for drained items; the in-flight P1 task is not interrupted, so it still writes results after stop.

## 15. Arbitrary seen-files cache eviction
**`main.py:475–483`** — `save_seen_ingested_files` keeps `list(seen_set)[-50000:]`. Set hash order is arbitrary, so "last 50000" evicts random *recent* files. After 50k ingested files, a previously-processed wafer image can be re-ingested (double-charge / duplicate output).
**Fix:** persist as a JSON-lines log or use an LRU keyed on insertion order (`collections.OrderedDict`).

## 16. Duplicated function definitions
- `main.py:1983–1985` — `update_benchmark_session_progress` defined twice; first definition is dead code.
- `run_unet_tflite_folder.py:39` and `:124` — `sigmoid` defined twice; the clipped version silently shadows the plain one.

## 17. Hardcoded warmup shape
**`main.py:3851`, `3955`** — `np.zeros((1, 640, 640, 3))` dummy warmup. Active model (`unet_pytorch_new.tflite`, 160×160 pipeline per `inspection_rules.yaml` target_width/height 160) takes a different input shape. Warmup either fails silently or warms the wrong allocation path on NPU.
**Fix:** read input shape from `interpreter.get_input_details()` and build the warmup tensor from that.

## 18. Fabricated / hardcoded telemetry
- `main.py:1737–1738` — `padsTotal: 1, padsDetected: 1` hardcoded in the per-image record.
- `main.py:4736` — `get_thermal_temperature()` returns a fabricated `45.0` fallback presented as a real sensor reading.
- `main.py:4736`-adjacent: no actual NPU/SoC thermal source wired in.

## 19. Deprecated FastAPI API
**`main.py:2942`** — `@app.on_event("startup")`.
Context7 confirms (`fastapi.tiangolo.com/advanced/events`): `on_event` is **deprecated**; use the `lifespan` context manager. Works today, breaks on a future FastAPI major.
**Fix:** convert to `@asynccontextmanager` lifespan.

## 20. 2-class model label-mapping risk
**`run_unet_tflite_folder.py:128–164`** — for 2-class models only the class-1 mask is produced. `main.py` maps class_ids `[0]` to `pads`. Depending on the class convention baked into each deployed `.tflite`, probemark pixels may land in `pads` instead of `mark_polys`.
**Fix:** add a per-model `class_id_map` to `models/active_model_info.json` and validate against one known-good image per model before deploy.

---

# P2 — Dependency Analysis (Context7-verified)

Declared (`requirements.txt`) vs actual usage:

| Dependency | Declared | Finding |
|---|---|---|
| `fastapi>=0.100.0` | ✓ | `on_event` deprecated (P1-19); `:path` and `UploadFile.filename` are unsanitized by design — code must sanitize (P0-1, P0-2). Context7: `filename` = "The original file name" (client-controlled). |
| `numpy>=1.22.0` | ✓ | Context7 (opencv-python repo, `pyproject.toml`): wheels for Python ≥3.9 are **built against numpy 2.x** (`numpy>=2` runtime constraint). A fresh install resolves numpy 2.x — OK. But the i.MX8 offline image likely carries numpy 1.x + an old opencv 4.5.x wheel → ABI mismatch risk. Pin the pair: `numpy>=1.26` + `opencv-python-headless>=4.10`. |
| `opencv-python-headless>=4.5.0` | ✓ | 4.5.x wheels predate the numpy-2 ABI. See above. Code usage (imread/imwrite/distanceTransform/contourArea) is standard and version-safe. |
| `uvicorn>=0.20.0` | ✓ | Used via `python -m uvicorn main:app`. Fine. |
| `pyyaml>=6.0` | ✓ | `load_config` fallback parser (`run_unet_tflite_folder.py:442–464`) only handles **flat** keys — nested YAML (`ai.model_path`, `paths.*`) is silently lost if the fallback path ever triggers. |
| `psutil>=5.9.0` | ✓ | Fine. |
| `torch` | ✗ missing | P0-8. Also `weights_only=False` pickle risk (P0-5). |
| `matplotlib` | ✗ missing | P0-8 — unconditional import, boot crash. |
| `psycopg2` | ✗ missing | P0-8. Also hardcoded `postgres`/`postgres` creds at `main.py:65–71` and `tests/test_audit_log.py:8–11`. |
| `tflite-runtime` | ✗ missing | P0-8 — primary inference path. (No Context7 library for tflite-runtime exists; only tflite-flutter and tflite-neuron-delegate were found — delegate thread-safety must be checked against NXP/i.MX vendor docs.) |
| `onnxruntime` | ✗ missing | P0-8. |
| `ultralytics` | ✗ missing | P0-8. |

Other config notes:
- `config.yaml` — `paths` all null (dynamic at runtime), central server `http://localhost:3000/api/v1/inspections` with `enabled: true`.
- `active_machine_setting.json` — contains a real internal NXP URL under `hume.url` and a placeholder `xadapter.url`. Consider keeping internal URLs out of the repo.
- `core/src/utils/config.py` — `ID_TO_LABEL` / `NUM_CLASSES` are **mutated at runtime** by `main.py:1520–1527, 2133–2140` (global shared state, no lock).

---

# Fix priority & Remediation Status (Updated: 2026-09-21)

### Status Summary
- ✅ **Completed (4/7):** Priority 1, 2, 3, 4 + Production NAS drive ingestion bug & missing image placeholder. All 45 regression/security tests passing.
- ⏳ **Remaining (3/7 + P1 backlog):** Priority 5, 6, 7 + P1 quality items (P1-11 to P1-20).

---

### Progress Tracking Checklist

- [x] **1. `main.py` failsafe on AI error / unreadable image → FAIL** (`P1-10`)
  - *Status:* **DONE**
  - *Details:* Catches inference errors, corruption, and empty reports, returning `decision = "FAIL"` and `STOP MACHINE`. Verified by `test_inspection_failsafe.py` (5/5 pass).
- [x] **2. Path-traversal sanitization on all upload & delete endpoints** (`P0-1`, `P0-2`)
  - *Status:* **DONE**
  - *Details:* Added `sanitize_safe_filename` and `is_safe_target_path` on all 7 target routes (`/api/config/...`, `/api/models/...`, upload endpoints). Verified by `test_path_traversal_security.py` (9/9 pass).
- [x] **3. Define `save_model_recipe_bindings`** (`P0-6`)
  - *Status:* **DONE**
  - *Details:* Aliased `save_model_recipe_bindings = save_config_registry` at line 461 of `main.py`.
- [x] **4. Pipeline test suite import fix** (`P0-7`)
  - *Status:* **DONE**
  - *Details:* Adjusted sys.path / package imports in `tests/test_pipeline_flow.py`. Entire test suite passes.
- [ ] **5. Complete `requirements.txt` + lazy `matplotlib` import** (`P0-8`, `P0-9`)
  - *Status:* **PENDING**
  - *Details:* `main.py:15` still does unconditional top-level import of `matplotlib`. `requirements.txt` missing `torch`, `tflite-runtime`, `psycopg2`. `setup_autostart_imx8.sh:25` swallows pip errors (`|| true`).
- [ ] **6. Network & System Security** (`P0-3`, `P0-4`, `P0-5`)
  - *Status:* **PENDING**
  - *Details:* No API auth token middleware, CORS `*`, service running as root on `0.0.0.0:8001`. `mount_prober_shares.sh` exposes `password=$SMB_PASS` on CLI. `torch.load(weights_only=False)` pickle risk.
- [ ] **7. Concurrency & Logic Flaws** (`P1-11`, `P1-12`, `P1-13`)
  - *Status:* **PENDING**
  - *Details:* `main.py:1732` flattens WARNING into FAIL (stopping machine unnecessarily). Double batch completion race condition between `.END` signal and idle timer. Runner hot-swap outside `inference_lock`.

### Additional P1 Backlog Items
- [ ] **P1-14:** Non-atomic counters (`inspection_count += 1`) and benchmark stop queue drain accounting.
- [ ] **P1-15:** Arbitrary seen-files cache eviction (hash-order random drop after 50k files instead of FIFO/LRU).
- [ ] **P1-16:** Duplicated function definitions (`update_benchmark_session_progress`, `sigmoid`).
- [ ] **P1-17:** Hardcoded warmup shape `(1, 640, 640, 3)` instead of reading model input details.
- [ ] **P1-18:** Telemetry clean-up (`padsTotal: 1`, dummy temperature `45.0`).
- [ ] **P1-19:** FastAPI `@app.on_event("startup")` migration to `lifespan` context manager.
- [ ] **P1-20:** 2-class model label-mapping validation.

---

*Report initiated 2026-09-18. Remediation tracked and verified actively in `backend_imx8`.*

