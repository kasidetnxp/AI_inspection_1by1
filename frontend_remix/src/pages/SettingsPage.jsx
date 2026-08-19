import React, { useState } from "react";
import { useInspection } from "../context/InspectionContext";

export default function SettingsPage() {
  const {
    edgeIp,
    updateEdgeIp,
    isBackendConnected,
    connectionStatus,
    testConnection,
    dbType,
    sysStats,
    benchmarkRules,
    setBenchmarkRules,
    isSimRunning,
    setIsSimRunning,
    simSpeed,
    setSimSpeed,
    runSingleOfflineInspection
  } = useInspection();

  const [tempIp, setTempIp] = useState(edgeIp);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  const handleSaveIp = (e) => {
    e.preventDefault();
    const sanitized = tempIp.trim();
    updateEdgeIp(sanitized);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
    // Also trigger ping test
    handleTestPing(sanitized);
  };

  const handleTestPing = async (ipToTest) => {
    const target = ipToTest || tempIp || edgeIp;
    setIsPinging(true);
    setPingResult(null);
    const res = await testConnection(target);
    setIsPinging(false);
    setPingResult(res);
  };

  return (
    <div className="tab-content active-tab" id="view-settings">
      <main style={{ padding: "24px 28px 80px 28px", maxWidth: "1280px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "20px", fontWeight: "700" }}>SYSTEM CONFIGURATION</h2>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
              Manage Edge i.MX8 node endpoints, rule engine inspection thresholds, and offline test simulation
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span
              className="badge-result"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: "700",
                background: connectionStatus === "CONNECTED" ? "rgba(16, 185, 129, 0.15)" : connectionStatus === "CONNECTING" ? "rgba(14, 165, 233, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: connectionStatus === "CONNECTED" ? "#10b981" : connectionStatus === "CONNECTING" ? "#38bdf8" : "#ef4444",
                border: `1px solid ${connectionStatus === "CONNECTED" ? "rgba(16, 185, 129, 0.4)" : connectionStatus === "CONNECTING" ? "rgba(14, 165, 233, 0.4)" : "rgba(239, 68, 68, 0.4)"}`
              }}
            >
              {connectionStatus === "CONNECTED" ? "EDGE: ONLINE" : connectionStatus === "CONNECTING" ? "EDGE: CONNECTING..." : "EDGE: OFFLINE"}
            </span>
          </div>
        </div>

        {/* 3-COLUMN / GRID SETTINGS TILES */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
          
          {/* CARD 1: EDGE NODE & CONNECTIVITY */}
          <div className="hmi-card">
            <div className="card-header">
              <h3>EDGE NODE & CONNECTIVITY</h3>
              <span className="pill-id">NETWORKING</span>
            </div>
            <div className="card-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <form onSubmit={handleSaveIp} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div className="form-group-lab">
                  <label>i.MX8 Edge IP Address / Hostname</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      value={tempIp}
                      onChange={(e) => {
                        setTempIp(e.target.value);
                        setPingResult(null);
                      }}
                      placeholder="e.g. 10.42.0.95 or localhost"
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: "6px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-main)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "13px"
                      }}
                    />
                    <button
                      type="submit"
                      className="select-file-btn"
                      style={{ padding: "8px 16px", fontSize: "12px", borderRadius: "6px" }}
                    >
                      Apply IP
                    </button>
                    <button
                      type="button"
                      className="select-file-btn"
                      style={{ padding: "8px 14px", fontSize: "12px", borderRadius: "6px", background: "rgba(14, 165, 233, 0.2)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.4)" }}
                      onClick={() => handleTestPing(tempIp)}
                      disabled={isPinging}
                    >
                      {isPinging ? "Testing..." : "Ping"}
                    </button>
                  </div>
                  {saveSuccess && (
                    <span style={{ fontSize: "11px", color: "var(--color-pass)", marginTop: "4px" }}>
                      ✓ IP updated & connecting...
                    </span>
                  )}
                  {pingResult && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        fontSize: "11.5px",
                        background: pingResult.ok ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                        border: `1px solid ${pingResult.ok ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                        color: pingResult.ok ? "var(--color-pass)" : "var(--color-fail)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <span>{pingResult.ok ? "✓ Endpoint Reachable" : "✕ Endpoint Unreachable"}</span>
                      <strong className="font-mono">{pingResult.message}</strong>
                    </div>
                  )}
                </div>
              </form>

              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Active Edge IP:</span>
                  <span className="font-mono" style={{ fontWeight: "bold" }}>{edgeIp}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>FastAPI API Base:</span>
                  <span className="font-mono">http://{edgeIp}:8001</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>FastAPI Inspection WS:</span>
                  <span className="font-mono">ws://{edgeIp}:8001/ws</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Database Engine:</span>
                  <span className="font-mono" style={{ color: "var(--color-pass)", fontWeight: "bold" }}>{dbType}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted)" }}>Edge Hardware Temp:</span>
                  <span className="font-mono">{isBackendConnected ? `${sysStats.temp}°C` : "N/A"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: INSPECTION RULE THRESHOLDS */}
          <div className="hmi-card">
            <div className="card-header">
              <h3>RULE ENGINE THRESHOLDS</h3>
              <span className="pill-id">AI QUALITY</span>
            </div>
            <div className="card-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="form-group-lab">
                <label style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Min Edge Distance Tolerance</span>
                  <span className="slider-val-badge font-mono">{benchmarkRules.fail_distance_um.toFixed(1)} µm</span>
                </label>
                <div className="lab-slider-row">
                  <input
                    type="range"
                    min="1.0"
                    max="25.0"
                    step="0.5"
                    className="lab-slider"
                    value={benchmarkRules.fail_distance_um}
                    onChange={(e) => setBenchmarkRules(prev => ({ ...prev, fail_distance_um: parseFloat(e.target.value) }))}
                  />
                </div>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  Probe marks closer than this distance to the pad border will be classified as FAIL.
                </span>
              </div>

              <div className="form-group-lab">
                <label style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Max Probe Mark Area Ratio</span>
                  <span className="slider-val-badge font-mono">{benchmarkRules.max_area_ratio_pct.toFixed(0)}%</span>
                </label>
                <div className="lab-slider-row">
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="1"
                    className="lab-slider"
                    value={benchmarkRules.max_area_ratio_pct}
                    onChange={(e) => setBenchmarkRules(prev => ({ ...prev, max_area_ratio_pct: parseFloat(e.target.value) }))}
                  />
                </div>
                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                  Marks exceeding this pad surface coverage percentage trigger a FAIL alarm.
                </span>
              </div>

              <div className="form-group-lab">
                <label>Missing Probe Mark Action</label>
                <select
                  className="lab-select"
                  value={benchmarkRules.missing_mark_action}
                  onChange={(e) => setBenchmarkRules(prev => ({ ...prev, missing_mark_action: e.target.value }))}
                >
                  <option value="fail">Strict: Trigger FAIL (Requires Probe Mark on Pad)</option>
                  <option value="pass">Tolerant: Allow PASS (Untouched Pristine Pad)</option>
                </select>
              </div>
            </div>
          </div>

          {/* CARD 3: SIMULATION & DEBUG */}
          <div className="hmi-card">
            <div className="card-header">
              <h3>OFFLINE SIMULATOR & TEST</h3>
              <span className="pill-id">DEBUG</span>
            </div>
            <div className="card-body" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "600", fontSize: "13px" }}>Auto-Simulation Loop</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Generates synthetic test wafer scans when backend is offline
                  </div>
                </div>
                <button
                  className={`view-btn ${isSimRunning ? "active" : ""}`}
                  style={{ padding: "6px 14px" }}
                  onClick={() => setIsSimRunning(!isSimRunning)}
                >
                  {isSimRunning ? "RUNNING" : "STOPPED"}
                </button>
              </div>

              <div className="form-group-lab">
                <label style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Simulation Interval</span>
                  <span className="slider-val-badge font-mono">{simSpeed} ms</span>
                </label>
                <div className="lab-slider-row">
                  <input
                    type="range"
                    min="500"
                    max="6000"
                    step="500"
                    className="lab-slider"
                    value={simSpeed}
                    onChange={(e) => setSimSpeed(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <button
                  className="select-file-btn"
                  style={{ flex: 1, padding: "8px", fontSize: "12px", borderRadius: "6px" }}
                  onClick={() => runSingleOfflineInspection(false)}
                >
                  + Trigger Random Die
                </button>
                <button
                  className="select-file-btn"
                  style={{ flex: 1, padding: "8px", fontSize: "12px", background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "6px" }}
                  onClick={() => runSingleOfflineInspection(true)}
                >
                  + Force Defect
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
