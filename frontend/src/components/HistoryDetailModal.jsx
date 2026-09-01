import React, { useState, useEffect, useRef } from "react";
import { useInspection } from "../context/InspectionContext";

export default function HistoryDetailModal() {
  const {
    closeModal,
    getActiveModalList,
    handleNextModalItem,
    handlePrevModalItem,
    history,
    mapInspectionData,
    modalViewMode,
    resolveImageUrl,
    selectedModalIndex,
    selectedModalItem,
    setModalViewMode,
    getRecordDisplayDateTime
  } = useInspection();

  const [historyModalZoom, setHistoryModalZoom] = useState(1);
  const [historyModalPan, setHistoryModalPan] = useState({ x: 0, y: 0 });
  const [isPanningHistory, setIsPanningHistory] = useState(false);
  const historyContainerRef = useRef(null);
  const historyDragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const clampHistoryPan = (x, y, zoom) => {
    if (zoom <= 1.0) return { x: 0, y: 0 };
    const rect = historyContainerRef.current ? historyContainerRef.current.getBoundingClientRect() : { width: 900, height: 600 };
    const maxPanX = Math.max(0, (rect.width * (zoom - 1)) / 2);
    const maxPanY = Math.max(0, (rect.height * (zoom - 1)) / 2);
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y))
    };
  };

  const resetHistoryZoom = (e) => {
    if (e) e.stopPropagation();
    setHistoryModalZoom(1);
    setHistoryModalPan({ x: 0, y: 0 });
  };

  const handleHistoryZoomIn = (e) => {
    if (e) e.stopPropagation();
    setHistoryModalZoom(prev => {
      const next = Math.min(5.0, Math.round((prev + 0.25) * 100) / 100);
      return next;
    });
  };

  const handleHistoryZoomOut = (e) => {
    if (e) e.stopPropagation();
    setHistoryModalZoom(prev => {
      const next = Math.max(1.0, Math.round((prev - 0.25) * 100) / 100);
      if (next === 1.0) setHistoryModalPan({ x: 0, y: 0 });
      else setHistoryModalPan(p => clampHistoryPan(p.x, p.y, next));
      return next;
    });
  };

  const handleHistoryPointerDown = (e) => {
    if (historyModalZoom <= 1.0 || e.button !== 0) return;
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    setIsPanningHistory(true);
    historyDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: historyModalPan.x,
      panY: historyModalPan.y
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleHistoryPointerMove = (e) => {
    if (!isPanningHistory || historyModalZoom <= 1.0) return;
    const dx = e.clientX - historyDragRef.current.x;
    const dy = e.clientY - historyDragRef.current.y;
    setHistoryModalPan(clampHistoryPan(historyDragRef.current.panX + dx, historyDragRef.current.panY + dy, historyModalZoom));
  };

  const handleHistoryPointerUp = (e) => {
    if (isPanningHistory) {
      setIsPanningHistory(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handleHistoryDoubleClick = (e) => {
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    // Double clicking smoothly expands the zoom without ever resetting
    setHistoryModalZoom(prev => (prev >= 5.0 ? 5.0 : Math.min(5.0, Math.round((prev + 1.0) * 100) / 100)));
  };

  useEffect(() => {
    setHistoryModalZoom(1);
    setHistoryModalPan({ x: 0, y: 0 });
  }, [selectedModalItem?.id]);

  if (!selectedModalItem) return null;

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
              {/* MODAL HEADER */}
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
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>HISTORICAL INSPECTION</h3>
                  <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                    {selectedModalItem.decision}
                  </span>
                  {getActiveModalList().length > 0 && (
                    <span className="modal-counter-badge">
                      ( ภาพที่ {selectedModalIndex !== null ? selectedModalIndex + 1 : 1} / {getActiveModalList().length} )
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {getActiveModalList().length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        className="modal-nav-btn"
                        onClick={handlePrevModalItem}
                        title="Previous Image (Keyboard: ← Left Arrow)"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        ◀ PREV
                      </button>
                      <button
                        className="modal-nav-btn"
                        onClick={handleNextModalItem}
                        title="Next Image (Keyboard: → Right Arrow)"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        NEXT ▶
                      </button>
                    </div>
                  )}
                  <button className="clear-history-btn" style={{ padding: "4px 12px", fontSize: "12px" }} onClick={closeModal}>Close</button>
                </div>
              </div>

              {/* MODAL BODY */}
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
                {/* LEFT: IMAGE VIEWPORT */}
                <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: "10px" }}>
                  {/* View Mode Segmented Controls */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="toggle-group" style={{ display: "flex", gap: "2px" }}>
                      <button
                        className={`modal-view-btn ${modalViewMode === "comparison" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("comparison")}
                      >
                        Split Compare
                      </button>
                      <button
                        className={`modal-view-btn ${modalViewMode === "annotated" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("annotated")}
                      >
                        Annotated
                      </button>
                      <button
                        className={`modal-view-btn ${modalViewMode === "raw" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("raw")}
                      >
                        Raw Image
                      </button>
                    </div>
                  </div>

                  {/* Fixed-Size Clean Image Container with Zoom & Pan */}
                  <div
                    ref={historyContainerRef}
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
                      cursor: historyModalZoom > 1 ? (isPanningHistory ? "grabbing" : "grab") : "default"
                    }}
                    onWheel={(e) => {
                      const delta = e.deltaY < 0 ? 0.25 : -0.25;
                      setHistoryModalZoom(prev => {
                        const next = Math.min(5.0, Math.max(1.0, Math.round((prev + delta) * 100) / 100));
                        if (next === 1.0) setHistoryModalPan({ x: 0, y: 0 });
                        else setHistoryModalPan(p => clampHistoryPan(p.x, p.y, next));
                        return next;
                      });
                    }}
                    onDoubleClick={handleHistoryDoubleClick}
                    onPointerDown={handleHistoryPointerDown}
                    onPointerMove={handleHistoryPointerMove}
                    onPointerUp={handleHistoryPointerUp}
                    onPointerCancel={handleHistoryPointerUp}
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
                        onClick={handleHistoryZoomOut}
                        disabled={historyModalZoom <= 1.0}
                        title="Zoom Out"
                      >
                        −
                      </button>
                      <span className="zoom-badge">
                        {Math.round(historyModalZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        className="zoom-btn"
                        onClick={handleHistoryZoomIn}
                        disabled={historyModalZoom >= 5.0}
                        title="Zoom In"
                      >
                        +
                      </button>
                      <div className="zoom-divider"></div>
                      <button
                        type="button"
                        className="zoom-btn-reset"
                        onClick={resetHistoryZoom}
                        title="Reset to 100%"
                      >
                        ↺ Reset
                      </button>
                    </div>

                    {getActiveModalList().length > 1 && (
                      <>
                        <button
                          className="modal-nav-arrow left"
                          onClick={handlePrevModalItem}
                          title="Previous Image (Left Arrow)"
                        >
                          ◀
                        </button>
                        <button
                          className="modal-nav-arrow right"
                          onClick={handleNextModalItem}
                          title="Next Image (Right Arrow)"
                        >
                          ▶
                        </button>
                      </>
                    )}

                    {selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl ? (
                      <img
                        className="zoomable-target"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
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
                          pointerEvents: "none",
                          transform: `translate3d(${historyModalPan.x}px, ${historyModalPan.y}px, 0) scale(${historyModalZoom})`,
                          transition: isPanningHistory ? "none" : "transform 0.15s ease-out"
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
                <div className="modal-meta-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  <div className="model-meta-box" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)" }}>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Machine no:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.machineNo || "PROBER01"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Wafer ID:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.id}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Time stamp:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{getRecordDisplayDateTime(selectedModalItem)}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                      <span className={`badge-result ${String(selectedModalItem.decision || "-").toLowerCase()}`}>{selectedModalItem.decision || "-"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Failure reason:</span>
                      <span
                        className="meta-val font-mono"
                        style={{
                          textAlign: "right",
                          wordBreak: "break-word",
                          color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit"
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
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Datetime:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{getRecordDisplayDateTime(selectedModalItem)}</span>
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
