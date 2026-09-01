import React, { useState, useRef, useEffect } from "react";
import { useInspection } from "../context/InspectionContext";

export default function InspectPage() {
  const {
    activeTab,
    apiBase,
    canvasRef,
    compareMode,
    currentInspection,
    failCount,
    formatBatchWafer,
    history,
    isBackendConnected,
    modelsList,
    openModalWithItem,
    passCount,
    renderCanvas,
    scannerRef,
    setCurrentInspection,
    setHistory,
    setLoadedImage,
    setLoadedRawImage,
    sysStats,
    totalScans,
    yieldRate,
    getRecordDisplayDateTime
  } = useInspection();

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Zoom & Pan Interactive State (Live Inspect Canvas)
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const canvasContainerRef = useRef(null);
  const canvasDragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const clampCanvasPan = (x, y, zoom) => {
    if (zoom <= 1.0) return { x: 0, y: 0 };
    const rect = canvasContainerRef.current ? canvasContainerRef.current.getBoundingClientRect() : { width: 600, height: 400 };
    const maxPanX = Math.max(0, (rect.width * (zoom - 1)) / 2);
    const maxPanY = Math.max(0, (rect.height * (zoom - 1)) / 2);
    return {
      x: Math.min(maxPanX, Math.max(-maxPanX, x)),
      y: Math.min(maxPanY, Math.max(-maxPanY, y))
    };
  };

  const resetCanvasZoom = (e) => {
    if (e) e.stopPropagation();
    setCanvasZoom(1);
    setCanvasPan({ x: 0, y: 0 });
  };

  const handleCanvasZoomIn = (e) => {
    if (e) e.stopPropagation();
    setCanvasZoom(prev => {
      const next = Math.min(4.0, Math.round((prev + 0.25) * 100) / 100);
      return next;
    });
  };

  const handleCanvasZoomOut = (e) => {
    if (e) e.stopPropagation();
    setCanvasZoom(prev => {
      const next = Math.max(1.0, Math.round((prev - 0.25) * 100) / 100);
      if (next === 1.0) setCanvasPan({ x: 0, y: 0 });
      else setCanvasPan(p => clampCanvasPan(p.x, p.y, next));
      return next;
    });
  };

  const handleCanvasPointerDown = (e) => {
    if (canvasZoom <= 1.0 || e.button !== 0) return;
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    setIsPanningCanvas(true);
    canvasDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: canvasPan.x,
      panY: canvasPan.y
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handleCanvasPointerMove = (e) => {
    if (!isPanningCanvas || canvasZoom <= 1.0) return;
    const dx = e.clientX - canvasDragRef.current.x;
    const dy = e.clientY - canvasDragRef.current.y;
    setCanvasPan(clampCanvasPan(canvasDragRef.current.panX + dx, canvasDragRef.current.panY + dy, canvasZoom));
  };

  const handleCanvasPointerUp = (e) => {
    if (isPanningCanvas) {
      setIsPanningCanvas(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handleCanvasDoubleClick = (e) => {
    if (e.target.closest(".zoom-toolbar-floating") || e.target.closest("button")) return;
    // Double clicking smoothly expands the zoom without ever resetting
    setCanvasZoom(prev => (prev >= 4.0 ? 4.0 : Math.min(4.0, Math.round((prev + 1.0) * 100) / 100)));
  };

  return (
        <div id="view-inspect" className={`tab-content ${activeTab === "inspect" ? "active-tab" : ""}`}>
          <main className="hmi-grid">

            {/* LEFT SIDEBAR: DECISION & SUMMARY */}
            <section className="grid-col left-col">
              {/* DECISION PANEL */}
              <div className="hmi-card decision-card">
                <div className="card-body central-decision">
                  <div id="decision-indicator" className={`decision-display ${currentInspection.decision === "PASS" ? "state-pass" : currentInspection.decision === "FAIL" ? "state-fail" : "state-idle"}`}>
                    <span className="decision-title">{currentInspection.decision === "-" ? "WAITING" : currentInspection.decision}</span>
                  </div>
                </div>
              </div>

              {/* SUMMARY PANEL */}
              <div className="hmi-card summary-card" style={{ flex: 1 }}>
                <div className="card-header">
                  <h3>SUMMARY</h3>
                </div>
                <div className="card-body">
                  <div className="metric-list">
                    <div className="metric-row">
                      <span className="met-label">Machine No.</span>
                      <span className="met-value font-mono highlight-blue" id="val-machine">{currentInspection.machine || "PROBER01"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Batch / Wafer</span>
                      <span className="met-value font-mono" id="val-batch">{currentInspection.batch && currentInspection.batch !== "-" ? currentInspection.batch : "-"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Pad / Site</span>
                      <span className="met-value font-mono" id="val-pad-site">
                        {currentInspection.pad && currentInspection.pad !== "-" ? `${currentInspection.pad} / ${currentInspection.site || '-'}` : "-"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">XY Coord</span>
                      <span className="met-value font-mono" id="val-xy">{currentInspection.xyCoord || "-"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Temp</span>
                      <span className="met-value font-mono highlight-orange" id="val-temp">{currentInspection.temp ? (currentInspection.temp.includes("°C") ? currentInspection.temp : `${currentInspection.temp}°C`) : "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* CENTER PANEL: WAFER VIEW */}
            <section className="grid-col center-col">
              <div className="hmi-card wafer-viewer-card">
                <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>LIVE VIEW (SPLIT COMPARE)</h3>
                  {/* Header-aligned Zoom Controls Toolbar */}
                  <div
                    className="zoom-toolbar-header"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="zoom-btn"
                      onClick={handleCanvasZoomOut}
                      disabled={canvasZoom <= 1.0}
                      title="Zoom Out"
                    >
                      −
                    </button>
                    <span className="zoom-badge">
                      {Math.round(canvasZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className="zoom-btn"
                      onClick={handleCanvasZoomIn}
                      disabled={canvasZoom >= 4.0}
                      title="Zoom In"
                    >
                      +
                    </button>
                    <div className="zoom-divider"></div>
                    <button
                      type="button"
                      className="zoom-btn-reset"
                      onClick={resetCanvasZoom}
                      title="Reset to 100%"
                    >
                      ↺ Reset
                    </button>
                  </div>
                </div>

                <div
                  ref={canvasContainerRef}
                  className="card-body canvas-container zoomable-container"
                  style={{ cursor: canvasZoom > 1 ? (isPanningCanvas ? "grabbing" : "grab") : "default" }}
                  onWheel={(e) => {
                    const delta = e.deltaY < 0 ? 0.25 : -0.25;
                    setCanvasZoom(prev => {
                      const next = Math.min(4.0, Math.max(1.0, Math.round((prev + delta) * 100) / 100));
                      if (next === 1.0) setCanvasPan({ x: 0, y: 0 });
                      else setCanvasPan(p => clampCanvasPan(p.x, p.y, next));
                      return next;
                    });
                  }}
                  onDoubleClick={handleCanvasDoubleClick}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  <canvas
                    ref={canvasRef}
                    id="wafer-canvas"
                    className={`zoomable-target ${compareMode === "overlay" ? "overlay-mode" : "split-mode"}`}
                    style={{
                      transform: `translate3d(${canvasPan.x}px, ${canvasPan.y}px, 0) scale(${canvasZoom})`,
                      transition: isPanningCanvas ? "none" : "transform 0.15s ease-out"
                    }}
                  ></canvas>
                  <div ref={scannerRef} className="scanning-bar" id="scanner-line"></div>
                </div>

                {/* Live Telemetry Status Bar */}
                <div className="card-footer live-status-bar">
                  <div className="status-indicator">
                    <span className={`status-dot ${isBackendConnected ? "green-glow" : "offline"}`}></span>
                    <span>{isBackendConnected ? "EDGE NPU ONLINE" : "EDGE NPU OFFLINE"}</span>
                  </div>
                  <div className="live-telemetry">
                    <span>INFERENCE: {modelsList.find(m => m.active)?.name || "unet.tflite"} + Rule Engine</span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT PANEL: PERFORMANCE & STATISTICS */}
            <section className="grid-col right-col">
              {/* SYSTEM PERFORMANCE */}
              <div className="hmi-card stats-card">
                <div className="card-header">
                  <h3>PERFORMANCE</h3>
                </div>
                <div className="card-body performance-body">
                  <div className="perf-grid">
                    <div className="perf-tile">
                      <span className="perf-lbl">CPU</span>
                      <span className="perf-val font-mono" id="cpu-text">{sysStats.cpu}%</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">NPU</span>
                      <span className="perf-val font-mono" id="npu-text">{sysStats.npu < 0 || sysStats.npu === -1 ? 'N/A' : `${sysStats.npu}%`}</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">RAM</span>
                      <span className="perf-val font-mono" id="ram-text-short">{sysStats.ram}%</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">TEMP</span>
                      <span className="perf-val font-mono" id="temp-text">{sysStats.temp}°C</span>
                    </div>
                  </div>

                  <div className="model-meta-box">
                    <div className="meta-row">
                      <span className="meta-lbl">Model:</span>
                      <span className="meta-val font-mono highlight-green" id="active-model-name" title={modelsList.find(m => m.active)?.name || "unet.tflite"}>
                        {modelsList.find(m => m.active)?.name || "unet.tflite"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STATISTICS CARD */}
              <div className="hmi-card statistics-card">
                <div className="card-header">
                  <h3>STATISTICS</h3>
                </div>
                <div className="card-body">
                  <div className="stats-overview">
                    <div className="stat-main">
                      <span className="lbl">TOTAL</span>
                      <span className="val font-mono" id="stat-total">{totalScans}</span>
                    </div>

                    <div className="stat-breakdown">
                      <div className="sub-stat green-text">
                        <span className="lbl">PASS</span>
                        <span className="val font-mono" id="stat-pass">{passCount}</span>
                      </div>
                      <div className="sub-stat red-text">
                        <span className="lbl">FAIL</span>
                        <span className="val font-mono" id="stat-fail">{failCount}</span>
                      </div>
                      <div className="sub-stat blue-text">
                        <span className="lbl">YIELD</span>
                        <span className="val font-mono" id="stat-yield">{yieldRate}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* BOTTOM ROW: HISTORY */}
            <section className="grid-row bottom-row">
              {/* HISTORY PANEL */}
              <div className="hmi-card history-card" style={{ width: "100%" }}>
                <div className="card-header">
                  <h3>HISTORY</h3>
                  <button className="clear-history-btn" id="btn-clear-history" onClick={() => {
                      setHistory([]);
                      setCurrentInspection({
                        id: "-", batch: "-", waferNo: "-", xyCoord: "-", site: "-", pad: "-", temp: "-",
                        padsTotal: 0, padsDetected: 0, probeMarks: 0, grains: 0,
                        confidence: 0, inferenceTime: 0, ruleTime: 0, decision: "-", machineAction: "WAITING"
                      });
                      setLoadedImage(null);
                      setLoadedRawImage(null);
                      fetch(`${apiBase}/api/history`, { method: "DELETE" })
                        .catch(err => console.error("Error clearing backend history:", err));
                    }}>Clear</button>
                </div>
                <div className="card-body table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Machine no</th>
                        <th>Batch/Wafer no</th>
                        <th>Pad</th>
                        <th>Site</th>
                        <th>XY Coordinate</th>
                        <th>Temp</th>
                        <th>Result</th>
                        <th>Failure Reason</th>
                        <th>Latency</th>
                      </tr>
                    </thead>
                    <tbody id="history-table-body">
                      {history.slice(0, 15).map((item, index) => {
                        const itemDecision = String(item.decision || "-");
                        return (
                          <tr key={item.id ? `${item.id}-${index}` : index} onClick={() => openModalWithItem(item, index)} title="Click to view inspection image">
                            <td>{getRecordDisplayDateTime(item)}</td>
                            <td className="font-mono">{item.machineNo || "PROBER01"}</td>
                            <td className="font-mono">{formatBatchWafer(item)}</td>
                            <td className="font-mono">{item.pad || "-"}</td>
                            <td className="font-mono">{item.site || "-"}</td>
                            <td className="font-mono">{item.xyCoord || "-"}</td>
                            <td className="font-mono">{item.temp || "-"}</td>
                            <td>
                              <span className={`badge-result ${itemDecision.toLowerCase()}`}>{itemDecision}</span>
                            </td>
                            <td className="font-mono" style={{ fontSize: "13px", color: item.reason && item.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                              {item.reason || "-"}
                            </td>
                            <td className="font-mono">{item.inferenceTime ?? 0} ms</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </main>
        </div>
  );
}
