import React, { useState, useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function App() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [activeTab, setActiveTab] = useState("inspect");
  const [compareMode, setCompareMode] = useState("split");
  const [isLight, setIsLight] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [dbType, setDbType] = useState("SQLite");

  const [filters, setFilters] = useState({
    pad: true,
    mark: true,
    grain: true,
    grid: true
  });

  const [currentInspection, setCurrentInspection] = useState({
    id: "-",
    batch: "-",
    waferNo: "-",
    xyCoord: "-",
    site: "-",
    pad: "-",
    temp: "-",
    padsTotal: 0,
    padsDetected: 0,
    probeMarks: 0,
    grains: 0,
    confidence: 0,
    inferenceTime: 0,
    ruleTime: 0,
    decision: "-",
    machineAction: "WAITING"
  });

  const [currentDieImage, setCurrentDieImage] = useState({
    pads: [],
    grains: []
  });

  const [activeAlarms, setActiveAlarms] = useState([]);
  const [history, setHistory] = useState([]);

  const [sysStats, setSysStats] = useState({
    cpu: 52,
    npu: 88,
    ram: 518,
    temp: 56.6
  });

  // Client Simulation Loops (Fallback Mode)
  const [isSimRunning, setIsSimRunning] = useState(false);
  const [simIndex, setSimIndex] = useState(0);
  const [simSpeed, setSimSpeed] = useState(3000);

  // Time clock
  const [clockStr, setClockStr] = useState("");

  // DOM Canvas Refs
  const canvasRef = useRef(null);
  const donutCanvasRef = useRef(null);
  const barCanvasRef = useRef(null);
  const lineCanvasRef = useRef(null);
  const scannerRef = useRef(null);

  // History Tab Filters & Enhanced Pagination
  const [filterSearch, setFilterSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState("ALL");
  const [analyticsBatchFilter, setAnalyticsBatchFilter] = useState("ALL");
  const [analyticsMachineFilter, setAnalyticsMachineFilter] = useState("ALL");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyViewMode, setHistoryViewMode] = useState("dashboard"); // "dashboard" or "table-full"

  // Filter logs logic for History Tab
  const historyList = Array.isArray(history) ? history : [];
  const filteredHistory = historyList.filter(record => {
    if (analyticsFilter === "PASS" && record.decision !== "PASS") return false;
    if (analyticsFilter === "FAIL" && record.decision === "PASS") return false;
    if (analyticsBatchFilter !== "ALL" && record.batch !== analyticsBatchFilter) return false;
    if (analyticsMachineFilter !== "ALL" && (record.machineNo || "PROBER01") !== analyticsMachineFilter) return false;
    if (filterSearch.trim() !== "") {
      const q = filterSearch.toLowerCase().trim();
      const searchableStr = [
        record.machineNo, record.batch, record.waferNo, record.xyCoord,
        record.site, record.pad, record.timeShort, record.timestamp,
        record.decision, record.reason, record.productSetup, record.temp, record.id
      ].join(" ").toLowerCase();
      if (!searchableStr.includes(q)) return false;
    }
    return true;
  });

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / (historyPageSize === "ALL" ? Math.max(1, filteredHistory.length) : Number(historyPageSize))));
  const effectiveHistoryPage = Math.min(historyPage, totalHistoryPages);
  const paginatedHistory = (historyPageSize === "ALL")
    ? filteredHistory
    : filteredHistory.slice((effectiveHistoryPage - 1) * Number(historyPageSize), effectiveHistoryPage * Number(historyPageSize));

  // Historical Inspection Image Modal State
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [selectedModalIndex, setSelectedModalIndex] = useState(null);
  const [modalViewMode, setModalViewMode] = useState("split");

  const getActiveModalList = () => {
    return (activeTab === "analytics" && filteredHistory.length > 0) ? filteredHistory : historyList;
  };

  const openModalWithItem = (item, idx) => {
    setSelectedModalItem(item);
    setSelectedModalIndex(idx);
    mapInspectionData(item);
  };

  const closeModal = () => {
    setSelectedModalItem(null);
    setSelectedModalIndex(null);
  };

  const handlePrevModalItem = (e) => {
    if (e) e.stopPropagation();
    const currentList = getActiveModalList();
    if (currentList.length === 0) return;
    const curIdx = selectedModalIndex !== null && selectedModalIndex >= 0 ? selectedModalIndex : 0;
    const prevIdx = (curIdx - 1 + currentList.length) % currentList.length;
    const prevItem = currentList[prevIdx];
    if (prevItem) {
      setSelectedModalIndex(prevIdx);
      setSelectedModalItem(prevItem);
      mapInspectionData(prevItem);
    }
  };

  const handleNextModalItem = (e) => {
    if (e) e.stopPropagation();
    const currentList = getActiveModalList();
    if (currentList.length === 0) return;
    const curIdx = selectedModalIndex !== null && selectedModalIndex >= 0 ? selectedModalIndex : 0;
    const nextIdx = (curIdx + 1) % currentList.length;
    const nextItem = currentList[nextIdx];
    if (nextItem) {
      setSelectedModalIndex(nextIdx);
      setSelectedModalItem(nextItem);
      mapInspectionData(nextItem);
    }
  };

  // ==============================================================================
  // MODEL VALIDATION LAB & HUMAN REVIEW STATE
  // ==============================================================================
  const fileInputRef = useRef(null);
  const benchmarkFileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBenchmarkDragging, setIsBenchmarkDragging] = useState(false);
  const [loadedImage, setLoadedImage] = useState(null);
  const [loadedRawImage, setLoadedRawImage] = useState(null);
  const [selectedClasses, setSelectedClasses] = useState(3);
  const [uploadClassCount, setUploadClassCount] = useState(3);
  const [modelFilter, setModelFilter] = useState("ALL");
  const [modelsList, setModelsList] = useState([]);

  const [benchmarkActiveSubTab, setBenchmarkActiveSubTab] = useState("hub"); // "hub" | "validation" | "registry"
  const [benchmarkModel, setBenchmarkModel] = useState("unet.tflite");
  const [benchmarkZipFile, setBenchmarkZipFile] = useState(null);
  const [benchmarkDataset, setBenchmarkDataset] = useState("all_wafers");
  const [benchmarkDatasetsList, setBenchmarkDatasetsList] = useState([]);
  const [benchmarkLimit, setBenchmarkLimit] = useState(50);
  const [benchmarkRules, setBenchmarkRules] = useState({
    fail_distance_um: 8.0,
    max_area_ratio_pct: 25.0,
    min_area_ratio_pct: 0.5,
    missing_mark_action: "fail"
  });
  const [benchmarkProgress, setBenchmarkProgress] = useState({
    status: "IDLE",
    active_priority: "IDLE",
    p0_pending: 0,
    p1_pending: 0,
    p1_total: 0,
    p1_processed: 0,
    p1_current_image: "",
    active_session_id: null
  });
  const [benchmarkResults, setBenchmarkResults] = useState([]);
  const [benchmarkKpis, setBenchmarkKpis] = useState({
    total_tested: 0,
    total_reviewed: 0,
    unreviewed_count: 0,
    human_pass_count: 0,
    human_fail_count: 0,
    ai_pass_count: 0,
    ai_fail_count: 0,
    overkill_count: 0,
    underkill_count: 0,
    agreement_count: 0,
    overkill_rate: 0.0,
    underkill_rate: 0.0,
    agreement_rate: 0.0,
    true_yield: 0.0,
    ai_yield: 0.0,
    avg_inference_time_ms: 0.0,
    min_inference_time_ms: 0.0,
    max_inference_time_ms: 0.0,
    avg_rule_time_ms: 0.0,
    confusion_matrix: { tp: 0, fp: 0, tn: 0, fn: 0 }
  });

  const priority_dispatcher_status_color = (status) => {
    if (status === "P0_PRODUCTION") return "#ef4444";
    if (status === "P1_BENCHMARK") return "#0ea5e9";
    return "var(--text-muted)";
  };

  const [benchmarkFilter, setBenchmarkFilter] = useState("ALL");
  const [benchmarkSearch, setBenchmarkSearch] = useState("");
  const [benchmarkSplitModalItem, setBenchmarkSplitModalItem] = useState(null);
  const [benchmarkSplitModalIndex, setBenchmarkSplitModalIndex] = useState(0);
  const [benchmarkReportModalOpen, setBenchmarkReportModalOpen] = useState(false);
  const [isBenchmarkStarting, setIsBenchmarkStarting] = useState(false);

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
      const res = await fetch(`${apiBase}/api/config/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveConfig(data);
      }
    } catch (err) {
      console.warn("Failed fetching active config:", err);
    }
  };

  const handleProductUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingProduct(true);
    setConfigUploadStatus("Uploading Product Recipe...");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${apiBase}/api/config/upload-product`, {
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
      const res = await fetch(`${apiBase}/api/config/upload-machine`, {
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
      const res = await fetch(`${apiBase}/api/config/apply-preset`, {
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

  // Client-side filtering on master benchmarkResults for instant, glitch-free filtering & search
  const filteredBenchmarkResults = (benchmarkResults || []).filter(item => {
    if (benchmarkFilter === "DISAGREEMENT") {
      const isDisagreement = item.human_decision !== "UNREVIEWED" && item.human_decision !== item.ai_decision;
      if (!isDisagreement) return false;
    } else if (benchmarkFilter === "UNREVIEWED") {
      if (item.human_decision !== "UNREVIEWED") return false;
    } else if (benchmarkFilter === "HUMAN_PASS") {
      if (item.human_decision !== "PASS") return false;
    } else if (benchmarkFilter === "HUMAN_FAIL") {
      if (item.human_decision !== "FAIL") return false;
    }
    if (benchmarkSearch.trim() !== "") {
      const q = benchmarkSearch.toLowerCase().trim();
      const matchName = (item.image_name || "").toLowerCase().includes(q);
      const matchReason = (item.ai_reason || "").toLowerCase().includes(q);
      if (!matchName && !matchReason) return false;
    }
    return true;
  });

  const handlePrevBenchmarkItem = () => {
    const list = filteredBenchmarkResults.length > 0 ? filteredBenchmarkResults : benchmarkResults;
    if (!list || list.length === 0) return;
    const curIdx = benchmarkSplitModalIndex >= 0 ? benchmarkSplitModalIndex : 0;
    const prevIdx = (curIdx - 1 + list.length) % list.length;
    setBenchmarkSplitModalIndex(prevIdx);
    setBenchmarkSplitModalItem(list[prevIdx]);
  };

  const handleNextBenchmarkItem = () => {
    const list = filteredBenchmarkResults.length > 0 ? filteredBenchmarkResults : benchmarkResults;
    if (!list || list.length === 0) return;
    const curIdx = benchmarkSplitModalIndex >= 0 ? benchmarkSplitModalIndex : 0;
    const nextIdx = (curIdx + 1) % list.length;
    setBenchmarkSplitModalIndex(nextIdx);
    setBenchmarkSplitModalItem(list[nextIdx]);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. Hotkeys for Historical Inspection Modal
      if (selectedModalItem) {
        if (e.key === "ArrowLeft") {
          handlePrevModalItem(e);
        } else if (e.key === "ArrowRight") {
          handleNextModalItem(e);
        } else if (e.key === "Escape") {
          closeModal();
        }
      }

      // 2. Hotkeys for Benchmark Split-View Modal
      if (benchmarkSplitModalItem) {
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          handleSaveHumanReview(benchmarkSplitModalItem, "PASS");
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          handleSaveHumanReview(benchmarkSplitModalItem, "FAIL");
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrevBenchmarkItem();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNextBenchmarkItem();
        } else if (e.key === "Escape") {
          setBenchmarkSplitModalItem(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedModalItem, selectedModalIndex, benchmarkSplitModalItem, benchmarkSplitModalIndex, benchmarkResults, history, activeTab, analyticsFilter, analyticsBatchFilter, analyticsMachineFilter, filterSearch]);

  const fetchBenchmarkDatasets = () => {
    fetch(`${apiBase}/api/model/benchmark/datasets`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setBenchmarkDatasetsList(data);
          if (!benchmarkDataset || benchmarkDataset === "all_wafers") {
            setBenchmarkDataset(data[0].key || "all_wafers");
          }
        }
      })
      .catch(err => console.error("Error fetching datasets:", err));
  };

  const fetchBenchmarkProgress = () => {
    fetch(`${apiBase}/api/model/benchmark/progress`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setBenchmarkProgress(prev => {
            const updated = {
              ...prev,
              ...data,
              p1_total: data.p1_total ?? data.total ?? prev.p1_total ?? 0,
              p1_processed: data.p1_processed ?? data.processed ?? prev.p1_processed ?? 0,
              status: data.status || prev.status
            };
            return JSON.stringify(prev) === JSON.stringify(updated) ? prev : updated;
          });
          if (data.kpis && data.kpis.total_tested > 0) {
            setBenchmarkKpis(prev => {
              const next = JSON.stringify(data.kpis);
              return JSON.stringify(prev) === next ? prev : data.kpis;
            });
          }
        }
      })
      .catch(err => console.error("Error fetching benchmark progress:", err));
  };

  const fetchBenchmarkResults = (sessionId) => {
    const query = new URLSearchParams();
    if (sessionId) query.append("session_id", sessionId);

    fetch(`${apiBase}/api/model/benchmark/results?${query.toString()}`)
      .then(res => res.ok ? res.json() : { results: [], kpis: null })
      .then(data => {
        if (data.results) setBenchmarkResults(data.results);
        if (data.kpis) setBenchmarkKpis(data.kpis);
      })
      .catch(err => console.error("Error fetching benchmark results:", err));
  };

  const handleStartBenchmark = () => {
    if (!benchmarkZipFile) {
      if (benchmarkFileInputRef.current) {
        benchmarkFileInputRef.current.click();
      }
      return;
    }
    handleCustomBenchmarkUpload([benchmarkZipFile]);
  };

  const handlePauseBenchmark = () => {
    setBenchmarkProgress(prev => ({ ...prev, status: "PAUSED" }));
    fetch(`${apiBase}/api/model/benchmark/pause`, { method: "POST" })
      .then(res => res.json())
      .then(() => fetchBenchmarkProgress())
      .catch(err => console.error("Error pausing benchmark:", err));
  };

  const handleResumeBenchmark = () => {
    setBenchmarkProgress(prev => ({ ...prev, status: "RUNNING" }));
    fetch(`${apiBase}/api/model/benchmark/resume`, { method: "POST" })
      .then(res => res.json())
      .then(() => fetchBenchmarkProgress())
      .catch(err => console.error("Error resuming benchmark:", err));
  };

  const handleStopBenchmark = () => {
    setBenchmarkProgress(prev => ({ ...prev, status: "STOPPED", active_priority: "IDLE" }));
    fetch(`${apiBase}/api/model/benchmark/stop`, { method: "POST" })
      .then(res => res.json())
      .then(data => {
        fetchBenchmarkProgress();
      })
      .catch(err => console.error("Error stopping benchmark:", err));
  };

  const handleSaveHumanReview = (item, decision, notes = "") => {
    if (!item) return;
    fetch(`${apiBase}/api/model/benchmark/save-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: item.session_id,
        result_id: item.id,
        human_decision: decision,
        reviewer: "QA Engineer",
        notes: notes
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.kpis) setBenchmarkKpis(data.kpis);
        setBenchmarkResults(prev => prev.map(r => r.id === item.id ? { ...r, human_decision: decision } : r));
        if (benchmarkSplitModalItem && benchmarkSplitModalItem.id === item.id) {
          setBenchmarkSplitModalItem(prev => ({ ...prev, human_decision: decision }));
        }
      })
      .catch(err => console.error("Error saving review:", err));
  };

  const handleBatchReview = (action) => {
    const sessId = benchmarkProgress.active_session_id || (benchmarkResults[0] && benchmarkResults[0].session_id);
    if (!sessId) {
      alert("No active benchmark session found.");
      return;
    }
    fetch(`${apiBase}/api/model/benchmark/batch-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessId,
        action: action,
        reviewer: "QA Lead"
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.kpis) setBenchmarkKpis(data.kpis);
        fetchBenchmarkResults(sessId, benchmarkFilter);
      })
      .catch(err => console.error("Batch review error:", err));
  };

  const handleCustomBenchmarkUpload = (filesList) => {
    if (!filesList || filesList.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < filesList.length; i++) {
      formData.append("files", filesList[i]);
    }
    formData.append("model_name", benchmarkModel);
    // ponytail: rule params now read from config file on backend side

    setIsBenchmarkStarting(true);
    setBenchmarkProgress(prev => ({ ...prev, status: "RUNNING", p1_processed: 0 }));
    fetch(`${apiBase}/api/model/benchmark/upload-images`, {
      method: "POST",
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setIsBenchmarkStarting(false);
        setBenchmarkResults([]);
        fetchBenchmarkProgress();
      })
      .catch(err => {
        setIsBenchmarkStarting(false);
        setBenchmarkProgress(prev => ({ ...prev, status: "IDLE" }));
        console.error("Custom benchmark upload error:", err);
        alert(`Failed to upload images: ${err.message}`);
      });
  };

  const handleViewReport = () => {
    const sessId = benchmarkProgress.active_session_id || (benchmarkResults[0] && benchmarkResults[0].session_id);
    if (!sessId) {
      alert("No benchmark session available for report generation.");
      return;
    }
    fetch(`${apiBase}/api/model/benchmark/report/${sessId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setBenchmarkReportData(data);
          setBenchmarkReportModalOpen(true);
        }
      })
      .catch(err => console.error("Error fetching report:", err));
  };

  const handleExportBenchmarkCSV = () => {
    if (benchmarkResults.length === 0) {
      alert("No benchmark data to export.");
      return;
    }
    const headers = [
      "Image Name", "AI Decision", "Human Review", "Agreement",
      "Confidence (%)", "Inference Time (ms)", "Rule Time (ms)",
      "Min Edge Distance (um)", "Mark Area Ratio (%)", "Pads Count", "Marks Count", "AI Reason"
    ];
    const rows = benchmarkResults.map(r => {
      const isAgree = r.human_decision === "UNREVIEWED" ? "PENDING" : (r.ai_decision === r.human_decision ? "AGREE" : "DISAGREE");
      return [
        `"${r.image_name}"`,
        r.ai_decision,
        r.human_decision,
        isAgree,
        r.ai_confidence,
        r.inference_time_ms,
        r.rule_time_ms,
        r.min_edge_distance_um,
        r.mark_area_ratio_pct,
        r.pads_count,
        r.marks_count,
        `"${(r.ai_reason || '-').replace(/"/g, '""')}"`
      ].join(",");
    });
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Wafer_Model_Benchmark_${benchmarkModel}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadFile = (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("classes", uploadClassCount);

    fetch(`${apiBase}/api/models/upload`, {
      method: "POST",
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        alert(`[UPLOAD SUCCESS] อัปโหลดโมเดล '${file.name}' สำเร็จ!\n\nกำลังเปิดใช้งานโมเดลนี้สำหรับการตรวจจับ...`);
        handleActivateModel({ name: file.name, classes: uploadClassCount });
      })
      .catch(err => {
        console.error("Upload error:", err);
        const newModel = {
          name: file.name,
          version: "v1.0.0",
          engine: file.name.endsWith(".tflite") ? "TFLite / NPU" : "ONNX / CPU",
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          accuracy: "95.0%",
          classes: uploadClassCount,
          active: false
        };
        setModelsList(prev => [newModel, ...prev]);
        alert(`Model '${file.name}' added to local view.`);
      });
  };

  const handleActivateModel = (model) => {
    fetch(`${apiBase}/api/models/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model.name, classes: model.classes || 3 })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const activeClasses = data.classes || model.classes || 3;
        setSelectedClasses(activeClasses);
        alert(`[NPU HOT-SWAP SUCCESS]\nModel '${model.name}' (${activeClasses}-Class Auto-Detected) activated on i.MX8 NPU Delegate!`);
        fetchModels();
      })
      .catch(err => {
        console.error("Activation error:", err);
        setSelectedClasses(model.classes || 3);
        setModelsList(prev => prev.map(m => ({ ...m, active: m.name === model.name })));
      });
  };

  const handleDeleteModel = (model) => {
    if (!window.confirm(`Are you sure you want to delete model '${model.name}'?`)) return;
    fetch(`${apiBase}/api/models/${encodeURIComponent(model.name)}`, {
      method: "DELETE"
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        alert(`Deleted model '${model.name}' successfully!`);
        fetchModels();
      })
      .catch(err => {
        setModelsList(prev => prev.filter(m => m.name !== model.name));
      });
  };



  // ==========================================
  // SYNC THEMING & ROLE WITH DOCUMENT BODY
  // ==========================================
  useEffect(() => {
    if (isLight) {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  }, [isLight]);

  // ==========================================
  // REAL-TIME DATETIME CLOCK
  // ==========================================
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      setClockStr(`${day}-${month}-${year} ${hours}:${minutes}:${seconds}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const getDefaultEdgeIp = () => {
    const saved = localStorage.getItem("IMX8_EDGE_IP");
    if (saved && saved !== "10.42.0.1" && saved !== "10.42.0.95") return saved;

    // [Mode A: Local PC Execution - Active]
    const hostname = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
    return (hostname === "0.0.0.0" || hostname === "::") ? "localhost" : hostname;

    // [Mode B: Physical i.MX8 Hardware Execution]
    // Uncomment line below if running HMI against physical i.MX8 board IP:
    // return "10.42.0.95";
  };

  const [edgeIp, setEdgeIp] = useState(getDefaultEdgeIp);
  const apiBase = `http://${edgeIp}:8001`;

  const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url.replace(/^https?:\/\/[^/]+/, apiBase);
    }
    if (url.startsWith("/")) {
      return `${apiBase}${url}`;
    }
    return `${apiBase}/${url}`;
  };

  const updateEdgeIp = (newIp) => {
    setEdgeIp(newIp);
    localStorage.setItem("IMX8_EDGE_IP", newIp);
  };

  const fetchModels = () => {
    fetch(`${apiBase}/api/models`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setModelsList(data);
        }
      })
      .catch(err => console.error("Error fetching models:", err));
  };

  useEffect(() => {
    fetchModels();
  }, [edgeIp]);

  // ==========================================
  // CONNECTED MODE: WEBSOCKETS & API CLIENT
  // ==========================================
  useEffect(() => {
    let ws = null;
    let pollStats = null;
    let reconnectTimeout = null;

    const connectBackend = () => {
      console.log(`Attempting connection to FastAPI server at ${edgeIp}:8001...`);
      ws = new WebSocket(`ws://${edgeIp}:8001/ws`);

      ws.onopen = () => {
        console.log("WebSocket connection established with NXP i.MX8 backend.");
        setIsBackendConnected(true);
        setIsSimRunning(false); // Stop local simulation
        fetchModels();

        // Fetch initial logs
        fetch(`${apiBase}/api/history`)
          .then(r => r.json())
          .then(data => setHistory(Array.isArray(data) ? data : []))
          .catch(e => setHistory([]));

        // Fetch latest scan data
        fetch(`${apiBase}/api/latest-inspection`)
          .then(r => r.json())
          .then(data => {
            if (data && data.id) {
              mapInspectionData(data);
            }
          })
          .catch(e => console.error(e));

        // Fetch benchmark datasets & progress
        fetchBenchmarkDatasets();
        fetchBenchmarkProgress();
        fetchBenchmarkResults();

        // Fallback polling loop if real-time hardware WS is inactive
        pollStats = setInterval(() => {
          fetch(`${apiBase}/api/sys-stats`)
            .then(r => r.json())
            .then(stats => {
              setSysStats(prev => ({
                ...prev,
                cpu: stats.cpu ?? prev.cpu,
                npu: stats.npu ?? prev.npu,
                ram: stats.ram ?? prev.ram,
                temp: stats.temp ?? prev.temp
              }));
              setDbType(stats.db);
            })
            .catch(e => console.error(e));

          fetchBenchmarkProgress();
        }, 2500);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.event === "NEW_INSPECTION" && payload.data) {
          mapInspectionData(payload.data);
          setHistory(prev => {
            const list = Array.isArray(prev) ? prev : [];
            const combined = [payload.data, ...list];
            const seen = new Set();
            return combined.filter(item => {
              const key = item.imageUrl || (item.id + "_" + item.timestamp + "_" + (item.pad || "") + "_" + (item.xyCoord || ""));
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          });
        } else if (payload.event === "BENCHMARK_PROGRESS" && payload.data) {
          const pData = payload.data;
          setBenchmarkProgress(prev => {
            const currentTotal = pData.p1_total ?? pData.total ?? prev.p1_total ?? 0;
            const currentProcessed = pData.p1_processed ?? pData.processed ?? prev.p1_processed ?? 0;
            const newStatus = pData.status || (currentProcessed < currentTotal && currentTotal > 0 ? "RUNNING" : prev.status);

            const updated = {
              ...prev,
              status: newStatus,
              p1_total: currentTotal,
              p1_processed: currentProcessed,
              p0_pending: pData.p0_pending ?? prev.p0_pending ?? 0,
              p1_pending: pData.p1_pending ?? prev.p1_pending ?? 0,
              active_priority: pData.active_priority || prev.active_priority || "IDLE",
              p1_current_image: pData.current_image || pData.p1_current_image || prev.p1_current_image || "",
              active_session_id: pData.session_id || pData.active_session_id || prev.active_session_id
            };

            return JSON.stringify(prev) === JSON.stringify(updated) ? prev : updated;
          });
          if (payload.data.kpis && payload.data.kpis.total_tested > 0) {
            setBenchmarkKpis(prev => {
              const next = JSON.stringify(payload.data.kpis);
              return JSON.stringify(prev) === next ? prev : payload.data.kpis;
            });
          }
          if (payload.data.latest_result) {
            setBenchmarkResults(prev => {
              const list = Array.isArray(prev) ? prev : [];
              const exists = list.some(r => r.id === payload.data.latest_result.id);
              if (exists) return list.map(r => r.id === payload.data.latest_result.id ? payload.data.latest_result : r);
              return [...list, payload.data.latest_result];
            });
          }
        } else if (payload.event === "BENCHMARK_REVIEW_UPDATED" && payload.data) {
          if (payload.data.kpis) setBenchmarkKpis(payload.data.kpis);
          setBenchmarkResults(prev => (Array.isArray(prev) ? prev : []).map(r => r.id === payload.data.result_id ? { ...r, human_decision: payload.data.human_decision } : r));
        }
      };


      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        console.log("FastAPI backend is offline. Running in offline client simulator mode.");
        setIsBackendConnected(false);
        if (pollStats) clearInterval(pollStats);
        reconnectTimeout = setTimeout(connectBackend, 5000);
      };
    };

    connectBackend();

    return () => {
      if (ws) ws.close();
      if (pollStats) clearInterval(pollStats);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [edgeIp]);

  // ==========================================
  // REAL-TIME HARDWARE MONITORING WEBSOCKET
  // ==========================================
  useEffect(() => {
    let hwWs = null;
    let reconnectTimeout = null;
    let isSubscribed = true;

    const connectHardwareMonitor = () => {
      const hostname = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
      const pcWsUrl = `ws://${hostname}:3000/ws/hardware`;
      const imx8WsUrl = `ws://${edgeIp}:8001/ws/hardware`;

      // Try PC NestJS relay first, with fallback to direct i.MX8 WebSocket
      const targetUrl = pcWsUrl;

      console.log(`[HMI] Connecting to Real-time Hardware WS at ${targetUrl}...`);
      try {
        hwWs = new WebSocket(targetUrl);

        hwWs.onopen = () => {
          console.log(`[HMI] Real-time Hardware WebSocket connected: ${targetUrl}`);
        };

        hwWs.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const parsed = JSON.parse(event.data);
            const data = parsed.data || parsed;
            if (data && typeof data.cpu !== "undefined") {
              setSysStats({
                cpu: data.cpu,
                ram: data.ram,
                temp: data.temp,
                npu: data.npu
              });
            }
          } catch (e) {
            console.error("[HMI] Error parsing hardware metrics payload:", e);
          }
        };

        hwWs.onerror = () => {
          if (hwWs) hwWs.close();
        };

        hwWs.onclose = () => {
          if (!isSubscribed) return;
          console.warn("[HMI] Real-time Hardware WS closed. Reconnecting in 2s...");
          reconnectTimeout = setTimeout(connectHardwareMonitor, 2000);
        };
      } catch (err) {
        console.error("[HMI] Failed to initiate Real-time Hardware WS:", err);
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connectHardwareMonitor, 2000);
        }
      }
    };

    connectHardwareMonitor();

    return () => {
      isSubscribed = false;
      if (hwWs) hwWs.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [edgeIp]);


  const preloadImages = (annotatedUrl, rawUrl) => {
    return new Promise((resolve) => {
      let loadedAnn = null;
      let loadedRaw = null;
      let pending = 0;
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve({ loadedAnn, loadedRaw });
        }
      };

      const timer = setTimeout(finish, 1500);

      const checkDone = () => {
        pending--;
        if (pending <= 0) {
          clearTimeout(timer);
          finish();
        }
      };

      const loadImageWithRetry = (url, callback, retries = 3) => {
        if (!url) { callback(null); return; }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => callback(img);
        img.onerror = () => {
          if (retries > 0) {
            setTimeout(() => loadImageWithRetry(url, callback, retries - 1), 150);
          } else {
            callback(null);
          }
        };
        img.src = url;
      };

      if (annotatedUrl) {
        pending++;
        loadImageWithRetry(annotatedUrl, (img) => { loadedAnn = img; checkDone(); });
      }

      if (rawUrl) {
        pending++;
        loadImageWithRetry(rawUrl, (img) => { loadedRaw = img; checkDone(); });
      }

      if (pending === 0) {
        clearTimeout(timer);
        finish();
      }
    });
  };

  const mapInspectionData = (data) => {
    const annUrl = resolveImageUrl(data.imageUrl || data.annotatedImageUrl);
    const rawUrl = resolveImageUrl(data.rawImageUrl);

    if (annUrl || rawUrl) {
      preloadImages(annUrl, rawUrl).then(({ loadedAnn, loadedRaw }) => {
        // 1. Set preloaded images
        setLoadedImage(loadedAnn);
        setLoadedRawImage(loadedRaw);

        // 2. Trigger scanner beam animation
        animateScannerLine();

        // 3. Atomically update decision banner, full-screen theme and result text at the exact same frame!
        setCurrentInspection({
          id: data.id,
          batch: data.batch,
          waferNo: data.waferNo,
          xyCoord: data.xyCoord,
          site: data.site,
          pad: data.pad,
          temp: data.temp || "-",
          padsTotal: data.padsTotal,
          padsDetected: data.padsDetected,
          probeMarks: data.probeMarks,
          grains: data.grains,
          confidence: data.confidence,
          inferenceTime: data.inferenceTime,
          ruleTime: data.ruleTime,
          decision: data.decision,
          machineAction: data.machineAction,
          imageUrl: data.imageUrl || null,
          rawImageUrl: data.rawImageUrl || null
        });

        setCurrentDieImage({
          pads: [{
            id: 1,
            x: 300,
            y: 300,
            detected: data.padsDetected > 0,
            marks: data.marks || []
          }],
          grains: data.grainList || []
        });
        setActiveAlarms(data.alarms || []);
      });
    } else {
      animateScannerLine();
      setLoadedImage(null);
      setLoadedRawImage(null);
      setCurrentInspection({
        id: data.id,
        batch: data.batch,
        waferNo: data.waferNo,
        xyCoord: data.xyCoord,
        site: data.site,
        pad: data.pad,
        temp: data.temp || "-",
        padsTotal: data.padsTotal,
        padsDetected: data.padsDetected,
        probeMarks: data.probeMarks,
        grains: data.grains,
        confidence: data.confidence,
        inferenceTime: data.inferenceTime,
        ruleTime: data.ruleTime,
        decision: data.decision,
        machineAction: data.machineAction,
        imageUrl: null,
        rawImageUrl: null
      });

      setCurrentDieImage({
        pads: [{
          id: 1,
          x: 300,
          y: 300,
          detected: data.padsDetected > 0,
          marks: data.marks || []
        }],
        grains: data.grainList || []
      });
      setActiveAlarms(data.alarms || []);
    }
  };

  // ==========================================
  // OFFLINE MODE: CLIENT SIMULATION GENERATORS
  // ==========================================
  useEffect(() => {
    if (isBackendConnected) return;
    // ponytail: no mock data — history comes from API only
  }, [isBackendConnected]);

  useEffect(() => {
    if (!isSimRunning || isBackendConnected) return;
    const interval = setInterval(() => {
      runSingleOfflineInspection(false);
    }, simSpeed);
    return () => clearInterval(interval);
  }, [isSimRunning, simIndex, isBackendConnected, simSpeed]);

  const runSingleOfflineInspection = (forceDefect = false) => {
    animateScannerLine();

    const anomalyType = forceDefect ? Math.floor(Math.random() * 5) + 1 : (Math.random() < 0.2 ? Math.floor(Math.random() * 5) + 1 : 0);
    const confidence = +(97.8 + Math.random() * 2.0).toFixed(1);
    const infTime = +(15.8 + Math.random() * 3.5).toFixed(1);

    let marksList = [];
    let alarms = [];

    if (anomalyType === 1) {
      alarms.push({ name: "Probe Mark Missing (Missed Hit)", time: clockStr.split(" ")[1] });
    } else if (anomalyType === 2) {
      marksList = [
        { dx: -25, dy: -20, rx: 24, ry: 16, rot: 0.2 },
        { dx: 30, dy: 25, rx: 20, ry: 14, rot: -0.3 }
      ];
      alarms.push({ name: "Double Hit Detected", time: clockStr.split(" ")[1] });
    } else if (anomalyType === 3) {
      marksList = [
        { dx: -10, dy: 10, rx: 24, ry: 16, rot: 0.1 },
        { dx: 15, dy: 15, isScratch: true }
      ];
      alarms.push({ name: "Critical Passivation Scratch", time: clockStr.split(" ")[1] });
    } else if (anomalyType === 5) {
      marksList = [
        { dx: 165, dy: -140, rx: 26, ry: 18, rot: 0.4 }
      ];
      alarms.push({ name: "Probe Mark Misaligned (Border Hit)", time: clockStr.split(" ")[1] });
    } else {
      const dx = -15 + Math.random() * 30;
      const dy = -15 + Math.random() * 30;
      marksList = [{ dx, dy, rx: 24, ry: 16, rot: 0.1 }];
    }

    let grains = [];
    let grainCount = 0;
    if (anomalyType === 4) {
      grainCount = Math.floor(Math.random() * 4) + 3;
      alarms.push({ name: "Dust Contamination Alert", time: clockStr.split(" ")[1] });
    } else if (Math.random() < 0.22) {
      grainCount = Math.floor(Math.random() * 2) + 1;
    }

    for (let i = 0; i < grainCount; i++) {
      grains.push({
        x: 180 + Math.random() * 240,
        y: 180 + Math.random() * 240,
        radius: 4 + Math.random() * 6
      });
    }

    let decision = "PASS";
    let action = "CONTINUE PROCESS";
    if (anomalyType === 1 || anomalyType === 3 || anomalyType === 4 || grains.length >= 3) {
      decision = "FAIL";
      action = "STOP MACHINE";
    } else if (anomalyType === 2 || anomalyType === 5 || grains.length > 0) {
      decision = "WARNING";
      action = "WARN OPERATOR";
    }

    const nextId = simIndex + 1;
    setSimIndex(nextId);

    const waferId = `#WF-${2940 + nextId}`;
    const newRecord = {
      id: waferId,
      machineNo: "PROBER01",
      batch: "B2940",
      waferNo: waferId,
      pad: "P1",
      site: "S1",
      xyCoord: `X${Math.floor(Math.random() * 50)}Y${Math.floor(Math.random() * 50)}`,
      timestamp: clockStr,
      timeShort: clockStr.split(" ")[1],
      decision: decision,
      padsTotal: 1,
      padsDetected: 1,
      probeMarks: marksList.length,
      grains: grains.length,
      confidence: confidence,
      inferenceTime: infTime,
      ruleTime: 0.2,
      machineAction: action
    };

    setCurrentInspection(newRecord);
    setCurrentDieImage({
      pads: [{ id: 1, x: 300, y: 300, detected: true, marks: marksList }],
      grains: grains
    });
    setActiveAlarms(alarms);
    setHistory(prev => [...prev, newRecord]);

    setSysStats({
      cpu: Math.floor(45 + Math.random() * 18),
      npu: Math.floor(84 + Math.random() * 8),
      ram: Math.floor(512 + Math.random() * 15),
      temp: +(54.5 + Math.random() * 3).toFixed(1)
    });
  };

  const animateScannerLine = () => {
    if (!scannerRef.current) return;
    scannerRef.current.style.top = "0%";
    scannerRef.current.style.opacity = "1";
    scannerRef.current.style.transition = "none";
    setTimeout(() => {
      if (!scannerRef.current) return;
      scannerRef.current.style.transition = "top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
      scannerRef.current.style.top = "100%";
      setTimeout(() => {
        if (!scannerRef.current) return;
        scannerRef.current.style.opacity = "0";
      }, 400);
    }, 50);
  };

  // ==========================================
  // WAFER GRAPHICS DRAWING ENGINE (Canvas)
  // ==========================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width || canvas.clientWidth || 600, rect.height || canvas.clientHeight || 600);
    const val = size > 0 ? size : 600;

    canvas.width = val * dpr;
    canvas.height = val * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale((val * dpr) / 600, (val * dpr) / 600);

    const drawRoundedRect = (c, x, y, width, height, radius, fill, stroke) => {
      c.beginPath();
      c.moveTo(x + radius, y);
      c.arcTo(x + width, y, x + width, y + height, radius);
      c.arcTo(x + width, y + height, x, y + height, radius);
      c.arcTo(x, y + height, x, y, radius);
      c.arcTo(x, y, x + width, y, radius);
      c.closePath();
      if (fill) c.fill();
      if (stroke) c.stroke();
    };

    const drawProbeMarkScratch = (c, x, y, rx, ry, rot) => {
      c.beginPath();
      c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      c.closePath();
      const grad = c.createRadialGradient(x, y, 2, x, y, rx);
      grad.addColorStop(0, "#64748b");
      grad.addColorStop(1, "#334155");
      c.fillStyle = grad;
      c.fill();
      c.strokeStyle = "rgba(255, 255, 255, 0.12)";
      c.lineWidth = 1;
      c.stroke();
    };

    const drawDieContent = (c, showOverlays) => {
      if (!showOverlays && loadedRawImage) {
        c.drawImage(loadedRawImage, 0, 0, 600, 600);
        return;
      }
      if (showOverlays && loadedImage) {
        c.drawImage(loadedImage, 0, 0, 600, 600);
        return;
      }

      // Clean 'NO IMAGE AVAILABLE' placeholder when no real camera or file image is loaded
      c.fillStyle = isLight ? "#f8fafc" : "#0d0e15";
      c.fillRect(0, 0, 600, 600);

      if (filters.grid) {
        c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
        c.lineWidth = 1;
      }

      c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
      c.lineWidth = 1.5;
      const rl = 25, rPad = 15;
      c.beginPath(); c.moveTo(rPad, rPad + rl); c.lineTo(rPad, rPad); c.lineTo(rPad + rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(600 - rPad, rPad + rl); c.lineTo(600 - rPad, rPad); c.lineTo(600 - rPad - rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(rPad, 600 - rPad - rl); c.lineTo(rPad, 600 - rPad); c.lineTo(rPad + rl, 600 - rPad); c.stroke();
      c.beginPath(); c.moveTo(600 - rPad, 600 - rPad - rl); c.lineTo(600 - rPad, 600 - rPad); c.lineTo(600 - rPad - rl, 600 - rPad); c.stroke();
    };

    if (compareMode === "overlay") {
      drawDieContent(ctx, true);
    } else {
      ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(300, 0); ctx.lineTo(300, 600); ctx.stroke();

      ctx.save();
      ctx.translate(6, 150); ctx.scale(0.48, 0.48);
      drawDieContent(ctx, false);
      ctx.restore();

      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "bold 13px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("RAW CAMERA FEED", 150, 30);

      ctx.save();
      ctx.translate(306, 150); ctx.scale(0.48, 0.48);
      drawDieContent(ctx, true);
      ctx.restore();

      ctx.fillStyle = "var(--color-info)";
      ctx.font = "bold 13px 'Inter', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("AI SEGMENTATION", 450, 30);
    }
  }, [currentDieImage, compareMode, isLight, filters, loadedImage, loadedRawImage, currentInspection]);

  // ==========================================
  // CHARTS CONFIGURATION ENGINE (Chart.js React)
  // ==========================================
  const passCountChart = (Array.isArray(history) ? history : []).filter(r => r.decision === "PASS").length;
  const failCountChart = (Array.isArray(history) ? history : []).filter(r => r.decision !== "PASS").length;

  const donutChartData = {
    labels: ["PASS", "FAIL"],
    datasets: [
      {
        data: [passCountChart, failCountChart],
        backgroundColor: [isLight ? "#059669" : "#10b981", isLight ? "#dc2626" : "#ef4444"],
        borderColor: isLight ? "#ffffff" : "#1e293b",
        borderWidth: 2,
        hoverOffset: 6
      }
    ]
  };

  const donutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "68%",
    animation: {
      animateScale: true,
      animateRotate: true,
      duration: 500
    },
    plugins: {
      legend: {
        position: "right",
        labels: {
          color: isLight ? "#334155" : "#cbd5e1",
          font: { family: "'Outfit', sans-serif", size: 12, weight: "bold" }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = passCountChart + failCountChart;
            const val = context.raw || 0;
            const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
            return ` ${context.label}: ${val} (${pct}%)`;
          }
        }
      }
    }
  };

  let bigMarkChart = 0, closeEdgeChart = 0, noMarkChart = 0;
  (Array.isArray(history) ? history : []).forEach(r => {
    const r_str = (r.reason || "").toLowerCase();
    const a_str = (r.alarms || []).map(a => a.name.toLowerCase()).join(" ");
    if (r_str.includes("big") || r_str.includes("area too large") || a_str.includes("big")) {
      bigMarkChart++;
    } else if (r_str.includes("no probe") || r_str.includes("missing") || r_str.includes("cannot classify") || a_str.includes("no probe") || a_str.includes("missing")) {
      noMarkChart++;
    } else if (r.decision === "FAIL") {
      closeEdgeChart++;
    }
  });

  const barChartData = {
    labels: ["Big Probe Mark", "Close to Edge", "No Probe Mark"],
    datasets: [
      {
        label: "Defects",
        data: [bigMarkChart, closeEdgeChart, noMarkChart],
        backgroundColor: ["#ef4444", "#f97316", "#a855f7"],
        borderRadius: 4
      }
    ]
  };

  const barChartOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` Defects: ${context.raw}`
        }
      }
    },
    scales: {
      x: {
        grid: { color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" },
        ticks: { color: isLight ? "#64748b" : "#94a3b8", font: { family: "'JetBrains Mono'" } }
      },
      y: {
        grid: { display: false },
        ticks: { color: isLight ? "#334155" : "#cbd5e1", font: { family: "'Outfit'", weight: "600" } }
      }
    }
  };

  const latencyRecent = (Array.isArray(history) ? history : []).slice(0, 15).reverse();
  const lineChartData = {
    labels: latencyRecent.map(d => (d.id || "").replace("#WF-", "")),
    datasets: [
      {
        label: "Inference Latency (ms)",
        data: latencyRecent.map(d => Number(d.inferenceTime) || 0),
        borderColor: isLight ? "#0284c7" : "#38bdf8",
        backgroundColor: isLight ? "rgba(2, 132, 199, 0.15)" : "rgba(56, 189, 248, 0.15)",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: isLight ? "#0284c7" : "#38bdf8",
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` Latency: ${context.raw} ms`
        }
      }
    },
    scales: {
      x: {
        grid: { color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" },
        ticks: { color: isLight ? "#64748b" : "#94a3b8", font: { family: "'JetBrains Mono'", size: 10 } }
      },
      y: {
        grid: { color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" },
        ticks: { color: isLight ? "#64748b" : "#94a3b8", font: { family: "'JetBrains Mono'" } },
        beginAtZero: true
      }
    }
  };

  // Helper to format Batch/Wafer identifier fully without extraneous delimiters
  const formatBatchWafer = (item) => {
    if (!item) return "-";
    const b = (item.batch && item.batch !== "-") ? item.batch : "";
    const w = (item.waferNo && item.waferNo !== "-") ? item.waferNo : (item.id && !item.id.startsWith("#WF") ? item.id : "");
    if (b && w) {
      if (w.includes(b)) return w;
      return `${b}${w}`;
    }
    return w || b || item.waferNo || item.batch || item.id || "-";
  };

  // ==========================================
  // REPORT DATA EXPORT (CSV SPREADSHEET)
  // ==========================================
  const exportToCSV = () => {
    if (history.length === 0) {
      alert("No data available to export.");
      return;
    }
    const csvRows = [
      ["Timestamp", "Machine no", "Batch/Wafer no", "Pad", "Site", "XY Coordinate", "Temp", "Result", "Failure Reason", "Latency (ms)"]
    ];
    history.forEach(rec => {
      const bw = formatBatchWafer(rec);
      csvRows.push([
        `"${rec.timestamp || rec.timeShort || "-"}"`,
        `"${rec.machineNo || "PROBER01"}"`,
        `"${bw}"`,
        `"${rec.pad || "-"}"`,
        `"${rec.site || "-"}"`,
        `"${rec.xyCoord || "-"}"`,
        `"${rec.temp || "-"}"`,
        `"${rec.decision}"`,
        `"${rec.reason || "-"}"`,
        rec.inferenceTime ?? 0
      ]);
    });
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Wafer_Inspection_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter logs logic for Analytics Tab
  const uniqueBatches = Array.from(new Set(historyList.map(item => item.batch).filter(b => b && b !== "-")));
  const uniqueMachines = Array.from(new Set(historyList.map(item => item.machineNo || "PROBER01").filter(m => m && m !== "-")));

  // Calculate local yields
  const totalScans = historyList.length;
  const passCount = historyList.filter(h => h.decision === "PASS").length;
  const failCount = historyList.filter(h => h.decision !== "PASS").length;
  const yieldRate = totalScans > 0 ? ((passCount / totalScans) * 100).toFixed(2) : "0.00";


  return (
    <>
      {/* MAIN APP FRAME */}
      <div id="app-wrapper" className="desktop-layout">

        {/* HEADER BAR */}
        <header className="app-header">
          <div className="header-left">
            <div className="logo-area">
              <span className="logo-icon"></span>
              <h1>WAFER AI</h1>
            </div>
          </div>

          <nav className="header-nav">
            <button className={`nav-tab ${activeTab === "inspect" ? "active" : ""}`} onClick={() => setActiveTab("inspect")}>INSPECT</button>
            <button className={`nav-tab ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>HISTORY</button>
            <button className={`nav-tab ${activeTab === "models" ? "active" : ""}`} onClick={() => { setActiveTab("models"); setBenchmarkActiveSubTab("hub"); }}>MODELS</button>
            <button className={`nav-tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => { setActiveTab("settings"); fetchActiveConfig(); }}>SETTINGS</button>
          </nav>

          <div className="header-center">
            <div className="status-indicator-group">
              {isBackendConnected && (
                <div className="status-pill online" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)", color: "var(--color-pass)", fontSize: "12px", padding: "4px 8px", borderRadius: "4px", fontWeight: "600", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                  DB: {dbType}
                </div>
              )}
              <div className="status-pill" style={{ background: "rgba(2, 132, 199, 0.08)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "2px 6px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--color-info)" }}>EDGE IP:</span>
                <input
                  type="text"
                  value={edgeIp}
                  onChange={(e) => updateEdgeIp(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "inherit", fontSize: "12px", fontFamily: "var(--font-mono)", width: "95px", outline: "none", fontWeight: "bold" }}
                  title="Change i.MX8 Edge Node IP Address"
                />
              </div>
              <div className={`status-pill ${isBackendConnected ? "online" : "offline"}`} id="imx8-status">
                <span className="status-dot"></span>
                <span className="status-label">{isBackendConnected ? "EDGE: ONLINE" : "EDGE: OFFLINE"}</span>
              </div>
              <div className={`status-pill ${isBackendConnected ? "online" : "offline"}`} id="prober-status">
                <span className="status-dot"></span>
                <span className="status-label">{isBackendConnected ? "PROBER: READY" : "PROBER: OFFLINE"}</span>
              </div>
            </div>
          </div>

          <div className="header-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div className="datetime-display" id="live-time">{clockStr}</div>

            <div className="toggle-group theme-group" style={{ display: "flex", gap: "2px" }}>
              <button id="btn-theme-dark" className={`view-btn ${!isLight ? "active" : ""}`} onClick={() => setIsLight(false)}>Dark</button>
              <button id="btn-theme-light" className={`view-btn ${isLight ? "active" : ""}`} onClick={() => setIsLight(true)}>Light</button>
            </div>
          </div>
        </header>

        {/* TAB WORKSPACE */}
        <div id="view-inspect" className={`tab-content ${activeTab === "inspect" ? "active-tab" : ""}`}>
          <main className="hmi-grid">

            {/* LEFT SIDEBAR: DECISION & SUMMARY */}
            <section className="grid-col left-col">
              {/* DECISION PANEL */}
              <div className="hmi-card decision-card">
                <div className="card-body central-decision">
                  <div id="decision-indicator" className={`decision-display ${currentInspection.decision === "PASS" ? "state-pass" : currentInspection.decision === "FAIL" ? "state-fail" : "state-idle"}`}>
                    <span className="decision-title">{currentInspection.decision === "-" ? "WAITING" : currentInspection.decision}</span>
                  </div>
                </div>
              </div>

              {/* SUMMARY PANEL */}
              <div className="hmi-card summary-card" style={{ flex: 1 }}>
                <div className="card-header">
                  <h3>SUMMARY</h3>
                  <span className="pill-id" id="wafer-id-tag">{formatBatchWafer(currentInspection)}</span>
                </div>
                <div className="card-body">
                  <div className="metric-list">
                    <div className="metric-row">
                      <span className="met-label">Confidence</span>
                      <span className="met-value font-mono" id="val-confidence">{currentInspection.confidence}%</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Inference Time</span>
                      <span className="met-value font-mono highlight-blue" id="val-inference-time">{currentInspection.inferenceTime} ms</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Rule Time</span>
                      <span className="met-value font-mono highlight-green" id="val-rule-time">{currentInspection.ruleTime || 0} ms</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Temp</span>
                      <span className="met-value font-mono highlight-orange" id="val-temp">{currentInspection.temp || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* CENTER PANEL: WAFER VIEW */}
            <section className="grid-col center-col">
              <div className="hmi-card wafer-viewer-card">
                <div className="card-header">
                  <h3>LIVE VIEW (SPLIT COMPARE)</h3>
                </div>

                <div className="card-body canvas-container">
                  <canvas ref={canvasRef} id="wafer-canvas"></canvas>
                  <div ref={scannerRef} className="scanning-bar" id="scanner-line"></div>
                </div>

                {/* Live Telemetry Status Bar */}
                <div className="card-footer live-status-bar">
                  <div className="status-indicator">
                    <span className={`status-dot ${isBackendConnected ? "green-glow" : "offline"}`}></span>
                    <span>{isBackendConnected ? "EDGE NPU ONLINE" : "EDGE NPU OFFLINE"}</span>
                  </div>
                  <div className="live-telemetry">
                    <span>INFERENCE: PyTorch UNet + Rule Engine</span>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT PANEL: PERFORMANCE & STATISTICS */}
            <section className="grid-col right-col">
              {/* SYSTEM PERFORMANCE */}
              <div className="hmi-card stats-card">
                <div className="card-header">
                  <h3>PERFORMANCE</h3>
                </div>
                <div className="card-body performance-body">
                  <div className="perf-grid">
                    <div className="perf-tile">
                      <span className="perf-lbl">CPU</span>
                      <span className="perf-val font-mono" id="cpu-text">{sysStats.cpu}%</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">NPU</span>
                      <span className="perf-val font-mono" id="npu-text">{sysStats.npu < 0 || sysStats.npu === -1 ? 'N/A' : `${sysStats.npu}%`}</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">RAM</span>
                      <span className="perf-val font-mono" id="ram-text-short">{sysStats.ram}%</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">TEMP</span>
                      <span className="perf-val font-mono" id="temp-text">{sysStats.temp}°C</span>
                    </div>
                  </div>

                  <div className="model-meta-box">
                    <div className="meta-row">
                      <span className="meta-lbl">Model:</span>
                      <span className="meta-val font-mono highlight-green" id="active-model-name">
                        unet_pytorch_3class.pth
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Classifier:</span>
                      <span className="meta-val font-mono highlight-blue" id="active-model-classifier">Rule Engine (YAML)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* STATISTICS CARD */}
              <div className="hmi-card statistics-card">
                <div className="card-header">
                  <h3>STATISTICS</h3>
                </div>
                <div className="card-body">
                  <div className="stats-overview">
                    <div className="stat-main">
                      <span className="lbl">TOTAL</span>
                      <span className="val font-mono" id="stat-total">{totalScans}</span>
                    </div>

                    <div className="stat-breakdown">
                      <div className="sub-stat green-text">
                        <span className="lbl">PASS</span>
                        <span className="val font-mono" id="stat-pass">{passCount}</span>
                      </div>
                      <div className="sub-stat red-text">
                        <span className="lbl">FAIL</span>
                        <span className="val font-mono" id="stat-fail">{failCount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="stats-details">
                    <div className="metric-row">
                      <span className="met-label">Yield</span>
                      <span className="met-value font-mono highlight-green" id="stat-yield">{yieldRate}%</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Overkill</span>
                      <span className="met-value font-mono" id="stat-overkill">0.45%</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Underkill</span>
                      <span className="met-value font-mono" id="stat-underkill">0.02%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* BOTTOM ROW: HISTORY */}
            <section className="grid-row bottom-row">
              {/* HISTORY PANEL */}
              <div className="hmi-card history-card" style={{ width: "100%" }}>
                <div className="card-header">
                  <h3>HISTORY</h3>
                  <button className="clear-history-btn" id="btn-clear-history" onClick={() => {
                      setHistory([]);
                      setCurrentInspection({
                        id: "-", batch: "-", waferNo: "-", xyCoord: "-", site: "-", pad: "-", temp: "-",
                        padsTotal: 0, padsDetected: 0, probeMarks: 0, grains: 0,
                        confidence: 0, inferenceTime: 0, ruleTime: 0, decision: "-", machineAction: "WAITING"
                      });
                      setLoadedImage(null);
                      setLoadedRawImage(null);
                      fetch(`${apiBase}/api/history`, { method: "DELETE" })
                        .catch(err => console.error("Error clearing backend history:", err));
                    }}>Clear</button>
                </div>
                <div className="card-body table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Machine no</th>
                        <th>Batch/Wafer no</th>
                        <th>Pad</th>
                        <th>Site</th>
                        <th>XY Coordinate</th>
                        <th>Temp</th>
                        <th>Result</th>
                        <th>Failure Reason</th>
                        <th>Latency</th>
                      </tr>
                    </thead>
                    <tbody id="history-table-body">
                      {history.slice(0, 15).map((item, index) => (
                        <tr key={index} onClick={() => openModalWithItem(item, index)} title="Click to view inspection image">
                          <td>{item.timestamp || item.timeShort || "-"}</td>
                          <td className="font-mono">{item.machineNo || "PROBER01"}</td>
                          <td className="font-mono">{formatBatchWafer(item)}</td>
                          <td className="font-mono">{item.pad || "-"}</td>
                          <td className="font-mono">{item.site || "-"}</td>
                          <td className="font-mono">{item.xyCoord || "-"}</td>
                          <td className="font-mono">{item.temp || "-"}</td>
                          <td>
                            <span className={`badge-result ${item.decision.toLowerCase()}`}>{item.decision}</span>
                          </td>
                          <td className="font-mono" style={{ fontSize: "13px", color: item.reason && item.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                            {item.reason || "-"}
                          </td>
                          <td className="font-mono">{item.inferenceTime ?? 0} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </main>
        </div>

        {/* ==========================================
            TAB CONTENT 2: HISTORY & REPORTS (Excel Export & Advanced Browsing)
            ========================================== */}
        {activeTab === "analytics" && (
          <div className="tab-content active-tab" id="view-analytics">
            <main className="analytics-layout">
              
              {/* TOP TOOLBAR & CONTROLS */}
              <div className="analytics-top-bar" style={{ display: "flex", gap: "14px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 16px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-color)", borderRadius: "8px" }}>
                
                {/* Filter Controls */}
                <div className="filter-controls" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                  
                  {/* Result Pill Filter */}
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Result:</label>
                    <div className="filter-pill-group" id="filter-pills">
                      {["ALL", "PASS", "FAIL"].map(pill => (
                        <button key={pill} className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`} onClick={() => { setAnalyticsFilter(pill); setHistoryPage(1); }}>{pill}</button>
                      ))}
                    </div>
                  </div>

                  {/* Machine Filter */}
                  {uniqueMachines.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Machine:</label>
                      <select
                        value={analyticsMachineFilter}
                        onChange={(e) => { setAnalyticsMachineFilter(e.target.value); setHistoryPage(1); }}
                        style={{ padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                      >
                        <option value="ALL">All Machines ({uniqueMachines.length})</option>
                        {uniqueMachines.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Batch Filter */}
                  {uniqueBatches.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Batch:</label>
                      <select
                        value={analyticsBatchFilter}
                        onChange={(e) => { setAnalyticsBatchFilter(e.target.value); setHistoryPage(1); }}
                        style={{ padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                      >
                        <option value="ALL">All Batches ({uniqueBatches.length})</option>
                        {uniqueBatches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Search Input */}
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
                    <input
                      type="text"
                      id="filter-search"
                      value={filterSearch}
                      onChange={(e) => { setFilterSearch(e.target.value); setHistoryPage(1); }}
                      placeholder="Search Batch, Wafer, XY, Site, Pad, Reason..."
                      style={{ width: "100%", padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                    />
                  </div>

                  {/* Reset Filter Button */}
                  {(filterSearch || analyticsFilter !== "ALL" || analyticsBatchFilter !== "ALL" || analyticsMachineFilter !== "ALL") && (
                    <button
                      style={{ padding: "6px 12px", borderRadius: "5px", border: "none", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", cursor: "pointer", fontSize: "13.5px", fontWeight: "bold" }}
                      onClick={() => { setFilterSearch(""); setAnalyticsFilter("ALL"); setAnalyticsBatchFilter("ALL"); setAnalyticsMachineFilter("ALL"); setHistoryPage(1); }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>

                {/* View Mode Switcher & Export Actions */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  
                  {/* View Mode Toggle */}
                  <div className="filter-pill-group" style={{ padding: "2px" }}>
                    <button
                      className={`filter-pill ${historyViewMode === "dashboard" ? "active" : ""}`}
                      onClick={() => setHistoryViewMode("dashboard")}
                      title="Show Analytics Charts + Table"
                      style={{ fontSize: "13.5px", padding: "6px 12px" }}
                    >
                      DASHBOARD
                    </button>
                    <button
                      className={`filter-pill ${historyViewMode === "table-full" ? "active" : ""}`}
                      onClick={() => setHistoryViewMode("table-full")}
                      title="Expand to Full Width Data Table"
                      style={{ fontSize: "13.5px", padding: "6px 12px" }}
                    >
                      FULL TABLE
                    </button>
                  </div>

                  <button className="excel-export-btn" id="btn-export-excel" onClick={exportToCSV} style={{ padding: "7px 16px", fontSize: "14px" }}>
                    <span className="excel-icon"></span> Export (.csv)
                  </button>
                  
                  <button
                    className="clear-history-btn"
                    id="btn-clear-db-history"
                    title="Clear all stored inspection history from database"
                    style={{ padding: "7px 14px", fontSize: "14px" }}
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear all history records from database?")) {
                        fetch(`${apiBase}/api/history`, { method: "DELETE" })
                          .then(r => r.json())
                          .then(res => {
                            setHistory([]);
                            alert("Database history cleared successfully!");
                          })
                          .catch(e => alert("Failed to clear history: " + e));
                      }
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* MAIN HISTORY DASHBOARD CONTENT */}
              {historyViewMode === "dashboard" ? (
                <div className="analytics-dashboard-grid">
                  {/* Left side: KPIs + Donut + Defect Bar */}
                  <div className="analytics-dashboard-col left-dashboard-col">
                    <div className="analytics-kpi-subgrid">
                      <div className="analytics-stat-card">
                        <span className="stat-lbl">Processed Wafers</span>
                        <span className="stat-val font-mono" id="an-total-inspected">{history.length}</span>
                      </div>
                      <div className="analytics-stat-card card-green">
                        <span className="stat-lbl">Yield Rate (Pass)</span>
                        <span className="stat-val font-mono" id="an-yield-rate">
                          {(history.length > 0 ? (history.filter(h => h.decision === "PASS").length / history.length) * 100 : 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className="analytics-stat-card card-red">
                        <span className="stat-lbl">Defect Rate (Fail)</span>
                        <span className="stat-val font-mono" id="an-defect-rate">
                          {(history.length > 0 ? (history.filter(h => h.decision !== "PASS").length / history.length) * 100 : 0).toFixed(2)}%
                        </span>
                      </div>
                      <div className="analytics-stat-card card-blue">
                        <span className="stat-lbl">Avg Confidence</span>
                        <span className="stat-val font-mono" id="an-avg-confidence">
                          {(history.length > 0 ? history.reduce((sum, h) => sum + h.confidence, 0) / history.length : 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="hmi-card donut-chart-card">
                      <div className="card-header"><h3>YIELD DISTRIBUTION</h3></div>
                      <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                        <Doughnut data={donutChartData} options={donutChartOptions} />
                      </div>
                    </div>

                    <div className="hmi-card bar-chart-card">
                      <div className="card-header"><h3>DEFECT CAUSES BREAKDOWN</h3></div>
                      <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                        <Bar data={barChartData} options={barChartOptions} />
                      </div>
                    </div>
                  </div>

                  {/* Right side: Line chart + Table with Pagination */}
                  <div className="analytics-dashboard-col right-dashboard-col">
                    <div className="hmi-card line-chart-card">
                      <div className="card-header"><h3>LATENCY HISTORY (MS)</h3></div>
                      <div className="card-body chart-body" style={{ height: "160px", position: "relative" }}>
                        <Line data={lineChartData} options={lineChartOptions} />
                      </div>
                    </div>

                    <div className="hmi-card analytics-table-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3>DETAILED PRODUCTION RECORDS</h3>
                        <span className="pill-id" id="report-row-count">{filteredHistory.length} Records</span>
                      </div>
                      
                      <div className="card-body table-container" style={{ flex: 1, overflowY: "auto", minHeight: "220px" }}>
                        <table className="history-table report-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Machine no</th>
                              <th>Batch/Wafer no</th>
                              <th>Pad</th>
                              <th>Site</th>
                              <th>XY Coordinate</th>
                              <th>Temp</th>
                              <th>Result</th>
                              <th>Failure Reason</th>
                              <th>Latency</th>
                            </tr>
                          </thead>
                          <tbody id="analytics-table-body">
                            {paginatedHistory.map((rec, index) => {
                              const absoluteIndex = (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + index;
                              return (
                                <tr key={absoluteIndex} onClick={() => openModalWithItem(rec, absoluteIndex)} title="Click to view inspection image" style={{ cursor: "pointer" }}>
                                  <td>{rec.timestamp || rec.timeShort || "-"}</td>
                                  <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                                  <td className="font-mono">{formatBatchWafer(rec)}</td>
                                  <td className="font-mono">{rec.pad || "-"}</td>
                                  <td className="font-mono">{rec.site || "-"}</td>
                                  <td className="font-mono">{rec.xyCoord || "-"}</td>
                                  <td className="font-mono">{rec.temp || "-"}</td>
                                  <td>
                                    <span className={`badge-result ${rec.decision.toLowerCase()}`}>{rec.decision}</span>
                                  </td>
                                  <td className="font-mono" style={{ fontSize: "14px", color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                                    {rec.reason || "-"}
                                  </td>
                                  <td className="font-mono">{rec.inferenceTime ?? 0} ms</td>
                                </tr>
                              );
                            })}
                            {paginatedHistory.length === 0 && (
                              <tr>
                                <td colSpan="10" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "14px" }}>
                                  No records found matching current filter criteria.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Footer */}
                      <div className="table-pagination-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.03)", flexWrap: "wrap", gap: "10px", fontSize: "13.5px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                          <span>
                            Showing <strong>{filteredHistory.length === 0 ? 0 : (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + 1}</strong> - <strong>{Math.min(effectiveHistoryPage * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)), filteredHistory.length)}</strong> of <strong>{filteredHistory.length}</strong>
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>Page Size:</span>
                            <select
                              value={historyPageSize}
                              onChange={(e) => { setHistoryPageSize(e.target.value === "ALL" ? "ALL" : Number(e.target.value)); setHistoryPage(1); }}
                              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13.5px" }}
                            >
                              <option value={15}>15</option>
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                              <option value={100}>100</option>
                              <option value="ALL">All ({filteredHistory.length})</option>
                            </select>
                          </div>
                        </div>

                        {historyPageSize !== "ALL" && totalHistoryPages > 1 && (
                          <div className="pagination-btn-group" style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                            <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(1)} title="First Page">⏮</button>
                            <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))} title="Previous Page">◀</button>
                            <span style={{ padding: "0 6px", fontWeight: "bold" }}>Page {effectiveHistoryPage} of {totalHistoryPages}</span>
                            <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} title="Next Page">▶</button>
                            <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(totalHistoryPages)} title="Last Page">⏭</button>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              ) : (
                /* FULL TABLE EXPANDED VIEW */
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", height: "calc(100% - 60px)" }}>
                  
                  {/* Mini KPI Bar */}
                  <div className="analytics-kpi-subgrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                    <div className="analytics-stat-card">
                      <span className="stat-lbl">Total Scans</span>
                      <span className="stat-val font-mono">{history.length}</span>
                    </div>
                    <div className="analytics-stat-card card-green">
                      <span className="stat-lbl">Pass Count</span>
                      <span className="stat-val font-mono">{history.filter(h => h.decision === "PASS").length}</span>
                    </div>
                    <div className="analytics-stat-card card-red">
                      <span className="stat-lbl">Defect Count</span>
                      <span className="stat-val font-mono">{history.filter(h => h.decision !== "PASS").length}</span>
                    </div>
                    <div className="analytics-stat-card card-blue">
                      <span className="stat-lbl">Yield Rate</span>
                      <span className="stat-val font-mono">{(history.length > 0 ? (history.filter(h => h.decision === "PASS").length / history.length) * 100 : 0).toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Expanded Full Width Table */}
                  <div className="hmi-card analytics-table-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3>FULL PRODUCTION INSPECTION HISTORY</h3>
                      <span className="pill-id">{filteredHistory.length} Filtered Records</span>
                    </div>
                    
                    <div className="card-body table-container" style={{ flex: 1, overflowY: "auto" }}>
                      <table className="history-table report-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Machine no</th>
                            <th>Batch/Wafer no</th>
                            <th>Pad</th>
                            <th>Site</th>
                            <th>XY Coordinate</th>
                            <th>Temp</th>
                            <th>Result</th>
                            <th>Failure Reason</th>
                            <th>Latency</th>
                          </tr>
                        </thead>
                        <tbody id="analytics-table-body">
                          {paginatedHistory.map((rec, index) => {
                            const absoluteIndex = (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + index;
                            return (
                              <tr key={absoluteIndex} onClick={() => openModalWithItem(rec, absoluteIndex)} title="Click to view inspection image" style={{ cursor: "pointer" }}>
                                <td>{rec.timestamp || rec.timeShort || "-"}</td>
                                <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                                <td className="font-mono">{formatBatchWafer(rec)}</td>
                                <td className="font-mono">{rec.pad || "-"}</td>
                                <td className="font-mono">{rec.site || "-"}</td>
                                <td className="font-mono">{rec.xyCoord || "-"}</td>
                                <td className="font-mono">{rec.temp || "-"}</td>
                                <td>
                                  <span className={`badge-result ${rec.decision.toLowerCase()}`}>{rec.decision}</span>
                                </td>
                                <td className="font-mono" style={{ fontSize: "13px", color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                                  {rec.reason || "-"}
                                </td>
                                <td className="font-mono">{rec.inferenceTime ?? 0} ms</td>
                              </tr>
                            );
                          })}
                          {paginatedHistory.length === 0 && (
                            <tr>
                              <td colSpan="10" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                                No records found matching current filter criteria.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="table-pagination-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.03)", flexWrap: "wrap", gap: "10px", fontSize: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "var(--text-muted)" }}>
                        <span>
                          Showing <strong>{filteredHistory.length === 0 ? 0 : (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + 1}</strong> - <strong>{Math.min(effectiveHistoryPage * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)), filteredHistory.length)}</strong> of <strong>{filteredHistory.length}</strong>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>Page Size:</span>
                          <select
                            value={historyPageSize}
                            onChange={(e) => { setHistoryPageSize(e.target.value === "ALL" ? "ALL" : Number(e.target.value)); setHistoryPage(1); }}
                            style={{ padding: "3px 8px", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "12px" }}
                          >
                            <option value={15}>15</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value="ALL">All ({filteredHistory.length})</option>
                          </select>
                        </div>
                      </div>

                      {historyPageSize !== "ALL" && totalHistoryPages > 1 && (
                        <div className="pagination-btn-group" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(1)} title="First Page">⏮ First</button>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))} title="Previous Page">◀ Prev</button>
                          
                          {/* Page numbers */}
                          {(() => {
                            const pages = [];
                            const maxVisible = 5;
                            let start = Math.max(1, effectiveHistoryPage - Math.floor(maxVisible / 2));
                            let end = Math.min(totalHistoryPages, start + maxVisible - 1);
                            if (end - start + 1 < maxVisible) {
                              start = Math.max(1, end - maxVisible + 1);
                            }
                            for (let i = start; i <= end; i++) {
                              pages.push(
                                <button
                                  key={i}
                                  className={`pagination-nav-btn ${effectiveHistoryPage === i ? "active" : ""}`}
                                  onClick={() => setHistoryPage(i)}
                                >
                                  {i}
                                </button>
                              );
                            }
                            return pages;
                          })()}

                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} title="Next Page">Next ▶</button>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(totalHistoryPages)} title="Last Page">Last ⏭</button>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </main>
          </div>
        )}

        {/* ==========================================
            TAB CONTENT 3: AI MODELS (HUB, UPLOAD & TEST)
            ========================================== */}
        {activeTab === "models" && (
          <div className="tab-content active-tab" id="view-models-validation">
            <main className="validation-lab-layout">

              {/* -------------------------------------------------------------
                  MODE 0: MODELS HUB (DEFAULT LANDING VIEW)
                  ------------------------------------------------------------- */}
              {benchmarkActiveSubTab === "hub" && (
                <div className="models-hub-view">
                  <div className="models-hub-header">
                    <div>
                      <h2 className="models-hub-title">MODELS</h2>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>ACTIVE NPU:</span>
                      <span className="badge-result pass font-mono" style={{ fontSize: "11px", fontWeight: "700" }}>
                        {benchmarkModel || "unet.tflite"} ({selectedClasses}C)
                      </span>
                    </div>
                  </div>

                  <div className="models-hub-grid">
                    {/* CARD 1: UPLOAD */}
                    <div className="hmi-card models-hub-card simple-hub-card" onClick={() => setBenchmarkActiveSubTab("registry")}>
                      <div className="simple-hub-card-content">
                        <h2 className="simple-hub-card-title">UPLOAD</h2>
                      </div>
                    </div>

                    {/* CARD 2: TEST */}
                    <div className="hmi-card models-hub-card simple-hub-card" onClick={() => setBenchmarkActiveSubTab("validation")}>
                      <div className="simple-hub-card-content">
                        <h2 className="simple-hub-card-title">TEST</h2>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Tab Navigation Header for inner views */}
              {benchmarkActiveSubTab !== "hub" && (
                <div className="tab-subnav">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <button
                      className="subnav-back-icon-btn"
                      onClick={() => setBenchmarkActiveSubTab("hub")}
                      title="Back"
                    >
                      ←
                    </button>
                    <span className="subnav-current-title">
                      {benchmarkActiveSubTab === "registry" ? "UPLOAD" : "TEST"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>ACTIVE NPU:</span>
                    <span className="badge-result pass font-mono" style={{ fontSize: "11px", fontWeight: "700" }}>
                      {benchmarkModel || "unet.tflite"} ({selectedClasses}C)
                    </span>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------------
                  VIEW A: VALIDATION & HUMAN REVIEW LAB
                  ------------------------------------------------------------- */}
              {benchmarkActiveSubTab === "validation" && (
                <>
                  {/* 1. TOP QUALITY KPI DASHBOARD */}
                  <div className="kpi-dashboard-grid">
                    {/* Overkill Rate */}
                    <div className={`kpi-card ${(benchmarkKpis.overkill_rate || 0) > 3 ? "alert-warning" : "highlight-info"}`}>
                      <div className="kpi-header">
                        <span className="kpi-title">Overkill Rate (FP)</span>
                        <span className="kpi-badge-hint badge-warn">AI Fail / Human Pass</span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val" style={{ color: (benchmarkKpis.overkill_rate || 0) > 3 ? "var(--color-warn)" : "inherit" }}>
                          {Number(benchmarkKpis.overkill_rate ?? 0).toFixed(1)}%
                        </span>
                        <span className="kpi-sub-text">({benchmarkKpis.overkill_count ?? 0} dies wasted)</span>
                      </div>
                      <div className="kpi-sub-text">Target: &lt; 3.0% (Minimizes false scrap)</div>
                    </div>

                    {/* Underkill / Escape Rate */}
                    <div className={`kpi-card ${(benchmarkKpis.underkill_rate || 0) > 0 ? "alert-danger" : "highlight-success"}`}>
                      <div className="kpi-header">
                        <span className="kpi-title">Underkill / Escape (FN)</span>
                        <span className={`kpi-badge-hint ${(benchmarkKpis.underkill_rate || 0) > 0 ? "badge-fail" : "badge-pass"}`}>
                          {(benchmarkKpis.underkill_rate || 0) > 0 ? "CRITICAL RISK" : "ZERO ESCAPE"}
                        </span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val" style={{ color: (benchmarkKpis.underkill_rate || 0) > 0 ? "var(--color-fail)" : "var(--color-pass)" }}>
                          {Number(benchmarkKpis.underkill_rate ?? 0).toFixed(1)}%
                        </span>
                        <span className="kpi-sub-text">({benchmarkKpis.underkill_count ?? 0} defect escapes)</span>
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
                        <span className="kpi-main-val">{Number(benchmarkKpis.agreement_rate ?? 0).toFixed(1)}%</span>
                        <span className="kpi-sub-text">({benchmarkKpis.agreement_count ?? 0} / {benchmarkKpis.total_reviewed || 0})</span>
                      </div>
                      <div className="kpi-sub-text">Reviewed: {benchmarkKpis.total_reviewed ?? 0} / {benchmarkKpis.total_tested ?? 0} items</div>
                    </div>

                    {/* True Yield vs AI Yield */}
                    <div className="kpi-card">
                      <div className="kpi-header">
                        <span className="kpi-title">Yield Benchmark</span>
                        <span className="kpi-badge-hint badge-neutral">Pass Ratio</span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val">{Number(benchmarkKpis.true_yield ?? 0).toFixed(1)}%</span>
                        <span className="kpi-sub-text">(AI: {Number(benchmarkKpis.ai_yield ?? 0).toFixed(1)}%)</span>
                      </div>
                      <div className="kpi-sub-text">Pass: {benchmarkKpis.human_pass_count ?? 0} | Fail: {benchmarkKpis.human_fail_count ?? 0}</div>
                    </div>

                    {/* NPU Latency */}
                    <div className="kpi-card">
                      <div className="kpi-header">
                        <span className="kpi-title">NPU Latency</span>
                        <span className="kpi-badge-hint badge-pass">i.MX8 NPU</span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val">{Number(benchmarkKpis.avg_inference_time_ms ?? 0).toFixed(1)} <small style={{ fontSize: "13px" }}>ms</small></span>
                      </div>
                      <div className="kpi-sub-text">Rule Eval: {Number(benchmarkKpis.avg_rule_time_ms ?? 0).toFixed(2)} ms</div>
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
                  <div className="validation-main-grid">

                    {/* LEFT COLUMN: SETUP & PRIORITY QUEUE PANEL */}
                    <div className="validation-setup-panel">
                      <div className="hmi-card">
                        <div className="card-header">
                          <h3>TEST SETUP & ENGINE RULES</h3>
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

                          {/* ponytail: rule params removed — config from uploaded file on backend */}

                          {/* Task Status Monitor */}
                          <div className="priority-queue-card">
                            <div className="priority-header">
                              <span>TASK STATUS</span>
                              <span style={{ fontSize: "10px", fontWeight: "700", color: benchmarkProgress.status === "RUNNING" ? "#38bdf8" : "var(--text-muted)" }}>
                                {isBenchmarkStarting ? "UPLOADING..." : benchmarkProgress.status}
                              </span>
                            </div>

                            {benchmarkProgress.p0_pending > 0 && benchmarkProgress.status === "RUNNING" && (
                              <div className="priority-warning-banner">
                                ⏳ กำลังรอ — เครื่อง Prober กำลังประมวลผลภาพอยู่ การ Validation จะทำต่อโดยอัตโนมัติ
                              </div>
                            )}

                            <div className="priority-progress-bar" style={{ marginTop: "4px" }}>
                              <div
                                className="priority-progress-fill"
                                style={{
                                  width: `${(benchmarkProgress.p1_total || benchmarkProgress.total || 0) > 0 
                                    ? Math.min(100, Math.round(((benchmarkProgress.p1_processed || benchmarkProgress.processed || 0) / (benchmarkProgress.p1_total || benchmarkProgress.total || 1)) * 100)) 
                                    : 0}%`
                                }}
                              ></div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", color: "var(--text-muted)" }}>
                              <span>
                                Progress: {benchmarkProgress.p1_processed || benchmarkProgress.processed || 0} / {benchmarkProgress.p1_total || benchmarkProgress.total || 0} Images ({
                                  (benchmarkProgress.p1_total || benchmarkProgress.total || 0) > 0 
                                    ? Math.min(100, Math.round(((benchmarkProgress.p1_processed || benchmarkProgress.processed || 0) / (benchmarkProgress.p1_total || benchmarkProgress.total || 1)) * 100)) 
                                    : 0
                                }%)
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                            {benchmarkProgress.status === "PAUSED" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-resume-benchmark"
                                  style={{ flex: 1 }}
                                  onClick={handleResumeBenchmark}
                                >
                                  ▶ RESUME BENCHMARK
                                </button>
                                <button
                                  type="button"
                                  className="btn-stop-benchmark"
                                  onClick={handleStopBenchmark}
                                  title="Stop and clear remaining images"
                                >
                                  ⏹ STOP
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="btn-start-benchmark"
                                  style={{ flex: 1 }}
                                  disabled={isBenchmarkStarting || benchmarkProgress.status === "RUNNING"}
                                  onClick={handleStartBenchmark}
                                >
                                  {isBenchmarkStarting
                                    ? "UPLOADING DATASET..."
                                    : benchmarkProgress.status === "RUNNING"
                                    ? "BENCHMARK RUNNING..."
                                    : "START BENCHMARK ON i.MX8"}
                                </button>
                                {benchmarkProgress.status === "RUNNING" && (
                                  <button
                                    type="button"
                                    className="btn-pause-benchmark"
                                    onClick={handlePauseBenchmark}
                                    title="Pause execution temporarily"
                                  >
                                    ⏸ PAUSE
                                  </button>
                                )}
                                {(benchmarkProgress.status === "RUNNING" || isBenchmarkStarting) && (
                                  <button
                                    type="button"
                                    className="btn-stop-benchmark"
                                    onClick={handleStopBenchmark}
                                    title="Stop and cancel benchmark"
                                  >
                                    ⏹ STOP
                                  </button>
                                )}
                              </>
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
                                onClick={() => setBenchmarkFilter("ALL")}
                              >
                                All ({benchmarkKpis.total_tested || benchmarkResults.length})
                              </button>
                              <button
                                className={`review-filter-btn warn ${benchmarkFilter === "DISAGREEMENT" ? "active" : ""}`}
                                onClick={() => setBenchmarkFilter("DISAGREEMENT")}
                              >
                                Disagreements ({(benchmarkKpis.overkill_count || 0) + (benchmarkKpis.underkill_count || 0)})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "UNREVIEWED" ? "active" : ""}`}
                                onClick={() => setBenchmarkFilter("UNREVIEWED")}
                              >
                                Pending Review ({benchmarkKpis.unreviewed_count ?? 0})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "HUMAN_PASS" ? "active" : ""}`}
                                onClick={() => setBenchmarkFilter("HUMAN_PASS")}
                              >
                                Human PASS ({benchmarkKpis.human_pass_count ?? 0})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "HUMAN_FAIL" ? "active" : ""}`}
                                onClick={() => setBenchmarkFilter("HUMAN_FAIL")}
                              >
                                Human FAIL ({benchmarkKpis.human_fail_count ?? 0})
                              </button>
                            </div>

                            {/* Search & Batch Action Helpers */}
                            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                                <input
                                  type="text"
                                  className="hmi-search-input"
                                  placeholder="Search Wafer ID / Reason..."
                                  value={benchmarkSearch}
                                  onChange={(e) => setBenchmarkSearch(e.target.value)}
                                  style={{
                                    padding: "4px 8px",
                                    paddingRight: benchmarkSearch ? "22px" : "8px",
                                    fontSize: "11px",
                                    borderRadius: "4px",
                                    width: "180px"
                                  }}
                                />
                                {benchmarkSearch && (
                                  <button
                                    onClick={() => setBenchmarkSearch("")}
                                    style={{
                                      position: "absolute",
                                      right: "4px",
                                      background: "none",
                                      border: "none",
                                      color: "var(--text-muted)",
                                      cursor: "pointer",
                                      fontSize: "11px",
                                      padding: "0 2px"
                                    }}
                                    title="Clear search"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              {/* ponytail: Auto-Confirm AI removed */}
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
                                {filteredBenchmarkResults.length === 0 ? (
                                  <tr>
                                    <td colSpan={9} style={{ textAlign: "center", padding: "30px", color: "var(--text-muted)" }}>
                                      {benchmarkProgress.status === "RUNNING"
                                        ? "Processing benchmark images on i.MX8 NPU... Results will stream in real-time."
                                        : "No matching benchmark validation results found."}
                                    </td>
                                  </tr>
                                ) : (
                                  filteredBenchmarkResults.map((item, idx) => {
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
                                            <span className="font-mono" style={{ fontSize: "14px" }}>{item.image_name}</span>
                                          </div>
                                        </td>

                                        {/* AI Decision */}
                                        <td>
                                          <span className={`badge-result ${item.ai_decision.toLowerCase()}`}>
                                            {item.ai_decision}
                                          </span>
                                        </td>

                                        {/* Violation / Reason */}
                                        <td style={{ fontSize: "14px", color: "var(--text-muted)", maxWidth: "220px" }}>
                                          <span title={item.ai_reason}>{item.ai_reason || "-"}</span>
                                        </td>

                                        {/* Min Edge Distance */}
                                        <td className="font-mono" style={{ fontSize: "14px" }}>
                                          <span>
                                            {item.min_edge_distance_um != null ? `${Number(item.min_edge_distance_um).toFixed(1)} µm` : "-"}
                                          </span>
                                        </td>

                                        {/* Mark Area Ratio */}
                                        <td className="font-mono" style={{ fontSize: "14px" }}>
                                          {item.mark_area_ratio_pct != null ? `${Number(item.mark_area_ratio_pct).toFixed(1)}%` : "-"}
                                        </td>

                                        {/* NPU Latency */}
                                        <td className="font-mono" style={{ fontSize: "14px" }}>
                                          {item.inference_time_ms ? `${Number(item.inference_time_ms).toFixed(1)} ms` : "-"}
                                        </td>

                                        {/* Human Decision Badge */}
                                        <td>
                                          {item.human_decision === "PASS" && (
                                            <span className="badge-result pass" style={{ fontSize: "13px" }}>PASS</span>
                                          )}
                                          {item.human_decision === "FAIL" && (
                                            <span className="badge-result fail" style={{ fontSize: "13px" }}>FAIL</span>
                                          )}
                                          {item.human_decision === "UNREVIEWED" && (
                                            <span className="badge-result warn" style={{ fontSize: "13px", opacity: 0.7 }}>UNREVIEWED</span>
                                          )}
                                          {isDisagreement && (
                                            <span style={{ marginLeft: "4px", fontSize: "12px", color: isUnderkill ? "#ef4444" : "#f59e0b", fontWeight: "bold" }}>
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
                                              style={{ padding: "5px 10px", fontSize: "13px", fontWeight: "700" }}
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

              {/* -------------------------------------------------------------
                  VIEW B: MODEL REGISTRY & NPU HOT-SWAP (STANDARD VIEW)
                  ------------------------------------------------------------- */}
              {benchmarkActiveSubTab === "registry" && (
                <div className="models-grid">

                  {/* Drag and drop upload */}
                  <div className="models-left-panel">
                    <div className="hmi-card uploader-card">
                      <div className="card-header">
                        <h3>UPLOAD AI DETECTOR</h3>
                      </div>
                      <div className="card-body">
                        {/* Target Class Selector for Imported Model */}
                        <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>Model Class Architecture:</label>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              className={`compare-btn ${uploadClassCount === 2 ? "active" : ""}`}
                              onClick={() => setUploadClassCount(2)}
                              style={{ flex: 1, padding: "5px 8px", fontSize: "11px", borderRadius: "4px" }}
                            >
                              2 Classes (Pad + Mark)
                            </button>
                            <button
                              type="button"
                              className={`compare-btn ${uploadClassCount === 3 ? "active" : ""}`}
                              onClick={() => setUploadClassCount(3)}
                              style={{ flex: 1, padding: "5px 8px", fontSize: "11px", borderRadius: "4px" }}
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
                        >
                          <div className="upload-icon-box"></div>
                          <p className="upload-main-text">Drag & Drop model file here</p>
                          <p className="upload-sub-text">Imports as {uploadClassCount}-Class Model (.onnx, .tflite)</p>
                          <button className="select-file-btn" id="btn-select-file" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Select File</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Models table list */}
                  <div className="models-right-panel">
                    <div className="hmi-card models-list-card">
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <h3>REGISTERED AI MODELS</h3>
                          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Active System Mode: <strong style={{ color: "var(--color-info)" }}>{selectedClasses} Classes</strong></span>
                        </div>
                        <div className="model-class-toggle" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>Filter View:</span>
                          <button
                            className={`compare-btn ${modelFilter === "ALL" ? "active" : ""}`}
                            onClick={() => setModelFilter("ALL")}
                            style={{ padding: "3px 8px", fontSize: "10px", borderRadius: "4px" }}
                          >
                            All
                          </button>
                          <button
                            className={`compare-btn ${modelFilter === "2" ? "active" : ""}`}
                            onClick={() => setModelFilter("2")}
                            style={{ padding: "3px 8px", fontSize: "10px", borderRadius: "4px" }}
                          >
                            2 Classes Only
                          </button>
                          <button
                            className={`compare-btn ${modelFilter === "3" ? "active" : ""}`}
                            onClick={() => setModelFilter("3")}
                            style={{ padding: "3px 8px", fontSize: "10px", borderRadius: "4px" }}
                          >
                            3 Classes Only
                          </button>
                        </div>
                        <span className="pill-id">EDGE MEMORY</span>
                      </div>
                      <div className="card-body table-container">
                        <table className="history-table models-table">
                          <thead>
                            <tr>
                              <th>Model Name</th>
                              <th>Version</th>
                              <th>Engine</th>
                              <th>Size</th>
                              <th>Supported Classes</th>
                              <th>Accuracy</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody id="models-table-body">
                            {modelsList
                              .filter(m => modelFilter === "ALL" || String(m.classes || 3) === modelFilter)
                              .map((model, idx) => {
                                return (
                                  <tr key={idx} className={model.active ? "row-active-model" : ""}>
                                    <td className="font-mono">{model.name}</td>
                                    <td className="font-mono">{model.version || "v1.0.0"}</td>
                                    <td className="font-mono">{model.engine || "TFLite / NPU"}</td>
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
                                      <span className={`badge-result ${model.active ? "pass" : "warn"}`}>
                                        {model.active ? `ACTIVE RUNNING (${model.classes || 3}C)` : "INACTIVE"}
                                      </span>
                                    </td>
                                    <td>
                                      {model.active ? (
                                        <button className="action-btn-sm active-green" disabled>IN USE</button>
                                      ) : (
                                        <div style={{ display: "flex", gap: "6px" }}>
                                          <button
                                            className="action-btn-sm"
                                            onClick={() => handleActivateModel(model)}
                                            title={`Activate model on i.MX8 NPU and switch system mode to ${model.classes || 3} Classes`}
                                          >
                                            ACTIVATE ({model.classes || 3}C)
                                          </button>
                                          <button className="action-btn-sm delete-red" onClick={() => handleDeleteModel(model)}>DELETE</button>
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

            </main>
          </div>
        )}

        {/* ==============================================================================
            TAB CONTENT 4: CONFIGURATION & RECIPE STUDIO (Product_Settine & Machine_Setting)
            ============================================================================== */}
        {activeTab === "settings" && (
          <div className="tab-content active-tab" id="view-settings" style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Header & Quick Action Toolbar */}
            <div className="hmi-card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: "800", letterSpacing: "0.5px", margin: 0, color: "var(--text-main)" }}>
                  CONFIGURATION & RECIPE MANAGEMENT
                </h2>
                <div style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Upload and manage factory parameters (<span className="font-mono" style={{ color: "var(--color-info)", fontWeight: "bold" }}>Product_Settine.txt</span> & <span className="font-mono" style={{ color: "var(--color-info)", fontWeight: "bold" }}>Machine_Setting.txt</span>) with instant live binding
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {configUploadStatus && (
                  <div style={{ fontSize: "13.5px", fontWeight: "600", padding: "6px 14px", borderRadius: "6px", background: "rgba(14, 165, 233, 0.1)", border: "1px solid rgba(14, 165, 233, 0.25)", color: "var(--color-info)" }}>
                    {configUploadStatus}
                  </div>
                )}
                <button
                  className="select-file-btn"
                  onClick={fetchActiveConfig}
                  style={{ fontSize: "14px", padding: "8px 16px" }}
                >
                  ↻ Refresh
                </button>
                <button
                  className="select-file-btn"
                  onClick={() => handleApplyPreset("default_factory")}
                  style={{ fontSize: "14px", padding: "8px 16px", background: "rgba(16, 185, 129, 0.1)", borderColor: "rgba(16, 185, 129, 0.3)", color: "var(--color-pass)" }}
                >
                  Factory Default Preset
                </button>
              </div>
            </div>

            {/* Top Row: 2 Upload Dropzones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              
              {/* Dropzone 1: Product Recipe */}
              <div className="hmi-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>PRODUCT RECIPE CONFIG</h3>
                  </div>
                  <span className="badge-result pass font-mono" style={{ fontSize: "12px" }}>Product_Settine.txt</span>
                </div>

                <div
                  className="upload-drop-zone"
                  style={{ height: "160px", background: "rgba(255, 255, 255, 0.01)", border: "2px dashed var(--border-color)", borderRadius: "8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  onClick={() => document.getElementById("product-config-input").click()}
                >
                  <input
                    id="product-config-input"
                    type="file"
                    accept=".txt,.json"
                    style={{ display: "none" }}
                    onChange={handleProductUpload}
                  />
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                    {isUploadingProduct ? "Uploading..." : "Click or Drag Product_Settine.txt here"}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Supports Product_Settine.txt or recipe JSON files
                  </div>
                </div>
              </div>

              {/* Dropzone 2: Machine Setting */}
              <div className="hmi-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>MACHINE & STATION CONFIG</h3>
                  </div>
                  <span className="badge-result info font-mono" style={{ fontSize: "12px" }}>Machine_Setting.txt</span>
                </div>

                <div
                  className="upload-drop-zone"
                  style={{ height: "160px", background: "rgba(255, 255, 255, 0.01)", border: "2px dashed var(--border-color)", borderRadius: "8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                  onClick={() => document.getElementById("machine-config-input").click()}
                >
                  <input
                    id="machine-config-input"
                    type="file"
                    accept=".txt,.json"
                    style={{ display: "none" }}
                    onChange={handleMachineUpload}
                  />
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                    {isUploadingMachine ? "Uploading..." : "Click or Drag Machine_Setting.txt here"}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Supports Machine_Setting.txt or station JSON files
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Row: Active Parameters Visual Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

              {/* Card 1: Active Product Criteria */}
              <div className="hmi-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="card-header" style={{ padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                    ACTIVE AI INSPECTION CRITERIA
                  </h3>
                  <span className="badge-result pass">LIVE</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>FAIL DISTANCE (EDGE)</div>
                    <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--color-fail)", marginTop: "4px" }} className="font-mono">
                      {activeConfig?.computed?.failDistanceUm ?? 8.0} µm
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      edgeThreshold: {activeConfig?.product?.edgeThreshold ?? 8} / factor: {activeConfig?.product?.edgeConversionFactor ?? 1}
                    </div>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>MAX PROBEMARK AREA</div>
                    <div style={{ fontSize: "22px", fontWeight: "800", color: "var(--color-warn)", marginTop: "4px" }} className="font-mono">
                      {activeConfig?.computed?.maxAreaRatioPct ?? 25.0} %
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      areaRatioThreshold: {activeConfig?.product?.areaRatioThreshold ?? 25}%
                    </div>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>TARGET RESOLUTION</div>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }} className="font-mono">
                      {activeConfig?.computed?.targetWidth ?? 160} × {activeConfig?.computed?.targetHeight ?? 160} px
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Shape: {activeConfig?.product?.padShape ?? "rectangle"}
                    </div>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>INSPECTION ROI</div>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-info)", marginTop: "4px" }} className="font-mono">
                      {((activeConfig?.computed?.hRoi ?? 0.7) * 100).toFixed(0)}% H × {((activeConfig?.computed?.vRoi ?? 0.7) * 100).toFixed(0)}% V
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Noise Filter: Pad {activeConfig?.computed?.minAreaSizes?.[0] ?? 300}px, PM {activeConfig?.computed?.minAreaSizes?.[1] ?? 10}px
                    </div>
                  </div>
                </div>

                {/* Devices */}
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "8px", fontWeight: "600" }}>
                    SUPPORTED PRODUCT DEVICES ({activeConfig?.product?.devices?.length || 0}):
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {(activeConfig?.product?.devices || ["T073C3BTAA-PL211", "T073C3BTAA-PL2-PS16-PT-1"]).map((dev, i) => (
                      <span key={i} className="font-mono" style={{ fontSize: "12px", padding: "4px 8px", background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.2)", borderRadius: "4px", color: "var(--color-info)" }}>
                        {dev}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Active Machine & Filename Parsing Rules */}
              <div className="hmi-card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="card-header" style={{ padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
                    ACTIVE MACHINE & I/O SIMULATION
                  </h3>
                  <span className="badge-result info">STATION</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: "600" }}>PROBER SOURCE IMAGE FOLDER</div>
                    <div className="font-mono" style={{ fontSize: "14px", color: "var(--color-info)", marginTop: "3px" }}>
                      {activeConfig?.machine?.["lot.source.folder"] || "N:\\WP288\\PMI\\IMAGE"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Simulated on Linux: <span className="font-mono" style={{ color: "var(--text-main)" }}>{activeConfig?.computed?.simulatedSourceFolder || "/simulation/drive_N/WP288/PMI/IMAGE"}</span>
                    </div>
                  </div>

                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: "600" }}>MACHINE RESULT JUDGE FOLDER & FORMAT</div>
                    <div className="font-mono" style={{ fontSize: "14px", color: "var(--color-pass)", marginTop: "3px" }}>
                      {activeConfig?.machine?.["machine.result.folder"] || "N:\\WP288\\PMI\\JUDGE"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Format: <span className="font-mono" style={{ color: "var(--text-main)" }}>{activeConfig?.machine?.["machine.result.fileFormat"] || "{output.result}_{output.code}_{output.machine}_{output.ts}.txt"}</span>
                    </div>
                  </div>

                  {/* Filename Schema Indices */}
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "12.5px", color: "var(--text-muted)", fontWeight: "600", marginBottom: "6px" }}>
                      FILENAME INDEX SCHEMA MAPPING (UNDERSCORE DELIMITED)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px" }} className="font-mono">
                      <div>• Index 0: Process Time ({activeConfig?.machine?.["input.index.processTime"] ?? 0})</div>
                      <div>• Index 1: Wafer ID ({activeConfig?.machine?.["input.index.waferId"] ?? 1})</div>
                      <div>• Index 2: Die Coord ({activeConfig?.machine?.["input.index.siteCoordinate"] ?? 2})</div>
                      <div>• Index 3: Probecard ({activeConfig?.machine?.["input.index.probecardSite"] ?? 3})</div>
                      <div>• Index 4: Pad No ({activeConfig?.machine?.["input.index.padNo"] ?? 4})</div>
                      <div>• Index 6: Device Setup ({activeConfig?.machine?.["input.index.device"] ?? 6})</div>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* ==============================================================================
            SPLIT VIEW INSPECTION & HUMAN GRADING MODAL
            ============================================================================== */}
        {benchmarkSplitModalItem && (
          <div className="split-view-modal-backdrop" onClick={() => setBenchmarkSplitModalItem(null)}>
            <div className="split-view-modal-content" onClick={(e) => e.stopPropagation()}>
              
              {/* Modal Header */}
              <div className="split-view-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
                    SPLIT VIEW INSPECTION — {benchmarkSplitModalItem.image_name}
                  </h3>
                  <span className={`badge-result ${benchmarkSplitModalItem.ai_decision.toLowerCase()}`}>
                    AI: {benchmarkSplitModalItem.ai_decision}
                  </span>
                  {benchmarkSplitModalItem.human_decision !== "UNREVIEWED" && (
                    <span className={`badge-result ${benchmarkSplitModalItem.human_decision.toLowerCase()}`}>
                      HUMAN: {benchmarkSplitModalItem.human_decision}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button className="modal-nav-btn" onClick={handlePrevBenchmarkItem} title="Previous Image (Left Arrow)">
                    ◀ PREV <span className="hotkey-pill">←</span>
                  </button>
                  <span className="modal-counter-badge">
                    {benchmarkSplitModalIndex + 1} / {filteredBenchmarkResults.length || benchmarkResults.length}
                  </span>
                  <button className="modal-nav-btn" onClick={handleNextBenchmarkItem} title="Next Image (Right Arrow)">
                    NEXT ▶ <span className="hotkey-pill">→</span>
                  </button>
                  <button className="close-btn" onClick={() => setBenchmarkSplitModalItem(null)}>✕</button>
                </div>
              </div>

              {/* Modal Body: Split View Images + Diagnostic Specs */}
              <div className="split-view-body">
                
                {/* 1. RAW ORIGINAL IMAGE */}
                <div className="split-image-box">
                  <span className="split-image-tag">1. RAW OPTICAL DIE</span>
                  <img
                    src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
                    alt="Raw Wafer"
                  />
                </div>

                {/* 2. AI MASK OVERLAY & EDGE MEASUREMENT */}
                <div className="split-image-box">
                  <span className="split-image-tag">2. AI SEGMENTATION & DISTANCE RULE</span>
                  <img
                    src={resolveImageUrl(benchmarkSplitModalItem.annotated_image_url || benchmarkSplitModalItem.image_url)}
                    alt="AI Annotated"
                    onError={(e) => {
                      e.target.src = resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url);
                    }}
                  />
                </div>

                {/* 3. DIAGNOSTIC SPECIFICATIONS & HUMAN GRADING SIDEBAR */}
                <div className="split-sidebar">
                  <div>
                    <h4 style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                      RULE ENGINE DIAGNOSTICS
                    </h4>

                    {/* Edge Distance */}
                    <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Min Edge Distance:</span>
                        <strong className="font-mono" style={{ color: "var(--color-info)" }}>
                          {benchmarkSplitModalItem.min_edge_distance_um != null ? `${Number(benchmarkSplitModalItem.min_edge_distance_um).toFixed(1)} µm` : "-"}
                        </strong>
                      </div>
                    </div>

                    {/* Mark Area Ratio */}
                    <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Mark Area Ratio:</span>
                        <strong className="font-mono">
                          {benchmarkSplitModalItem.mark_area_ratio_pct != null ? `${Number(benchmarkSplitModalItem.mark_area_ratio_pct).toFixed(1)}%` : "-"}
                        </strong>
                      </div>
                    </div>

                    {/* Classes Count */}
                    <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px", fontSize: "11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>Pads Detected:</span>
                        <span className="font-mono">{benchmarkSplitModalItem.pads_count || 0}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Probe Marks:</span>
                        <span className="font-mono">{benchmarkSplitModalItem.marks_count || 0}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Grains / Defects:</span>
                        <span className="font-mono">{benchmarkSplitModalItem.grains_count || 0}</span>
                      </div>
                    </div>

                    {/* AI Latency */}
                    <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px", borderRadius: "6px", marginBottom: "6px", fontSize: "11px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--text-muted)" }}>NPU Inference:</span>
                        <strong className="font-mono" style={{ color: "var(--color-info)" }}>
                          {benchmarkSplitModalItem.inference_time_ms ? `${benchmarkSplitModalItem.inference_time_ms.toFixed(1)} ms` : "-"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                        <span style={{ color: "var(--text-muted)" }}>AI Confidence:</span>
                        <span className="font-mono">{benchmarkSplitModalItem.ai_confidence ? `${benchmarkSplitModalItem.ai_confidence.toFixed(1)}%` : "-"}</span>
                      </div>
                    </div>

                    {/* Violation Reason */}
                    <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "8px", borderRadius: "6px", marginBottom: "12px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>AI Diagnosis:</div>
                      <div style={{ fontSize: "11px", color: benchmarkSplitModalItem.ai_decision === "FAIL" ? "#ef4444" : "#10b981", fontWeight: "600", marginTop: "2px" }}>
                        {benchmarkSplitModalItem.ai_reason || "Within Normal Inspection Tolerance"}
                      </div>
                    </div>
                  </div>

                  {/* HUMAN REVIEW ACTION BUTTONS & HOTKEYS */}
                  <div>
                    <h4 style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                      HUMAN VERDICT (GROUND TRUTH)
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <button
                        className={`btn-human-pass ${benchmarkSplitModalItem.human_decision === "PASS" ? "active" : ""}`}
                        style={{ padding: "10px", fontSize: "13px", display: "flex", justifyContent: "center", alignItems: "center" }}
                        onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "PASS")}
                      >
                        <span>HUMAN PASS</span>
                        <span className="hotkey-pill" style={{ background: "rgba(0,0,0,0.2)" }}>KEY: P</span>
                      </button>
                      <button
                        className={`btn-human-fail ${benchmarkSplitModalItem.human_decision === "FAIL" ? "active" : ""}`}
                        style={{ padding: "10px", fontSize: "13px", display: "flex", justifyContent: "center", alignItems: "center" }}
                        onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "FAIL")}
                      >
                        <span>HUMAN FAIL</span>
                        <span className="hotkey-pill" style={{ background: "rgba(0,0,0,0.2)" }}>KEY: F</span>
                      </button>
                    </div>

                    <div style={{ fontSize: "9.5px", color: "var(--text-muted)", textAlign: "center", marginTop: "10px" }}>
                      Hotkeys: <span className="hotkey-pill">P</span> Pass | <span className="hotkey-pill">F</span> Fail | <span className="hotkey-pill">←</span> Prev | <span className="hotkey-pill">→</span> Next | <span className="hotkey-pill">Esc</span> Close
                    </div>
                  </div>

                </div>

              </div>

            </div>
          </div>
        )}

        {/* ==============================================================================
            FORMAL MODEL VALIDATION & QUALIFICATION REPORT MODAL
            ============================================================================== */}
        {benchmarkReportModalOpen && benchmarkReportData && (
          <div className="split-view-modal-backdrop" onClick={() => setBenchmarkReportModalOpen(false)}>
            <div className="split-view-modal-content benchmark-report-print-container formal-qualification-document" style={{ maxWidth: "880px" }} onClick={(e) => e.stopPropagation()}>
              
              {/* Formal Document Title & Letterhead */}
              <div className="formal-report-letterhead">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", width: "100%" }}>
                  <div>
                    <div className="formal-org-title">NXP SEMICONDUCTORS — WAFER QUALITY ASSURANCE LAB</div>
                    <h2 className="formal-doc-title">NEURAL NETWORK VALIDATION & COMPLIANCE REPORT</h2>
                    <div className="formal-doc-meta">
                      <span>Doc Ref: <strong>VAL-RPT-BM-{benchmarkReportData.session.id || "001"}</strong></span>
                      <span> | Standard: <strong>SEMI E10 / ISO-9001 QA Audit</strong></span>
                      <span> | Issued: <strong>{benchmarkReportData.summary.generated_at}</strong></span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className={`formal-verdict-box ${benchmarkReportData.summary.verdict.toLowerCase().replace(/[^a-z]/g, "-")}`}>
                      <div className="formal-verdict-sub">QUALIFICATION VERDICT</div>
                      <div className="formal-verdict-main">{benchmarkReportData.summary.verdict}</div>
                    </div>
                  </div>
                </div>
                <button className="close-btn no-print" onClick={() => setBenchmarkReportModalOpen(false)}>✕</button>
              </div>

              <div style={{ padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px" }}>
                
                {/* SECTION 1: EXECUTIVE SUMMARY & VALIDATION ENVIRONMENT */}
                <div className="formal-report-section">
                  <div className="formal-section-heading">
                    <span>1. EXECUTIVE SUMMARY & VALIDATION ENVIRONMENT</span>
                  </div>
                  <table className="formal-spec-table">
                    <tbody>
                      <tr>
                        <td className="formal-spec-label">Target Neural Model:</td>
                        <td className="formal-spec-val font-mono">{benchmarkReportData.session.model_name} (TFLite Edge Runtime)</td>
                        <td className="formal-spec-label">Dataset Archive:</td>
                        <td className="formal-spec-val">{benchmarkReportData.session.dataset_name}</td>
                      </tr>
                      <tr>
                        <td className="formal-spec-label">Inspection Population:</td>
                        <td className="formal-spec-val">{benchmarkReportData.session.total_images} dies (100% Sample Population)</td>
                        <td className="formal-spec-label">QA Audit Progress:</td>
                        <td className="formal-spec-val">
                          {benchmarkReportData.kpis.total_reviewed ?? 0} / {benchmarkReportData.session.total_images} dies (
                          {benchmarkReportData.session.total_images > 0
                            ? Math.round(((benchmarkReportData.kpis.total_reviewed ?? 0) / benchmarkReportData.session.total_images) * 100)
                            : 0}%)
                        </td>
                      </tr>
                      <tr>
                        <td className="formal-spec-label">AI Detected Yield:</td>
                        <td className="formal-spec-val">
                          {benchmarkReportData.kpis.ai_pass_count ?? 0} Golden Pass / {benchmarkReportData.kpis.ai_fail_count ?? 0} Defect Scrap ({Number(benchmarkReportData.kpis.ai_yield ?? 0).toFixed(2)}% Pass Rate)
                        </td>
                        <td className="formal-spec-label">Quality Baseline:</td>
                        <td className="formal-spec-val">Zero Underkill Tolerance (0.00% Defect Escape)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* SECTION 2: QUALITY COMPLIANCE & ACCURACY SPECIFICATIONS */}
                <div className="formal-report-section">
                  <div className="formal-section-heading">
                    <span>2. QUALITY COMPLIANCE & ACCURACY SPECIFICATIONS</span>
                  </div>
                  <table className="formal-data-table">
                    <thead>
                      <tr>
                        <th style={{ width: "38%" }}>Performance Metric</th>
                        <th style={{ width: "24%" }}>Measured Result</th>
                        <th style={{ width: "22%" }}>Quality Spec Limit</th>
                        <th style={{ width: "16%", textAlign: "center" }}>Compliance Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <strong>Underkill Rate (FN / Defect Escape)</strong>
                          <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Defective dies erroneously classified as Good</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: "bold" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0
                            ? "Pending QA Audit"
                            : `${Number(benchmarkReportData.kpis.underkill_rate ?? 0).toFixed(2)}% (${benchmarkReportData.kpis.underkill_count ?? 0} / ${benchmarkReportData.kpis.total_reviewed} dies)`}
                        </td>
                        <td className="font-mono">0.00% (Zero Escape)</td>
                        <td style={{ textAlign: "center" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0 ? (
                            <span className="formal-badge warn">PENDING AUDIT</span>
                          ) : benchmarkReportData.kpis.underkill_rate === 0 ? (
                            <span className="formal-badge pass">COMPLIANT</span>
                          ) : (
                            <span className="formal-badge fail">NON-COMPLIANT</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Overkill Rate (FP / False Scrap)</strong>
                          <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Good golden dies erroneously rejected as Defect</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: "bold" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0
                            ? "Pending QA Audit"
                            : `${Number(benchmarkReportData.kpis.overkill_rate ?? 0).toFixed(2)}% (${benchmarkReportData.kpis.overkill_count ?? 0} / ${benchmarkReportData.kpis.total_reviewed} dies)`}
                        </td>
                        <td className="font-mono">&lt; 3.00% (Yield Loss Limit)</td>
                        <td style={{ textAlign: "center" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0 ? (
                            <span className="formal-badge warn">PENDING AUDIT</span>
                          ) : benchmarkReportData.kpis.overkill_rate <= 3.0 ? (
                            <span className="formal-badge pass">COMPLIANT</span>
                          ) : (
                            <span className="formal-badge warn">YIELD WARNING</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>AI-Human Decision Concordance</strong>
                          <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>Overall agreement between AI Model & QA Expert Ground Truth</div>
                        </td>
                        <td className="font-mono" style={{ fontWeight: "bold" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0
                            ? "Pending QA Audit"
                            : `${Number(benchmarkReportData.kpis.agreement_rate ?? 0).toFixed(2)}% (${benchmarkReportData.kpis.agreement_count ?? 0} / ${benchmarkReportData.kpis.total_reviewed})`}
                        </td>
                        <td className="font-mono">&ge; 95.00% Concordance</td>
                        <td style={{ textAlign: "center" }}>
                          {benchmarkReportData.kpis.total_reviewed === 0 ? (
                            <span className="formal-badge warn">PENDING AUDIT</span>
                          ) : benchmarkReportData.kpis.agreement_rate >= 95.0 ? (
                            <span className="formal-badge pass">COMPLIANT</span>
                          ) : (
                            <span className="formal-badge warn">LOW AGREEMENT</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* SECTION 3: CONTINGENCY ANALYSIS (CONFUSION MATRIX) */}
                <div className="formal-report-section">
                  <div className="formal-section-heading">
                    <span>3. CONTINGENCY ANALYSIS (CONFUSION MATRIX)</span>
                  </div>
                  {benchmarkReportData.kpis.total_reviewed === 0 && (
                    <div className="no-print" style={{ fontSize: "11px", color: "var(--color-warn)", marginBottom: "8px", background: "rgba(245, 158, 11, 0.08)", padding: "8px 12px", borderRadius: "4px", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                      <strong>Audit Notice:</strong> Ground truth statistical metrics are derived upon QA grading of samples in the Human Review Station using the <strong>PASS (P)</strong> / <strong>FAIL (F)</strong> hotkeys.
                    </div>
                  )}
                  
                  {/* Formal 2x2 Matrix Table */}
                  <table className="formal-contingency-table">
                    <thead>
                      <tr>
                        <th colSpan="2" rowSpan="2" style={{ width: "35%", textAlign: "center", verticalAlign: "middle" }}>
                          CLASSIFICATION MATRIX
                        </th>
                        <th colSpan="2" style={{ textAlign: "center" }}>
                          QA Reference Ground Truth (Actual)
                        </th>
                      </tr>
                      <tr>
                        <th style={{ width: "32.5%", textAlign: "center" }}>CONFIRMED DEFECT (FAIL)</th>
                        <th style={{ width: "32.5%", textAlign: "center" }}>CONFIRMED GOLDEN (PASS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th rowSpan="2" style={{ width: "12%", textAlign: "center", verticalAlign: "middle" }}>
                          AI Model Decision
                        </th>
                        <td style={{ fontWeight: "bold" }}>
                          PREDICTED DEFECT (FAIL)
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>TRUE POSITIVE (TP)</div>
                          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#10b981", marginTop: "2px" }}>
                            {benchmarkReportData.kpis.confusion_matrix.tp}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>FALSE POSITIVE / OVERKILL (FP)</div>
                          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#f59e0b", marginTop: "2px" }}>
                            {benchmarkReportData.kpis.confusion_matrix.fp}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: "bold" }}>
                          PREDICTED GOLDEN (PASS)
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>FALSE NEGATIVE / UNDERKILL (FN)</div>
                          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#ef4444", marginTop: "2px" }}>
                            {benchmarkReportData.kpis.confusion_matrix.fn}
                          </div>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>TRUE NEGATIVE (TN)</div>
                          <div style={{ fontSize: "18px", fontWeight: "bold", color: "#0ea5e9", marginTop: "2px" }}>
                            {benchmarkReportData.kpis.confusion_matrix.tn}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Statistical Performance Indicators */}
                  <div className="formal-stats-summary-grid">
                    <div>
                      <span className="formal-stat-lbl">Defect Sensitivity (Recall):</span>
                      <strong className="font-mono">
                        {((benchmarkReportData.kpis.confusion_matrix.tp || 0) + (benchmarkReportData.kpis.confusion_matrix.fn || 0)) > 0
                          ? `${(((benchmarkReportData.kpis.confusion_matrix.tp || 0) / ((benchmarkReportData.kpis.confusion_matrix.tp || 0) + (benchmarkReportData.kpis.confusion_matrix.fn || 0))) * 100).toFixed(2)}%`
                          : "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span className="formal-stat-lbl">Golden Pass Specificity:</span>
                      <strong className="font-mono">
                        {((benchmarkReportData.kpis.confusion_matrix.tn || 0) + (benchmarkReportData.kpis.confusion_matrix.fp || 0)) > 0
                          ? `${(((benchmarkReportData.kpis.confusion_matrix.tn || 0) / ((benchmarkReportData.kpis.confusion_matrix.tn || 0) + (benchmarkReportData.kpis.confusion_matrix.fp || 0))) * 100).toFixed(2)}%`
                          : "N/A"}
                      </strong>
                    </div>
                    <div>
                      <span className="formal-stat-lbl">Defect Precision (PPV):</span>
                      <strong className="font-mono">
                        {((benchmarkReportData.kpis.confusion_matrix.tp || 0) + (benchmarkReportData.kpis.confusion_matrix.fp || 0)) > 0
                          ? `${(((benchmarkReportData.kpis.confusion_matrix.tp || 0) / ((benchmarkReportData.kpis.confusion_matrix.tp || 0) + (benchmarkReportData.kpis.confusion_matrix.fp || 0))) * 100).toFixed(2)}%`
                          : "N/A"}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* SECTION 4: ENGINEERING SIGN-OFF & APPROVAL */}
                <div className="formal-report-section">
                  <div className="formal-section-heading">
                    <span>4. ENGINEERING AUDIT & SIGN-OFF</span>
                  </div>
                  <div className="formal-signoff-grid">
                    <div className="formal-signoff-box">
                      <div><strong>Evaluated By:</strong> AI Quality Inspection Station (i.MX8 Edge Node)</div>
                      <div style={{ marginTop: "14px" }}><strong>Signature:</strong> ___________________________________</div>
                      <div style={{ marginTop: "6px" }}><strong>Date:</strong> {benchmarkReportData.summary.generated_at}</div>
                    </div>
                    <div className="formal-signoff-box">
                      <div><strong>Approved By:</strong> Lead QA / Process Quality Engineer</div>
                      <div style={{ marginTop: "14px" }}><strong>Signature:</strong> ___________________________________</div>
                      <div style={{ marginTop: "6px" }}><strong>Date:</strong> ____ / ____ / 2026</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                  <button className="select-file-btn" onClick={() => window.print()}>PRINT REPORT</button>
                  <button className="select-file-btn" style={{ background: "rgba(255, 255, 255, 0.1)" }} onClick={() => setBenchmarkReportModalOpen(false)}>CLOSE</button>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            HISTORICAL INSPECTION IMAGE PREVIEW MODAL
            ========================================== */}
        {selectedModalItem && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content-box hmi-card" onClick={(e) => e.stopPropagation()}>
              <div className="card-header modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <h3 style={{ margin: 0 }}>HISTORICAL INSPECTION</h3>
                  <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                    {selectedModalItem.decision}
                  </span>
                  {getActiveModalList().length > 0 && (
                    <span className="modal-counter-badge">
                      ( ภาพที่ {selectedModalIndex !== null ? selectedModalIndex + 1 : 1} / {getActiveModalList().length} )
                    </span>
                  )}
                </div>

                <button className="clear-history-btn" onClick={closeModal}>Close</button>
              </div>

              <div className="card-body modal-body-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "16px", padding: "16px" }}>
                <div className="modal-image-container" style={{ position: "relative", background: "#0b0f19", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "380px" }}>
                  {getActiveModalList().length > 1 && (
                    <>
                      <button
                        className="modal-nav-arrow left"
                        onClick={handlePrevModalItem}
                        title="Previous Image (Left Arrow)"
                      >
                        ◀
                      </button>
                      <button
                        className="modal-nav-arrow right"
                        onClick={handleNextModalItem}
                        title="Next Image (Right Arrow)"
                      >
                        ▶
                      </button>
                    </>
                  )}

                  {selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl ? (
                    <img
                      key={selectedModalItem.id + "_" + (selectedModalItem.imageUrl || "") + "_" + modalViewMode}
                      src={resolveImageUrl(
                        modalViewMode === "raw"
                          ? selectedModalItem.rawImageUrl || selectedModalItem.imageUrl
                          : modalViewMode === "annotated"
                            ? selectedModalItem.annotatedImageUrl || selectedModalItem.imageUrl
                            : selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl
                      )}
                      alt={selectedModalItem.id}
                      style={{ width: "100%", height: "auto", maxHeight: "450px", objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ padding: "30px", textAlign: "center", color: "var(--text-muted)" }}>
                      <div className="font-mono" style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-main)", marginBottom: "6px" }}>
                        WAFER IMAGE: WF_IMG_{selectedModalItem.id.replace("#WF-", "")}_{selectedModalItem.decision}.PNG
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-info)" }}>
                        AI Mask Overlay & Inspection Visual Stored in Edge NPU Memory
                      </div>
                    </div>
                  )}

                  <div className="modal-view-mode-group">
                    <button
                      className={`modal-view-btn ${modalViewMode === "split" ? "active" : ""}`}
                      onClick={() => setModalViewMode("split")}
                    >
                      Split Compare
                    </button>
                    <button
                      className={`modal-view-btn ${modalViewMode === "annotated" ? "active" : ""}`}
                      onClick={() => setModalViewMode("annotated")}
                    >
                      Annotated
                    </button>
                    <button
                      className={`modal-view-btn ${modalViewMode === "raw" ? "active" : ""}`}
                      onClick={() => setModalViewMode("raw")}
                    >
                      Raw Image
                    </button>
                  </div>
                </div>

                <div className="modal-meta-panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="model-meta-box" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="meta-row">
                      <span className="meta-lbl">Machine no:</span>
                      <span className="meta-val font-mono">{selectedModalItem.machineNo || "PROBER01"}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Wafer ID:</span>
                      <span className="meta-val font-mono">{selectedModalItem.id}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Time stamp:</span>
                      <span className="meta-val font-mono">{selectedModalItem.timestamp}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Result:</span>
                      <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>{selectedModalItem.decision}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Failure reason:</span>
                      <span className="meta-val font-mono" style={{ color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                        {selectedModalItem.reason || "-"}
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Batch:</span>
                      <span className="meta-val font-mono">{selectedModalItem.batch || "-"}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Datetime:</span>
                      <span className="meta-val font-mono">{selectedModalItem.dateTime || selectedModalItem.timestamp}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Site coordinate:</span>
                      <span className="meta-val font-mono">{selectedModalItem.xyCoord || "-"}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Probecard site:</span>
                      <span className="meta-val font-mono">{selectedModalItem.site || "-"}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Pad no.:</span>
                      <span className="meta-val font-mono">{selectedModalItem.pad || "-"}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Temp:</span>
                      <span className="meta-val font-mono">{selectedModalItem.temp || "-"}</span>
                    </div>
                  </div>

                  <button
                    className="override-btn active"
                    style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "bold", background: "var(--accent-blue)", color: "#fff", cursor: "pointer", borderRadius: "6px" }}
                    onClick={() => {
                      mapInspectionData(selectedModalItem);
                      setActiveTab("inspect");
                      closeModal();
                    }}
                  >
                    LOAD INTO LIVE VIEW
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
