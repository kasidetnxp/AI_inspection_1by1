import React, { useEffect, useState } from "react";
import { useInspection } from "../context/InspectionContext";
import AuditLogModal from "../components/AuditLogModal";
import ConfigEditorModal from "../components/ConfigEditorModal";

export default function SettingsPage() {
  const {
    activeConfig,
    apiBase,
    configLibrary,
    configUploadStatus,
    dbType,
    fetchActiveConfig,
    fetchConfigLibrary,
    handleActivateMachine,
    handleActivateRecipe,
    handleBindModelConfig,
    handleDeleteConfigFile,
    handleMachineUpload,
    handleProductUpload,
    handleSaveIp,
    handleTestPing,
    isBackendConnected,
    isPinging,
    isUploadingMachine,
    isUploadingProduct,
    modelsList,
    pingResult,
    saveIpSuccess,
    setPingResult,
    setTempIp,
    tempIp
  } = useInspection();

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [deletingConfigKey, setDeletingConfigKey] = useState(null);


  // Config Editor Modal State
  const [editorModalState, setEditorModalState] = useState({
    isOpen: false,
    configType: "product",
    filename: "",
    isNew: false,
    template: null
  });

  useEffect(() => {
    fetchActiveConfig();
    fetchConfigLibrary();
  }, [fetchActiveConfig, fetchConfigLibrary]);

  const handleOpenNewConfig = (type) => {
    setEditorModalState({
      isOpen: true,
      configType: type,
      filename: "",
      isNew: true,
      template: type === "product" ? activeConfig?.product : activeConfig?.machine
    });
  };

  const handleOpenEditConfig = (type, filename) => {
    setEditorModalState({
      isOpen: true,
      configType: type,
      filename: filename,
      isNew: false,
      template: null
    });
  };

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
        {/* TOP BAR: HEADER & AUDIT LOG ACCESS */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", paddingBottom: "4px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)", letterSpacing: "0.5px" }}>SYSTEM CONFIGURATION</h2>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Hardware edge node, recipe profiles, and machine calibration parameters
            </div>
          </div>
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="btn-secondary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: "600",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            AUDIT LOG
          </button>
        </div>

        {/* ROW 1: EDGE NODE & SYSTEM CONNECTIVITY (EXPANDED FULL-WIDTH) */}
        <div className="hmi-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700", letterSpacing: "0.5px" }}>EDGE NODE & SYSTEM</h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>i.MX8 Machine Gateway & Factory Network Connectivity</span>
            </div>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "18px", alignItems: "start" }}>
            {/* IP & PING CONTROL */}
            <form onSubmit={handleSaveIp} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: "600" }}>i.MX8 Hostname / IP Address</label>
              <div style={{ display: "flex", gap: "8px" }}>
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
                    padding: "9px 12px",
                    borderRadius: "8px",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-main)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "13.5px"
                  }}
                />
                <button
                  type="submit"
                  className="select-file-btn"
                  style={{ padding: "8px 16px", fontSize: "13px", fontWeight: "700", borderRadius: "8px" }}
                >
                  Apply IP
                </button>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{ padding: "8px 16px", fontSize: "13px", fontWeight: "700", borderRadius: "8px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.35)" }}
                  onClick={() => handleTestPing(tempIp)}
                  disabled={isPinging}
                >
                  {isPinging ? "Testing..." : "Ping"}
                </button>
              </div>

              {saveIpSuccess && (
                <span style={{ fontSize: "12.5px", color: "var(--color-pass)", fontWeight: "600" }}>
                  ✓ IP address updated successfully
                </span>
              )}

              {pingResult && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12.5px",
                    background: pingResult.ok ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
                    border: `1px solid ${pingResult.ok ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
                    color: pingResult.ok ? "var(--color-pass)" : "var(--color-fail)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span>{pingResult.ok ? "Node Reachable" : "Unreachable"}</span>
                  <strong className="font-mono" style={{ fontSize: "12.5px" }}>{pingResult.message}</strong>
                </div>
              )}
            </form>

            {/* DB & API TILES */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "11.5px", fontWeight: "700", letterSpacing: "0.5px" }}>DATABASE</div>
                <div className="font-mono" style={{ color: "var(--color-pass)", fontWeight: "700", fontSize: "15px", marginTop: "4px" }}>{dbType}</div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <div style={{ color: "var(--text-muted)", fontSize: "11.5px", fontWeight: "700", letterSpacing: "0.5px" }}>API ENDPOINT</div>
                <div className="font-mono" style={{ color: "var(--color-info)", fontWeight: "600", fontSize: "14px", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={apiBase}>{apiBase}</div>
              </div>
            </div>

            {/* MOUNTED DRIVES TILE */}
            <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "11.5px", fontWeight: "700", letterSpacing: "0.5px" }}>FACTORY DRIVES (N: / M:)</span>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: "700",
                    padding: "2px 7px",
                    borderRadius: "10px",
                    background: activeConfig?.computed?.isHardwareMounted ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                    color: activeConfig?.computed?.isHardwareMounted ? "#10b981" : "var(--color-warn)",
                    border: `1px solid ${activeConfig?.computed?.isHardwareMounted ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`
                  }}
                >
                  {activeConfig?.computed?.isHardwareMounted ? "HARDWARE DETECTED" : "SIMULATION FALLBACK"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "3px", fontSize: "11px" }}>
                <div style={{ display: "flex", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-muted)", minWidth: "75px" }}>Source (N:):</span>
                  <span className="font-mono" style={{ color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis" }} title={activeConfig?.computed?.simulatedSourceFolder || "-"}>
                    {activeConfig?.computed?.simulatedSourceFolder || "-"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-muted)", minWidth: "75px" }}>Judge (N:):</span>
                  <span className="font-mono" style={{ color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis" }} title={activeConfig?.computed?.simulatedJudgeFolder || "-"}>
                    {activeConfig?.computed?.simulatedJudgeFolder || "-"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ROW 2: RECIPE & MACHINE CONFIGURATION (UPGRADED WITH WORKFLOW & ACTIVE SUMMARY) */}
        <div className="hmi-card" style={{ padding: "26px", display: "flex", flexDirection: "column", gap: "20px" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "0.5px" }}>RECIPE & MACHINE CONFIGURATION</h3>
          </div>

          {/* ACTIVE PARAMETERS & THRESHOLDS SUMMARY BAR */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(99, 102, 241, 0.05) 50%, rgba(16, 185, 129, 0.05) 100%)",
              border: "1px solid rgba(14, 165, 233, 0.22)",
              borderRadius: "10px",
              padding: "12px 18px",
              display: "flex",
              flexWrap: "wrap",
              gap: "18px",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 2px 10px rgba(14, 165, 233, 0.04)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-info)", boxShadow: "0 0 8px var(--color-info)", display: "inline-block" }}></span>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--color-info)", letterSpacing: "0.5px" }}>
                ACTIVE THRESHOLDS & RUNTIME:
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>Fail Distance (Edge):</span>
                <span className="font-mono" style={{ fontWeight: "700", color: "var(--color-fail)", background: "rgba(239, 68, 68, 0.12)", padding: "3px 9px", borderRadius: "5px", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                  {Number(activeConfig?.computed?.failDistanceUm ?? 8.0).toFixed(1)} µm
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>Max Probe Mark Area:</span>
                <span className="font-mono" style={{ fontWeight: "700", color: "var(--color-warn)", background: "rgba(245, 158, 11, 0.12)", padding: "3px 9px", borderRadius: "5px", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                  {Number(activeConfig?.computed?.maxAreaRatioPct ?? 25).toFixed(0)}%
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>Target Die Size:</span>
                <span className="font-mono" style={{ fontWeight: "600", color: "var(--text-main)", background: "var(--bg-card)", padding: "3px 9px", borderRadius: "5px", border: "1px solid var(--border-color)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  {activeConfig?.computed?.targetWidth ?? 160} × {activeConfig?.computed?.targetHeight ?? 160} px
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                <span style={{ color: "var(--text-muted)" }}>ROI (H / V):</span>
                <span className="font-mono" style={{ fontWeight: "600", color: "var(--color-info)", background: "rgba(14, 165, 233, 0.12)", padding: "3px 9px", borderRadius: "5px", border: "1px solid rgba(14, 165, 233, 0.25)" }}>
                  {Math.round((activeConfig?.computed?.hRoi ?? 0.7) * 100)}% / {Math.round((activeConfig?.computed?.vRoi ?? 0.7) * 100)}%
                </span>
              </div>
            </div>
          </div>


          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "20px" }}>
            
            {/* PRODUCT RECIPE BOX */}
            <div className="hmi-card" style={{ background: "var(--bg-card)", border: "1px solid rgba(14, 165, 233, 0.25)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)" }}>
              <div>
                <div style={{ display: "flex", gap: "14px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(14, 165, 233, 0.25)" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Product Recipe</h4>
                  </div>
                  
                  {/* ACTIVE FILE BADGE (CLICKABLE TO EDIT) */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditConfig("product", configLibrary.active_recipe || "Product_Setting.txt")}
                    className="clickable-config-name font-mono"
                    style={{
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      color: "var(--color-pass)",
                      fontSize: "12px",
                      fontWeight: "700",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                    title={`Click to edit active file: ${configLibrary.active_recipe || "Product_Setting.txt"}`}
                  >
                    <span>Active: {configLibrary.active_recipe || "Product_Setting.txt"}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* ACTION BUTTONS ROW (ONLY NEW RECIPE & UPLOAD FILE) */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 14px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(14, 165, 233, 0.1)",
                    color: "var(--color-info)",
                    borderColor: "rgba(14, 165, 233, 0.3)"
                  }}
                  onClick={() => handleOpenNewConfig("product")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>New Recipe</span>
                </button>

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
                    flex: "1 1 auto",
                    padding: "9px 14px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(14, 165, 233, 0.05)",
                    color: "var(--text-main)",
                    borderColor: "rgba(14, 165, 233, 0.25)"
                  }}
                  onClick={() => document.getElementById("product-config-input").click()}
                  disabled={isUploadingProduct}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>{isUploadingProduct ? "Uploading..." : "Upload File"}</span>
                </button>
              </div>

              {/* STORED RECIPES TABLE */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "700", color: "var(--color-info)", letterSpacing: "0.5px" }}>
                    STORED RECIPES
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {(configLibrary.recipes || []).length} profiles
                  </span>
                </div>

                <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
                  <table className="history-table models-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th>Config File</th>
                        <th style={{ minWidth: "150px" }}>Bound AI Model</th>
                        <th style={{ width: "70px" }}>Size</th>
                        <th style={{ width: "120px", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(configLibrary.recipes || []).map((rec, idx) => {
                        const isRecipeActive = Boolean(rec.is_active || rec.active || rec.name === configLibrary.active_recipe);
                        const boundModelName = (modelsList || []).find(m => {
                          const b = configLibrary.bindings?.[m.name];
                          return b?.recipe === rec.name;
                        })?.name || "";

                        return (
                          <tr key={`rec-${idx}`} className={isRecipeActive ? "row-active-model" : ""}>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleOpenEditConfig("product", rec.name)}
                                className="clickable-config-name"
                                title={`Click to edit ${rec.name}`}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontFamily: "var(--font-mono)",
                                  fontWeight: "700",
                                  fontSize: "12.5px",
                                  color: isRecipeActive ? "var(--color-pass)" : "var(--color-info)",
                                  cursor: "pointer",
                                  textAlign: "left"
                                }}
                              >
                                <span>{rec.name}</span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                            </td>
                            <td>
                              <select
                                className="lab-select"
                                style={{ width: "100%", padding: "4px 8px", fontSize: "11.5px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-color)", color: "var(--text-main)" }}
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
                            </td>
                            <td className="font-mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{rec.size || "-"}</td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "5px", justifyContent: "center", alignItems: "center" }}>
                                {isRecipeActive ? (
                                  <span className="badge-result pass" style={{ fontSize: "10px", padding: "3px 8px", fontWeight: "700" }}>
                                    CURRENT
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="action-btn-sm"
                                    style={{ fontSize: "10.5px", padding: "3px 7px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-pass)", borderColor: "rgba(16, 185, 129, 0.3)" }}
                                    onClick={() => handleActivateRecipe(rec.name)}
                                    title={`Apply ${rec.name}`}
                                  >
                                    ACTIVATE
                                  </button>
                                )}

                                {!isRecipeActive && (
                                  deletingConfigKey === `product-${rec.name}` ? (
                                    <div style={{ display: "flex", gap: "3px" }}>
                                      <button
                                        type="button"
                                        className="action-btn-sm delete-red"
                                        style={{ fontSize: "10px", padding: "3px 6px", background: "#dc2626", color: "#fff", fontWeight: "700" }}
                                        onClick={async () => {
                                          await handleDeleteConfigFile("product", rec.name, true);
                                          setDeletingConfigKey(null);
                                        }}
                                        title="Confirm delete recipe"
                                      >
                                        CONFIRM
                                      </button>
                                      <button
                                        type="button"
                                        className="action-btn-sm"
                                        style={{ fontSize: "10px", padding: "3px 6px" }}
                                        onClick={() => setDeletingConfigKey(null)}
                                        title="Cancel"
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="18" y1="6" x2="6" y2="18"></line>
                                          <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="action-btn-sm delete-red"
                                      style={{ fontSize: "10.5px", padding: "3px 6px" }}
                                      onClick={() => setDeletingConfigKey(`product-${rec.name}`)}
                                      title={`Delete ${rec.name}`}
                                    >
                                      DEL
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(!configLibrary.recipes || configLibrary.recipes.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", padding: "18px", color: "var(--text-muted)", fontSize: "12px" }}>
                            No recipes stored in library. Create or upload above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* MACHINE SETTING BOX */}
            <div className="hmi-card" style={{ background: "var(--bg-card)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)" }}>
              <div>
                <div style={{ display: "flex", gap: "14px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: "rgba(245, 158, 11, 0.12)", color: "var(--color-warn)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                      </svg>
                    </div>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700" }}>Machine Setting</h4>
                  </div>
                  
                  {/* ACTIVE FILE BADGE (CLICKABLE TO EDIT) */}
                  <button
                    type="button"
                    onClick={() => handleOpenEditConfig("machine", configLibrary.active_machine || "Machine_Setting_ForTest.txt")}
                    className="clickable-config-name font-mono"
                    style={{
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      color: "var(--color-warn)",
                      fontSize: "12px",
                      fontWeight: "700",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                    title={`Click to edit active file: ${configLibrary.active_machine || "Machine_Setting_ForTest.txt"}`}
                  >
                    <span>Active: {configLibrary.active_machine || "Machine_Setting_ForTest.txt"}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>

              {/* ACTION BUTTONS ROW (ONLY NEW MACHINE & UPLOAD FILE) */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 14px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(245, 158, 11, 0.1)",
                    color: "var(--color-warn)",
                    borderColor: "rgba(245, 158, 11, 0.3)"
                  }}
                  onClick={() => handleOpenNewConfig("machine")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>New Machine</span>
                </button>

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
                    flex: "1 1 auto",
                    padding: "9px 14px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(245, 158, 11, 0.05)",
                    color: "var(--text-main)",
                    borderColor: "rgba(245, 158, 11, 0.25)"
                  }}
                  onClick={() => document.getElementById("machine-config-input").click()}
                  disabled={isUploadingMachine}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>{isUploadingMachine ? "Uploading..." : "Upload File"}</span>
                </button>
              </div>

              {/* STORED MACHINE SETTINGS TABLE */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11.5px", fontWeight: "700", color: "var(--color-warn)", letterSpacing: "0.5px" }}>
                    STORED MACHINE SETTINGS
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {(configLibrary.machines || []).length} profiles
                  </span>
                </div>

                <div className="table-container" style={{ border: "1px solid var(--border-color)", borderRadius: "8px", overflow: "hidden" }}>
                  <table className="history-table models-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th>Config File</th>
                        <th style={{ width: "70px" }}>Size</th>
                        <th style={{ width: "140px" }}>Last Modified</th>
                        <th style={{ width: "120px", textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(configLibrary.machines || []).map((mach, idx) => {
                        const isMachineActive = Boolean(mach.is_active || mach.active || mach.name === configLibrary.active_machine);

                        return (
                          <tr key={`mach-${idx}`} className={isMachineActive ? "row-active-model" : ""}>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleOpenEditConfig("machine", mach.name)}
                                className="clickable-config-name"
                                title={`Click to edit ${mach.name}`}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  padding: 0,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontFamily: "var(--font-mono)",
                                  fontWeight: "700",
                                  fontSize: "12.5px",
                                  color: isMachineActive ? "var(--color-pass)" : "var(--color-warn)",
                                  cursor: "pointer",
                                  textAlign: "left"
                                }}
                              >
                                <span>{mach.name}</span>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                            </td>
                            <td className="font-mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{mach.size || "-"}</td>
                            <td className="font-mono" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{mach.updatedAt || "-"}</td>
                            <td style={{ textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "5px", justifyContent: "center", alignItems: "center" }}>
                                {isMachineActive ? (
                                  <span className="badge-result pass" style={{ fontSize: "10px", padding: "3px 8px", fontWeight: "700" }}>
                                    CURRENT
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="action-btn-sm"
                                    style={{ fontSize: "10.5px", padding: "3px 7px", background: "rgba(245, 158, 11, 0.15)", color: "var(--color-warn)", borderColor: "rgba(245, 158, 11, 0.3)" }}
                                    onClick={() => handleActivateMachine(mach.name)}
                                    title={`Apply ${mach.name}`}
                                  >
                                    ACTIVATE
                                  </button>
                                )}

                                {!isMachineActive && (
                                deletingConfigKey === `machine-${mach.name}` ? (
                                  <div style={{ display: "flex", gap: "3px" }}>
                                    <button
                                      type="button"
                                      className="action-btn-sm delete-red"
                                      style={{ fontSize: "10px", padding: "3px 6px", background: "#dc2626", color: "#fff", fontWeight: "700" }}
                                      onClick={async () => {
                                        await handleDeleteConfigFile("machine", mach.name, true);
                                        setDeletingConfigKey(null);
                                      }}
                                      title="Confirm delete machine setting"
                                    >
                                      CONFIRM
                                    </button>
                                    <button
                                      type="button"
                                      className="action-btn-sm"
                                      style={{ fontSize: "10px", padding: "3px 6px" }}
                                      onClick={() => setDeletingConfigKey(null)}
                                      title="Cancel"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="action-btn-sm delete-red"
                                    style={{ fontSize: "10.5px", padding: "3px 6px" }}
                                    onClick={() => setDeletingConfigKey(`machine-${mach.name}`)}
                                    title={`Delete ${mach.name}`}
                                  >
                                    DEL
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                      {(!configLibrary.machines || configLibrary.machines.length === 0) && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", padding: "18px", color: "var(--text-muted)", fontSize: "12px" }}>
                            No machine settings stored in library. Create or upload above.
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

        {/* SYSTEM AUDIT LOG MODAL */}
        <AuditLogModal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} />

        {/* CONFIG CODE EDITOR & CREATOR MODAL */}
        <ConfigEditorModal
          isOpen={editorModalState.isOpen}
          onClose={() => setEditorModalState((prev) => ({ ...prev, isOpen: false }))}
          configType={editorModalState.configType}
          initialFilename={editorModalState.filename}
          isNew={editorModalState.isNew}
          activeConfigTemplate={editorModalState.template}
          onSuccess={() => {
            fetchActiveConfig();
            fetchConfigLibrary();
          }}
        />
      </div>
    </div>
  );
}
