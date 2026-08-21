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

  // Configuration Management State (Product_Settine & Machine_Setting)
  const [activeConfig, setActiveConfig] = useState({
    product: {},
    machine: {},
    computed: {}
  });
  const [configUploadStatus, setConfigUploadStatus] = useState("");
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isUploadingMachine, setIsUploadingMachine] = useState(false);

  const fetchActiveConfig = async () => {
    try {
      const res = await fetch(`http://${edgeIp}:8001/api/config/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveConfig(data);
      }
    } catch (err) {
      console.warn("Failed fetching active config:", err);
    }
  };

  React.useEffect(() => {
    fetchActiveConfig();
  }, [edgeIp]);

  const handleProductUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingProduct(true);
    setConfigUploadStatus("Uploading Product Recipe...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`http://${edgeIp}:8001/api/config/upload-product`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setConfigUploadStatus(data.message || "Product recipe updated");
        fetchActiveConfig();
      } else {
        setConfigUploadStatus(data.message || "Upload failed");
      }
    } catch (err) {
      setConfigUploadStatus(`Error: ${err.message}`);
    } finally {
      setIsUploadingProduct(false);
    }
  };

  const handleMachineUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMachine(true);
    setConfigUploadStatus("Uploading Machine Setting...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`http://${edgeIp}:8001/api/config/upload-machine`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setConfigUploadStatus(data.message || "Machine setting updated");
        fetchActiveConfig();
      } else {
        setConfigUploadStatus(data.message || "Upload failed");
      }
    } catch (err) {
      setConfigUploadStatus(`Error: ${err.message}`);
    } finally {
      setIsUploadingMachine(false);
    }
  };

  const handleApplyPreset = async (presetName) => {
    try {
      setConfigUploadStatus(`Applying preset '${presetName}'...`);
      const res = await fetch(`http://${edgeIp}:8001/api/config/apply-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset_name: presetName })
      });
      const data = await res.json();
      if (res.ok) {
        setConfigUploadStatus(data.message || "Preset applied");
        fetchActiveConfig();
      } else {
        setConfigUploadStatus(`Failed applying preset: ${data.message}`);
      }
    } catch (err) {
      setConfigUploadStatus(`Error: ${err.message}`);
    }
  };

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
            </div>
          </div>
        </div>

        {/* CONFIG & RECIPE MANAGEMENT SECTION */}
        <div className="hmi-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: "700" }}>CONFIGURATION & RECIPE STUDIO</h3>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                Upload and manage factory parameters (<span className="font-mono" style={{ color: "var(--color-info)" }}>Product_Settine.txt</span> & <span className="font-mono" style={{ color: "var(--color-info)" }}>Machine_Setting.txt</span>) with live binding
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {configUploadStatus && (
                <div style={{ fontSize: "13px", fontWeight: "600", padding: "6px 12px", borderRadius: "6px", background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.25)", color: "var(--color-info)" }}>
                  {configUploadStatus}
                </div>
              )}
              <button className="select-file-btn" onClick={fetchActiveConfig} style={{ fontSize: "13px", padding: "6px 14px" }}>
                Refresh
              </button>
              <button className="select-file-btn" onClick={() => handleApplyPreset("default_factory")} style={{ fontSize: "13px", padding: "6px 14px", background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)", color: "var(--color-pass)" }}>
                Factory Default Preset
              </button>
            </div>
          </div>

          {/* 2 Dropzones */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {/* Product Recipe Dropzone */}
            <div style={{ border: "2px dashed var(--border-color)", borderRadius: "8px", padding: "20px", textAlign: "center", cursor: "pointer", background: "rgba(255,255,255,0.01)" }} onClick={() => document.getElementById("remix-product-input").click()}>
              <input id="remix-product-input" type="file" accept=".txt,.json" style={{ display: "none" }} onChange={handleProductUpload} />
              <div style={{ fontSize: "15px", fontWeight: "700" }}>{isUploadingProduct ? "Uploading..." : "Click or Drag Product_Settine.txt here"}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Active: {activeConfig?.computed?.failDistanceUm ?? 8}µm Fail Dist, {activeConfig?.computed?.maxAreaRatioPct ?? 25}% Max Area</div>
            </div>

            {/* Machine Setting Dropzone */}
            <div style={{ border: "2px dashed var(--border-color)", borderRadius: "8px", padding: "20px", textAlign: "center", cursor: "pointer", background: "rgba(255,255,255,0.01)" }} onClick={() => document.getElementById("remix-machine-input").click()}>
              <input id="remix-machine-input" type="file" accept=".txt,.json" style={{ display: "none" }} onChange={handleMachineUpload} />
              <div style={{ fontSize: "15px", fontWeight: "700" }}>{isUploadingMachine ? "Uploading..." : "Click or Drag Machine_Setting.txt here"}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>Source: {activeConfig?.machine?.["lot.source.folder"] || "N:\\WP288\\PMI\\IMAGE"}</div>
            </div>
          </div>

          {/* Computed Summary Badges */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>FAIL DISTANCE THRESHOLD</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--color-fail)" }} className="font-mono">{activeConfig?.computed?.failDistanceUm ?? 8.0} µm</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>MAX PROBEMARK AREA</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--color-warn)" }} className="font-mono">{activeConfig?.computed?.maxAreaRatioPct ?? 25.0} %</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>TARGET RESOLUTION</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)" }} className="font-mono">{activeConfig?.computed?.targetWidth ?? 160}x{activeConfig?.computed?.targetHeight ?? 160}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>INSPECTION ROI</div>
              <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--color-info)" }} className="font-mono">{((activeConfig?.computed?.hRoi ?? 0.7) * 100).toFixed(0)}% H x {((activeConfig?.computed?.vRoi ?? 0.7) * 100).toFixed(0)}% V</div>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
