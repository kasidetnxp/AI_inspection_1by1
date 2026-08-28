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

  useEffect(() => {
    if (benchmarkSplitModalItem) {
      setCommentText(benchmarkSplitModalItem.notes || "");
    }
  }, [benchmarkSplitModalItem?.id, benchmarkSplitModalItem?.notes]);

  if (!benchmarkSplitModalItem) return null;

  // Extract batch, wafer, xy, pad, site from image filename
  const parseFilenameMeta = (filename = "") => {
    if (!filename) return { batch: "-", pad: "-", site: "-", xy: "-" };
    const parts = filename.replace(/\.(bmp|png|jpg|jpeg)$/i, "").split("_");
    let batch = "-";
    let xy = "-";
    let site = "-";
    let pad = "-";

    for (const part of parts) {
      if (
        /^C\d+W\d+/i.test(part) ||
        (/^[A-Z0-9]{8,15}$/i.test(part) && !part.startsWith("X") && !part.startsWith("S") && !part.startsWith("P"))
      ) {
        batch = part;
      }
      if (/^X-?\d+Y-?\d+/i.test(part)) {
        xy = part;
      }
      if (/^S\d+/i.test(part)) {
        site = part.replace(/^S/i, "Site ");
      }
      if (/^P\d+/i.test(part)) {
        pad = part.replace(/^P/i, "Pad ");
      }
    }
    return { batch, xy, site, pad };
  };

  const meta = parseFilenameMeta(benchmarkSplitModalItem.image_name);
  const activeModelName =
    (modelsList && modelsList.find((m) => m.is_active)?.name) ||
    benchmarkModel ||
    "unet_pytorch_new.pth";

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
                  title="Previous Image"
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
          {/* LEFT: 2 SPLIT IMAGES VIEWPORT WITH FLOATING ARROWS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              height: "100%",
              minHeight: 0,
              position: "relative"
            }}
          >
            {/* Floating Prev / Next Slider Arrows like Historical modal */}
            {benchmarkResults.length > 1 && (
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

            {/* 1. RAW ORIGINAL IMAGE */}
            <div className="split-image-box">
              <span className="split-image-tag">1. RAW OPTICAL DIE</span>
              <img
                src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
                alt="Raw Wafer"
              />
            </div>

            {/* 2. AI SEGMENTATION & DISTANCE RULE */}
            <div className="split-image-box">
              <span className="split-image-tag">2. AI SEGMENTATION & DISTANCE RULE</span>
              <img
                src={resolveImageUrl(benchmarkSplitModalItem.annotated_image_url || benchmarkSplitModalItem.image_url)}
                alt="AI Annotated"
                onError={(e) => {
                  e.target.src = resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url);
                }}
              />
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

              {/* Human Decision Action Buttons (Clean without hotkey labels) */}
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
