import React from "react";
import { useInspection } from "../context/InspectionContext";

export default function SplitViewModal() {
  const {
    benchmarkSplitModalItem,
    setBenchmarkSplitModalItem,
    benchmarkSplitModalIndex,
    benchmarkResults,
    benchmarkRules,
    handlePrevBenchmarkItem,
    handleNextBenchmarkItem,
    handleSaveHumanReview,
    resolveImageUrl
  } = useInspection();

  if (!benchmarkSplitModalItem) return null;

  return (
    <div className="split-view-modal-backdrop" onClick={() => setBenchmarkSplitModalItem(null)}>
      <div className="split-view-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="split-view-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
              SPLIT VIEW INSPECTION — {benchmarkSplitModalItem.image_name}
            </h3>
            <span className={`badge-result ${benchmarkSplitModalItem.ai_decision.toLowerCase()}`}>
              AI: {benchmarkSplitModalItem.ai_decision}
            </span>
            {benchmarkSplitModalItem.human_decision !== "UNREVIEWED" && (
              <span className={`badge-result ${benchmarkSplitModalItem.human_decision.toLowerCase()}`}>
                HUMAN: {benchmarkSplitModalItem.human_decision}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button className="modal-nav-btn" onClick={handlePrevBenchmarkItem} title="Previous Image (Left Arrow)">
              ◀ PREV <span className="hotkey-pill">←</span>
            </button>
            <span className="modal-counter-badge">
              {benchmarkSplitModalIndex + 1} / {benchmarkResults.length}
            </span>
            <button className="modal-nav-btn" onClick={handleNextBenchmarkItem} title="Next Image (Right Arrow)">
              NEXT ▶ <span className="hotkey-pill">→</span>
            </button>
            <button className="close-btn" onClick={() => setBenchmarkSplitModalItem(null)}>✕</button>
          </div>
        </div>

        {/* Modal Body: Split View Images + Diagnostic Specs */}
        <div className="split-view-body">
          {/* 1. RAW ORIGINAL IMAGE */}
          <div className="split-image-box">
            <span className="split-image-tag">1. RAW OPTICAL DIE</span>
            <img
              src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
              alt="Raw Wafer"
            />
          </div>

          {/* 2. AI MASK OVERLAY & EDGE MEASUREMENT */}
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

          {/* 3. DIAGNOSTIC SPECIFICATIONS & HUMAN GRADING SIDEBAR */}
          <div className="split-sidebar">
            <div>
              <h4 style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                RULE ENGINE DIAGNOSTICS
              </h4>

              {/* Edge Distance */}
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Min Edge Distance:</span>
                  <strong className="font-mono" style={{ color: benchmarkSplitModalItem.min_edge_distance_um < benchmarkRules.fail_distance_um ? "#ef4444" : "#10b981" }}>
                    {benchmarkSplitModalItem.min_edge_distance_um ? `${benchmarkSplitModalItem.min_edge_distance_um.toFixed(1)} µm` : "-"}
                  </strong>
                </div>
                <div style={{ fontSize: "9.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Limit: ≥ {benchmarkRules.fail_distance_um.toFixed(1)} µm ({benchmarkSplitModalItem.min_edge_distance_um < benchmarkRules.fail_distance_um ? "VIOLATION" : "PASSED"})
                </div>
              </div>

              {/* Mark Area Ratio */}
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Mark Area Ratio:</span>
                  <strong className="font-mono">
                    {benchmarkSplitModalItem.mark_area_ratio_pct ? `${benchmarkSplitModalItem.mark_area_ratio_pct.toFixed(1)}%` : "-"}
                  </strong>
                </div>
                <div style={{ fontSize: "9.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Allowed Limit: {benchmarkRules.min_area_ratio_pct}% - {benchmarkRules.max_area_ratio_pct}%
                </div>
              </div>

              {/* Classes Count */}
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Pads Detected:</span>
                  <span className="font-mono">{benchmarkSplitModalItem.pads_count || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Probe Marks:</span>
                  <span className="font-mono">{benchmarkSplitModalItem.marks_count || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Grains / Defects:</span>
                  <span className="font-mono">{benchmarkSplitModalItem.grains_count || 0}</span>
                </div>
              </div>

              {/* AI Latency */}
              <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px", fontSize: "11px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>NPU Inference:</span>
                  <strong className="font-mono" style={{ color: "var(--color-info)" }}>
                    {benchmarkSplitModalItem.inference_time_ms ? `${benchmarkSplitModalItem.inference_time_ms.toFixed(1)} ms` : "-"}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                  <span style={{ color: "var(--text-muted)" }}>AI Confidence:</span>
                  <span className="font-mono">{benchmarkSplitModalItem.ai_confidence ? `${benchmarkSplitModalItem.ai_confidence.toFixed(1)}%` : "-"}</span>
                </div>
              </div>

              {/* Violation Reason */}
              <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "8px", borderRadius: "6px", marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>AI Diagnosis:</div>
                <div style={{ fontSize: "11px", color: benchmarkSplitModalItem.ai_decision === "FAIL" ? "#ef4444" : "#10b981", fontWeight: "600", marginTop: "2px" }}>
                  {benchmarkSplitModalItem.ai_reason || "Within Normal Inspection Tolerance"}
                </div>
              </div>
            </div>

            {/* HUMAN REVIEW ACTION BUTTONS & HOTKEYS */}
            <div>
              <h4 style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                HUMAN VERDICT (GROUND TRUTH)
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  className={`btn-human-pass ${benchmarkSplitModalItem.human_decision === "PASS" ? "active" : ""}`}
                  style={{ padding: "10px", fontSize: "13px", display: "flex", justifyContent: "center", alignItems: "center" }}
                  onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "PASS")}
                >
                  <span>HUMAN PASS</span>
                  <span className="hotkey-pill" style={{ background: "rgba(0,0,0,0.2)" }}>KEY: P</span>
                </button>
                <button
                  className={`btn-human-fail ${benchmarkSplitModalItem.human_decision === "FAIL" ? "active" : ""}`}
                  style={{ padding: "10px", fontSize: "13px", display: "flex", justifyContent: "center", alignItems: "center" }}
                  onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "FAIL")}
                >
                  <span>HUMAN FAIL</span>
                  <span className="hotkey-pill" style={{ background: "rgba(0,0,0,0.2)" }}>KEY: F</span>
                </button>
              </div>

              <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textAlign: "center", marginTop: "10px" }}>
                Hotkeys: <span className="hotkey-pill">P</span> Pass | <span className="hotkey-pill">F</span> Fail | <span className="hotkey-pill">←</span> Prev | <span className="hotkey-pill">→</span> Next | <span className="hotkey-pill">Esc</span> Close
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
