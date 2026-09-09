import React, { useState, useEffect, useRef } from "react";
import { useInspection } from "../context/InspectionContext";

export default function ModelTrainingSubTab() {
  const {
    pcApiBase,
    trainingStatus,
    trainingModels,
    isUploadingDataset,
    datasetUploadResult,
    fetchTrainingModels,
    fetchTrainingStatus,
    uploadTrainingDataset,
    startTrainingJob,
    stopTrainingJob,
    handleActivateModel,
    setBenchmarkActiveSubTab
  } = useInspection();

  const [modelName, setModelName] = useState(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `unet_${today}`;
  });
  const [trainingMode, setTrainingMode] = useState("scratch"); // 'scratch' | 'continue'
  const [selectedBaseModel, setSelectedBaseModel] = useState("");
  const [epochs, setEpochs] = useState(30);
  const [batchSize, setBatchSize] = useState(4);
  const [learningRate, setLearningRate] = useState(0.0001);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [startError, setStartError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  const fileInputRef = useRef(null);
  const logContainerRef = useRef(null);

  useEffect(() => {
    fetchTrainingModels();
    fetchTrainingStatus();
  }, [fetchTrainingModels, fetchTrainingStatus]);

  useEffect(() => {
    let interval = null;
    if (trainingStatus?.state === "running") {
      interval = setInterval(() => {
        fetchTrainingStatus();
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [trainingStatus?.state, fetchTrainingStatus]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [trainingStatus?.logs]);

  useEffect(() => {
    if (trainingModels.length > 0 && !selectedBaseModel) {
      setSelectedBaseModel(trainingModels[0].model_name);
    }
  }, [trainingModels, selectedBaseModel]);

  const handleFileDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.toLowerCase().endsWith(".zip")) {
        setSelectedFile(file);
        setUploadError(null);
      } else {
        setUploadError("Please select a .zip file with images and JSON.");
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.toLowerCase().endsWith(".zip")) {
        setSelectedFile(file);
        setUploadError(null);
      } else {
        setUploadError("Please select a .zip file with images and JSON.");
      }
    }
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) {
      setUploadError("Select a .zip file first.");
      return;
    }
    if (!modelName.trim()) {
      setUploadError("Enter a model name.");
      return;
    }

    setUploadError(null);
    const baseId = trainingMode === "continue" ? selectedBaseModel : null;
    const res = await uploadTrainingDataset(selectedFile, modelName.trim(), baseId);
    if (!res.success) {
      setUploadError(res.message);
    }
  };

  const handleStartTraining = async () => {
    if (!modelName.trim()) {
      setStartError("Enter a valid model name.");
      return;
    }
    setStartError(null);
    setIsStarting(true);

    const params = {
      model_name: modelName.trim(),
      base_model: trainingMode === "continue" ? selectedBaseModel : undefined,
      epochs: Number(epochs),
      batch_size: Number(batchSize),
      lr: Number(learningRate),
      dataset_dir: datasetUploadResult?.dataset_dir
    };

    const res = await startTrainingJob(params);
    setIsStarting(false);
    if (!res.success) {
      setStartError(res.message);
    }
  };

  const handleStopTraining = async () => {
    if (window.confirm("Stop training? Progress will be saved.")) {
      await stopTrainingJob();
    }
  };

  const isTrainingActive = trainingStatus?.state === "running";
  const isTrainingCompleted = trainingStatus?.state === "completed";
  const isNameConflict = trainingModels.some((m) => m.model_name.toLowerCase() === modelName.trim().toLowerCase());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "50px", width: "100%" }}>
      {/* HEADER BAR */}
      <div
        className="hmi-card"
        style={{
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "700", color: "var(--text-main)" }}>
              MODEL TRAINING
            </h2>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#059669",
                fontWeight: "700"
              }}
            >
              PC GPU (CUDA)
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Train PyTorch U-Net models on PC host
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Host: <strong style={{ color: "var(--text-main)" }}>{pcApiBase}</strong>
          </span>
          <button
            onClick={() => {
              fetchTrainingModels();
              fetchTrainingStatus();
            }}
            className="btn-secondary"
            style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", cursor: "pointer" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* TWO-COLUMN GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "start" }}>
        
        {/* LEFT COLUMN: SETTINGS & DATASET */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* 1. MODEL SETTINGS */}
          <div className="hmi-card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
            <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>
                1. MODEL SETTINGS
              </h3>
            </div>

            {/* MODEL NAME */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "4px" }}>
                Model Name
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={modelName}
                  disabled={isTrainingActive}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. unet_v1"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: isNameConflict ? "1px solid #d97706" : "1px solid var(--border-input)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "13px",
                    fontFamily: "monospace",
                    outline: "none"
                  }}
                />
                <button
                  type="button"
                  disabled={isTrainingActive}
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
                    const rand = Math.floor(100 + Math.random() * 900);
                    setModelName(`unet_${today}_${rand}`);
                  }}
                  className="btn-secondary"
                  style={{ fontSize: "12px", padding: "0 12px", borderRadius: "6px", cursor: "pointer" }}
                >
                  New Name
                </button>
              </div>
              {isNameConflict && (
                <div style={{ fontSize: "11px", color: "#d97706", marginTop: "3px" }}>
                  Model name already exists. Checkpoints will update under this name.
                </div>
              )}
            </div>

            {/* TRAINING MODE */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "4px" }}>
                Mode
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button
                  type="button"
                  disabled={isTrainingActive}
                  onClick={() => setTrainingMode("scratch")}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: trainingMode === "scratch" ? "1px solid #3b82f6" : "1px solid var(--border-color)",
                    background: trainingMode === "scratch" ? "rgba(59, 130, 246, 0.15)" : "var(--bg-subtle)",
                    color: trainingMode === "scratch" ? "#2563eb" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: "13px"
                  }}
                >
                  New Model
                </button>

                <button
                  type="button"
                  disabled={isTrainingActive}
                  onClick={() => setTrainingMode("continue")}
                  style={{
                    padding: "10px",
                    borderRadius: "6px",
                    border: trainingMode === "continue" ? "1px solid #9333ea" : "1px solid var(--border-color)",
                    background: trainingMode === "continue" ? "rgba(168, 85, 247, 0.15)" : "var(--bg-subtle)",
                    color: trainingMode === "continue" ? "#9333ea" : "var(--text-muted)",
                    cursor: "pointer",
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: "13px"
                  }}
                >
                  Continue from Base
                </button>
              </div>
            </div>

            {/* BASE MODEL DROPDOWN */}
            {trainingMode === "continue" && (
              <div style={{ background: "var(--bg-subtle)", padding: "10px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-main)", marginBottom: "4px" }}>
                  Base Checkpoint
                </label>
                <select
                  value={selectedBaseModel}
                  disabled={isTrainingActive}
                  onChange={(e) => setSelectedBaseModel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-input)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "13px",
                    outline: "none"
                  }}
                >
                  {trainingModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>
                      {m.model_name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                  New images will merge with this model dataset.
                </div>
              </div>
            )}

            {/* HYPERPARAMETERS */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "6px" }}>
                Parameters
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Epochs</div>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    disabled={isTrainingActive}
                    value={epochs}
                    onChange={(e) => setEpochs(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-input)",
                      background: "var(--bg-input)",
                      color: "var(--text-main)",
                      fontSize: "13px"
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Batch</div>
                  <select
                    value={batchSize}
                    disabled={isTrainingActive}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-input)",
                      background: "var(--bg-input)",
                      color: "var(--text-main)",
                      fontSize: "13px"
                    }}
                  >
                    <option value="2">2</option>
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="16">16</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>Learning Rate</div>
                  <input
                    type="number"
                    step="0.00005"
                    disabled={isTrainingActive}
                    value={learningRate}
                    onChange={(e) => setLearningRate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-input)",
                      background: "var(--bg-input)",
                      color: "var(--text-main)",
                      fontSize: "13px"
                    }}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* 2. DATASET UPLOAD */}
          <div className="hmi-card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
            <div style={{ borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>
                2. DATASET (ZIP)
              </h3>
            </div>

            {/* DROPZONE */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              style={{
                border: isDragging ? "2px dashed #3b82f6" : "1px dashed var(--border-input)",
                borderRadius: "8px",
                padding: "20px",
                textAlign: "center",
                backgroundColor: isDragging ? "rgba(59, 130, 246, 0.08)" : "var(--bg-subtle)",
                cursor: isTrainingActive ? "not-allowed" : "pointer"
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                disabled={isTrainingActive}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-main)", marginBottom: "3px" }}>
                {selectedFile ? selectedFile.name : "Click or drop .zip file here"}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Contains raw images and LabelMe JSON annotations
              </div>
              {selectedFile && (
                <div style={{ fontSize: "11px", color: "var(--color-info)", marginTop: "4px" }}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleUploadAndProcess}
                disabled={!selectedFile || isUploadingDataset || isTrainingActive}
                className="btn-primary"
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: "600",
                  borderRadius: "6px",
                  cursor: (!selectedFile || isUploadingDataset || isTrainingActive) ? "not-allowed" : "pointer"
                }}
              >
                {isUploadingDataset ? "Processing Masks..." : "Upload Dataset"}
              </button>

              {datasetUploadResult && (
                <span style={{ fontSize: "12px", color: "var(--color-pass)", fontWeight: "600" }}>
                  Ready
                </span>
              )}
            </div>

            {uploadError && (
              <div style={{ padding: "8px 12px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", color: "var(--color-fail)", fontSize: "12px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                {uploadError}
              </div>
            )}

            {/* DATASET STATS */}
            {datasetUploadResult && (
              <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "12px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "8px" }}>
                  DATASET SUMMARY
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", textAlign: "center" }}>
                  <div style={{ background: "var(--bg-card)", padding: "6px 4px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>{datasetUploadResult.new_pairs}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>NEW</div>
                  </div>
                  <div style={{ background: "var(--bg-card)", padding: "6px 4px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#2563eb" }}>{datasetUploadResult.total_train}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>TRAIN (80%)</div>
                  </div>
                  <div style={{ background: "var(--bg-card)", padding: "6px 4px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "#9333ea" }}>{datasetUploadResult.total_val}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>VAL (20%)</div>
                  </div>
                  <div style={{ background: "var(--bg-card)", padding: "6px 4px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--color-pass)" }}>{datasetUploadResult.base_pairs || 0}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>BASE</div>
                  </div>
                </div>
              </div>
            )}

          </div>

        </div>

        {/* RIGHT COLUMN: TRAINING RUN & METRICS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div className="hmi-card" style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>
                3. TRAINING RUN
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background: isTrainingActive ? "rgba(59, 130, 246, 0.15)" : isTrainingCompleted ? "rgba(16, 185, 129, 0.15)" : "var(--bg-subtle)",
                  color: isTrainingActive ? "#2563eb" : isTrainingCompleted ? "#059669" : "var(--text-muted)",
                  border: "1px solid var(--border-color)"
                }}
              >
                STATUS: {trainingStatus?.state || "IDLE"}
              </span>
            </div>

            {/* ACTION BUTTON */}
            <div>
              {!isTrainingActive ? (
                <button
                  type="button"
                  onClick={handleStartTraining}
                  disabled={isStarting}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: "13px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    cursor: isStarting ? "not-allowed" : "pointer"
                  }}
                >
                  {isStarting ? "Starting..." : "Start Training"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopTraining}
                  className="btn-secondary"
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: "13px",
                    fontWeight: "700",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "var(--color-fail)",
                    border: "1px solid rgba(239, 68, 68, 0.3)"
                  }}
                >
                  Stop Training
                </button>
              )}
            </div>

            {startError && (
              <div style={{ padding: "8px 12px", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", color: "var(--color-fail)", fontSize: "12px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                {startError}
              </div>
            )}

            {/* PROGRESS BAR */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                <span style={{ color: "var(--text-muted)" }}>
                  Epoch {trainingStatus?.current_epoch || 0} / {trainingStatus?.total_epochs || epochs}
                </span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>
                  {trainingStatus?.progress_pct || 0}%
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "8px",
                  borderRadius: "4px",
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-color)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    width: `${trainingStatus?.progress_pct || 0}%`,
                    height: "100%",
                    background: isTrainingCompleted ? "var(--color-pass)" : "#3b82f6",
                    transition: "width 0.3s ease"
                  }}
                />
              </div>
            </div>

            {/* METRICS TILES */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              <div style={{ background: "var(--bg-subtle)", padding: "10px 6px", borderRadius: "6px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>TRAIN LOSS</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", fontFamily: "monospace" }}>
                  {trainingStatus?.train_loss !== undefined ? trainingStatus.train_loss : "-"}
                </div>
              </div>

              <div style={{ background: "var(--bg-subtle)", padding: "10px 6px", borderRadius: "6px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>VAL LOSS</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#2563eb", fontFamily: "monospace" }}>
                  {trainingStatus?.val_loss !== undefined ? trainingStatus.val_loss : "-"}
                </div>
              </div>

              <div style={{ background: "var(--bg-subtle)", padding: "10px 6px", borderRadius: "6px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>VAL mIoU</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--color-pass)", fontFamily: "monospace" }}>
                  {trainingStatus?.val_miou !== undefined ? `${trainingStatus.val_miou}%` : "-"}
                </div>
              </div>

              <div style={{ background: "var(--bg-subtle)", padding: "10px 6px", borderRadius: "6px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>TIME LEFT</div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", fontFamily: "monospace" }}>
                  {trainingStatus?.eta_seconds ? `${Math.floor(trainingStatus.eta_seconds / 60)}m ${trainingStatus.eta_seconds % 60}s` : "-"}
                </div>
              </div>
            </div>

            {/* CONSOLE STREAM */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "4px" }}>
                Console Output
              </div>
              <div
                ref={logContainerRef}
                style={{
                  height: "200px",
                  overflowY: "auto",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "var(--bg-console)",
                  border: "1px solid var(--border-highlight)",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: "#f8fafc"
                }}
              >
                {(!trainingStatus?.logs || trainingStatus.logs.length === 0) ? (
                  <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>
                    Session idle. Click "Start Training" to begin.
                  </div>
                ) : (
                  trainingStatus.logs.map((line, idx) => (
                    <div key={idx} style={{ wordBreak: "break-word" }}>
                      {line}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* COMPLETION CARD */}
            {isTrainingCompleted && (
              <div
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--color-pass)",
                  borderRadius: "6px",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                }}
              >
                <div style={{ color: "var(--color-pass)", fontWeight: "700", fontSize: "13px" }}>
                  Training & INT8 Conversion Complete
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  <div>PyTorch: {trainingStatus.saved_pth}</div>
                  {trainingStatus.saved_tflite && <div>Edge: {trainingStatus.saved_tflite}</div>}
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  {trainingStatus.saved_tflite && (
                    <button
                      type="button"
                      onClick={async () => {
                        const tfliteFileName = trainingStatus.saved_tflite.split("/").pop();
                        await handleActivateModel(tfliteFileName);
                      }}
                      className="btn-primary"
                      style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", cursor: "pointer" }}
                    >
                      Deploy to Edge
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setBenchmarkActiveSubTab("validation")}
                    className="btn-secondary"
                    style={{ fontSize: "12px", padding: "6px 14px", borderRadius: "6px", cursor: "pointer" }}
                  >
                    Test in Lab
                  </button>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
