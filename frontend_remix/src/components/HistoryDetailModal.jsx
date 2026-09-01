import React, { useState, useEffect } from "react";
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

  // Zoom & Pan Interactive State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Reset zoom on item switch
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [selectedModalItem?.id]);

  // Keyboard navigation & escape listener
  useEffect(() => {
    if (!selectedModalItem) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeModal();
      } else if (e.key === "ArrowLeft") {
        handlePrevModalItem();
      } else if (e.key === "ArrowRight") {
        handleNextModalItem();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedModalItem, closeModal, handlePrevModalItem, handleNextModalItem]);

  if (!selectedModalItem) return null;

  const currentList = getActiveModalList ? getActiveModalList() : [];

  return (
    <div className="modal-overlay" onClick={closeModal}>
      <div
        className="modal-content-box hmi-card"
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
            gridTemplateColumns: "1fr 280px",
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

            {/* Fixed-Size Clean Image Container (with Zoom & Pan) */}
            <div
              className="modal-image-container zoomable-container"
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
                position: "relative",
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

              {currentList.length > 1 && (
                <>
                  <button
                    className="modal-nav-arrow left"
                    onClick={handlePrevModalItem}
                    title="Previous Image (←)"
                  >
                    ◀
                  </button>
                  <button
                    className="modal-nav-arrow right"
                    onClick={handleNextModalItem}
                    title="Next Image (→)"
                  >
                    ▶
                  </button>
                </>
              )}

              {selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl ? (
                <img
                  className="zoomable-target"
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
                    display: "block",
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`
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

          {/* RIGHT: METADATA PANEL (RIGHT-ALIGNED VALUES) */}
          <div
            className="modal-meta-panel"
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
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Machine no:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.machineNo || "PROBER01"}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Wafer ID:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right", fontWeight: "bold" }}>{selectedModalItem.id}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Time stamp:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.timestamp}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                  {selectedModalItem.decision}
                </span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Failure reason:</span>
                <span
                  className="meta-val font-mono"
                  style={{
                    textAlign: "right",
                    wordBreak: "break-word",
                    color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit",
                    fontWeight: "600"
                  }}
                >
                  {selectedModalItem.reason || "-"}
                </span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Batch:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.batch || "-"}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Site coordinate:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.xyCoord || "-"}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Probecard site:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.site || "-"}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Pad no.:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.pad || "-"}</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Inference Latency:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.inferenceTime ?? 0} ms</span>
              </div>
              <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="meta-lbl" style={{ flexShrink: 0 }}>Temp:</span>
                <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.temp || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
