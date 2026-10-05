import React, { useState, useEffect, useRef } from "react";
import { useInspection } from "../context/InspectionContext";

export default function SplitViewModal() {
  const {
    benchmarkModalComment,
    benchmarkModel,
    benchmarkResults,
    benchmarkRules,
    benchmarkSplitModalIndex,
    benchmarkSplitModalItem,
    filteredBenchmarkResults,
    handleNextBenchmarkItem,
    handlePrevBenchmarkItem,
    handleSaveHumanReview,
    history,
    modelsList,
    resolveImageUrl,
    setBenchmarkModalComment,
    setBenchmarkSplitModalItem,
    splitBatchAndWafer
  } = useInspection();

  const [commentText, setCommentText] = useState("");
  const [splitZoom, setSplitZoom] = useState(1);
  const [splitPan, setSplitPan] = useState({ x: 0, y: 0 });
  const [isPanningSplit, setIsPanningSplit] = useState(false);
  const [rawLoadError, setRawLoadError] = useState(false);
  const [annotatedLoadError, setAnnotatedLoadError] = useState(false);
  const splitContainerRef = useRef(null);
  const splitDragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    setRawLoadError(false);
    setAnnotatedLoadError(false);
  }, [benchmarkSplitModalItem]);

  const clampSplitPan = (x, y, zoom) => {
    if (zoom <= 1.0) return { x: 0, y: 0 };
    const rect = splitContainerRef.current ? splitContainerRef.current.getBoundingClientRect() : { width: 900, height: 600 };
    const maxPanX = Math.max(0, (rect.width * (zoom - 1)) / 2);
    const maxPanY = Math.max(0, (rect.height * (zoom - 1)) / 2);
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y))
    };
  };

  const resetSplitZoom = (e) => {
    if (e) e.stopPropagation();
    setSplitZoom(1);
    setSplitPan({ x: 0, y: 0 });
  };

  const handleSplitZoomIn = (e) => {
    if (e) e.stopPropagation();
    setSplitZoom(prev => {
      const next = Math.min(5.0, Math.round((prev + 0.25) * 100) / 100);
      return next;
    });
  };

  const handleSplitZoomOut = (e) => {
    if (e) e.stopPropagation();
    setSplitZoom(prev => {
      const next = Math.max(1.0, Math.round((prev - 0.25) * 100) / 100);
      if (next === 1.0) setSplitPan({ x: 0, y: 0 });
      else setSplitPan(p => clampSplitPan(p.x, p.y, next));
      return next;
    });
  };

  const handleSplitPointerDown = (e) => {
    if (splitZoom <= 1.0 || e.button !== 0) return;
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    setIsPanningSplit(true);
    splitDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: splitPan.x,
      panY: splitPan.y
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleSplitPointerMove = (e) => {
    if (!isPanningSplit || splitZoom <= 1.0) return;
    const dx = e.clientX - splitDragRef.current.x;
    const dy = e.clientY - splitDragRef.current.y;
    setSplitPan(clampSplitPan(splitDragRef.current.panX + dx, splitDragRef.current.panY + dy, splitZoom));
  };

  const handleSplitPointerUp = (e) => {
    if (isPanningSplit) {
      setIsPanningSplit(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handleSplitDoubleClick = (e) => {
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    // Double clicking smoothly expands the zoom without ever resetting
    setSplitZoom(prev => (prev >= 5.0 ? 5.0 : Math.min(5.0, Math.round((prev + 1.0) * 100) / 100)));
  };

  useEffect(() => {
    if (benchmarkSplitModalItem) {
      setCommentText(benchmarkSplitModalItem.notes || "");
      setSplitZoom(1);
      setSplitPan({ x: 0, y: 0 });
    }
  }, [benchmarkSplitModalItem?.id, benchmarkSplitModalItem?.notes]);

  if (!benchmarkSplitModalItem) return null;

          // Extract batch, wafer, xy, pad, site, timestamp from image filename
          const parseSplitMeta = (filename = "") => {
            if (!filename) return { batch: "-", waferNo: "-", pad: "-", site: "-", xy: "-", dateTime: "-" };
            const clean = filename.replace(/\.(bmp|png|jpg|jpeg)$/i, "")
              .replace(/^(raw_|annotated_|inspect_)+/i, "")
              .replace(/(_mask_result|_inspect|_annotated|_raw|_result)+$/i, "");
            const parts = clean.split("_");

            let batch = "-";
            let waferNo = "-";
            let xy = "-";
            let site = "-";
            let pad = "-";
            let dateTime = "-";

            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              if (!part) continue;

              // 1. Process Time: 14-digit or 8-digit timestamp (e.g. 20260813155201)
              if (/^\d{14}$/.test(part)) {
                dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)} ${part.slice(8, 10)}:${part.slice(10, 12)}:${part.slice(12, 14)}`;
                continue;
              }
              if (/^\d{8}$/.test(part) && i === 0) {
                dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)}`;
                continue;
              }

              // 2. Coordinate: X...Y... (e.g. X68Y5)
              if (/^X-?\d+Y-?\d+$/i.test(part)) {
                xy = part;
                continue;
              }

              // 3. Site: S... (e.g. S2, S14)
              if (/^S\d+$/i.test(part)) {
                site = part.replace(/^S/i, "Site ");
                continue;
              }

              // 4. Pad: P... (e.g. P6, P25)
              if (/^P\d+$/i.test(part)) {
                pad = part.replace(/^P/i, "Pad ");
                continue;
              }

              // 5. Inspection status keyword (OK, NG, PASS, FAIL, REJECT)
              if (/^(OK|NG|PASS|FAIL|REJECT)$/i.test(part)) {
                continue;
              }

              // 6. Temperature (2-3 digit number at end, e.g. 300)
              if (/^\d{2,3}$/.test(part) && i === parts.length - 1) {
                continue;
              }

              // 7. Wafer ID / Batch identifier (e.g. SUC720-15F0, C01W02, BATCH123)
              if (batch === "-") {
                waferNo = part;
                if (part.includes("-")) {
                  batch = part.split("-")[0];
                } else {
                  const m = part.match(/^([A-Z0-9]+?)(W[A-Z0-9]+)$/i);
                  batch = m ? m[1] : part;
                }
              }
            }

            // Fallback for standard position: parts[1] is wafer/batch if not assigned
            if (batch === "-" && parts.length > 1 && parts[1]) {
              const part = parts[1];
              waferNo = part;
              batch = part.includes("-") ? part.split("-")[0] : part;
            }

            return { batch, waferNo, xy, site, pad, dateTime };
          };

          const splitMeta = parseSplitMeta(benchmarkSplitModalItem.image_name);
          const testedModelName = benchmarkSplitModalItem.model_name || benchmarkModel || (modelsList && modelsList.find((m) => m.active)?.name) || "unet.tflite";


  return (
            <div className="split-view-modal-backdrop" onClick={() => setBenchmarkSplitModalItem(null)}>
              <div
                className="split-view-modal-content hmi-card"
                style={{
                  width: "1340px",
                  maxWidth: "96vw",
                  height: "720px",
                  maxHeight: "94vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  className="card-header split-view-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--border-color)",
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
                      SPLIT VIEW INSPECTION — <span className="font-mono">{benchmarkSplitModalItem.image_name}</span>
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {(filteredBenchmarkResults.length > 1 || benchmarkResults.length > 1) && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          className="modal-nav-btn"
                          onClick={handlePrevBenchmarkItem}
                          title="Previous Image"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                        >
                          ◀ PREV
                        </button>
                        <span className="modal-counter-badge" style={{ fontSize: "11px", minWidth: "60px", textAlign: "center" }}>
                          {benchmarkSplitModalIndex + 1} / {filteredBenchmarkResults.length || benchmarkResults.length}
                        </span>
                        <button
                          className="modal-nav-btn"
                          onClick={handleNextBenchmarkItem}
                          title="Next Image"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                        >
                          NEXT ▶
                        </button>
                      </div>
                    )}
                    <button
                      className="clear-history-btn"
                      style={{ marginLeft: "8px", padding: "4px 12px", fontSize: "12px" }}
                      onClick={() => setBenchmarkSplitModalItem(null)}
                      title="Close modal"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Modal Body: Split View Images with Slider Arrows + Right Sidebar */}
                <div
                  className="card-body split-view-body"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 340px",
                    gap: "16px",
                    padding: "16px",
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden"
                  }}
                >
                  {/* LEFT: 2 SPLIT IMAGES VIEWPORT WITH FLOATING ARROWS & ZOOM */}
                  <div
                    ref={splitContainerRef}
                    className="zoomable-container"
                    style={{
                      height: "100%",
                      minHeight: 0,
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: "8px",
                      background: "#070913",
                      border: "1px solid var(--border-color)",
                      cursor: splitZoom > 1 ? (isPanningSplit ? "grabbing" : "grab") : "default"
                    }}
                    onWheel={(e) => {
                      const delta = e.deltaY < 0 ? 0.25 : -0.25;
                      setSplitZoom(prev => {
                        const next = Math.min(5.0, Math.max(1.0, Math.round((prev + delta) * 100) / 100));
                        if (next === 1.0) setSplitPan({ x: 0, y: 0 });
                        else setSplitPan(p => clampSplitPan(p.x, p.y, next));
                        return next;
                      });
                    }}
                    onDoubleClick={handleSplitDoubleClick}
                    onPointerDown={handleSplitPointerDown}
                    onPointerMove={handleSplitPointerMove}
                    onPointerUp={handleSplitPointerUp}
                    onPointerCancel={handleSplitPointerUp}
                  >
                    {/* Floating Zoom Controls Toolbar */}
                    <div
                      className="zoom-toolbar-floating"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={handleSplitZoomOut}
                        disabled={splitZoom <= 1.0}
                        title="Zoom Out"
                      >
                        −
                      </button>
                      <span className="zoom-badge">
                        {Math.round(splitZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={handleSplitZoomIn}
                        disabled={splitZoom >= 5.0}
                        title="Zoom In"
                      >
                        +
                      </button>
                      <div className="zoom-divider"></div>
                      <button
                        type="button"
                        className="zoom-btn-reset"
                        onClick={resetSplitZoom}
                        title="Reset to 100%"
                      >
                        ↺ Reset
                      </button>
                    </div>

                    {/* Floating Prev / Next Slider Arrows */}
                    {(benchmarkResults && benchmarkResults.length > 1) && (
                      <>
                        <button
                          className="modal-nav-arrow left"
                          onClick={handlePrevBenchmarkItem}
                          title="Previous Image"
                        >
                          ◀
                        </button>
                        <button
                          className="modal-nav-arrow right"
                          onClick={handleNextBenchmarkItem}
                          title="Next Image"
                        >
                          ▶
                        </button>
                      </>
                    )}

                    <div
                      className="zoomable-target"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                        height: "100%",
                        padding: "8px",
                        transform: `translate3d(${splitPan.x}px, ${splitPan.y}px, 0) scale(${splitZoom})`,
                        transition: isPanningSplit ? "none" : "transform 0.15s ease-out"
                      }}
                    >
                      {/* 1. RAW OPTICAL DIE */}
                      <div className="split-image-box" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        <span className="split-image-tag">1. RAW OPTICAL DIE</span>
                        {rawLoadError ? (
                          <div
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0, 0, 0, 0.4)",
                              borderRadius: "6px",
                              border: "1px dashed var(--border-color)",
                              padding: "20px",
                              textAlign: "center"
                            }}
                          >
                            <span style={{ fontSize: "28px", marginBottom: "8px" }}>📷</span>
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                              ไม่มีภาพ Raw / No Raw Image
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                              ไม่พบไฟล์ภาพ Raw ใน Drive M PROCESSED
                            </span>
                          </div>
                        ) : (
                          <img
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
                            alt="Raw Wafer"
                            style={{ width: "100%", height: "100%", objectFit: "contain", flex: 1, pointerEvents: "none" }}
                            onError={() => setRawLoadError(true)}
                          />
                        )}
                      </div>

                      {/* 2. AI SEGMENTATION & DISTANCE RULE */}
                      <div className="split-image-box" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                        <span className="split-image-tag">2. AI SEGMENTATION & DISTANCE RULE</span>
                        {annotatedLoadError ? (
                          <div
                            style={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0, 0, 0, 0.4)",
                              borderRadius: "6px",
                              border: "1px dashed var(--border-color)",
                              padding: "20px",
                              textAlign: "center"
                            }}
                          >
                            <span style={{ fontSize: "28px", marginBottom: "8px" }}>🖼️</span>
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)" }}>
                              ไม่มีภาพ Output / No Output Image
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                              ไฟล์ภาพ Output ใน Drive M ถูกลบหรือยังไม่มีในระบบ
                            </span>
                          </div>
                        ) : (
                          <img
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            src={resolveImageUrl(benchmarkSplitModalItem.annotated_image_url || benchmarkSplitModalItem.image_url)}
                            alt="AI Annotated"
                            style={{ width: "100%", height: "100%", objectFit: "contain", flex: 1, pointerEvents: "none" }}
                            onError={() => setAnnotatedLoadError(true)}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: METADATA & HUMAN REVIEW PANEL */}
                  <div
                    className="split-sidebar"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      width: "340px",
                      minWidth: "340px",
                      maxWidth: "340px",
                      minHeight: 0,
                      gap: "10px"
                    }}
                  >
                    {/* TOP: INSPECTION METADATA & RESULTS (SCROLLABLE IF NEEDED) */}
                    <div
                      className="model-meta-box"
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        overflowX: "hidden",
                        scrollbarGutter: "stable",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "14px",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)"
                      }}
                    >
                      {/* Image & Location Info */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Machine no:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.machineNo || "PROBER01"}
                        </span>
                      </div>
                      {(() => {
                        const bw = splitBatchAndWafer ? splitBatchAndWafer(splitMeta) : { batch: splitMeta.batch, waferNo: splitMeta.waferNo };
                        return (
                          <>
                            <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="meta-lbl" style={{ flexShrink: 0 }}>Batch:</span>
                              <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                                {bw.batch}
                              </span>
                            </div>
                            <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="meta-lbl" style={{ flexShrink: 0 }}>Wafer No.:</span>
                              <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                                {bw.waferNo}
                              </span>
                            </div>
                          </>
                        );
                      })()}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Pad / Site:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {splitMeta.pad !== "-" || splitMeta.site !== "-" ? `${splitMeta.pad} / ${splitMeta.site}` : "-"}
                        </span>
                      </div>
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Site coordinate:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {splitMeta.xy}
                        </span>
                      </div>

                      <div style={{ height: "1px", background: "var(--border-color)", margin: "1px 0" }} />

                      {/* Inspection Results */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "28px" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                        <span
                          className={`badge-result ${(benchmarkSplitModalItem.ai_decision || "PASS").toLowerCase()}`}
                          style={{
                            fontSize: "12px",
                            fontWeight: "700",
                            padding: "3px 10px",
                            height: "26px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxSizing: "border-box",
                            margin: 0
                          }}
                        >
                          {benchmarkSplitModalItem.ai_decision || "PASS"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Reason:</span>
                        <span
                          className="meta-val font-mono"
                          style={{
                            textAlign: "right",
                            wordBreak: "break-word",
                            color: benchmarkSplitModalItem.ai_reason && benchmarkSplitModalItem.ai_reason !== "-" && benchmarkSplitModalItem.ai_decision === "FAIL" ? "var(--color-fail)" : "inherit",
                            fontWeight: "600"
                          }}
                        >
                          {benchmarkSplitModalItem.ai_reason || "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Min Edge Distance:</span>
                        <span
                          className="meta-val font-mono"
                          style={{
                            textAlign: "right",
                            color:
                              benchmarkSplitModalItem.min_edge_distance_um !== null &&
                              benchmarkSplitModalItem.min_edge_distance_um !== undefined &&
                              benchmarkSplitModalItem.min_edge_distance_um < (benchmarkRules?.fail_distance_um || 8.0)
                                ? "var(--color-fail)"
                                : "var(--color-info)",
                            fontWeight: "600"
                          }}
                        >
                          {benchmarkSplitModalItem.min_edge_distance_um !== null && benchmarkSplitModalItem.min_edge_distance_um !== undefined
                            ? `${Number(benchmarkSplitModalItem.min_edge_distance_um).toFixed(1)} µm`
                            : "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Mark Area Ratio:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.mark_area_ratio_pct !== null && benchmarkSplitModalItem.mark_area_ratio_pct !== undefined
                            ? `${Number(benchmarkSplitModalItem.mark_area_ratio_pct).toFixed(1)}%`
                            : "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Model:</span>
                        <span className="meta-val font-mono highlight-green" style={{ textAlign: "right" }}>
                          {testedModelName}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Time Inference:</span>
                        <span className="meta-val font-mono highlight-blue" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.inference_time_ms !== null && benchmarkSplitModalItem.inference_time_ms !== undefined
                            ? `${Number(benchmarkSplitModalItem.inference_time_ms).toFixed(1)} ms`
                            : "-"}
                        </span>
                      </div>
                    </div>

                    {/* BOTTOM: FIXED DEDICATED HUMAN REVIEW PANEL */}
                    <div
                      className="human-review-box"
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "12px 14px",
                        background: "rgba(255, 255, 255, 0.025)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)",
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.12)"
                      }}
                    >
                      {/* Human Decision Section (Fixed 28px height badge for zero layout shift) */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "28px" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0, fontWeight: "600" }}>Human Decision:</span>
                        {benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED" ? (
                          <span
                            className={`badge-result ${benchmarkSplitModalItem.human_decision.toLowerCase()}`}
                            style={{
                              fontSize: "12px",
                              fontWeight: "700",
                              padding: "3px 10px",
                              height: "26px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxSizing: "border-box",
                              margin: 0
                            }}
                          >
                            {benchmarkSplitModalItem.human_decision}
                          </span>
                        ) : (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: "12px",
                              fontWeight: "700",
                              padding: "3px 10px",
                              height: "26px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              boxSizing: "border-box",
                              margin: 0,
                              color: "var(--text-muted)",
                              border: "1px solid var(--border-color)",
                              borderRadius: "5px",
                              background: "rgba(255, 255, 255, 0.04)"
                            }}
                          >
                            UNREVIEWED
                          </span>
                        )}
                      </div>

                      {/* Human Decision Action Buttons (Fixed 38px height) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <button
                          type="button"
                          className={`btn-human-pass ${benchmarkSplitModalItem.human_decision === "PASS" ? "active" : ""}`}
                          style={{
                            padding: "8px",
                            height: "38px",
                            fontSize: "13px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontWeight: "700",
                            borderRadius: "6px",
                            boxSizing: "border-box"
                          }}
                          onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "PASS", benchmarkModalComment)}
                        >
                          PASS
                        </button>
                        <button
                          type="button"
                          className={`btn-human-fail ${benchmarkSplitModalItem.human_decision === "FAIL" ? "active" : ""}`}
                          style={{
                            padding: "8px",
                            height: "38px",
                            fontSize: "13px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontWeight: "700",
                            borderRadius: "6px",
                            boxSizing: "border-box"
                          }}
                          onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "FAIL", benchmarkModalComment)}
                        >
                          FAIL
                        </button>
                      </div>

                      {/* Comment Box (Stable layout height) */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "16px" }}>
                          <span className="meta-lbl" style={{ fontSize: "11px" }}>Comment:</span>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--color-info)",
                              visibility: benchmarkModalComment !== (benchmarkSplitModalItem.notes || "") ? "visible" : "hidden"
                            }}
                          >
                            Auto-saving on blur...
                          </span>
                        </div>
                        <textarea
                          className="form-control"
                          style={{
                            width: "100%",
                            height: "56px",
                            resize: "none",
                            fontSize: "12px",
                            padding: "6px 8px",
                            background: "rgba(0, 0, 0, 0.25)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            color: "var(--text-main)",
                            fontFamily: "inherit",
                            boxSizing: "border-box"
                          }}
                          placeholder="Enter remarks / notes..."
                          value={benchmarkModalComment}
                          onChange={(e) => setBenchmarkModalComment(e.target.value)}
                          onBlur={() => {
                            if (benchmarkModalComment !== (benchmarkSplitModalItem.notes || "")) {
                              handleSaveHumanReview(
                                benchmarkSplitModalItem,
                                benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED"
                                  ? benchmarkSplitModalItem.human_decision
                                  : "UNREVIEWED",
                                benchmarkModalComment
                              );
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
  );
}
