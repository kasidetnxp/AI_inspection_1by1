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

  const handleSaveThresholds = async () => {
    try {
      setConfigUploadStatus("Saving thresholds...");
      const res = await fetch(`http://${edgeIp}:8001/api/config/update-thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fail_distance_um: benchmarkRules.fail_distance_um,
          max_area_ratio_pct: benchmarkRules.max_area_ratio_pct
        })
      });
      const data = await res.json();
      if (res.ok) {
        setConfigUploadStatus(data.message || "Thresholds updated");
        fetchActiveConfig();
      } else {
        setConfigUploadStatus(`Failed: ${data.message}`);
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
      <main style={{ padding: "20px 24px", maxWidth: "1500px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: "20px" }}>
          
          {/* CARD 1: EDGE NODE & SYSTEM CONNECTIVITY */}
          <div className="hmi-card" style={{ padding: "24px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "20px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "18px" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "0.5px" }}>EDGE NODE & SYSTEM</h3>
                <span
                  className="badge-result"
                  style={{
                    fontSize: "12px",
                    fontWeight: "700",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    background: isBackendConnected ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: isBackendConnected ? "#10b981" : "#ef4444",
                    border: `1px solid ${isBackendConnected ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`
                  }}
                >
                  {isBackendConnected ? "EDGE: ONLINE" : "EDGE: OFFLINE"}
                </span>
              </div>

              <form onSubmit={handleSaveIp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div className="form-group-lab" style={{ margin: 0 }}>
                  <label style={{ fontSize: "13.5px", color: "var(--text-muted)", fontWeight: "600" }}>i.MX8 Hostname / IP Address</label>
                  <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                    <input
                      type="text"
                      value={tempIp}
                      onChange={(e) => {
                        setTempIp(e.target.value);
                        setPingResult(null);
                      }}
                      placeholder="localhost or 10.42.0.95"
                      style={{
                        flex: 1,
                        padding: "11px 14px",
                        borderRadius: "8px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-main)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "14px"
                      }}
                    />
                    <button
                      type="submit"
                      className="select-file-btn"
                      style={{ padding: "10px 18px", fontSize: "13px", fontWeight: "700", borderRadius: "8px" }}
                    >
                      Apply IP
                    </button>
                    <button
                      type="button"
                      className="select-file-btn"
                      style={{ padding: "10px 18px", fontSize: "13px", fontWeight: "700", borderRadius: "8px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.35)" }}
                      onClick={() => handleTestPing(tempIp)}
                      disabled={isPinging}
                    >
                      {isPinging ? "Testing..." : "Ping"}
                    </button>
                  </div>
                </div>

                {saveSuccess && (
                  <span style={{ fontSize: "13px", color: "var(--color-pass)", fontWeight: "600" }}>
                    IP address updated successfully
                  </span>
                )}

                {pingResult && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      background: pingResult.ok ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                      border: `1px solid ${pingResult.ok ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                      color: pingResult.ok ? "var(--color-pass)" : "var(--color-fail)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <span>{pingResult.ok ? "Node Reachable" : "Unreachable"}</span>
                    <strong className="font-mono" style={{ fontSize: "13px" }}>{pingResult.message}</strong>
                  </div>
                )}
              </form>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "10px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>DATABASE</div>
                <div className="font-mono" style={{ color: "var(--color-pass)", fontWeight: "700", fontSize: "16px", marginTop: "4px" }}>{dbType}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>API ENDPOINT</div>
                <div className="font-mono" style={{ color: "var(--color-info)", fontWeight: "600", fontSize: "15px", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>http://{edgeIp}:8001</div>
              </div>
            </div>

          </div>

          {/* CARD 2: AI INSPECTION THRESHOLDS */}
          <div className="hmi-card" style={{ padding: "24px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "20px" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", marginBottom: "18px" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "0.5px" }}>AI INSPECTION THRESHOLDS</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="select-file-btn"
                    style={{ padding: "7px 16px", fontSize: "13px", fontWeight: "700", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)", color: "var(--color-pass)" }}
                    onClick={() => handleApplyPreset("default_factory")}
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    className="select-file-btn"
                    style={{ padding: "7px 18px", fontSize: "13px", fontWeight: "700", borderRadius: "8px" }}
                    onClick={handleSaveThresholds}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Min Edge Slider */}
                <div className="form-group-lab" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", fontWeight: "700", color: "var(--text-muted)" }}>
                    <span>FAIL DISTANCE (EDGE)</span>
                    <span className="slider-val-badge font-mono" style={{ color: "var(--color-fail)", fontWeight: "800", fontSize: "16px" }}>{benchmarkRules.fail_distance_um.toFixed(1)} µm</span>
                  </div>
                  <div className="lab-slider-row" style={{ marginTop: "10px" }}>
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
                </div>

                {/* Max Area Ratio Slider */}
                <div className="form-group-lab" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", fontWeight: "700", color: "var(--text-muted)" }}>
                    <span>MAX PROBE MARK AREA</span>
                    <span className="slider-val-badge font-mono" style={{ color: "var(--color-warn)", fontWeight: "800", fontSize: "16px" }}>{benchmarkRules.max_area_ratio_pct.toFixed(0)}%</span>
                  </div>
                  <div className="lab-slider-row" style={{ marginTop: "10px" }}>
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
                </div>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Thresholds apply in real-time to AI decision rules</span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-info)", letterSpacing: "0.5px" }}>AUTO SYNCED</span>
            </div>

          </div>

        </div>

        {/* EXPANDED & BALANCED RECIPE & MACHINE CONFIGURATION UPLOAD SECTION */}
        <div className="hmi-card" style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "20px", marginTop: "24px" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "0.5px" }}>RECIPE & MACHINE CONFIGURATION</h3>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>Upload setup files for real-time synchronization with i.MX8 Edge inference pipeline</div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", background: "rgba(14, 165, 233, 0.1)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.25)", fontWeight: "600" }}>
                HOT RELOAD SUPPORTED
              </span>
            </div>
          </div>

          {configUploadStatus && (
            <div style={{ fontSize: "13.5px", fontWeight: "600", padding: "12px 16px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.3)", color: "var(--color-info)", display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>{configUploadStatus}</span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "20px" }}>
            
            {/* PRODUCT RECIPE BOX */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(14, 165, 233, 0.25)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Product Recipe Configuration</h4>
                    <span className="font-mono" style={{ fontSize: "12px", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: "4px", color: "var(--text-muted)" }}>Product_Settine.txt</span>
                  </div>
                  <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.45" }}>
                    Specifies wafer defect rules, probe mark tolerance, pad coordinates, and AI model inference scripts.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <input
                  id="remix-product-input"
                  type="file"
                  accept=".txt,.json"
                  style={{ display: "none" }}
                  onChange={handleProductUpload}
                />
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: 1,
                    padding: "12px 18px",
                    fontSize: "14px",
                    fontWeight: "700",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    background: "rgba(14, 165, 233, 0.08)",
                    borderColor: "rgba(14, 165, 233, 0.35)",
                    color: "var(--color-info)"
                  }}
                  onClick={() => document.getElementById("remix-product-input").click()}
                  disabled={isUploadingProduct}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>{isUploadingProduct ? "Uploading Recipe..." : "Select & Upload Product_Settine.txt"}</span>
                </button>
              </div>
            </div>

            {/* MACHINE SETTING BOX */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.12)", color: "var(--color-warn)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Machine Calibration Setting</h4>
                    <span className="font-mono" style={{ fontSize: "12px", background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: "4px", color: "var(--text-muted)" }}>Machine_Setting.txt</span>
                  </div>
                  <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.45" }}>
                    Configures prober equipment name, simulated network drives (N:, M:), and image grab sync directories.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <input
                  id="remix-machine-input"
                  type="file"
                  accept=".txt,.json"
                  style={{ display: "none" }}
                  onChange={handleMachineUpload}
                />
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: 1,
                    padding: "12px 18px",
                    fontSize: "14px",
                    fontWeight: "700",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    background: "rgba(245, 158, 11, 0.08)",
                    borderColor: "rgba(245, 158, 11, 0.35)",
                    color: "var(--color-warn)"
                  }}
                  onClick={() => document.getElementById("remix-machine-input").click()}
                  disabled={isUploadingMachine}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>{isUploadingMachine ? "Uploading Config..." : "Select & Upload Machine_Setting.txt"}</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
