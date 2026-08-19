import React from "react";
import { useInspection } from "../context/InspectionContext";

export default function ModelsPage() {
  const {
    benchmarkActiveSubTab,
    setBenchmarkActiveSubTab,
    benchmarkModel,
    setBenchmarkModel,
    selectedClasses,
    benchmarkKpis,
    modelsList,
    benchmarkFileInputRef,
    benchmarkZipFile,
    setBenchmarkZipFile,
    isBenchmarkDragging,
    setIsBenchmarkDragging,
    benchmarkRules,
    setBenchmarkRules,
    benchmarkProgress,
    isBenchmarkStarting,
    handleStartBenchmark,
    handleStopBenchmark,
    handleExportBenchmarkCSV,
    handleViewReport,
    benchmarkFilter,
    setBenchmarkFilter,
    fetchBenchmarkResults,
    handleBatchReview,
    benchmarkResults,
    benchmarkSearch,
    setBenchmarkSplitModalItem,
    setBenchmarkSplitModalIndex,
    handleSaveHumanReview,
    resolveImageUrl,
    uploadClassCount,
    setUploadClassCount,
    fileInputRef,
    isDragging,
    setIsDragging,
    handleUploadFile,
    modelFilter,
    setModelFilter,
    handleActivateModel,
    handleDeleteModel
  } = useInspection();

  const priority_dispatcher_status_color = (status) => {
    if (status === "P0_PRODUCTION") return "#ef4444";
    if (status === "P1_BENCHMARK") return "#0ea5e9";
    return "var(--text-muted)";
  };

  // Default to registry if hub was selected previously
  const activeTab = benchmarkActiveSubTab === "hub" ? "registry" : benchmarkActiveSubTab;

  return (
    <div className="tab-content active-tab" id="view-models-validation">
      <main className="validation-lab-layout" style={{ padding: "16px 24px", maxWidth: "1600px", margin: "0 auto" }}>
        
        {/* TOP MODELS SUB-NAVBAR & STATUS HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            background: "var(--bg-card)",
            padding: "12px 18px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)"
          }}
        >
          {/* Left Title & Segmented Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: "0 0 2px 0", fontSize: "16px", fontWeight: "700", letterSpacing: "0.5px" }}>
                AI MODELS & VALIDATION
              </h2>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Manage NPU weights, live hot-swapping and ground-truth validation benchmark
              </span>
            </div>

            {/* Segmented Dual-Tab Switcher */}
            <div
              style={{
                display: "inline-flex",
                background: "rgba(0, 0, 0, 0.2)",
                padding: "3px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                gap: "4px"
              }}
            >
              <button
                type="button"
                className={`compare-btn ${activeTab === "registry" ? "active" : ""}`}
                onClick={() => setBenchmarkActiveSubTab("registry")}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "4px",
                  border: "none"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
                  <rect x="9" y="9" width="6" height="6"></rect>
                  <line x1="9" y1="1" x2="9" y2="4"></line>
                  <line x1="15" y1="1" x2="15" y2="4"></line>
                  <line x1="9" y1="20" x2="9" y2="23"></line>
                  <line x1="15" y1="20" x2="15" y2="23"></line>
                  <line x1="20" y1="9" x2="23" y2="9"></line>
                  <line x1="20" y1="14" x2="23" y2="14"></line>
                  <line x1="1" y1="9" x2="4" y2="9"></line>
                  <line x1="1" y1="14" x2="4" y2="14"></line>
                </svg>
                MODEL REGISTRY & DEPLOY
              </button>

              <button
                type="button"
                className={`compare-btn ${activeTab === "validation" ? "active" : ""}`}
                onClick={() => setBenchmarkActiveSubTab("validation")}
                style={{
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "4px",
                  border: "none"
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2v6h.01L6 8.01 10 13v6a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-6l4-4.99V8h.01V2z"></path>
                  <line x1="6" y1="2" x2="18" y2="2"></line>
                </svg>
                BENCHMARK & QUALITY LAB
              </button>
            </div>
          </div>

          {/* Right Active Model Info Pill */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>ACTIVE NPU MODEL:</span>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "4px 10px",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "4px"
              }}
            >
              <span className="status-dot green-glow" style={{ width: "7px", height: "7px" }}></span>
              <span className="font-mono" style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-pass)" }}>
                {benchmarkModel || "unet.tflite"} ({selectedClasses} Classes)
              </span>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------------
            TAB 1: MODEL REGISTRY & NPU DEPLOYMENT
            ------------------------------------------------------------- */}
        {activeTab === "registry" && (
          <div className="models-grid" style={{ marginTop: "12px" }}>
            {/* Left: Drag and drop upload card */}
            <div className="models-left-panel">
              <div className="hmi-card uploader-card">
                <div className="card-header">
                  <h3>UPLOAD AI MODEL</h3>
                  <span className="pill-id">IMPORT</span>
                </div>
                <div className="card-body">
                  {/* Architecture Toggle */}
                  <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      Model Class Architecture:
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className={`compare-btn ${uploadClassCount === 2 ? "active" : ""}`}
                        onClick={() => setUploadClassCount(2)}
                        style={{ flex: 1, padding: "6px 8px", fontSize: "11px", borderRadius: "4px" }}
                      >
                        2 Classes (Pad + Mark)
                      </button>
                      <button
                        type="button"
                        className={`compare-btn ${uploadClassCount === 3 ? "active" : ""}`}
                        onClick={() => setUploadClassCount(3)}
                        style={{ flex: 1, padding: "6px 8px", fontSize: "11px", borderRadius: "4px" }}
                      >
                        3 Classes (Pad + Mark + Grain)
                      </button>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".tflite,.onnx,.pth"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className={`upload-drop-zone ${isDragging ? "active-drag" : ""}`}
                    id="upload-zone"
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files.length > 0) {
                        handleUploadFile(files[0]);
                      }
                    }}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  >
                    <div style={{ marginBottom: "8px", color: "var(--color-info)" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                      </svg>
                    </div>
                    <p className="upload-main-text" style={{ fontSize: "13px", fontWeight: "600", margin: "0 0 4px 0" }}>
                      Drag & Drop Model File Here
                    </p>
                    <p className="upload-sub-text" style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 12px 0" }}>
                      Supports .tflite (NPU Delegate) or .onnx ({uploadClassCount} Classes)
                    </p>
                    <button
                      type="button"
                      className="select-file-btn"
                      style={{ padding: "6px 16px", fontSize: "12px", borderRadius: "4px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current && fileInputRef.current.click();
                      }}
                    >
                      Browse File
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Models table list */}
            <div className="models-right-panel">
              <div className="hmi-card models-list-card">
                <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>REGISTERED MODELS ON EDGE</h3>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Current System Architecture: <strong style={{ color: "var(--color-info)" }}>{selectedClasses} Classes</strong>
                    </span>
                  </div>
                  <div className="model-class-toggle" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>Filter:</span>
                    <button
                      className={`compare-btn ${modelFilter === "ALL" ? "active" : ""}`}
                      onClick={() => setModelFilter("ALL")}
                      style={{ padding: "3px 8px", fontSize: "11px", borderRadius: "4px" }}
                    >
                      All ({modelsList.length})
                    </button>
                    <button
                      className={`compare-btn ${modelFilter === "2" ? "active" : ""}`}
                      onClick={() => setModelFilter("2")}
                      style={{ padding: "3px 8px", fontSize: "11px", borderRadius: "4px" }}
                    >
                      2 Classes
                    </button>
                    <button
                      className={`compare-btn ${modelFilter === "3" ? "active" : ""}`}
                      onClick={() => setModelFilter("3")}
                      style={{ padding: "3px 8px", fontSize: "11px", borderRadius: "4px" }}
                    >
                      3 Classes
                    </button>
                  </div>
                </div>
                <div className="card-body table-container">
                  <table className="history-table models-table">
                    <thead>
                      <tr>
                        <th>Model Name</th>
                        <th>Version</th>
                        <th>Engine / Delegate</th>
                        <th>Size</th>
                        <th>Architecture</th>
                        <th>Target Acc</th>
                        <th>Status</th>
                        <th style={{ textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody id="models-table-body">
                      {modelsList
                        .filter(m => modelFilter === "ALL" || String(m.classes || 3) === modelFilter)
                        .map((model, idx) => {
                          const isActive = model.active || model.name === benchmarkModel;
                          return (
                            <tr key={idx} className={isActive ? "row-active-model" : ""}>
                              <td className="font-mono" style={{ fontWeight: "600" }}>{model.name}</td>
                              <td className="font-mono">{model.version || "v1.0.0"}</td>
                              <td className="font-mono">
                                <span style={{ color: model.name.endsWith(".tflite") ? "var(--color-pass)" : "inherit" }}>
                                  {model.engine || (model.name.endsWith(".tflite") ? "TFLite / NPU" : "ONNX / CPU")}
                                </span>
                              </td>
                              <td className="font-mono">{model.size || "-"}</td>
                              <td>
                                <span
                                  className="badge-result"
                                  style={{
                                    fontSize: "10px",
                                    background: model.classes === 2 ? "rgba(14, 165, 233, 0.15)" : "rgba(139, 92, 246, 0.15)",
                                    color: model.classes === 2 ? "#0ea5e9" : "#a855f7",
                                    border: `1px solid ${model.classes === 2 ? "rgba(14, 165, 233, 0.4)" : "rgba(139, 92, 246, 0.4)"}`
                                  }}
                                >
                                  {model.classes || 3} Classes {model.classes === 2 ? "(Pad+Mark)" : "(Pad+Mark+Grain)"}
                                </span>
                              </td>
                              <td className="font-mono">{model.accuracy || "97.5%"}</td>
                              <td>
                                <span className={`badge-result ${isActive ? "pass" : "warn"}`}>
                                  {isActive ? `ACTIVE (${model.classes || 3}C)` : "STANDBY"}
                                </span>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                {isActive ? (
                                  <button className="action-btn-sm active-green" disabled>IN USE</button>
                                ) : (
                                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                    <button
                                      className="action-btn-sm"
                                      onClick={() => handleActivateModel(model)}
                                      title={`Deploy to i.MX8 NPU and switch system architecture to ${model.classes || 3} Classes`}
                                    >
                                      ACTIVATE ({model.classes || 3}C)
                                    </button>
                                    <button className="action-btn-sm delete-red" onClick={() => handleDeleteModel(model)}>
                                      DELETE
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB 2: VALIDATION & HUMAN REVIEW LAB
            ------------------------------------------------------------- */}
        {activeTab === "validation" && (
          <>
            {/* 1. TOP QUALITY KPI DASHBOARD */}
            <div className="kpi-dashboard-grid" style={{ marginTop: "12px" }}>
              {/* Overkill Rate */}
              <div className={`kpi-card ${benchmarkKpis.overkill_rate > 3 ? "alert-warning" : "highlight-info"}`}>
                <div className="kpi-header">
                  <span className="kpi-title">Overkill Rate (FP)</span>
                  <span className="kpi-badge-hint badge-warn">AI Fail / Human Pass</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val" style={{ color: benchmarkKpis.overkill_rate > 3 ? "var(--color-warn)" : "inherit" }}>
                    {benchmarkKpis.overkill_rate.toFixed(1)}%
                  </span>
                  <span className="kpi-sub-text">({benchmarkKpis.overkill_count} dies wasted)</span>
                </div>
                <div className="kpi-sub-text">Target: &lt; 3.0% (Minimizes false scrap)</div>
              </div>

              {/* Underkill / Escape Rate */}
              <div className={`kpi-card ${benchmarkKpis.underkill_rate > 0 ? "alert-danger" : "highlight-success"}`}>
                <div className="kpi-header">
                  <span className="kpi-title">Underkill / Escape (FN)</span>
                  <span className={`kpi-badge-hint ${benchmarkKpis.underkill_rate > 0 ? "badge-fail" : "badge-pass"}`}>
                    {benchmarkKpis.underkill_rate > 0 ? "CRITICAL RISK" : "ZERO ESCAPE"}
                  </span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val" style={{ color: benchmarkKpis.underkill_rate > 0 ? "var(--color-fail)" : "var(--color-pass)" }}>
                    {benchmarkKpis.underkill_rate.toFixed(1)}%
                  </span>
                  <span className="kpi-sub-text">({benchmarkKpis.underkill_count} defect escapes)</span>
                </div>
                <div className="kpi-sub-text">Target: 0.0% (Zero defect leakage)</div>
              </div>

              {/* AI-Human Agreement */}
              <div className="kpi-card highlight-info">
                <div className="kpi-header">
                  <span className="kpi-title">AI Agreement</span>
                  <span className="kpi-badge-hint badge-info">Ground Truth Match</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val">{benchmarkKpis.agreement_rate.toFixed(1)}%</span>
                  <span className="kpi-sub-text">({benchmarkKpis.agreement_count} / {benchmarkKpis.total_reviewed || 0})</span>
                </div>
                <div className="kpi-sub-text">Reviewed: {benchmarkKpis.total_reviewed} / {benchmarkKpis.total_tested} items</div>
              </div>

              {/* True Yield vs AI Yield */}
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">Yield Benchmark</span>
                  <span className="kpi-badge-hint badge-neutral">Pass Ratio</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val">{benchmarkKpis.true_yield.toFixed(1)}%</span>
                  <span className="kpi-sub-text">(AI: {benchmarkKpis.ai_yield.toFixed(1)}%)</span>
                </div>
                <div className="kpi-sub-text">Pass: {benchmarkKpis.human_pass_count} | Fail: {benchmarkKpis.human_fail_count}</div>
              </div>

              {/* NPU Latency */}
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">NPU Latency</span>
                  <span className="kpi-badge-hint badge-pass">i.MX8 NPU</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val">{benchmarkKpis.avg_inference_time_ms.toFixed(1)} <small style={{ fontSize: "13px" }}>ms</small></span>
                </div>
                <div className="kpi-sub-text">Rule Eval: {benchmarkKpis.avg_rule_time_ms.toFixed(2)} ms</div>
              </div>

              {/* Interactive Confusion Matrix */}
              <div className="confusion-matrix-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="kpi-title" style={{ fontSize: "10px" }}>Confusion Matrix</span>
                  <span style={{ fontSize: "9px", color: "var(--text-muted)" }}>H: Ground Truth</span>
                </div>
                <div className="matrix-grid">
                  <div className="matrix-cell tp" title="True Positive: AI FAIL and Human FAIL (Confirmed Defect)">
                    <span className="matrix-lbl">TP (Defect)</span>
                    <span className="matrix-num" style={{ color: "#10b981" }}>{benchmarkKpis.confusion_matrix.tp}</span>
                  </div>
                  <div className="matrix-cell fp" title="False Positive / Overkill: AI FAIL but Human PASS (Wasted Good Die)">
                    <span className="matrix-lbl">FP (Overkill)</span>
                    <span className="matrix-num" style={{ color: "#f59e0b" }}>{benchmarkKpis.confusion_matrix.fp}</span>
                  </div>
                  <div className="matrix-cell fn" title="False Negative / Escape: AI PASS but Human FAIL (Defect Escaped)">
                    <span className="matrix-lbl">FN (Escape)</span>
                    <span className="matrix-num" style={{ color: "#ef4444" }}>{benchmarkKpis.confusion_matrix.fn}</span>
                  </div>
                  <div className="matrix-cell tn" title="True Negative: AI PASS and Human PASS (Confirmed Good Die)">
                    <span className="matrix-lbl">TN (Good)</span>
                    <span className="matrix-num" style={{ color: "#0ea5e9" }}>{benchmarkKpis.confusion_matrix.tn}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. TWO-COLUMN MAIN WORKSPACE */}
            <div className="validation-main-grid" style={{ marginTop: "12px" }}>
              {/* LEFT COLUMN: SETUP & PRIORITY QUEUE PANEL */}
              <div className="validation-setup-panel">
                <div className="hmi-card">
                  <div className="card-header">
                    <h3>BENCHMARK ENGINE CONFIG</h3>
                    <span className="pill-id">CONFIG</span>
                  </div>
                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {/* Model Selector */}
                    <div className="form-group-lab">
                      <label>Target AI Model</label>
                      <select
                        className="lab-select"
                        value={benchmarkModel}
                        onChange={(e) => setBenchmarkModel(e.target.value)}
                      >
                        {modelsList.map((m, idx) => (
                          <option key={idx} value={m.name}>
                            {m.name} ({m.classes || 3} Classes - {m.engine || "TFLite"})
                          </option>
                        ))}
                        {modelsList.length === 0 && (
                          <option value="unet.tflite">unet.tflite (3 Classes - TFLite NPU)</option>
                        )}
                      </select>
                    </div>

                    {/* Test Dataset (ZIP Upload) */}
                    <div className="form-group-lab">
                      <label>Upload Test Dataset (.zip)</label>
                      <input
                        type="file"
                        ref={benchmarkFileInputRef}
                        accept=".zip,image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setBenchmarkZipFile(e.target.files[0]);
                          }
                        }}
                      />

                      {!benchmarkZipFile ? (
                        <div
                          className={`benchmark-zip-dropzone ${isBenchmarkDragging ? "active-drag" : ""}`}
                          onDragOver={(e) => { e.preventDefault(); setIsBenchmarkDragging(true); }}
                          onDragLeave={() => setIsBenchmarkDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsBenchmarkDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              setBenchmarkZipFile(e.dataTransfer.files[0]);
                            }
                          }}
                          onClick={() => benchmarkFileInputRef.current && benchmarkFileInputRef.current.click()}
                        >
                          <p className="upload-main-text" style={{ fontSize: "12px", margin: 0, fontWeight: "600" }}>
                            Drop .ZIP file or click to browse
                          </p>
                          <p className="upload-sub-text" style={{ fontSize: "10px", margin: "4px 0 0 0" }}>
                            Raw wafer images archive (.zip)
                          </p>
                        </div>
                      ) : (
                        <div className="selected-zip-box">
                          <div className="zip-file-info">
                            <span className="zip-file-name" title={benchmarkZipFile.name}>{benchmarkZipFile.name}</span>
                            <span className="zip-file-meta">
                              {(benchmarkZipFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to benchmark
                            </span>
                          </div>
                          <button
                            className="zip-remove-btn"
                            title="Remove and select another file"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBenchmarkZipFile(null);
                              if (benchmarkFileInputRef.current) benchmarkFileInputRef.current.value = "";
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Rule Limit Sliders */}
                    <div className="form-group-lab">
                      <label>
                        <span>Min Edge Distance</span>
                        <span className="slider-val-badge">{benchmarkRules.fail_distance_um.toFixed(1)} µm</span>
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
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Mark &lt; {benchmarkRules.fail_distance_um} µm from pad border triggers FAIL</span>
                    </div>

                    <div className="form-group-lab">
                      <label>
                        <span>Max Area Ratio</span>
                        <span className="slider-val-badge">{benchmarkRules.max_area_ratio_pct.toFixed(0)}%</span>
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
                    </div>

                    <div className="form-group-lab">
                      <label>Missing Probe Mark</label>
                      <select
                        className="lab-select"
                        value={benchmarkRules.missing_mark_action}
                        onChange={(e) => setBenchmarkRules(prev => ({ ...prev, missing_mark_action: e.target.value }))}
                      >
                        <option value="fail">Strict: Trigger FAIL (Requires Probe Mark)</option>
                        <option value="pass">Tolerant: Allow PASS (Untouched Pad)</option>
                      </select>
                    </div>

                    {/* Priority Queue Status Monitor */}
                    <div className="priority-queue-card">
                      <div className="priority-header">
                        <span>TASK PRIORITY QUEUE</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                          Active: <strong style={{ color: priority_dispatcher_status_color(benchmarkProgress.active_priority) }}>{benchmarkProgress.active_priority}</strong>
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", marginTop: "2px" }}>
                        <span className="priority-badge-p0">P0 (Prober): {benchmarkProgress.p0_pending} in queue</span>
                        <span className="priority-badge-p1">P1 (Validation): {benchmarkProgress.p1_pending} pending</span>
                      </div>
                      
                      <div className="priority-progress-bar" style={{ marginTop: "4px" }}>
                        <div
                          className="priority-progress-fill"
                          style={{
                            width: `${benchmarkProgress.p1_total > 0 ? (benchmarkProgress.p1_processed / benchmarkProgress.p1_total) * 100 : 0}%`
                          }}
                        ></div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", color: "var(--text-muted)" }}>
                        <span>Progress: {benchmarkProgress.p1_processed} / {benchmarkProgress.p1_total} Images ({benchmarkProgress.p1_total > 0 ? Math.round((benchmarkProgress.p1_processed / benchmarkProgress.p1_total) * 100) : 0}%)</span>
                        <span style={{ color: benchmarkProgress.status === "RUNNING" ? "#38bdf8" : "inherit" }}>
                          {benchmarkProgress.status}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                      <button
                        type="button"
                        className="btn-start-benchmark"
                        style={{ flex: 1 }}
                        disabled={isBenchmarkStarting || benchmarkProgress.status === "RUNNING"}
                        onClick={handleStartBenchmark}
                      >
                        {benchmarkProgress.status === "RUNNING" ? "BENCHMARK RUNNING..." : "START BENCHMARK ON i.MX8"}
                      </button>
                      {benchmarkProgress.status === "RUNNING" && (
                        <button
                          type="button"
                          className="btn-stop-benchmark"
                          onClick={handleStopBenchmark}
                        >
                          STOP
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: HUMAN REVIEW STATION */}
              <div className="human-review-panel">
                <div className="hmi-card" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <h3>HUMAN REVIEW STATION</h3>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        Compare AI Decision vs QA Ground Truth ({benchmarkResults.length} Items)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="review-action-btn" onClick={handleExportBenchmarkCSV} title="Export CSV summary report">
                        EXPORT CSV
                      </button>
                      <button className="review-action-btn" onClick={handleViewReport} title="Open analytical validation report card">
                        VIEW REPORT
                      </button>
                    </div>
                  </div>

                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, overflow: "hidden" }}>
                    {/* Review Toolbar & Filter Tabs */}
                    <div className="review-toolbar">
                      <div className="review-filter-group">
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "ALL" ? "active" : ""}`}
                          onClick={() => { setBenchmarkFilter("ALL"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "ALL"); }}
                        >
                          All ({benchmarkResults.length})
                        </button>
                        <button
                          className={`review-filter-btn warn ${benchmarkFilter === "DISAGREEMENT" ? "active" : ""}`}
                          onClick={() => { setBenchmarkFilter("DISAGREEMENT"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "DISAGREEMENT"); }}
                        >
                          Disagreements ({benchmarkKpis.overkill_count + benchmarkKpis.underkill_count})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "UNREVIEWED" ? "active" : ""}`}
                          onClick={() => { setBenchmarkFilter("UNREVIEWED"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "UNREVIEWED"); }}
                        >
                          Pending Review ({benchmarkKpis.unreviewed_count})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "HUMAN_PASS" ? "active" : ""}`}
                          onClick={() => { setBenchmarkFilter("HUMAN_PASS"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "HUMAN_PASS"); }}
                        >
                          Human PASS ({benchmarkKpis.human_pass_count})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "HUMAN_FAIL" ? "active" : ""}`}
                          onClick={() => { setBenchmarkFilter("HUMAN_FAIL"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "HUMAN_FAIL"); }}
                        >
                          Human FAIL ({benchmarkKpis.human_fail_count})
                        </button>
                      </div>

                      {/* Batch Action Helpers */}
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <button
                          className="review-action-btn"
                          style={{ fontSize: "10.5px" }}
                          onClick={() => handleBatchReview("CONFIRM_ALL_AI")}
                          title="Auto-fill human decision to match AI prediction for all unreviewed items"
                        >
                          Auto-Confirm AI
                        </button>
                        <button
                          className="review-action-btn"
                          style={{ fontSize: "10.5px" }}
                          onClick={() => handleBatchReview("MARK_UNREVIEWED_PASS")}
                          title="Set all unreviewed items to PASS"
                        >
                          Mark All PASS
                        </button>
                        <button
                          className="review-action-btn"
                          style={{ fontSize: "10.5px" }}
                          onClick={() => handleBatchReview("MARK_UNREVIEWED_FAIL")}
                          title="Set all unreviewed items to FAIL"
                        >
                          Mark All FAIL
                        </button>
                        <button
                          className="review-action-btn"
                          style={{ fontSize: "10.5px" }}
                          onClick={() => handleBatchReview("RESET_ALL")}
                          title="Reset all reviews back to UNREVIEWED"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Results Table */}
                    <div className="table-container" style={{ flex: 1, overflowY: "auto" }}>
                      <table className="history-table">
                        <thead>
                          <tr>
                            <th style={{ width: "60px" }}>Visual</th>
                            <th>Sample / Wafer ID</th>
                            <th>AI Decision</th>
                            <th>Violations / Reason</th>
                            <th>Min Edge</th>
                            <th>Area %</th>
                            <th>Latency</th>
                            <th>Human Review</th>
                            <th style={{ textAlign: "center", width: "150px" }}>Grade Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {benchmarkResults.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                                {benchmarkProgress.status === "RUNNING"
                                  ? "Processing benchmark images on i.MX8 NPU... Results will stream in real-time."
                                  : "No benchmark validation results found. Select a dataset and click 'START BENCHMARK ON i.MX8' to begin."}
                              </td>
                            </tr>
                          ) : (
                            benchmarkResults
                              .filter(r => !benchmarkSearch || r.image_name.toLowerCase().includes(benchmarkSearch.toLowerCase()))
                              .map((item, idx) => {
                                const isDisagreement = item.human_decision !== "UNREVIEWED" && item.human_decision !== item.ai_decision;
                                const isOverkill = item.ai_decision === "FAIL" && item.human_decision === "PASS";
                                const isUnderkill = item.ai_decision === "PASS" && item.human_decision === "FAIL";

                                return (
                                  <tr
                                    key={item.id || idx}
                                    style={{
                                      background: isUnderkill
                                        ? "rgba(239, 68, 68, 0.08)"
                                        : isOverkill
                                        ? "rgba(245, 158, 11, 0.08)"
                                        : "inherit"
                                    }}
                                  >
                                    {/* Thumbnail */}
                                    <td>
                                      <div
                                        style={{
                                          width: "44px",
                                          height: "44px",
                                          borderRadius: "4px",
                                          overflow: "hidden",
                                          cursor: "pointer",
                                          border: "1px solid var(--border-color)",
                                          background: "#000"
                                        }}
                                        onClick={() => {
                                          setBenchmarkSplitModalItem(item);
                                          setBenchmarkSplitModalIndex(idx);
                                        }}
                                        title="Click to open Split View Inspection"
                                      >
                                        <img
                                          src={resolveImageUrl(item.annotated_image_url || item.image_url)}
                                          alt={item.image_name}
                                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                          onError={(e) => {
                                            e.target.src = resolveImageUrl(item.raw_image_url || item.image_url);
                                          }}
                                        />
                                      </div>
                                    </td>

                                    {/* Sample Name */}
                                    <td>
                                      <div
                                        style={{ cursor: "pointer", fontWeight: "600" }}
                                        onClick={() => {
                                          setBenchmarkSplitModalItem(item);
                                          setBenchmarkSplitModalIndex(idx);
                                        }}
                                      >
                                        <span className="font-mono" style={{ fontSize: "11px" }}>{item.image_name}</span>
                                      </div>
                                    </td>

                                    {/* AI Decision */}
                                    <td>
                                      <span className={`badge-result ${item.ai_decision.toLowerCase()}`}>
                                        {item.ai_decision}
                                      </span>
                                    </td>

                                    {/* Violation / Reason */}
                                    <td style={{ fontSize: "11px", color: "var(--text-muted)", maxWidth: "200px" }}>
                                      <span title={item.ai_reason}>{item.ai_reason || "-"}</span>
                                    </td>

                                    {/* Min Edge Distance */}
                                    <td className="font-mono" style={{ fontSize: "11px" }}>
                                      <span style={{ color: item.min_edge_distance_um < benchmarkRules.fail_distance_um ? "#ef4444" : "inherit" }}>
                                        {item.min_edge_distance_um ? `${item.min_edge_distance_um.toFixed(1)} µm` : "-"}
                                      </span>
                                    </td>

                                    {/* Mark Area Ratio */}
                                    <td className="font-mono" style={{ fontSize: "11px" }}>
                                      {item.mark_area_ratio_pct ? `${item.mark_area_ratio_pct.toFixed(1)}%` : "-"}
                                    </td>

                                    {/* NPU Latency */}
                                    <td className="font-mono" style={{ fontSize: "11px" }}>
                                      {item.inference_time_ms ? `${item.inference_time_ms.toFixed(1)} ms` : "-"}
                                    </td>

                                    {/* Human Decision Badge */}
                                    <td>
                                      {item.human_decision === "PASS" && (
                                        <span className="badge-result pass" style={{ fontSize: "10px" }}>PASS</span>
                                      )}
                                      {item.human_decision === "FAIL" && (
                                        <span className="badge-result fail" style={{ fontSize: "10px" }}>FAIL</span>
                                      )}
                                      {item.human_decision === "UNREVIEWED" && (
                                        <span className="badge-result warn" style={{ fontSize: "10px", opacity: 0.7 }}>UNREVIEWED</span>
                                      )}
                                      {isDisagreement && (
                                        <span style={{ marginLeft: "4px", fontSize: "9px", color: isUnderkill ? "#ef4444" : "#f59e0b", fontWeight: "bold" }}>
                                          {isUnderkill ? "[ESCAPE]" : "[OVERKILL]"}
                                        </span>
                                      )}
                                    </td>

                                    {/* Quick Grade Action Buttons */}
                                    <td>
                                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                                        <button
                                          className={`btn-human-pass ${item.human_decision === "PASS" ? "active" : ""}`}
                                          onClick={() => handleSaveHumanReview(item, "PASS")}
                                          title="Mark this sample as Human PASS"
                                        >
                                          PASS
                                        </button>
                                        <button
                                          className={`btn-human-fail ${item.human_decision === "FAIL" ? "active" : ""}`}
                                          onClick={() => handleSaveHumanReview(item, "FAIL")}
                                          title="Mark this sample as Human FAIL"
                                        >
                                          FAIL
                                        </button>
                                        <button
                                          className="action-btn-sm"
                                          style={{ padding: "4px 8px", fontSize: "10px", fontWeight: "700" }}
                                          onClick={() => {
                                            setBenchmarkSplitModalItem(item);
                                            setBenchmarkSplitModalIndex(idx);
                                          }}
                                          title="Open High-Resolution Split View"
                                        >
                                          VIEW
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
