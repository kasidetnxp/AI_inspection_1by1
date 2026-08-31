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

  const getDefaultEdgeIp = () => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("IMX8_EDGE_IP") : null;
    if (saved && saved !== "10.42.0.1" && saved !== "10.42.0.95") return saved;
    const hostname = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
    return (hostname === "0.0.0.0" || hostname === "::") ? "localhost" : hostname;
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

  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [dbType, setDbType] = useState("PostgreSQL");

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

  // Benchmark / Test Tab Pagination State (mirrors history pagination)
  const [benchmarkPage, setBenchmarkPage] = useState(1);
  const [benchmarkPageSize, setBenchmarkPageSize] = useState(25);

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
  const [modelsList, setModelsList] = useState([]);
  const [isModelConverting, setIsModelConverting] = useState(false);
  const [convertingModelName, setConvertingModelName] = useState("");

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
  const [benchmarkModalComment, setBenchmarkModalComment] = useState("");
  const [benchmarkReportModalOpen, setBenchmarkReportModalOpen] = useState(false);
  const [benchmarkReportData, setBenchmarkReportData] = useState(null);
  const [isBenchmarkStarting, setIsBenchmarkStarting] = useState(false);

  useEffect(() => {
    if (benchmarkSplitModalItem) {
      setBenchmarkModalComment(benchmarkSplitModalItem.notes || "");
    }
  }, [benchmarkSplitModalItem?.id, benchmarkSplitModalItem?.notes]);

  // Configuration Management State (Product_Settine & Machine_Setting)
  const [activeConfig, setActiveConfig] = useState({
    product: {},
    machine: {},
    computed: {}
  });
  const [configUploadStatus, setConfigUploadStatus] = useState("");
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isUploadingMachine, setIsUploadingMachine] = useState(false);

  // Settings State: Edge IP & Live Thresholds
  const [tempIp, setTempIp] = useState(edgeIp);
  const [saveIpSuccess, setSaveIpSuccess] = useState(false);
  const [pingResult, setPingResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [settingsFailDist, setSettingsFailDist] = useState(8.0);
  const [settingsMaxArea, setSettingsMaxArea] = useState(25.0);
  const [isSavingThresholds, setIsSavingThresholds] = useState(false);

  useEffect(() => {
    setTempIp(edgeIp);
  }, [edgeIp]);

  useEffect(() => {
    if (activeConfig?.computed) {
      if (activeConfig.computed.failDistanceUm != null) {
        setSettingsFailDist(Number(activeConfig.computed.failDistanceUm));
      }
      if (activeConfig.computed.maxAreaRatioPct != null) {
        setSettingsMaxArea(Number(activeConfig.computed.maxAreaRatioPct));
      }
    }
  }, [activeConfig]);

  const handleSaveIp = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const sanitized = tempIp.trim();
    if (!sanitized) return;
    updateEdgeIp(sanitized);
    setSaveIpSuccess(true);
    setTimeout(() => setSaveIpSuccess(false), 2500);
    handleTestPing(sanitized);
  };

  const handleTestPing = async (ipToTest) => {
    const target = (ipToTest || tempIp || edgeIp).trim();
    setIsPinging(true);
    setPingResult(null);
    try {
      const t0 = performance.now();
      const res = await fetch(`http://${target}:8001/api/models`, { signal: AbortSignal.timeout(3500) });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        setPingResult({ ok: true, message: `${latency} ms (Online)` });
      } else {
        setPingResult({ ok: false, message: `HTTP ${res.status}` });
      }
    } catch (err) {
      setPingResult({ ok: false, message: "Offline / Unreachable" });
    } finally {
      setIsPinging(false);
    }
  };

  const handleSaveThresholds = async () => {
    setIsSavingThresholds(true);
    try {
      const res = await fetch(`${apiBase}/api/config/update-thresholds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fail_distance_um: settingsFailDist,
          max_area_ratio_pct: settingsMaxArea
        })
      });
      const data = await res.json();
      if (res.ok) {
        setConfigUploadStatus(data.message || "Thresholds updated");
        fetchActiveConfig();
      } else {
        setConfigUploadStatus(data.message || "Failed updating thresholds");
      }
    } catch (err) {
      setConfigUploadStatus(`Error: ${err.message}`);
    } finally {
      setIsSavingThresholds(false);
    }
  };

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

  const totalBenchmarkPages = Math.max(1, Math.ceil(filteredBenchmarkResults.length / (benchmarkPageSize === "ALL" ? Math.max(1, filteredBenchmarkResults.length) : Number(benchmarkPageSize))));
  const effectiveBenchmarkPage = Math.min(benchmarkPage, totalBenchmarkPages);
  const paginatedBenchmarkResults = (benchmarkPageSize === "ALL")
    ? filteredBenchmarkResults
    : filteredBenchmarkResults.slice((effectiveBenchmarkPage - 1) * Number(benchmarkPageSize), effectiveBenchmarkPage * Number(benchmarkPageSize));

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
      // Ignore hotkeys when typing in text fields
      if (["INPUT", "TEXTAREA"].includes(e.target?.tagName)) {
        if (e.key === "Escape") {
          e.target.blur();
        }
        return;
      }

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
          handleSaveHumanReview(benchmarkSplitModalItem, "PASS", benchmarkModalComment);
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          handleSaveHumanReview(benchmarkSplitModalItem, "FAIL", benchmarkModalComment);
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
  }, [selectedModalItem, selectedModalIndex, benchmarkSplitModalItem, benchmarkSplitModalIndex, benchmarkResults, history, activeTab, analyticsFilter, analyticsBatchFilter, analyticsMachineFilter, filterSearch, benchmarkModalComment]);

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
        setBenchmarkResults(prev => prev.map(r => r.id === item.id ? { ...r, human_decision: decision, notes: notes } : r));
        if (benchmarkSplitModalItem && benchmarkSplitModalItem.id === item.id) {
          setBenchmarkSplitModalItem(prev => ({ ...prev, human_decision: decision, notes: notes }));
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
    const isPth = file.name.toLowerCase().endsWith(".pth") || file.name.toLowerCase().endsWith(".pt");
    const isTflite = file.name.toLowerCase().endsWith(".tflite");
    
    if (!isPth && !isTflite) {
      alert("รองรับเฉพาะไฟล์โมเดล .pth หรือ .tflite เท่านั้น");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsModelConverting(true);
    setConvertingModelName(file.name);

    fetch(`${apiBase}/api/models/upload`, {
      method: "POST",
      body: formData
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(d => { throw new Error(d.detail || `HTTP ${res.status}`); });
        }
        return res.json();
      })
      .then(data => {
        setIsModelConverting(false);
        const finalName = data.name || file.name;
        alert(`[UPLOAD SUCCESS] อัปโหลดโมเดล '${finalName}' สำเร็จ!\n\n${isPth ? "ระบบได้แปลงไฟล์เป็น TFLite (INT8) สำหรับรันบน NPU เรียบร้อยแล้ว" : ""}`);
        fetchModels();
      })
      .catch(err => {
        setIsModelConverting(false);
        console.error("Upload error:", err);
        alert(`เกิดข้อผิดพลาดในการอัปโหลด/แปลงโมเดล: ${err.message || err}`);
      });
  };

  const handleActivateModel = (model) => {
    fetch(`${apiBase}/api/models/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model.name })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        alert(`[NPU HOT-SWAP SUCCESS]\nModel '${model.name}' activated on i.MX8 NPU Delegate!`);
        fetchModels();
      })
      .catch(err => {
        console.error("Activation error:", err);
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
    const isSplit = compareMode !== "overlay";
    const baseW = isSplit ? 1200 : 600;
    const baseH = 600;

    canvas.width = baseW * dpr;
    canvas.height = baseH * dpr;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const drawDieContent = (c, showOverlays, targetW = 600, targetH = 600) => {
      if (!showOverlays && loadedRawImage) {
        c.drawImage(loadedRawImage, 0, 0, targetW, targetH);
        return;
      }
      if (showOverlays && loadedImage) {
        c.drawImage(loadedImage, 0, 0, targetW, targetH);
        return;
      }

      // Clean 'NO IMAGE AVAILABLE' placeholder when no real camera or file image is loaded
      c.fillStyle = isLight ? "#f8fafc" : "#0d0e15";
      c.fillRect(0, 0, targetW, targetH);

      if (filters.grid) {
        c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
        c.lineWidth = 1;
      }

      c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
      c.lineWidth = 2;
      const rl = 35, rPad = 18;
      c.beginPath(); c.moveTo(rPad, rPad + rl); c.lineTo(rPad, rPad); c.lineTo(rPad + rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, rPad + rl); c.lineTo(targetW - rPad, rPad); c.lineTo(targetW - rPad - rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(rPad, targetH - rPad - rl); c.lineTo(rPad, targetH - rPad); c.lineTo(rPad + rl, targetH - rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, targetH - rPad - rl); c.lineTo(targetW - rPad, targetH - rPad); c.lineTo(targetW - rPad - rl, targetH - rPad); c.stroke();

      // Standby indicator in center
      c.fillStyle = isLight ? "#94a3b8" : "#475569";
      c.font = "600 13px 'Inter', sans-serif";
      c.textAlign = "center";
      c.fillText("STANDBY • WAITING FOR PROBER SCAN", targetW / 2, targetH / 2);
    };

    if (compareMode === "overlay") {
      drawDieContent(ctx, true, 600, 600);
    } else {
      // Split mode: 1200 x 600
      ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(600, 600); ctx.stroke();

      const paneSize = 530;
      const leftX = (600 - paneSize) / 2;
      const rightX = 600 + (600 - paneSize) / 2;
      const topY = 50;

      // Header Labels
      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "bold 16px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RAW CAMERA FEED", 300, 32);

      ctx.save();
      ctx.translate(leftX, topY);
      drawDieContent(ctx, false, paneSize, paneSize);
      ctx.restore();

      ctx.fillStyle = "var(--color-info)";
      ctx.font = "bold 16px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AI SEGMENTATION", 900, 32);

      ctx.save();
      ctx.translate(rightX, topY);
      drawDieContent(ctx, true, paneSize, paneSize);
      ctx.restore();
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
              <img
                src="/nxp_logo.webp"
                alt="NXP Semiconductors"
                className="brand-logo"
              />
              <span className="brand-subtitle">iMX8 AI INSPECTION</span>
            </div>
          </div>

          <nav className="header-nav">
            <button className={`nav-tab ${activeTab === "inspect" ? "active" : ""}`} onClick={() => setActiveTab("inspect")}>INSPECT</button>
            <button className={`nav-tab ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>HISTORY</button>
            <button className={`nav-tab ${activeTab === "models" ? "active" : ""}`} onClick={() => { setActiveTab("models"); setBenchmarkActiveSubTab("hub"); }}>MODELS</button>
            <button className={`nav-tab ${activeTab === "settings" ? "active" : ""}`} onClick={() => { setActiveTab("settings"); fetchActiveConfig(); }}>SETTINGS</button>
          </nav>

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
                </div>
                <div className="card-body">
                  <div className="metric-list">
                    <div className="metric-row">
                      <span className="met-label">Machine No.</span>
                      <span className="met-value font-mono highlight-blue" id="val-machine">{currentInspection.machine || "PROBER01"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Batch / Wafer</span>
                      <span className="met-value font-mono" id="val-batch">{currentInspection.batch && currentInspection.batch !== "-" ? currentInspection.batch : "-"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Pad / Site</span>
                      <span className="met-value font-mono" id="val-pad-site">
                        {currentInspection.pad && currentInspection.pad !== "-" ? `${currentInspection.pad} / ${currentInspection.site || '-'}` : "-"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">XY Coord</span>
                      <span className="met-value font-mono" id="val-xy">{currentInspection.xyCoord || "-"}</span>
                    </div>
                    <div className="metric-row">
                      <span className="met-label">Temp</span>
                      <span className="met-value font-mono highlight-orange" id="val-temp">{currentInspection.temp ? (currentInspection.temp.includes("°C") ? currentInspection.temp : `${currentInspection.temp}°C`) : "-"}</span>
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
                  <canvas ref={canvasRef} id="wafer-canvas" className={compareMode === "overlay" ? "overlay-mode" : "split-mode"}></canvas>
                  <div ref={scannerRef} className="scanning-bar" id="scanner-line"></div>
                </div>

                {/* Live Telemetry Status Bar */}
                <div className="card-footer live-status-bar">
                  <div className="status-indicator">
                    <span className={`status-dot ${isBackendConnected ? "green-glow" : "offline"}`}></span>
                    <span>{isBackendConnected ? "EDGE NPU ONLINE" : "EDGE NPU OFFLINE"}</span>
                  </div>
                  <div className="live-telemetry">
                    <span>INFERENCE: {modelsList.find(m => m.active)?.name || "PyTorch UNet"} + Rule Engine</span>
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
                      <span className="meta-val font-mono highlight-green" id="active-model-name" title={modelsList.find(m => m.active)?.name || "unet_pytorch_new.pth"}>
                        {modelsList.find(m => m.active)?.name || "unet_pytorch_new.pth"}
                      </span>
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
                      <div className="sub-stat blue-text">
                        <span className="lbl">YIELD</span>
                        <span className="val font-mono" id="stat-yield">{yieldRate}%</span>
                      </div>
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

                {/* Actions: Export & Clear */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
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
              <div className="analytics-dashboard-grid">
                {/* Left side: KPIs + Donut + Defect Bar */}
                <div className="analytics-dashboard-col left-dashboard-col">
                  <div className="analytics-kpi-subgrid">
                    <div className="analytics-stat-card span-full">
                      <span className="stat-lbl">Processed Wafers</span>
                      <span className="stat-val font-mono" id="an-total-inspected">{history.length}</span>
                    </div>
                    <div className="analytics-stat-card card-green">
                      <span className="stat-lbl">Yield Rate (Pass)</span>
                      <span className="stat-val font-mono" id="an-yield-rate">
                        {(history.length > 0 ? (history.filter(h => h.decision === "PASS").length / history.length) * 100 : 0).toFixed(2)}%
                      </span>
                      <span className="stat-sub font-mono">
                        ({history.filter(h => h.decision === "PASS").length})
                      </span>
                    </div>
                    <div className="analytics-stat-card card-red">
                      <span className="stat-lbl">Defect Rate (Fail)</span>
                      <span className="stat-val font-mono" id="an-defect-rate">
                        {(history.length > 0 ? (history.filter(h => h.decision !== "PASS").length / history.length) * 100 : 0).toFixed(2)}%
                      </span>
                      <span className="stat-sub font-mono">
                        ({history.filter(h => h.decision !== "PASS").length})
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

                {/* Right side: Table with Full Height */}
                <div className="analytics-dashboard-col right-dashboard-col">
                  <div className="hmi-card analytics-table-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
                    <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3>DETAILED PRODUCTION RECORDS</h3>
                      <span className="pill-id" id="report-row-count">{filteredHistory.length} Records</span>
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
                              </tr>
                            );
                          })}
                          {paginatedHistory.length === 0 && (
                            <tr>
                              <td colSpan="9" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "14px" }}>
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
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>MODEL:</span>
                      <span className="badge-result pass font-mono" style={{ fontSize: "11px", fontWeight: "700" }}>
                        {benchmarkModel || "unet.tflite"}
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
                      title="Back to Models Hub"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 14L4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H4" />
                      </svg>
                    </button>
                    <span className="subnav-current-title">
                      {benchmarkActiveSubTab === "registry" ? "UPLOAD" : "TEST"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>MODEL:</span>
                    <span className="badge-result pass font-mono" style={{ fontSize: "11px", fontWeight: "700" }}>
                      {benchmarkModel || "unet.tflite"}
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
                        <span className="kpi-title">OVERKILL RATE</span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val" style={{ color: (benchmarkKpis.overkill_rate || 0) > 3 ? "var(--color-warn)" : "inherit" }}>
                          {Number(benchmarkKpis.overkill_rate ?? 0).toFixed(1)}%
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
                          {Number(benchmarkKpis.underkill_rate ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* True Yield vs AI Yield */}
                    <div className="kpi-card">
                      <div className="kpi-header">
                        <span className="kpi-title">YIELD BENCHMARK</span>
                      </div>
                      <div className="kpi-value-row">
                        <span className="kpi-main-val">{Number(benchmarkKpis.true_yield ?? 0).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. TWO-COLUMN MAIN WORKSPACE */}
                  <div className="validation-main-grid">

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

                          {/* Task Status Monitor */}
                          <div className="priority-queue-card" style={{ padding: "14px 16px" }}>
                            <div className="priority-header" style={{ fontSize: "14px" }}>
                              <span>TASK STATUS</span>
                              <span style={{ fontSize: "13px", fontWeight: "700", color: benchmarkProgress.status === "RUNNING" ? "#38bdf8" : "var(--text-muted)" }}>
                                {isBenchmarkStarting ? "UPLOADING..." : benchmarkProgress.status}
                              </span>
                            </div>

                            {benchmarkProgress.p0_pending > 0 && benchmarkProgress.status === "RUNNING" && (
                              <div className="priority-warning-banner" style={{ fontSize: "13px", padding: "8px 12px" }}>
                                ⏳ กำลังรอ — เครื่อง Prober กำลังประมวลผลภาพอยู่ การ Validation จะทำต่อโดยอัตโนมัติ
                              </div>
                            )}

                            <div className="priority-progress-bar" style={{ marginTop: "8px", height: "8px" }}>
                              <div
                                className="priority-progress-fill"
                                style={{
                                  width: `${(benchmarkProgress.p1_total || benchmarkProgress.total || 0) > 0 
                                    ? Math.min(100, Math.round(((benchmarkProgress.p1_processed || benchmarkProgress.processed || 0) / (benchmarkProgress.p1_total || benchmarkProgress.total || 1)) * 100)) 
                                    : 0}%`
                                }}
                              ></div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-muted)", marginTop: "6px" }}>
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
                          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                            {benchmarkProgress.status === "PAUSED" ? (
                              <>
                                <button
                                  type="button"
                                  className="btn-resume-benchmark"
                                  style={{ flex: 1, padding: "12px 16px", fontSize: "15px" }}
                                  onClick={handleResumeBenchmark}
                                >
                                  ▶ RESUME BENCHMARK
                                </button>
                                <button
                                  type="button"
                                  className="btn-stop-benchmark"
                                  style={{ padding: "12px 16px", fontSize: "15px" }}
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
                                  style={{ flex: 1, padding: "12px 16px", fontSize: "15px" }}
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
                                    style={{ padding: "12px 16px", fontSize: "15px" }}
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
                                    style={{ padding: "12px 16px", fontSize: "15px" }}
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
                                onClick={() => { setBenchmarkFilter("ALL"); setBenchmarkPage(1); }}
                              >
                                All ({benchmarkKpis.total_tested || benchmarkResults.length})
                              </button>
                              <button
                                className={`review-filter-btn warn ${benchmarkFilter === "DISAGREEMENT" ? "active" : ""}`}
                                style={{ fontSize: "14px", padding: "7px 14px" }}
                                onClick={() => { setBenchmarkFilter("DISAGREEMENT"); setBenchmarkPage(1); }}
                              >
                                Disagreements ({(benchmarkKpis.overkill_count || 0) + (benchmarkKpis.underkill_count || 0)})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "UNREVIEWED" ? "active" : ""}`}
                                style={{ fontSize: "14px", padding: "7px 14px" }}
                                onClick={() => { setBenchmarkFilter("UNREVIEWED"); setBenchmarkPage(1); }}
                              >
                                Pending Review ({benchmarkKpis.unreviewed_count ?? 0})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "HUMAN_PASS" ? "active" : ""}`}
                                style={{ fontSize: "14px", padding: "7px 14px" }}
                                onClick={() => { setBenchmarkFilter("HUMAN_PASS"); setBenchmarkPage(1); }}
                              >
                                Human PASS ({benchmarkKpis.human_pass_count ?? 0})
                              </button>
                              <button
                                className={`review-filter-btn ${benchmarkFilter === "HUMAN_FAIL" ? "active" : ""}`}
                                style={{ fontSize: "14px", padding: "7px 14px" }}
                                onClick={() => { setBenchmarkFilter("HUMAN_FAIL"); setBenchmarkPage(1); }}
                              >
                                Human FAIL ({benchmarkKpis.human_fail_count ?? 0})
                              </button>
                            </div>

                            {/* Search & Batch Action Helpers */}
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                                <input
                                  type="text"
                                  className="hmi-search-input"
                                  placeholder="Search Wafer ID / Reason..."
                                  value={benchmarkSearch}
                                  onChange={(e) => { setBenchmarkSearch(e.target.value); setBenchmarkPage(1); }}
                                  style={{
                                    padding: "6px 10px",
                                    paddingRight: benchmarkSearch ? "26px" : "10px",
                                    fontSize: "14px",
                                    borderRadius: "4px",
                                    width: "210px"
                                  }}
                                />
                                {benchmarkSearch && (
                                  <button
                                    onClick={() => { setBenchmarkSearch(""); setBenchmarkPage(1); }}
                                    style={{
                                      position: "absolute",
                                      right: "6px",
                                      background: "none",
                                      border: "none",
                                      color: "var(--text-muted)",
                                      cursor: "pointer",
                                      fontSize: "14px",
                                      padding: "0 2px"
                                    }}
                                    title="Clear search"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                              <button
                                className="review-action-btn"
                                style={{ fontSize: "13px", padding: "6px 12px" }}
                                onClick={() => handleBatchReview("MARK_UNREVIEWED_PASS")}
                                title="Set all unreviewed items to PASS"
                              >
                                Mark All PASS
                              </button>
                              <button
                                className="review-action-btn"
                                style={{ fontSize: "13px", padding: "6px 12px" }}
                                onClick={() => handleBatchReview("MARK_UNREVIEWED_FAIL")}
                                title="Set all unreviewed items to FAIL"
                              >
                                Mark All FAIL
                              </button>
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
                                {filteredBenchmarkResults.length === 0 ? (
                                  <tr>
                                    <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)", fontSize: "15px" }}>
                                      {benchmarkProgress.status === "RUNNING"
                                        ? "Processing benchmark images on i.MX8 NPU... Results will stream in real-time."
                                        : "No matching benchmark validation results found."}
                                    </td>
                                  </tr>
                                ) : (
                                  paginatedBenchmarkResults.map((item, idx) => {
                                    const absoluteIndex = (effectiveBenchmarkPage - 1) * (benchmarkPageSize === "ALL" ? filteredBenchmarkResults.length : Number(benchmarkPageSize)) + idx;
                                    const isDisagreement = item.human_decision !== "UNREVIEWED" && item.human_decision !== item.ai_decision;
                                    const isOverkill = item.ai_decision === "FAIL" && item.human_decision === "PASS";
                                    const isUnderkill = item.ai_decision === "PASS" && item.human_decision === "FAIL";

                                    return (
                                      <tr
                                        key={item.id || absoluteIndex}
                                        onClick={() => {
                                          setBenchmarkSplitModalItem(item);
                                          setBenchmarkSplitModalIndex(absoluteIndex);
                                        }}
                                        title="Click to view Split Inspection View"
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
                                              setBenchmarkSplitModalIndex(absoluteIndex);
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
                                              setBenchmarkSplitModalIndex(absoluteIndex);
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
                                                setBenchmarkSplitModalIndex(absoluteIndex);
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

                          {/* Pagination Footer (Mirrors History Table) */}
                          <div className="table-pagination-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.03)", flexWrap: "wrap", gap: "10px", fontSize: "13.5px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                              <span>
                                Showing <strong>{filteredBenchmarkResults.length === 0 ? 0 : (effectiveBenchmarkPage - 1) * (benchmarkPageSize === "ALL" ? filteredBenchmarkResults.length : Number(benchmarkPageSize)) + 1}</strong> - <strong>{Math.min(effectiveBenchmarkPage * (benchmarkPageSize === "ALL" ? filteredBenchmarkResults.length : Number(benchmarkPageSize)), filteredBenchmarkResults.length)}</strong> of <strong>{filteredBenchmarkResults.length}</strong>
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>Page Size:</span>
                                <select
                                  value={benchmarkPageSize}
                                  onChange={(e) => { setBenchmarkPageSize(e.target.value === "ALL" ? "ALL" : Number(e.target.value)); setBenchmarkPage(1); }}
                                  style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13.5px" }}
                                >
                                  <option value={15}>15</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                  <option value="ALL">All ({filteredBenchmarkResults.length})</option>
                                </select>
                              </div>
                            </div>

                            {benchmarkPageSize !== "ALL" && totalBenchmarkPages > 1 && (
                              <div className="pagination-btn-group" style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                                <button className="pagination-nav-btn" disabled={effectiveBenchmarkPage <= 1} onClick={() => setBenchmarkPage(1)} title="First Page">⏮</button>
                                <button className="pagination-nav-btn" disabled={effectiveBenchmarkPage <= 1} onClick={() => setBenchmarkPage(p => Math.max(1, p - 1))} title="Previous Page">◀</button>
                                <span style={{ padding: "0 6px", fontWeight: "bold" }}>Page {effectiveBenchmarkPage} of {totalBenchmarkPages}</span>
                                <button className="pagination-nav-btn" disabled={effectiveBenchmarkPage >= totalBenchmarkPages} onClick={() => setBenchmarkPage(p => Math.min(totalBenchmarkPages, p + 1))} title="Next Page">▶</button>
                                <button className="pagination-nav-btn" disabled={effectiveBenchmarkPage >= totalBenchmarkPages} onClick={() => setBenchmarkPage(totalBenchmarkPages)} title="Last Page">⏭</button>
                              </div>
                            )}
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
                              <div className="upload-icon-box"></div>
                              <p className="upload-main-text">Drag & Drop model file here</p>
                              <p className="upload-sub-text">Accepts .pth (Auto-converts to TFLite) or .tflite</p>
                              <button
                                className="select-file-btn"
                                id="btn-select-file"
                                type="button"
                                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                              >
                                Select File
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Models table list */}
                  <div className="models-right-panel">
                    <div className="hmi-card models-list-card">
                      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <h3 style={{ margin: 0 }}>REGISTERED AI MODELS</h3>
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
                              return (
                                <tr key={idx} className={model.active ? "row-active-model" : ""}>
                                  <td className="font-mono" style={{ fontWeight: "600" }}>{model.name}</td>
                                  <td className="font-mono">{model.version || "v1.0.0"}</td>
                                  <td className="font-mono">{model.size || "-"}</td>
                                  <td>
                                    <span className={`badge-result ${model.active ? "pass" : "warn"}`}>
                                      {model.active ? "ACTIVE RUNNING" : "INACTIVE"}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: "center" }}>
                                    {model.active ? (
                                      <button className="action-btn-sm active-green" disabled>IN USE</button>
                                    ) : (
                                      <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                        <button
                                          className="action-btn-sm"
                                          onClick={() => handleActivateModel(model)}
                                          title={`Activate ${model.name} on i.MX8 NPU`}
                                        >
                                          ACTIVATE
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
            TAB CONTENT 4: SYSTEM SETTINGS & RECIPE
            ============================================================================== */}
        {activeTab === "settings" && (
          <div className="tab-content active-tab" id="view-settings" style={{ padding: "24px 28px", maxWidth: "1500px", margin: "0 auto", overflowY: "auto", display: "flex", flexDirection: "column", gap: "24px", width: "100%", boxSizing: "border-box" }}>
            
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

            </div>

          </div>
        )}

        {/* ==============================================================================
            SPLIT VIEW INSPECTION & HUMAN GRADING MODAL
            ============================================================================== */}
        {benchmarkSplitModalItem && (() => {
          // Extract batch, wafer, xy, pad, site, timestamp from image filename
          const parseSplitMeta = (filename = "") => {
            if (!filename) return { batch: "-", waferNo: "-", pad: "-", site: "-", xy: "-", dateTime: "-" };
            const clean = filename.replace(/\.(bmp|png|jpg|jpeg)$/i, "")
              .replace(/^(raw_|annotated_|inspect_)+/i, "")
              .replace(/(_mask_result|_inspect|_annotated|_raw|_result)+$/i, "");
            const parts = clean.split("_");

            let batch = "-";
            let waferNo = "-";
            let xy = "-";
            let site = "-";
            let pad = "-";
            let dateTime = "-";

            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              if (!part) continue;

              // 1. Process Time: 14-digit or 8-digit timestamp (e.g. 20260813155201)
              if (/^\d{14}$/.test(part)) {
                dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)} ${part.slice(8, 10)}:${part.slice(10, 12)}:${part.slice(12, 14)}`;
                continue;
              }
              if (/^\d{8}$/.test(part) && i === 0) {
                dateTime = `${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)}`;
                continue;
              }

              // 2. Coordinate: X...Y... (e.g. X68Y5)
              if (/^X-?\d+Y-?\d+$/i.test(part)) {
                xy = part;
                continue;
              }

              // 3. Site: S... (e.g. S2, S14)
              if (/^S\d+$/i.test(part)) {
                site = part.replace(/^S/i, "Site ");
                continue;
              }

              // 4. Pad: P... (e.g. P6, P25)
              if (/^P\d+$/i.test(part)) {
                pad = part.replace(/^P/i, "Pad ");
                continue;
              }

              // 5. Inspection status keyword (OK, NG, PASS, FAIL, REJECT)
              if (/^(OK|NG|PASS|FAIL|REJECT)$/i.test(part)) {
                continue;
              }

              // 6. Temperature (2-3 digit number at end, e.g. 300)
              if (/^\d{2,3}$/.test(part) && i === parts.length - 1) {
                continue;
              }

              // 7. Wafer ID / Batch identifier (e.g. SUC720-15F0, C01W02, BATCH123)
              if (batch === "-") {
                waferNo = part;
                if (part.includes("-")) {
                  batch = part.split("-")[0];
                } else {
                  const m = part.match(/^([A-Z0-9]+?)(W[A-Z0-9]+)$/i);
                  batch = m ? m[1] : part;
                }
              }
            }

            // Fallback for standard position: parts[1] is wafer/batch if not assigned
            if (batch === "-" && parts.length > 1 && parts[1]) {
              const part = parts[1];
              waferNo = part;
              batch = part.includes("-") ? part.split("-")[0] : part;
            }

            return { batch, waferNo, xy, site, pad, dateTime };
          };

          const splitMeta = parseSplitMeta(benchmarkSplitModalItem.image_name);
          const activeModelName = (modelsList && modelsList.find((m) => m.is_active)?.name) || benchmarkModel || "unet_pytorch_new.pth";

          return (
            <div className="split-view-modal-backdrop" onClick={() => setBenchmarkSplitModalItem(null)}>
              <div
                className="split-view-modal-content hmi-card"
                style={{
                  width: "1340px",
                  maxWidth: "96vw",
                  height: "720px",
                  maxHeight: "94vh",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div
                  className="card-header split-view-header"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 18px",
                    borderBottom: "1px solid var(--border-color)",
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
                      SPLIT VIEW INSPECTION — <span className="font-mono">{benchmarkSplitModalItem.image_name}</span>
                    </h3>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {(filteredBenchmarkResults.length > 1 || benchmarkResults.length > 1) && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          className="modal-nav-btn"
                          onClick={handlePrevBenchmarkItem}
                          title="Previous Image"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                        >
                          ◀ PREV
                        </button>
                        <span className="modal-counter-badge" style={{ fontSize: "11px", minWidth: "60px", textAlign: "center" }}>
                          {benchmarkSplitModalIndex + 1} / {filteredBenchmarkResults.length || benchmarkResults.length}
                        </span>
                        <button
                          className="modal-nav-btn"
                          onClick={handleNextBenchmarkItem}
                          title="Next Image"
                          style={{ padding: "4px 12px", fontSize: "12px" }}
                        >
                          NEXT ▶
                        </button>
                      </div>
                    )}
                    <button
                      className="clear-history-btn"
                      style={{ marginLeft: "8px", padding: "4px 12px", fontSize: "12px" }}
                      onClick={() => setBenchmarkSplitModalItem(null)}
                      title="Close modal"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Modal Body: Split View Images with Slider Arrows + Right Sidebar */}
                <div
                  className="card-body split-view-body"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 340px",
                    gap: "16px",
                    padding: "16px",
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden"
                  }}
                >
                  {/* LEFT: 2 SPLIT IMAGES VIEWPORT WITH FLOATING ARROWS */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                      height: "100%",
                      minHeight: 0,
                      position: "relative"
                    }}
                  >
                    {/* Floating Prev / Next Slider Arrows */}
                    {(filteredBenchmarkResults.length > 1 || benchmarkResults.length > 1) && (
                      <>
                        <button
                          className="modal-nav-arrow left"
                          onClick={handlePrevBenchmarkItem}
                          title="Previous Image"
                        >
                          ◀
                        </button>
                        <button
                          className="modal-nav-arrow right"
                          onClick={handleNextBenchmarkItem}
                          title="Next Image"
                        >
                          ▶
                        </button>
                      </>
                    )}

                    {/* 1. RAW ORIGINAL IMAGE */}
                    <div className="split-image-box">
                      <span className="split-image-tag">1. RAW OPTICAL DIE</span>
                      <img
                        src={resolveImageUrl(benchmarkSplitModalItem.raw_image_url || benchmarkSplitModalItem.image_url)}
                        alt="Raw Wafer"
                      />
                    </div>

                    {/* 2. AI SEGMENTATION & DISTANCE RULE */}
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
                  </div>

                  {/* RIGHT: METADATA & HUMAN REVIEW PANEL */}
                  <div
                    className="split-sidebar"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      minHeight: 0
                    }}
                  >
                    <div
                      className="model-meta-box"
                      style={{
                        flex: 1,
                        minHeight: 0,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        padding: "14px",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color)"
                      }}
                    >
                      {/* Image & Location Info */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Machine no:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.machineNo || "PROBER01"}
                        </span>
                      </div>
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Batch:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {splitMeta.batch}
                        </span>
                      </div>
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Pad / Site:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {splitMeta.pad !== "-" || splitMeta.site !== "-" ? `${splitMeta.pad} / ${splitMeta.site}` : "-"}
                        </span>
                      </div>
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Site coordinate:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {splitMeta.xy}
                        </span>
                      </div>

                      <div style={{ height: "1px", background: "var(--border-color)", margin: "1px 0" }} />

                      {/* Inspection Results */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                        <span className={`badge-result ${(benchmarkSplitModalItem.ai_decision || "PASS").toLowerCase()}`}>
                          {benchmarkSplitModalItem.ai_decision || "PASS"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Reason:</span>
                        <span
                          className="meta-val font-mono"
                          style={{
                            textAlign: "right",
                            wordBreak: "break-word",
                            color: benchmarkSplitModalItem.ai_reason && benchmarkSplitModalItem.ai_reason !== "-" && benchmarkSplitModalItem.ai_decision === "FAIL" ? "var(--color-fail)" : "inherit",
                            fontWeight: "600"
                          }}
                        >
                          {benchmarkSplitModalItem.ai_reason || "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Min Edge Distance:</span>
                        <span
                          className="meta-val font-mono"
                          style={{
                            textAlign: "right",
                            color:
                              benchmarkSplitModalItem.min_edge_distance_um !== null &&
                              benchmarkSplitModalItem.min_edge_distance_um !== undefined &&
                              benchmarkSplitModalItem.min_edge_distance_um < (benchmarkRules?.fail_distance_um || 8.0)
                                ? "var(--color-fail)"
                                : "var(--color-info)",
                            fontWeight: "600"
                          }}
                        >
                          {benchmarkSplitModalItem.min_edge_distance_um !== null && benchmarkSplitModalItem.min_edge_distance_um !== undefined
                            ? `${Number(benchmarkSplitModalItem.min_edge_distance_um).toFixed(1)} µm`
                            : "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Mark Area Ratio:</span>
                        <span className="meta-val font-mono" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.mark_area_ratio_pct !== null && benchmarkSplitModalItem.mark_area_ratio_pct !== undefined
                            ? `${Number(benchmarkSplitModalItem.mark_area_ratio_pct).toFixed(1)}%`
                            : "-"}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Model:</span>
                        <span className="meta-val font-mono highlight-green" style={{ textAlign: "right" }}>
                          {activeModelName}
                        </span>
                      </div>

                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Time Inference:</span>
                        <span className="meta-val font-mono highlight-blue" style={{ textAlign: "right" }}>
                          {benchmarkSplitModalItem.inference_time_ms !== null && benchmarkSplitModalItem.inference_time_ms !== undefined
                            ? `${Number(benchmarkSplitModalItem.inference_time_ms).toFixed(1)} ms`
                            : "-"}
                        </span>
                      </div>

                      <div style={{ height: "1px", background: "var(--border-color)", margin: "1px 0" }} />

                      {/* Human Decision Section */}
                      <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="meta-lbl" style={{ flexShrink: 0 }}>Human Decision:</span>
                        {benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED" ? (
                          <span className={`badge-result ${benchmarkSplitModalItem.human_decision.toLowerCase()}`}>
                            {benchmarkSplitModalItem.human_decision}
                          </span>
                        ) : (
                          <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            UNREVIEWED
                          </span>
                        )}
                      </div>

                      {/* Human Decision Action Buttons (Clean PASS / FAIL without hotkey pills) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "2px" }}>
                        <button
                          type="button"
                          className={`btn-human-pass ${benchmarkSplitModalItem.human_decision === "PASS" ? "active" : ""}`}
                          style={{
                            padding: "10px 8px",
                            fontSize: "13px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontWeight: "700",
                            borderRadius: "6px"
                          }}
                          onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "PASS", benchmarkModalComment)}
                        >
                          PASS
                        </button>
                        <button
                          type="button"
                          className={`btn-human-fail ${benchmarkSplitModalItem.human_decision === "FAIL" ? "active" : ""}`}
                          style={{
                            padding: "10px 8px",
                            fontSize: "13px",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            fontWeight: "700",
                            borderRadius: "6px"
                          }}
                          onClick={() => handleSaveHumanReview(benchmarkSplitModalItem, "FAIL", benchmarkModalComment)}
                        >
                          FAIL
                        </button>
                      </div>

                      {/* Comment Box */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="meta-lbl" style={{ fontSize: "11px" }}>Comment:</span>
                          {benchmarkModalComment !== (benchmarkSplitModalItem.notes || "") && (
                            <span style={{ fontSize: "10px", color: "var(--color-info)" }}>Auto-saving on blur...</span>
                          )}
                        </div>
                        <textarea
                          className="form-control"
                          style={{
                            width: "100%",
                            height: "60px",
                            resize: "none",
                            fontSize: "12px",
                            padding: "6px 8px",
                            background: "rgba(0, 0, 0, 0.25)",
                            border: "1px solid var(--border-color)",
                            borderRadius: "6px",
                            color: "var(--text-main)",
                            fontFamily: "inherit"
                          }}
                          placeholder="Enter remarks / notes..."
                          value={benchmarkModalComment}
                          onChange={(e) => setBenchmarkModalComment(e.target.value)}
                          onBlur={() => {
                            if (benchmarkModalComment !== (benchmarkSplitModalItem.notes || "")) {
                              handleSaveHumanReview(
                                benchmarkSplitModalItem,
                                benchmarkSplitModalItem.human_decision && benchmarkSplitModalItem.human_decision !== "UNREVIEWED"
                                  ? benchmarkSplitModalItem.human_decision
                                  : "UNREVIEWED",
                                benchmarkModalComment
                              );
                            }
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
        {/* ==========================================
            HISTORICAL INSPECTION IMAGE PREVIEW MODAL
            ========================================== */}
        {selectedModalItem && (
          <div className="modal-overlay" onClick={closeModal}>
            <div
              className="modal-content-box hmi-card"
              style={{
                width: "1340px",
                maxWidth: "96vw",
                height: "720px",
                maxHeight: "94vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* MODAL HEADER */}
              <div
                className="card-header modal-header"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--border-color)",
                  flexShrink: 0
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>HISTORICAL INSPECTION</h3>
                  <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                    {selectedModalItem.decision}
                  </span>
                  {getActiveModalList().length > 0 && (
                    <span className="modal-counter-badge">
                      ( ภาพที่ {selectedModalIndex !== null ? selectedModalIndex + 1 : 1} / {getActiveModalList().length} )
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {getActiveModalList().length > 1 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        className="modal-nav-btn"
                        onClick={handlePrevModalItem}
                        title="Previous Image (Keyboard: ← Left Arrow)"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        ◀ PREV
                      </button>
                      <button
                        className="modal-nav-btn"
                        onClick={handleNextModalItem}
                        title="Next Image (Keyboard: → Right Arrow)"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        NEXT ▶
                      </button>
                    </div>
                  )}
                  <button className="clear-history-btn" style={{ padding: "4px 12px", fontSize: "12px" }} onClick={closeModal}>Close</button>
                </div>
              </div>

              {/* MODAL BODY */}
              <div
                className="card-body modal-body-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 280px",
                  gap: "16px",
                  padding: "16px",
                  flex: 1,
                  minHeight: 0,
                  overflow: "hidden"
                }}
              >
                {/* LEFT: IMAGE VIEWPORT WITH TOP MODE TOOLBAR */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", height: "100%", minHeight: 0 }}>
                  {/* View Mode Toolbar (Above Image - No Overlap) */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.03)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      flexShrink: 0
                    }}
                  >
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>
                      VIEW MODE:
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className={`modal-view-btn ${modalViewMode === "split" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("split")}
                      >
                        Split Compare
                      </button>
                      <button
                        className={`modal-view-btn ${modalViewMode === "annotated" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("annotated")}
                      >
                        Annotated
                      </button>
                      <button
                        className={`modal-view-btn ${modalViewMode === "raw" ? "active" : ""}`}
                        style={{ padding: "5px 12px", fontSize: "12px" }}
                        onClick={() => setModalViewMode("raw")}
                      >
                        Raw Image
                      </button>
                    </div>
                  </div>

                  {/* Fixed-Size Clean Image Container */}
                  <div
                    className="modal-image-container"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      width: "100%",
                      background: "#070913",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative"
                    }}
                  >
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
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
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
                  </div>
                </div>

                {/* RIGHT: METADATA PANEL (RIGHT-ALIGNED VALUES) */}
                <div className="modal-meta-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
                  <div className="model-meta-box" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-color)" }}>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Machine no:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.machineNo || "PROBER01"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Wafer ID:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.id}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Time stamp:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.timestamp}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Result:</span>
                      <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>{selectedModalItem.decision}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Failure reason:</span>
                      <span
                        className="meta-val font-mono"
                        style={{
                          textAlign: "right",
                          wordBreak: "break-word",
                          color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit"
                        }}
                      >
                        {selectedModalItem.reason || "-"}
                      </span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Batch:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.batch || "-"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Datetime:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.dateTime || selectedModalItem.timestamp}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Site coordinate:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.xyCoord || "-"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Probecard site:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.site || "-"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Pad no.:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.pad || "-"}</span>
                    </div>
                    <div className="meta-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="meta-lbl" style={{ flexShrink: 0 }}>Temp:</span>
                      <span className="meta-val font-mono" style={{ textAlign: "right" }}>{selectedModalItem.temp || "-"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
