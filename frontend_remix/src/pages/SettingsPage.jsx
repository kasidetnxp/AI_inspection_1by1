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
          <div className="hmi-card" style={{ padding: "22px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "0.5px" }}>EDGE NODE & SYSTEM</h3>
              <span
                className="badge-result"
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  padding: "4px 10px",
                  background: connectionStatus === "CONNECTED" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: connectionStatus === "CONNECTED" ? "#10b981" : "#ef4444",
                  border: `1px solid ${connectionStatus === "CONNECTED" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`
                }}
              >
                {connectionStatus === "CONNECTED" ? "EDGE: ONLINE" : "EDGE: OFFLINE"}
              </span>
            </div>

            <form onSubmit={handleSaveIp} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div className="form-group-lab" style={{ margin: 0 }}>
                <label style={{ fontSize: "14px", color: "var(--text-muted)", fontWeight: "600" }}>i.MX8 Hostname / IP Address</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
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
                      padding: "10px 14px",
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
                    style={{ padding: "10px 16px", fontSize: "13px", fontWeight: "700", borderRadius: "8px", background: "rgba(14, 165, 233, 0.15)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.3)" }}
                    onClick={() => handleTestPing(tempIp)}
                    disabled={isPinging}
                  >
                    {isPinging ? "Testing..." : "Ping"}
                  </button>
                </div>
              </div>

              {saveSuccess && (
                <span style={{ fontSize: "13px", color: "var(--color-pass)", fontWeight: "600" }}>
                  ✓ IP address updated successfully
                </span>
              )}

              {pingResult && (
                <div
                  style={{
                    padding: "8px 14px",
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
                  <span>{pingResult.ok ? "✓ Node Reachable" : "✕ Unreachable"}</span>
                  <strong className="font-mono" style={{ fontSize: "13px" }}>{pingResult.message}</strong>
                </div>
              )}
            </form>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>DATABASE</div>
                <div className="font-mono" style={{ color: "var(--color-pass)", fontWeight: "700", fontSize: "15px", marginTop: "4px" }}>{dbType}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>API ENDPOINT</div>
                <div className="font-mono" style={{ color: "var(--color-info)", fontWeight: "600", fontSize: "15px", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>http://{edgeIp}:8001</div>
              </div>
            </div>

            {/* Recipe Upload Dropzones */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-muted)", letterSpacing: "0.5px" }}>RECIPE CONFIG UPLOAD</div>
              <div style={{ display: "flex", gap: "10px" }}>
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
                  style={{ flex: 1, padding: "10px 14px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", textAlign: "center" }}
                  onClick={() => document.getElementById("remix-product-input").click()}
                  disabled={isUploadingProduct}
                >
                  {isUploadingProduct ? "Uploading..." : "📁 Product_Settine.txt"}
                </button>

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
                  style={{ flex: 1, padding: "10px 14px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", textAlign: "center" }}
                  onClick={() => document.getElementById("remix-machine-input").click()}
                  disabled={isUploadingMachine}
                >
                  {isUploadingMachine ? "Uploading..." : "📁 Machine_Setting.txt"}
                </button>
              </div>
            </div>

          </div>

          {/* CARD 2: AI INSPECTION THRESHOLDS */}
          <div className="hmi-card" style={{ padding: "22px", display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "0.5px" }}>AI INSPECTION THRESHOLDS</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{ padding: "6px 14px", fontSize: "13px", fontWeight: "700", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)", color: "var(--color-pass)" }}
                  onClick={() => handleApplyPreset("default_factory")}
                >
                  Default
                </button>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{ padding: "6px 16px", fontSize: "13px", fontWeight: "700", borderRadius: "8px" }}
                  onClick={handleSaveThresholds}
                >
                  Save
                </button>
              </div>
            </div>

            {/* Min Edge Slider */}
            <div className="form-group-lab" style={{ margin: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", fontWeight: "700", color: "var(--text-muted)" }}>
                <span>FAIL DISTANCE (EDGE)</span>
                <span className="slider-val-badge font-mono" style={{ color: "var(--color-fail)", fontWeight: "800", fontSize: "16px" }}>{benchmarkRules.fail_distance_um.toFixed(1)} µm</span>
              </div>
              <div className="lab-slider-row" style={{ marginTop: "8px" }}>
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
              <div className="lab-slider-row" style={{ marginTop: "8px" }}>
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

            {/* Info summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>RESOLUTION</div>
                <div className="font-mono" style={{ fontWeight: "700", fontSize: "15px", marginTop: "4px" }}>
                  {activeConfig?.computed?.targetWidth ?? 160} × {activeConfig?.computed?.targetHeight ?? 160} px
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "12px", fontWeight: "700", letterSpacing: "0.5px" }}>ROI</div>
                <div className="font-mono" style={{ color: "var(--color-info)", fontWeight: "700", fontSize: "15px", marginTop: "4px" }}>
                  {((activeConfig?.computed?.hRoi ?? 0.7) * 100).toFixed(0)}% H × {((activeConfig?.computed?.vRoi ?? 0.7) * 100).toFixed(0)}% V
                </div>
              </div>
            </div>

            {configUploadStatus && (
              <div style={{ fontSize: "13px", fontWeight: "600", padding: "8px 12px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.25)", color: "var(--color-info)", textAlign: "center" }}>
                {configUploadStatus}
              </div>
            )}

          </div>

        </div>

      </main>
    </div>
  );
}
