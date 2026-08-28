import React from "react";
import { useInspection } from "../context/InspectionContext";
import WaferCanvas from "../components/WaferCanvas";

export default function InspectPage() {
  const {
    currentInspection,
    formatBatchWafer,
    sysStats,
    isBackendConnected,
    totalScans,
    passCount,
    failCount,
    yieldRate,
    history,
    setHistory,
    setCurrentInspection,
    setLoadedImage,
    setLoadedRawImage,
    apiBase,
    openModalWithItem
  } = useInspection();

  return (
    <div id="view-inspect" className="tab-content active-tab">
      <main className="hmi-grid">
        {/* LEFT SIDEBAR: DECISION & SUMMARY */}
        <section className="grid-col left-col">
          {/* DECISION PANEL */}
          <div className="hmi-card decision-card">
            <div className="card-body central-decision">
              <div
                id="decision-indicator"
                className={`decision-display ${
                  currentInspection.decision === "PASS"
                    ? "state-pass"
                    : currentInspection.decision === "FAIL"
                    ? "state-fail"
                    : "state-idle"
                }`}
              >
                <span className="decision-title">
                  {currentInspection.decision === "-" ? "WAITING" : currentInspection.decision}
                </span>
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
                  <span className="met-value font-mono highlight-blue" id="val-machine">
                    {currentInspection.machine || "PROBER01"}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="met-label">Batch / Wafer</span>
                  <span className="met-value font-mono" id="val-batch">
                    {currentInspection.batch && currentInspection.batch !== "-" ? currentInspection.batch : "-"}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="met-label">Pad / Site</span>
                  <span className="met-value font-mono" id="val-pad-site">
                    {currentInspection.pad && currentInspection.pad !== "-"
                      ? `${currentInspection.pad} / ${currentInspection.site || "-"}`
                      : "-"}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="met-label">XY Coord</span>
                  <span className="met-value font-mono" id="val-xy">
                    {currentInspection.xyCoord || "-"}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="met-label">Temp</span>
                  <span className="met-value font-mono highlight-orange" id="val-temp">
                    {currentInspection.temp
                      ? currentInspection.temp.includes("°C")
                        ? currentInspection.temp
                        : `${currentInspection.temp}°C`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CENTER PANEL: WAFER VIEW */}
        <section className="grid-col center-col">
          <div className="hmi-card wafer-viewer-card">
            <div className="card-header">
              <h3>LIVE VIEW (SPLIT COMPARE)</h3>
            </div>

            <div className="card-body canvas-container">
              <WaferCanvas />
            </div>

            {/* Live Telemetry Status Bar */}
            <div className="card-footer live-status-bar">
              <div className="status-indicator">
                <span className={`status-dot ${isBackendConnected ? "green-glow" : "offline"}`}></span>
                <span>{isBackendConnected ? "EDGE NPU ONLINE" : "EDGE NPU OFFLINE"}</span>
              </div>
              <div className="live-telemetry">
                <span>INFERENCE: PyTorch UNet + Rule Engine</span>
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
                  <span className="perf-val font-mono" id="npu-text">
                    {sysStats.npu < 0 || sysStats.npu === -1 ? "N/A" : `${sysStats.npu}%`}
                  </span>
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
                  <span className="meta-val font-mono highlight-green" id="active-model-name">
                    unet_pytorch_new.pth
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
          <div className="hmi-card history-card" style={{ width: "100%" }}>
            <div className="card-header">
              <h3>HISTORY</h3>
              <button
                className="clear-history-btn"
                id="btn-clear-history"
                onClick={() => {
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
                }}
              >
                Clear
              </button>
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
                  {history.slice(0, 15).map((item, index) => (
                    <tr key={index} onClick={() => openModalWithItem(item, index)} title="Click to view inspection image">
                      <td>{item.timestamp || item.timeShort || "-"}</td>
                      <td className="font-mono">{item.machineNo || "PROBER01"}</td>
                      <td className="font-mono">{formatBatchWafer(item)}</td>
                      <td className="font-mono">{item.pad || "-"}</td>
                      <td className="font-mono">{item.site || "-"}</td>
                      <td className="font-mono">{item.xyCoord || "-"}</td>
                      <td className="font-mono">{item.temp || "-"}</td>
                      <td>
                        <span className={`badge-result ${item.decision.toLowerCase()}`}>{item.decision}</span>
                      </td>
                      <td className="font-mono" style={{ fontSize: "13px", color: item.reason && item.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                        {item.reason || "-"}
                      </td>
                      <td className="font-mono">{item.inferenceTime ?? 0} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
