import React from "react";
import { useNavigate } from "react-router-dom";
import { useInspection } from "../context/InspectionContext";

export default function HistoryDetailModal() {
  const {
    selectedModalItem,
    selectedModalIndex,
    modalViewMode,
    setModalViewMode,
    closeModal,
    handlePrevModalItem,
    handleNextModalItem,
    getActiveModalList,
    resolveImageUrl,
    mapInspectionData
  } = useInspection();

  const navigate = useNavigate();

  if (!selectedModalItem) return null;

  const currentList = getActiveModalList ? getActiveModalList() : [];

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        className="modal-content-box hmi-card"
        style={{
          width: "1080px",
          maxWidth: "95vw",
          height: "660px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER: Title, Nav Buttons & Close */}
        <div
          className="card-header modal-header"
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
              HISTORICAL INSPECTION — <span className="font-mono">{selectedModalItem.id}</span>
            </h3>
            <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
              {selectedModalItem.decision}
            </span>
          </div>

          {/* Dedicated Nav Bar in Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {currentList.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button
                  className="modal-nav-btn"
                  onClick={handlePrevModalItem}
                  title="Previous Image (Keyboard: ← Left Arrow)"
                >
                  ◀ PREV <span className="hotkey-pill">←</span>
                </button>
                <span className="modal-counter-badge" style={{ fontSize: "11px", minWidth: "60px", textAlign: "center" }}>
                  {selectedModalIndex !== null ? selectedModalIndex + 1 : 1} / {currentList.length}
                </span>
                <button
                  className="modal-nav-btn"
                  onClick={handleNextModalItem}
                  title="Next Image (Keyboard: → Right Arrow)"
                >
                  NEXT ▶ <span className="hotkey-pill">→</span>
                </button>
              </div>
            )}

            <button
              className="clear-history-btn"
              style={{ marginLeft: "8px", padding: "4px 10px" }}
              onClick={closeModal}
              title="Close modal (Esc)"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* MODAL BODY: Left Viewport (Fixed) + Right Sidebar (Fixed) */}
        <div
          className="card-body modal-body-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 330px",
            gap: "16px",
            padding: "16px",
            flex: 1,
            minHeight: 0,
            overflow: "hidden"
          }}
        >
          {/* LEFT: IMAGE VIEWPORT WITH TOP MODE TOOLBAR */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", height: "100%", minHeight: 0 }}>
            {/* View Mode Toolbar (Outside Image) */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.03)",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                flexShrink: 0
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
                VIEW MODE:
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className={`modal-view-btn ${modalViewMode === "split" ? "active" : ""}`}
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                  onClick={() => setModalViewMode("split")}
                >
                  Split Compare
                </button>
                <button
                  className={`modal-view-btn ${modalViewMode === "annotated" ? "active" : ""}`}
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                  onClick={() => setModalViewMode("annotated")}
                >
                  Annotated
                </button>
                <button
                  className={`modal-view-btn ${modalViewMode === "raw" ? "active" : ""}`}
                  style={{ padding: "4px 10px", fontSize: "11px" }}
                  onClick={() => setModalViewMode("raw")}
                >
                  Raw Image
                </button>
              </div>
            </div>

            {/* Fixed-Size Clean Image Container (No overlays blocking) */}
            <div
              className="modal-image-container"
              style={{
                flex: 1,
                minHeight: 0,
                width: "100%",
                background: "#070913",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}
            >
              {selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl ? (
                <img
                  key={selectedModalItem.id + "_" + (selectedModalItem.imageUrl || "") + "_" + modalViewMode}
                  src={resolveImageUrl(
                    modalViewMode === "raw"
                      ? selectedModalItem.rawImageUrl || selectedModalItem.imageUrl
                      : modalViewMode === "annotated"
                        ? selectedModalItem.annotatedImageUrl || selectedModalItem.imageUrl
                        : selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl
                  )}
                  alt={selectedModalItem.id}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block"
                  }}
                />
              ) : (
                <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                  <div className="font-mono" style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-main)", marginBottom: "6px" }}>
                    WAFER IMAGE: WF_IMG_{selectedModalItem.id.replace("#WF-", "")}_{selectedModalItem.decision}.PNG
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-info)" }}>
                    AI Mask Overlay & Inspection Visual Stored in Edge NPU Memory
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: METADATA PANEL (FIXED WIDTH WITH SCROLL) */}
          <div
            className="modal-meta-panel"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
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
                gap: "8px",
                padding: "12px",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "6px",
                border: "1px solid var(--border-color)"
              }}
            >
              <div className="meta-row">
                <span className="meta-lbl">Machine no:</span>
                <span className="meta-val font-mono">{selectedModalItem.machineNo || "PROBER01"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Wafer ID:</span>
                <span className="meta-val font-mono" style={{ fontWeight: "bold" }}>{selectedModalItem.id}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Time stamp:</span>
                <span className="meta-val font-mono">{selectedModalItem.timestamp}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Result:</span>
                <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                  {selectedModalItem.decision}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Failure reason:</span>
                <span
                  className="meta-val font-mono"
                  style={{
                    color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit",
                    fontWeight: "600"
                  }}
                >
                  {selectedModalItem.reason || "-"}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Batch:</span>
                <span className="meta-val font-mono">{selectedModalItem.batch || "-"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Site coordinate:</span>
                <span className="meta-val font-mono">{selectedModalItem.xyCoord || "-"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Probecard site:</span>
                <span className="meta-val font-mono">{selectedModalItem.site || "-"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Pad no.:</span>
                <span className="meta-val font-mono">{selectedModalItem.pad || "-"}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Inference Latency:</span>
                <span className="meta-val font-mono">{selectedModalItem.inferenceTime ?? 0} ms</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Temp:</span>
                <span className="meta-val font-mono">{selectedModalItem.temp || "-"}</span>
              </div>
            </div>

            <button
              className="override-btn active"
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "13px",
                fontWeight: "bold",
                background: "var(--accent-blue)",
                color: "#fff",
                cursor: "pointer",
                borderRadius: "6px",
                border: "none",
                flexShrink: 0
              }}
              onClick={() => {
                mapInspectionData(selectedModalItem);
                navigate("/inspect");
                closeModal();
              }}
            >
              LOAD INTO LIVE VIEW
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
