import React, { useState, useEffect } from "react";
import { useInspection } from "../context/InspectionContext";

export default function SplitViewModal() {
  const {
    benchmarkSplitModalItem,
    setBenchmarkSplitModalItem,
    benchmarkSplitModalIndex,
    benchmarkResults,
    benchmarkRules,
    benchmarkModel,
    modelsList,
    handlePrevBenchmarkItem,
    handleNextBenchmarkItem,
    handleSaveHumanReview,
    resolveImageUrl
  } = useInspection();

  const [commentText, setCommentText] = useState("");

  // Zoom & Pan Interactive State (Split View)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (benchmarkSplitModalItem) {
      setCommentText(benchmarkSplitModalItem.notes || "");
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [benchmarkSplitModalItem?.id, benchmarkSplitModalItem?.notes]);

  // Keyboard navigation & escape listener
  useEffect(() => {
    if (!benchmarkSplitModalItem) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setBenchmarkSplitModalItem(null);
      } else if (e.key === "ArrowLeft") {
        handlePrevBenchmarkItem();
      } else if (e.key === "ArrowRight") {
        handleNextBenchmarkItem();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [benchmarkSplitModalItem, setBenchmarkSplitModalItem, handlePrevBenchmarkItem, handleNextBenchmarkItem]);

  if (!benchmarkSplitModalItem) return null;

  // Extract batch, wafer, xy, pad, site, timestamp from image filename
  const parseFilenameMeta = (filename = "") => {
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

      if (/^\d{14}$/.test(part)) {
        dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)} ${part.slice(8, 10)}:${part.slice(10, 12)}:${part.slice(12, 14)}`;
        continue;
      }
      if (/^\d{8}$/.test(part) && i === 0) {
        dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)}`;
        continue;
      }
      if (/^X-?\d+Y-?\d+$/i.test(part)) {
        xy = part;
        continue;
      }
      if (/^S\d+$/i.test(part)) {
        site = part.replace(/^S/i, "Site ");
        continue;
      }
      if (/^P\d+$/i.test(part)) {
        pad = part.replace(/^P/i, "Pad ");
        continue;
      }
      if (/^(OK|NG|PASS|FAIL|REJECT)$/i.test(part)) {
        continue;
      }
      if (/^\d{2,3}$/.test(part) && i === parts.length - 1) {
        continue;
      }
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

    if (batch === "-" && parts.length > 1 && parts[1]) {
      const part = parts[1];
      waferNo = part;
      batch = part.includes("-") ? part.split("-")[0] : part;
    }

    return { batch, waferNo, xy, site, pad, dateTime };
  };

  const meta = parseFilenameMeta(benchmarkSplitModalItem.image_name);
  const activeModelName =
    (modelsList && modelsList.find((m) => m.is_active)?.name) ||
    benchmarkModel ||
    "unet_pytorch_new.pth";

  return (
    <div className="split-view-modal-backdrop modal-overlay" onClick={() => setBenchmarkSplitModalItem(null)}>
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
        {/* MODAL HEADER */}
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

          {/* Nav Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {benchmarkResults.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  className="modal-nav-btn"
                  onClick={handlePrevBenchmarkItem}
                  title="Previous Image (Keyboard: ←)"
                  style={{ padding: "4px 12px", fontSize: "12px" }}
                >
                  ◀ PREV
                </button>
                <span className="modal-counter-badge" style={{ fontSize: "11px", minWidth: "60px", textAlign: "center" }}>
                  {benchmarkSplitModalIndex !== null ? benchmarkSplitModalIndex + 1 : 1} / {benchmarkResults.length}
                </span>
                <button
                  className="modal-nav-btn"
                  onClick={handleNextBenchmarkItem}
                  title="Next Image (Keyboard: →)"
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
              title="Close modal (Esc)"
            >
              Close
            </button>
          </div>
        </div>

        {/* MODAL BODY: Split View Images + Right Metadata/Review Panel */}
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
            className="zoomable-container"
            style={{
              position: "relative",
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
              borderRadius: "8px",
              background: "#070913",
              border: "1px solid var(--border-color)",
              cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default"
            }}
            onWheel={(e) => {
              const delta = e.deltaY < 0 ? 0.2 : -0.2;
              setZoom(prev => {
                const next = Math.min(5.0, Math.max(1.0, Math.round((prev + delta) * 10) / 10));
                if (next === 1.0) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
            onMouseDown={(e) => {
              if (zoom <= 1.0) return;
              setIsPanning(true);
              setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }}
            onMouseMove={(e) => {
              if (!isPanning || zoom <= 1.0) return;
              setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
            }}
            onMouseUp={() => setIsPanning(false)}
            onMouseLeave={() => setIsPanning(false)}
            onDoubleClick={() => {
              if (zoom > 1.0) {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              } else {
                setZoom(2);
              }
            }}
          >
            {/* Floating Zoom Controls Toolbar */}
            <div className="zoom-toolbar-floating">
              <button
                className="zoom-btn"
                aria-label="Zoom Out"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(prev => {
                    const next = Math.max(1.0, Math.round((prev - 0.25) * 100) / 100);
                    if (next === 1.0) setPan({ x: 0, y: 0 });
                    return next;
                  });
                }}
                title="Zoom Out"
              >
                −
              </button>
              <span
                className="zoom-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Click to Reset 100%"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                className="zoom-btn"
                aria-label="Zoom In"
                onClick={(e) => {
                  e.stopPropagation();
                  setZoom(prev => Math.min(5.0, Math.round((prev + 0.25) * 100) / 100));
                }}
                title="Zoom In"
              >
                +
              </button>
              {zoom > 1 && (
                <button
                  className="zoom-btn"
                  aria-label="Reset Zoom"
                  style={{ fontSize: "11px", width: "22px", height: "22px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  title="Reset 100%"
                >
                  ↺
                </button>
              )}
            </div>

            {/* Floating Prev / Next Slider Arrows */}
            {benchmarkResults.length > 1 && (
              <>
                <button
                  className="modal-nav-arrow left"
                  onClick={handlePrevBenchmarkItem}
                  title="Previous Image (←)"
                >
                  ◀
                </button>
                <button
                  className="modal-nav-arrow right"
                  onClick={handleNextBenchmarkItem}
                  title="Next Image (→)"
                >
                  ▶
                </button>
              </>
            )}

            {/* Split Images Grid */}
            <div
              className="zoomable-target"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                height: "100%",
                padding: "8px",
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`
              }}
            >
              {/* 1. RAW OPTICAL DIE */}
              <div className="split-image-box" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <span className="split-image-tag">1. RAW OPTICAL DIE</span>
                <img
                  src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
                  alt="Raw Wafer"
                  style={{ width: "100%", height: "100%", objectFit: "contain", flex: 1 }}
                />
              </div>

              {/* 2. AI SEGMENTATION & DISTANCE RULE */}
              <div className="split-image-box" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <span className="split-image-tag">2. AI SEGMENTATION & DISTANCE RULE</span>
                <img
                  src={resolveImageUrl(benchmarkSplitModalItem.annotated_image_url || benchmarkSplitModalItem.image_url)}
                  alt="AI Annotated"
                  style={{ width: "100%", height: "100%", objectFit: "contain", flex: 1 }}
                  onError={(e) => {
                    e.target.src = resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url);
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3. RIGHT METADATA & HUMAN REVIEW PANEL */}
          <div
            className="split-sidebar"
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0
            }}
          >
            <div
              className="model-meta-box"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
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
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Batch:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                  {meta.batch}
                </span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Pad / Site:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                  {meta.pad !== "-" || meta.site !== "-" ? `${meta.pad} / ${meta.site}` : "-"}
                </span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Site coordinate:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                  {meta.xy}
                </span>
              </div>

              <div style={{ height: "1px", background: "var(--border-color)", margin: "1px 0" }} />

              {/* Inspection Results */}
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                <span className={`badge-result ${(benchmarkSplitModalItem.ai_decision || "PASS").toLowerCase()}`}>
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
                  {activeModelName}
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

              <div style={{ height: "1px", background: "var(--border-color)", margin: "1px 0" }} />

              {/* Human Decision Section */}
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Human Decision:</span>
                {benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED" ? (
                  <span className={`badge-result ${benchmarkSplitModalItem.human_decision.toLowerCase()}`}>
                    {benchmarkSplitModalItem.human_decision}
                  </span>
                ) : (
                  <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    UNREVIEWED
                  </span>
                )}
              </div>

              {/* Human Decision Action Buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "2px" }}>
                <button
                  type="button"
                  className={`btn-human-pass ${benchmarkSplitModalItem.human_decision === "PASS" ? "active" : ""}`}
                  style={{
                    padding: "10px 8px",
                    fontSize: "13px",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontWeight: "700",
                    borderRadius: "6px"
                  }}
                  onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "PASS", commentText)}
                >
                  PASS
                </button>
                <button
                  type="button"
                  className={`btn-human-fail ${benchmarkSplitModalItem.human_decision === "FAIL" ? "active" : ""}`}
                  style={{
                    padding: "10px 8px",
                    fontSize: "13px",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontWeight: "700",
                    borderRadius: "6px"
                  }}
                  onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "FAIL", commentText)}
                >
                  FAIL
                </button>
              </div>

              {/* Comment Box */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="meta-lbl" style={{ fontSize: "11px" }}>Comment:</span>
                  {commentText !== (benchmarkSplitModalItem.notes || "") && (
                    <span style={{ fontSize: "10px", color: "var(--color-info)" }}>Auto-saving on blur...</span>
                  )}
                </div>
                <textarea
                  className="form-control"
                  style={{
                    width: "100%",
                    height: "60px",
                    resize: "none",
                    fontSize: "12px",
                    padding: "6px 8px",
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    color: "var(--text-main)",
                    fontFamily: "inherit"
                  }}
                  placeholder="Enter remarks / notes..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onBlur={() => {
                    if (commentText !== (benchmarkSplitModalItem.notes || "")) {
                      handleSaveHumanReview(
                        benchmarkSplitModalItem,
                        benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED"
                          ? benchmarkSplitModalItem.human_decision
                          : "UNREVIEWED",
                        commentText
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
