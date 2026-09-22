# Original User Request

## 2026-09-09T07:46:01Z

This is a single self-contained fix; keep it small and focused.

Refactor the Wafer PMI Prober backend ingestion and output pipeline in `backend_imx8`: eliminate file moving/deletion from Drive N, monitor Drive M PROCESSED in read-only mode, output split comparison images to Drive M OUTPUT retaining identical original filenames (no inspect/anno prefix), and output batch judgement TXT exclusively to Drive N JUDGE triggered by time-based idle timeout.

Working directory: /home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU
Integrity mode: development

## Requirements

### R1. Read-Only Ingestion from Drive M PROCESSED
- Monitor the configured Drive M input directory (`lot.input.folder` / `M:\WP288\PMI\PROCESSED\{output.lotNo}`).
- Ingestion must be strictly read-only: do **not** delete, move, or rename incoming images in `PROCESSED`.
- Implement write-completion checks (e.g. file size stability / SMB write delay) before submitting images to the inference queue.
- Cease actively pulling or moving images from Drive N `IMAGE`.

### R2. Output Image Naming & Storage
- Save processed inspection images directly into Drive M output directory (`lot.output.folder` / `M:\WP288\PMI\OUTPUT\{output.lotNo}`).
- The generated output image must be a split comparison view (original image alongside inspection overlay).
- The output filename must strictly match the original filename (e.g., `IMAGE01.bmp` -> `IMAGE01.bmp`), with **no** prefixes such as `inspect_`, `annotated_`, or `anno_`.
- Update API endpoints, WebSockets, and database references if necessary to serve images without requiring `inspect_` filename prefixes.

### R3. Drive N Result Isolation & Batch Judgement
- Drive N access is strictly limited to writing the final batch judgement file (`machine.result.folder` / `N:\WP288\PMI\JUDGE`).
- Do not create, modify, or delete any image folders on Drive N.
- The judgement filename and format must strictly follow `machine.result.fileFormat` (e.g., `PASS_00000000_PROBER01_YYYYMMDDHHMMSS.txt` / `FAIL_...txt`).

### R4. Time-Based Batch Completion Detection
- Detect batch/lot completion via an idle timeout mechanism based on `process.end.timeout` (default 10,000 ms) from `Machine_Setting.txt`.
- When no new images arrive in a lot's `PROCESSED` folder for longer than the timeout period (and at least one image was processed for that lot), declare the batch complete.
- Upon batch completion, synthesize the batch judgement code (8-digit mask), generate the summary TXT file, deposit it into Drive N `JUDGE`, and broadcast the `BATCH_COMPLETE` event.

## Acceptance Criteria

### Automated Pipeline Verification
- [ ] Programmatic test script (`backend_imx8/tests/test_pipeline_flow.py`) executes successfully against simulated Drive M & N environments.
- [ ] Raw images placed in simulated `Drive M: .../PROCESSED/<lot>` remain completely intact with unchanged file counts and checksums after inference.
- [ ] Processed output images in simulated `Drive M: .../OUTPUT/<lot>` exist with filenames strictly identical to their input counterparts (no `inspect_` or `annotated_` prefix) and contain the split comparison view.
- [ ] When image ingestion ceases for longer than `process.end.timeout`, batch completion triggers automatically and exactly one valid 8-digit judgement TXT is written to simulated `Drive N: .../JUDGE`.
- [ ] Drive N contains zero image files and is only touched for writing the judgement TXT file.
- [ ] Backend server starts and operates cleanly without regression in WebSocket event broadcasts or DB persistence.

## Follow-up — 2026-09-09T08:48:48Z

This is a single self-contained fix; keep it small and focused. Continue the refactoring and adversarial refinement of the Wafer PMI Prober backend ingestion and output pipeline in `backend_imx8`, resolving the 6 review findings identified in Round 1, ensuring state persistence, and completing full test verification and audit.

Working directory: /home/nxp1/Desktop/PUNPUNJA/PROJECT/UIIU
Integrity mode: development

## Context & Prior Progress
- Phase 1 core refactoring is already completed in `backend_imx8/main.py`, `backend_imx8/core/src/rules/inspection.py`, and `backend_imx8/config.yaml`.
- Initial end-to-end tests exist in `backend_imx8/tests/test_pipeline_flow.py` and are currently passing (4/4 tests).
- Reviewer Round 1 identified 6 specific bugs/edge cases to patch before proceeding to subsequent refinement and post-victory audit.

## Requirements

### R1. Resolve Review Findings in `backend_imx8/main.py`
Patch the 6 adversarial review findings:
1. **Lot Name Parsing**: Fix lot name parsing/truncation when lot name strings contain hyphens or special delimiters.
2. **Ingestion State Persistence**: Prevent re-queueing/re-processing on server restart by persisting ingested file tracking or checking existing output files rather than relying solely on in-memory set `seen_ingested_files`.
3. **Batch Complete Flag Reset**: Ensure `is_batch_complete` and per-lot completion states cleanly reset so subsequent batches for the same or new lots are not blocked or misreported.
4. **Multi-Lot Idle Timeout Concurrency**: Ensure global locks do not block per-lot idle timeouts when multiple lots have active incoming images simultaneously.
5. **Judgement TXT Overwrite Protection**: Prevent accidental overwriting of prior JUDGE TXT files on Drive N (ensure timestamp/sequence uniqueness per `machine.result.fileFormat`).
6. **Async SMB Ingestion Efficiency**: Prevent blocking synchronous sleeps inside async loops during Drive M polling to ensure smooth concurrent event handling.

### R2. Maintain Core Architectural Constraints
- **Drive M Read-Only Ingestion**: Ingestion from `PROCESSED` must remain strictly read-only (no deletion, moving, or renaming).
- **Drive M Output Naming**: Saved inspection images in `OUTPUT` must be split comparison views retaining the exact original filename (no `inspect_`, `annotated_` prefixes).
- **Drive N Isolation**: Drive N access must be strictly restricted to writing the final batch judgement TXT to `JUDGE`. Zero images or temporary files on Drive N.
- **Idle Timeout Batch Completion**: Batch summary and judgement generation must be triggered after `process.end.timeout` (default 10s) elapses with no new images for the lot.

### R3. Comprehensive Test Coverage Expansion
Expand `backend_imx8/tests/test_pipeline_flow.py` with test cases specifically validating:
- Proper handling of lots with hyphens in the name (e.g. `LOT-123-ABC`).
- Ingestion state persistence / restart recovery behavior.
- Clean transition across back-to-back batches without state leakage.
- Multi-lot concurrency and isolation.

## Acceptance Criteria

### Verification & Test Suite
- [ ] `./.venv/bin/pytest backend_imx8/tests/test_pipeline_flow.py` executes and passes 100% without failures or unhandled exceptions.
- [ ] Raw images in simulated Drive M `PROCESSED` remain byte-identical with unchanged count and checksums.
- [ ] Generated images in simulated Drive M `OUTPUT` match original filenames exactly (no `inspect_`/`annotated_` prefix) with split comparison view.
- [ ] Exactly one valid judgement TXT file per batch is placed in simulated Drive N `JUDGE`, adhering strictly to `machine.result.fileFormat`.
- [ ] Drive N contains zero image files or directories outside `JUDGE`.
- [ ] Backend server runs without regressions in WebSocket broadcasts, DB persistence, or API endpoints.
