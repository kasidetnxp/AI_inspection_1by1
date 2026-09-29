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

  // Quick Selector State
  const [selectedRecipeToActivate, setSelectedRecipeToActivate] = useState("");
  const [selectedMachineToActivate, setSelectedMachineToActivate] = useState("");

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

  // Sync quick-selector state when library loads
  useEffect(() => {
    if (configLibrary.active_recipe) {
      setSelectedRecipeToActivate(configLibrary.active_recipe);
    }
  }, [configLibrary.active_recipe]);

  useEffect(() => {
    if (configLibrary.active_machine) {
      setSelectedMachineToActivate(configLibrary.active_machine);
    }
  }, [configLibrary.active_machine]);

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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", letterSpacing: "0.5px" }}>RECIPE & MACHINE CONFIGURATION</h3>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                Manage, create, edit, and activate setup files for real-time synchronization with i.MX8 Edge inference pipeline
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", background: "rgba(14, 165, 233, 0.1)", color: "var(--color-info)", border: "1px solid rgba(14, 165, 233, 0.25)", fontWeight: "600" }}>
                HOT RELOAD SUPPORTED
              </span>
            </div>
          </div>

          {/* ACTIVE PARAMETERS & THRESHOLDS SUMMARY BAR */}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.15)",
              border: "1px solid var(--border-color)",
              borderRadius: "10px",
              padding: "14px 18px",
              display: "flex",
              flexWrap: "wrap",
              gap: "18px",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11.5px", fontWeight: "700", color: "var(--text-muted)", letterSpacing: "0.5px" }}>
                ACTIVE THRESHOLDS & RUNTIME:
              </span>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                <span style={{ color: "var(--text-muted)" }}>Fail Distance (Edge):</span>
                <span className="font-mono" style={{ fontWeight: "700", color: "var(--color-fail)", background: "rgba(239, 68, 68, 0.12)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(239, 68, 68, 0.25)" }}>
                  {Number(activeConfig?.computed?.failDistanceUm ?? 8.0).toFixed(1)} µm
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                <span style={{ color: "var(--text-muted)" }}>Max Probe Mark Area:</span>
                <span className="font-mono" style={{ fontWeight: "700", color: "var(--color-warn)", background: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "4px", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                  {Number(activeConfig?.computed?.maxAreaRatioPct ?? 25).toFixed(0)}%
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                <span style={{ color: "var(--text-muted)" }}>Target Die Size:</span>
                <span className="font-mono" style={{ fontWeight: "600", color: "var(--text-main)", background: "rgba(255, 255, 255, 0.05)", padding: "2px 8px", borderRadius: "4px" }}>
                  {activeConfig?.computed?.targetWidth ?? 160} × {activeConfig?.computed?.targetHeight ?? 160} px
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                <span style={{ color: "var(--text-muted)" }}>Horizontal / Vertical ROI:</span>
                <span className="font-mono" style={{ fontWeight: "600", color: "var(--color-info)", background: "rgba(14, 165, 233, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                  {Math.round((activeConfig?.computed?.hRoi ?? 0.7) * 100)}% / {Math.round((activeConfig?.computed?.vRoi ?? 0.7) * 100)}%
                </span>
              </div>
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
              <div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(14, 165, 233, 0.12)", color: "var(--color-info)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(14, 165, 233, 0.25)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Product Recipe Configuration</h4>
                      <span className="badge-result pass font-mono" style={{ fontSize: "11px", padding: "2px 8px" }}>
                        Active: {configLibrary.active_recipe || "Product_Setting.txt"}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                      Specifies wafer defect rules, probe mark tolerance, pad coordinates, and AI model inference scripts.
                    </p>
                  </div>
                </div>

                {/* QUICK SELECTOR & ACTIVATE ROW */}
                <div style={{ marginTop: "16px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>
                    <span>SELECT RECIPE PROFILE:</span>
                    <span style={{ fontSize: "11px", color: "var(--color-info)" }}>{(configLibrary.recipes || []).length} stored profiles</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      className="lab-select"
                      style={{ flex: 1, padding: "8px 12px", fontSize: "13px", borderRadius: "6px", background: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}
                      value={selectedRecipeToActivate}
                      onChange={(e) => setSelectedRecipeToActivate(e.target.value)}
                    >
                      {(configLibrary.recipes || []).map((rec, rIdx) => (
                        <option key={rIdx} value={rec.name}>
                          {rec.name} {rec.name === configLibrary.active_recipe ? "★ (Active)" : ""}
                        </option>
                      ))}
                      {(!configLibrary.recipes || configLibrary.recipes.length === 0) && (
                        <option value="Product_Setting.txt">Product_Setting.txt (Active)</option>
                      )}
                    </select>

                    {selectedRecipeToActivate && selectedRecipeToActivate !== configLibrary.active_recipe ? (
                      <button
                        type="button"
                        className="select-file-btn"
                        style={{
                          padding: "8px 16px",
                          fontSize: "12.5px",
                          fontWeight: "700",
                          borderRadius: "6px",
                          background: "var(--color-pass, #10b981)",
                          borderColor: "var(--color-pass, #10b981)",
                          color: "#fff",
                          whiteSpace: "nowrap"
                        }}
                        onClick={() => handleActivateRecipe(selectedRecipeToActivate)}
                      >
                        Activate Recipe
                      </button>
                    ) : (
                      <span
                        style={{
                          padding: "7px 14px",
                          fontSize: "12px",
                          fontWeight: "700",
                          borderRadius: "6px",
                          background: "rgba(16, 185, 129, 0.12)",
                          color: "var(--color-pass)",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        ✓ Active Profile
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS ROW */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 12px",
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
                  <span>+ New Recipe</span>
                </button>

                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(255, 255, 255, 0.05)"
                  }}
                  onClick={() => handleOpenEditConfig("product", selectedRecipeToActivate || configLibrary.active_recipe || "Product_Setting.txt")}
                >
                  <span>✏️ Edit Config</span>
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
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px"
                  }}
                  onClick={() => document.getElementById("product-config-input").click()}
                  disabled={isUploadingProduct}
                >
                  <span>{isUploadingProduct ? "Uploading..." : "⬆ Upload File"}</span>
                </button>
              </div>
            </div>

            {/* MACHINE SETTING BOX */}
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)", borderRadius: "10px", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.12)", color: "var(--color-warn)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>Machine Calibration Setting</h4>
                      <span className="badge-result info font-mono" style={{ fontSize: "11px", padding: "2px 8px" }}>
                        Active: {configLibrary.active_machine || "Machine_Setting.txt"}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0 0", fontSize: "12.5px", color: "var(--text-muted)", lineHeight: "1.4" }}>
                      Configures prober equipment name, simulated network drives (N:, M:), and image grab sync directories.
                    </p>
                  </div>
                </div>

                {/* QUICK SELECTOR & ACTIVATE ROW */}
                <div style={{ marginTop: "16px", padding: "12px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>
                    <span>SELECT MACHINE PROFILE:</span>
                    <span style={{ fontSize: "11px", color: "var(--color-warn)" }}>{(configLibrary.machines || []).length} stored profiles</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      className="lab-select"
                      style={{ flex: 1, padding: "8px 12px", fontSize: "13px", borderRadius: "6px", background: "var(--bg-input)", border: "1px solid var(--border-color)", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}
                      value={selectedMachineToActivate}
                      onChange={(e) => setSelectedMachineToActivate(e.target.value)}
                    >
                      {(configLibrary.machines || []).map((mach, mIdx) => (
                        <option key={mIdx} value={mach.name}>
                          {mach.name} {mach.name === configLibrary.active_machine ? "★ (Active)" : ""}
                        </option>
                      ))}
                      {(!configLibrary.machines || configLibrary.machines.length === 0) && (
                        <option value="Machine_Setting.txt">Machine_Setting.txt (Active)</option>
                      )}
                    </select>

                    {selectedMachineToActivate && selectedMachineToActivate !== configLibrary.active_machine ? (
                      <button
                        type="button"
                        className="select-file-btn"
                        style={{
                          padding: "8px 16px",
                          fontSize: "12.5px",
                          fontWeight: "700",
                          borderRadius: "6px",
                          background: "var(--color-warn, #f59e0b)",
                          borderColor: "var(--color-warn, #f59e0b)",
                          color: "#fff",
                          whiteSpace: "nowrap"
                        }}
                        onClick={() => handleActivateMachine(selectedMachineToActivate)}
                      >
                        Activate Machine
                      </button>
                    ) : (
                      <span
                        style={{
                          padding: "7px 14px",
                          fontSize: "12px",
                          fontWeight: "700",
                          borderRadius: "6px",
                          background: "rgba(245, 158, 11, 0.12)",
                          color: "var(--color-warn)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          whiteSpace: "nowrap"
                        }}
                      >
                        ✓ Active Profile
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS ROW */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 12px",
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
                  <span>+ New Machine</span>
                </button>

                <button
                  type="button"
                  className="select-file-btn"
                  style={{
                    flex: "1 1 auto",
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    background: "rgba(255, 255, 255, 0.05)"
                  }}
                  onClick={() => handleOpenEditConfig("machine", selectedMachineToActivate || configLibrary.active_machine || "Machine_Setting.txt")}
                >
                  <span>✏️ Edit Config</span>
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
                    padding: "9px 12px",
                    fontSize: "12.5px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px"
                  }}
                  onClick={() => document.getElementById("machine-config-input").click()}
                  disabled={isUploadingMachine}
                >
                  <span>{isUploadingMachine ? "Uploading..." : "⬆ Upload File"}</span>
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
                  Select active configuration profiles, edit code directly, or bind recipes to specific AI models.
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="badge-result pass font-mono" style={{ fontSize: "11px", padding: "4px 10px" }}>
                  Active Recipe: {configLibrary.active_recipe || "Product_Setting.txt"}
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
                    <th style={{ width: "100px" }}>Type</th>
                    <th>Config File</th>
                    <th style={{ width: "85px" }}>Size</th>
                    <th style={{ width: "150px" }}>Last Modified</th>
                    <th style={{ minWidth: "200px" }}>Bound AI Model</th>
                    <th style={{ width: "100px", textAlign: "center" }}>Status</th>
                    <th style={{ width: "210px", textAlign: "center" }}>Action</th>
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
                          <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                            {rec.active ? (
                              <span className="badge-result pass" style={{ fontSize: "10.5px", padding: "4px 8px", fontWeight: "700" }}>
                                CURRENT
                              </span>
                            ) : (
                              <button
                                className="action-btn-sm"
                                style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(16, 185, 129, 0.15)", color: "var(--color-pass)", borderColor: "rgba(16, 185, 129, 0.3)" }}
                                onClick={() => handleActivateRecipe(rec.name)}
                                title={`Apply ${rec.name}`}
                              >
                                ACTIVATE
                              </button>
                            )}

                            {/* EDIT BUTTON */}
                            <button
                              className="action-btn-sm"
                              style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(255, 255, 255, 0.05)" }}
                              onClick={() => handleOpenEditConfig("product", rec.name)}
                              title={`Edit ${rec.name}`}
                            >
                              EDIT
                            </button>

                            {!rec.active && (
                              deletingConfigKey === `product-${rec.name}` ? (
                                <div style={{ display: "flex", gap: "4px" }}>
                                  <button
                                    className="action-btn-sm delete-red"
                                    style={{ fontSize: "11px", padding: "4px 8px", background: "#dc2626", color: "#fff", fontWeight: "700" }}
                                    onClick={async () => {
                                      await handleDeleteConfigFile("product", rec.name, true);
                                      setDeletingConfigKey(null);
                                    }}
                                    title="Confirm delete recipe"
                                  >
                                    CONFIRM
                                  </button>
                                  <button
                                    className="action-btn-sm"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    onClick={() => setDeletingConfigKey(null)}
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="action-btn-sm delete-red"
                                  style={{ fontSize: "11px", padding: "4px 8px" }}
                                  onClick={() => setDeletingConfigKey(`product-${rec.name}`)}
                                  title={`Delete ${rec.name}`}
                                >
                                  DELETE
                                </button>
                              )
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
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", alignItems: "center" }}>
                          {mach.active ? (
                            <span className="badge-result pass" style={{ fontSize: "10.5px", padding: "4px 8px", fontWeight: "700" }}>
                              CURRENT
                            </span>
                          ) : (
                            <button
                              className="action-btn-sm"
                              style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(245, 158, 11, 0.15)", color: "var(--color-warn)", borderColor: "rgba(245, 158, 11, 0.3)" }}
                              onClick={() => handleActivateMachine(mach.name)}
                              title={`Apply ${mach.name}`}
                            >
                              ACTIVATE
                            </button>
                          )}

                          {/* EDIT BUTTON */}
                          <button
                            className="action-btn-sm"
                            style={{ fontSize: "11px", padding: "4px 8px", background: "rgba(255, 255, 255, 0.05)" }}
                            onClick={() => handleOpenEditConfig("machine", mach.name)}
                            title={`Edit ${mach.name}`}
                          >
                            EDIT
                          </button>

                          {!mach.active && (
                            deletingConfigKey === `machine-${mach.name}` ? (
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button
                                  className="action-btn-sm delete-red"
                                  style={{ fontSize: "11px", padding: "4px 8px", background: "#dc2626", color: "#fff", fontWeight: "700" }}
                                  onClick={async () => {
                                    await handleDeleteConfigFile("machine", mach.name, true);
                                    setDeletingConfigKey(null);
                                  }}
                                  title="Confirm delete machine setting"
                                >
                                  CONFIRM
                                </button>
                                <button
                                  className="action-btn-sm"
                                  style={{ fontSize: "11px", padding: "4px 8px" }}
                                  onClick={() => setDeletingConfigKey(null)}
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                className="action-btn-sm delete-red"
                                style={{ fontSize: "11px", padding: "4px 8px" }}
                                onClick={() => setDeletingConfigKey(`machine-${mach.name}`)}
                                title={`Delete ${mach.name}`}
                              >
                                DELETE
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {(!configLibrary.recipes || configLibrary.recipes.length === 0) &&
                    (!configLibrary.machines || configLibrary.machines.length === 0) && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                          No configurations stored in library. Create or upload a Product Recipe or Machine Setting above.
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
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
