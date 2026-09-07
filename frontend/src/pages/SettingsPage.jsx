import React, { useEffect } from "react";
import { useInspection } from "../context/InspectionContext";

export default function SettingsPage() {
  const {
    activeConfig,
    apiBase,
    benchmarkRules,
    configLibrary,
    configUploadStatus,
    dbType,
    edgeIp,
    fetchActiveConfig,
    fetchConfigLibrary,
    handleActivateMachine,
    handleActivateRecipe,
    handleApplyPreset,
    handleBindModelConfig,
    handleDeleteConfigFile,
    handleMachineUpload,
    handleProductUpload,
    handleSaveIp,
    handleSaveThresholds,
    handleTestPing,
    isBackendConnected,
    isPinging,
    isSavingThresholds,
    isSimRunning,
    isUploadingMachine,
    isUploadingProduct,
    modelsList,
    pingResult,
    runSingleOfflineInspection,
    saveIpSuccess,
    setActiveConfig,
    setBenchmarkRules,
    setConfigUploadStatus,
    setIsPinging,
    setIsSavingThresholds,
    setIsSimRunning,
    setPingResult,
    setSaveIpSuccess,
    setSettingsFailDist,
    setSettingsMaxArea,
    setSimSpeed,
    setTempIp,
    settingsFailDist,
    settingsMaxArea,
    simSpeed,
    sysStats,
    tempIp,
    updateEdgeIp
  } = useInspection();

  useEffect(() => {
    fetchActiveConfig();
    fetchConfigLibrary();
  }, [fetchActiveConfig, fetchConfigLibrary]);

  return (
    <div
      className="tab-content active-tab"
      id="view-settings"
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        height: "calc(100vh - var(--header-height))",
        maxHeight: "calc(100vh - var(--header-height))",
        overflowY: "auto",
        overflowX: "hidden",
        width: "100%",
        display: "block",
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          padding: "24px 28px 80px 28px",
          maxWidth: "1500px",
          margin: "0 auto",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxSizing: "border-box"
        }}
      >
            
            {/* TOP ROW: 2 BALANCED CARDS */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))", gap: "24px" }}>
              
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

                    {saveIpSuccess && (
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
                    <div className="font-mono" style={{ color: "var(--color-info)", fontWeight: "600", fontSize: "15px", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apiBase}</div>
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
                        disabled={isSavingThresholds}
                      >
                        {isSavingThresholds ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {/* Min Edge Slider */}
                    <div className="form-group-lab" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", fontWeight: "700", color: "var(--text-muted)" }}>
                        <span>FAIL DISTANCE (EDGE)</span>
                        <span className="slider-val-badge font-mono" style={{ color: "var(--color-fail)", fontWeight: "800", fontSize: "16px" }}>{settingsFailDist.toFixed(1)} µm</span>
                      </div>
                      <div className="lab-slider-row" style={{ marginTop: "10px" }}>
                        <input
                          type="range"
                          min="1.0"
                          max="25.0"
                          step="0.5"
                          className="lab-slider"
                          value={settingsFailDist}
                          onChange={(e) => setSettingsFailDist(parseFloat(e.target.value))}
                        />
                      </div>
                    </div>

                    {/* Max Area Ratio Slider */}
                    <div className="form-group-lab" style={{ margin: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13.5px", fontWeight: "700", color: "var(--text-muted)" }}>
                        <span>MAX PROBE MARK AREA</span>
                        <span className="slider-val-badge font-mono" style={{ color: "var(--color-warn)", fontWeight: "800", fontSize: "16px" }}>{settingsMaxArea.toFixed(0)}%</span>
                      </div>
                      <div className="lab-slider-row" style={{ marginTop: "10px" }}>
                        <input
                          type="range"
                          min="5"
                          max="60"
                          step="1"
                          className="lab-slider"
                          value={settingsMaxArea}
                          onChange={(e) => setSettingsMaxArea(parseFloat(e.target.value))}
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
            <div className="hmi-card" style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "20px" }}>
              
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
                      id="product-config-input"
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
                      onClick={() => document.getElementById("product-config-input").click()}
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
                      id="machine-config-input"
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
                      onClick={() => document.getElementById("machine-config-input").click()}
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

              {/* STORED CONFIGURATIONS & MODEL BINDINGS LIBRARY */}
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", letterSpacing: "0.5px" }}>STORED CONFIGURATIONS & MODEL BINDINGS</h4>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Select active configuration profiles or bind recipes to specific AI models for automated loading upon model activation.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="badge-result pass font-mono" style={{ fontSize: "11px", padding: "4px 10px" }}>
                      Active Recipe: {configLibrary.active_recipe || "Product_Settine.txt"}
                    </span>
                    <span className="badge-result info font-mono" style={{ fontSize: "11px", padding: "4px 10px" }}>
                      Active Machine: {configLibrary.active_machine || "Machine_Setting.txt"}
                    </span>
                  </div>
                </div>

                <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
                  <table className="history-table models-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ width: "120px" }}>Type</th>
                        <th>Config File</th>
                        <th style={{ width: "90px" }}>Size</th>
                        <th style={{ width: "160px" }}>Last Modified</th>
                        <th style={{ minWidth: "220px" }}>Bound AI Model</th>
                        <th style={{ width: "110px", textAlign: "center" }}>Status</th>
                        <th style={{ width: "180px", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Recipes */}
                      {(configLibrary.recipes || []).map((rec, idx) => {
                        const boundModelName = (modelsList || []).find(m => {
                          const b = configLibrary.bindings?.[m.name];
                          return b?.recipe === rec.name;
                        })?.name || "";

                        return (
                          <tr key={`rec-${idx}`} className={rec.active ? "row-active-model" : ""}>
                            <td>
                              <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "4px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)" }}>
                                RECIPE
                              </span>
                            </td>
                            <td className="font-mono" style={{ fontWeight: "700" }}>{rec.name}</td>
                            <td className="font-mono" style={{ fontSize: "12px" }}>{rec.size}</td>
                            <td className="font-mono" style={{ fontSize: "12px", color: "var(--text-muted)" }}>{rec.updatedAt}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <select
                                  className="lab-select"
                                  style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", color: "var(--text-main)" }}
                                  value={boundModelName}
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleBindModelConfig(e.target.value, rec.name, configLibrary.active_machine);
                                    }
                                  }}
                                >
                                  <option value="">-- Assign to Model --</option>
                                  {(modelsList || []).map((m, mIdx) => (
                                    <option key={mIdx} value={m.name}>
                                      {m.name} {configLibrary.bindings?.[m.name]?.recipe === rec.name ? "(Bound)" : ""}
                                    </option>
                                  ))}
                                </select>
                                {rec.boundModels && rec.boundModels.length > 0 && (
                                  <span style={{ fontSize: "11px", color: "var(--color-info)", fontWeight: "600" }}>
                                    {rec.boundModels.join(", ")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className={`badge-result ${rec.active ? "pass" : "warn"}`} style={{ fontSize: "11px", padding: "3px 8px" }}>
                                {rec.active ? "ACTIVE" : "SAVED"}
                              </span>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                {rec.active ? (
                                  <button className="action-btn-sm active-green" disabled style={{ fontSize: "11px", padding: "4px 8px" }}>
                                    CURRENT
                                  </button>
                                ) : (
                                  <button
                                    className="action-btn-sm"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    onClick={() => handleActivateRecipe(rec.name)}
                                    title={`Apply ${rec.name}`}
                                  >
                                    ACTIVATE
                                  </button>
                                )}
                                {!rec.active && (
                                  <button
                                    className="action-btn-sm delete-red"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    onClick={() => handleDeleteConfigFile("product", rec.name)}
                                    title={`Delete ${rec.name}`}
                                  >
                                    DELETE
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Machine Settings */}
                      {(configLibrary.machines || []).map((mach, idx) => (
                        <tr key={`mach-${idx}`} className={mach.active ? "row-active-model" : ""}>
                          <td>
                            <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "4px", background: "rgba(245, 158, 11, 0.12)", color: "var(--color-warn)" }}>
                              MACHINE
                            </span>
                          </td>
                          <td className="font-mono" style={{ fontWeight: "700" }}>{mach.name}</td>
                          <td className="font-mono" style={{ fontSize: "12px" }}>{mach.size}</td>
                          <td className="font-mono" style={{ fontSize: "12px", color: "var(--text-muted)" }}>{mach.updatedAt}</td>
                          <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>Applied to system runtime</td>
                          <td style={{ textAlign: "center" }}>
                            <span className={`badge-result ${mach.active ? "pass" : "warn"}`} style={{ fontSize: "11px", padding: "3px 8px" }}>
                              {mach.active ? "ACTIVE" : "SAVED"}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                              {mach.active ? (
                                <button className="action-btn-sm active-green" disabled style={{ fontSize: "11px", padding: "4px 8px" }}>
                                  CURRENT
                                </button>
                              ) : (
                                <button
                                  className="action-btn-sm"
                                  style={{ fontSize: "11px", padding: "4px 8px" }}
                                  onClick={() => handleActivateMachine(mach.name)}
                                  title={`Apply ${mach.name}`}
                                >
                                  ACTIVATE
                                </button>
                              )}
                              {!mach.active && (
                                <button
                                  className="action-btn-sm delete-red"
                                  style={{ fontSize: "11px", padding: "4px 8px" }}
                                  onClick={() => handleDeleteConfigFile("machine", mach.name)}
                                  title={`Delete ${mach.name}`}
                                >
                                  DELETE
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {(!configLibrary.recipes || configLibrary.recipes.length === 0) &&
                       (!configLibrary.machines || configLibrary.machines.length === 0) && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                            No configurations stored in library. Upload Product Recipe or Machine Setting above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        </div>
  );
}
