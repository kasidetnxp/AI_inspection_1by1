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
    fileInputRef,
    isDragging,
    setIsDragging,
    handleUploadFile,
    isModelConverting,
    convertingModelName,
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
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>MODEL:</span>
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
                {benchmarkModel || "unet.tflite"}
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
                </div>
                <div className="card-body">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".tflite,.pth,.pt"
                    style={{ display: "none" }}
                    disabled={isModelConverting}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div
                    className={`upload-drop-zone ${isDragging ? "active-drag" : ""}`}
                    id="upload-zone"
                    style={{ minHeight: "220px", pointerEvents: isModelConverting ? "none" : "auto", opacity: isModelConverting ? 0.85 : 1 }}
                    onDragOver={(e) => { e.preventDefault(); if (!isModelConverting) setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (isModelConverting) return;
                      const files = e.dataTransfer.files;
                      if (files.length > 0) {
                        handleUploadFile(files[0]);
                      }
                    }}
                    onClick={() => { if (!isModelConverting && fileInputRef.current) fileInputRef.current.click(); }}
                  >
                    {isModelConverting ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px" }}>
                        <div className="upload-spinner"></div>
                        <p className="upload-main-text" style={{ fontSize: "16px", color: "var(--color-info)" }}>Converting Model...</p>
                        <p className="upload-sub-text" style={{ fontSize: "12px", marginTop: "4px" }}>
                          Exporting PyTorch ({convertingModelName}) & Quantizing to INT8 TFLite for NPU...
                        </p>
                      </div>
                    ) : (
                      <>
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
                          Accepts .pth (Auto-converts to TFLite) or .tflite
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
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Models table list */}
            <div className="models-right-panel">
              <div className="hmi-card models-list-card">
                <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>REGISTERED MODELS ON EDGE</h3>
                  </div>
                </div>
                <div className="card-body table-container">
                  <table className="history-table models-table">
                    <thead>
                      <tr>
                        <th>Model Name</th>
                        <th>Version</th>
                        <th>Size</th>
                        <th>Status</th>
                        <th style={{ textAlign: "center" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody id="models-table-body">
                      {modelsList.map((model, idx) => {
                        const isActive = model.active || model.name === benchmarkModel;
                        return (
                          <tr key={idx} className={isActive ? "row-active-model" : ""}>
                            <td className="font-mono" style={{ fontWeight: "600" }}>{model.name}</td>
                            <td className="font-mono">{model.version || "v1.0.0"}</td>
                            <td className="font-mono">{model.size || "-"}</td>
                            <td>
                              <span className={`badge-result ${isActive ? "pass" : "warn"}`}>
                                {isActive ? "ACTIVE RUNNING" : "INACTIVE"}
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
                                    title={`Deploy ${model.name} to i.MX8 NPU`}
                                  >
                                    ACTIVATE
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
              <div className={`kpi-card ${(benchmarkKpis.overkill_rate || 0) > 3 ? "alert-warning" : "highlight-info"}`}>
                <div className="kpi-header">
                  <span className="kpi-title">OVERKILL RATE</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val" style={{ color: (benchmarkKpis.overkill_rate || 0) > 3 ? "var(--color-warn)" : "inherit" }}>
                    {(benchmarkKpis.overkill_rate || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Underkill Rate */}
              <div className={`kpi-card ${(benchmarkKpis.underkill_rate || 0) > 0 ? "alert-danger" : "highlight-success"}`}>
                <div className="kpi-header">
                  <span className="kpi-title">UNDERKILL</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val" style={{ color: (benchmarkKpis.underkill_rate || 0) > 0 ? "var(--color-fail)" : "var(--color-pass)" }}>
                    {(benchmarkKpis.underkill_rate || 0).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* True Yield vs AI Yield */}
              <div className="kpi-card">
                <div className="kpi-header">
                  <span className="kpi-title">YIELD BENCHMARK</span>
                </div>
                <div className="kpi-value-row">
                  <span className="kpi-main-val">{(benchmarkKpis.true_yield || 0).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* 2. TWO-COLUMN MAIN WORKSPACE */}
            <div className="validation-main-grid" style={{ marginTop: "12px" }}>
              {/* LEFT COLUMN: SETUP & PRIORITY QUEUE PANEL */}
              <div className="validation-setup-panel">
                <div className="hmi-card">
                  <div className="card-header">
                    <h3>TEST SETUP</h3>
                  </div>
                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    {/* Model Selector */}
                    <div className="form-group-lab">
                      <label style={{ fontSize: "14px", fontWeight: "700" }}>Target AI Model</label>
                      <select
                        className="lab-select"
                        value={benchmarkModel}
                        onChange={(e) => setBenchmarkModel(e.target.value)}
                        style={{ fontSize: "15px", padding: "10px 12px" }}
                      >
                        {modelsList.map((m, idx) => (
                          <option key={idx} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                        {modelsList.length === 0 && (
                          <option value="unet.tflite">unet.tflite</option>
                        )}
                      </select>
                    </div>

                    {/* Test Dataset (ZIP Upload) */}
                    <div className="form-group-lab">
                      <label style={{ fontSize: "14px", fontWeight: "700" }}>Upload Test Dataset (.zip)</label>
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
                          <div style={{ marginBottom: "10px", color: "var(--color-info)" }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="17 8 12 3 7 8"></polyline>
                              <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                          </div>
                          <p className="upload-main-text" style={{ fontSize: "16px", margin: "0 0 6px 0", fontWeight: "700" }}>
                            Drop .ZIP file or click to browse
                          </p>
                          <p className="upload-sub-text" style={{ fontSize: "14px", margin: 0, color: "var(--text-muted)" }}>
                            Raw wafer images archive (.zip)
                          </p>
                        </div>
                      ) : (
                        <div className="selected-zip-box" style={{ padding: "14px 16px" }}>
                          <div className="zip-file-info">
                            <span className="zip-file-name" style={{ fontSize: "15px" }} title={benchmarkZipFile.name}>{benchmarkZipFile.name}</span>
                            <span className="zip-file-meta" style={{ fontSize: "13px" }}>
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

                    {/* Priority Queue Status Monitor */}
                    <div className="priority-queue-card" style={{ padding: "14px 16px" }}>
                      <div className="priority-header" style={{ fontSize: "14px" }}>
                        <span>TASK STATUS</span>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: benchmarkProgress.status === "RUNNING" ? "#38bdf8" : "var(--text-muted)" }}>
                          {isBenchmarkStarting ? "UPLOADING..." : benchmarkProgress.status}
                        </span>
                      </div>
                      
                      <div className="priority-progress-bar" style={{ marginTop: "8px", height: "8px" }}>
                        <div
                          className="priority-progress-fill"
                          style={{
                            width: `${benchmarkProgress.p1_total > 0 ? (benchmarkProgress.p1_processed / benchmarkProgress.p1_total) * 100 : 0}%`
                          }}
                        ></div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-muted)", marginTop: "6px" }}>
                        <span>Progress: {benchmarkProgress.p1_processed || 0} / {benchmarkProgress.p1_total || 0} Images ({benchmarkProgress.p1_total > 0 ? Math.round((benchmarkProgress.p1_processed / benchmarkProgress.p1_total) * 100) : 0}%)</span>
                        <span style={{ color: benchmarkProgress.status === "RUNNING" ? "#38bdf8" : "inherit" }}>
                          {benchmarkProgress.status}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                      <button
                        type="button"
                        className="btn-start-benchmark"
                        style={{ flex: 1, padding: "12px 16px", fontSize: "15px" }}
                        disabled={isBenchmarkStarting || benchmarkProgress.status === "RUNNING"}
                        onClick={handleStartBenchmark}
                      >
                        {benchmarkProgress.status === "RUNNING" ? "BENCHMARK RUNNING..." : "START BENCHMARK ON i.MX8"}
                      </button>
                      {benchmarkProgress.status === "RUNNING" && (
                        <button
                          type="button"
                          className="btn-stop-benchmark"
                          style={{ padding: "12px 16px", fontSize: "15px" }}
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
                      <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                        Compare AI Decision vs QA Ground Truth ({benchmarkResults.length} Items)
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="review-action-btn" style={{ fontSize: "14px", padding: "7px 16px" }} onClick={handleExportBenchmarkCSV} title="Export CSV summary report">
                        EXPORT CSV
                      </button>
                      <button className="review-action-btn" style={{ fontSize: "14px", padding: "7px 16px" }} onClick={handleViewReport} title="Open analytical validation report card">
                        VIEW REPORT
                      </button>
                    </div>
                  </div>

                  <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1, overflow: "hidden" }}>
                    {/* Review Toolbar & Filter Tabs */}
                    <div className="review-toolbar">
                      <div className="review-filter-group">
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "ALL" ? "active" : ""}`}
                          style={{ fontSize: "14px", padding: "7px 14px" }}
                          onClick={() => { setBenchmarkFilter("ALL"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "ALL"); }}
                        >
                          All ({benchmarkResults.length})
                        </button>
                        <button
                          className={`review-filter-btn warn ${benchmarkFilter === "DISAGREEMENT" ? "active" : ""}`}
                          style={{ fontSize: "14px", padding: "7px 14px" }}
                          onClick={() => { setBenchmarkFilter("DISAGREEMENT"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "DISAGREEMENT"); }}
                        >
                          Disagreements ({(benchmarkKpis.overkill_count || 0) + (benchmarkKpis.underkill_count || 0)})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "UNREVIEWED" ? "active" : ""}`}
                          style={{ fontSize: "14px", padding: "7px 14px" }}
                          onClick={() => { setBenchmarkFilter("UNREVIEWED"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "UNREVIEWED"); }}
                        >
                          Pending Review ({benchmarkKpis.unreviewed_count || 0})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "HUMAN_PASS" ? "active" : ""}`}
                          style={{ fontSize: "14px", padding: "7px 14px" }}
                          onClick={() => { setBenchmarkFilter("HUMAN_PASS"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "HUMAN_PASS"); }}
                        >
                          Human PASS ({benchmarkKpis.human_pass_count || 0})
                        </button>
                        <button
                          className={`review-filter-btn ${benchmarkFilter === "HUMAN_FAIL" ? "active" : ""}`}
                          style={{ fontSize: "14px", padding: "7px 14px" }}
                          onClick={() => { setBenchmarkFilter("HUMAN_FAIL"); fetchBenchmarkResults(benchmarkProgress.active_session_id, "HUMAN_FAIL"); }}
                        >
                          Human FAIL ({benchmarkKpis.human_fail_count || 0})
                        </button>
                      </div>

                      {/* Search & Batch Action Helpers */}
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          className="review-action-btn"
                          style={{ fontSize: "13px", padding: "6px 12px" }}
                          onClick={() => handleBatchReview("RESET_ALL")}
                          title="Reset all reviews back to UNREVIEWED"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Results Table */}
                    <div className="table-container" style={{ flex: 1, overflowY: "auto" }}>
                      <table className="history-table benchmark-review-table report-table">
                        <thead>
                          <tr>
                            <th style={{ width: "74px", fontSize: "14px" }}>Visual</th>
                            <th style={{ minWidth: "160px", maxWidth: "220px", fontSize: "14px" }}>Sample / Wafer ID</th>
                            <th style={{ width: "95px", fontSize: "14px", textAlign: "center" }}>AI Decision</th>
                            <th style={{ minWidth: "180px", maxWidth: "230px", fontSize: "14px" }}>Violations / Reason</th>
                            <th style={{ width: "85px", fontSize: "14px", whiteSpace: "nowrap" }}>Min Edge</th>
                            <th style={{ width: "75px", fontSize: "14px", whiteSpace: "nowrap" }}>Area %</th>
                            <th style={{ width: "85px", fontSize: "14px", whiteSpace: "nowrap" }}>Latency</th>
                            <th style={{ width: "115px", fontSize: "14px", textAlign: "center" }}>Human Review</th>
                            <th style={{ textAlign: "center", width: "145px", fontSize: "14px" }}>Grade Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {benchmarkResults.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "15px" }}>
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
                                    onClick={() => {
                                      setBenchmarkSplitModalItem(item);
                                      setBenchmarkSplitModalIndex(idx);
                                    }}
                                    title="Click to open Split View Inspection"
                                    style={{
                                      cursor: "pointer",
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
                                          width: "56px",
                                          height: "56px",
                                          borderRadius: "6px",
                                          overflow: "hidden",
                                          cursor: "pointer",
                                          border: "1.5px solid var(--border-color)",
                                          background: "#000",
                                          boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
                                        }}
                                        onClick={(e) => {
                                          e.stopPropagation();
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
                                    <td style={{ maxWidth: "220px" }}>
                                      <div
                                        style={{ cursor: "pointer", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setBenchmarkSplitModalItem(item);
                                          setBenchmarkSplitModalIndex(idx);
                                        }}
                                        title={item.image_name}
                                      >
                                        <span className="font-mono" style={{ fontSize: "13.5px" }}>{item.image_name}</span>
                                      </div>
                                    </td>

                                    {/* AI Decision */}
                                    <td style={{ textAlign: "center" }}>
                                      <span className={`badge-result ${item.ai_decision.toLowerCase()}`} style={{ fontSize: "13px", padding: "4px 8px" }}>
                                        {item.ai_decision}
                                      </span>
                                    </td>

                                    {/* Violation / Reason (with clean wrap & no column overlap) */}
                                    <td style={{ fontSize: "13.5px", color: "var(--text-muted)", maxWidth: "230px", minWidth: "180px", wordBreak: "break-word", whiteSpace: "normal", lineHeight: "1.3" }}>
                                      <span title={item.ai_reason}>{item.ai_reason || "-"}</span>
                                    </td>

                                    {/* Min Edge Distance */}
                                    <td className="font-mono" style={{ fontSize: "13.5px", whiteSpace: "nowrap" }}>
                                      <span>
                                        {item.min_edge_distance_um != null ? `${Number(item.min_edge_distance_um).toFixed(1)} µm` : "-"}
                                      </span>
                                    </td>

                                    {/* Mark Area Ratio */}
                                    <td className="font-mono" style={{ fontSize: "13.5px", whiteSpace: "nowrap" }}>
                                      {item.mark_area_ratio_pct != null ? `${Number(item.mark_area_ratio_pct).toFixed(1)}%` : "-"}
                                    </td>

                                    {/* NPU Latency */}
                                    <td className="font-mono" style={{ fontSize: "13.5px", whiteSpace: "nowrap" }}>
                                      {item.inference_time_ms ? `${Number(item.inference_time_ms).toFixed(1)} ms` : "-"}
                                    </td>

                                    {/* Human Decision Badge */}
                                    <td style={{ textAlign: "center" }}>
                                      {item.human_decision === "PASS" && (
                                        <span className="badge-result pass" style={{ fontSize: "13px", padding: "4px 8px" }}>PASS</span>
                                      )}
                                      {item.human_decision === "FAIL" && (
                                        <span className="badge-result fail" style={{ fontSize: "13px", padding: "4px 8px" }}>FAIL</span>
                                      )}
                                      {item.human_decision === "UNREVIEWED" && (
                                        <span className="badge-result warn" style={{ fontSize: "13px", padding: "4px 8px", opacity: 0.7 }}>UNREVIEWED</span>
                                      )}
                                      {isDisagreement && (
                                        <div style={{ marginTop: "3px", fontSize: "11px", color: isUnderkill ? "#ef4444" : "#f59e0b", fontWeight: "bold" }}>
                                          {isUnderkill ? "[ESCAPE]" : "[OVERKILL]"}
                                        </div>
                                      )}
                                    </td>

                                    {/* Quick Grade Action Buttons */}
                                    <td>
                                      <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                                        <button
                                          className={`btn-human-pass ${item.human_decision === "PASS" ? "active" : ""}`}
                                          style={{ padding: "5px 9px", fontSize: "13px" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveHumanReview(item, "PASS");
                                          }}
                                          title="Mark this sample as Human PASS"
                                        >
                                          PASS
                                        </button>
                                        <button
                                          className={`btn-human-fail ${item.human_decision === "FAIL" ? "active" : ""}`}
                                          style={{ padding: "5px 9px", fontSize: "13px" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleSaveHumanReview(item, "FAIL");
                                          }}
                                          title="Mark this sample as Human FAIL"
                                        >
                                          FAIL
                                        </button>
                                        <button
                                          className="action-btn-sm"
                                          style={{ padding: "5px 9px", fontSize: "13px", fontWeight: "700" }}
                                          onClick={(e) => {
                                            e.stopPropagation();
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
