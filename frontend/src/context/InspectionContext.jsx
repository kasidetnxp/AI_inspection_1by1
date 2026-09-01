import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
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
import {
  formatBatchWafer,
  normalizeRecordDate,
  getRecordTimestampMs,
  getNumericValue,
  sortRecords,
  getRecordDisplayDateTime,
  generateExportFilename,
  isDateRangeInvalid
} from "../utils/historyHelpers";

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

const InspectionContext = createContext(null);

export function useInspection() {
  const context = useContext(InspectionContext);
  if (!context) {
    throw new Error("useInspection must be used within an InspectionProvider");
  }
  return context;
}

export function InspectionProvider({ children }) {
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

  // History Tab Filters & Enhanced Pagination & Sorting
  const [filterSearch, setFilterSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState("ALL");
  const [analyticsBatchFilter, setAnalyticsBatchFilter] = useState("ALL");
  const [analyticsMachineFilter, setAnalyticsMachineFilter] = useState("ALL");
  const [analyticsDateFilter, setAnalyticsDateFilter] = useState("ALL");
  const [dateRangePreset, setDateRangePreset] = useState("ALL"); // "ALL" | "TODAY" | "7D" | "30D" | "CUSTOM"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortField, setSortField] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc"); // "desc" | "asc"
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(25);
  const [historyViewMode, setHistoryViewMode] = useState("dashboard"); // "dashboard" or "table-full"

  // Benchmark / Test Tab Pagination State (mirrors history pagination)
  const [benchmarkPage, setBenchmarkPage] = useState(1);
  const [benchmarkPageSize, setBenchmarkPageSize] = useState(25);

  const getRecordDate = (record) => {
    return normalizeRecordDate(record);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "timestamp" ? "desc" : "asc");
    }
    setHistoryPage(1);
  };

  const setDatePreset = (preset) => {
    setDateRangePreset(preset);
    if (preset !== "CUSTOM") {
      setStartDate("");
      setEndDate("");
    }
    setHistoryPage(1);
  };

  const resetAllFilters = () => {
    setFilterSearch("");
    setAnalyticsFilter("ALL");
    setAnalyticsBatchFilter("ALL");
    setAnalyticsMachineFilter("ALL");
    setAnalyticsDateFilter("ALL");
    setDateRangePreset("ALL");
    setStartDate("");
    setEndDate("");
    setSortField("timestamp");
    setSortOrder("desc");
    setHistoryPage(1);
  };

  // Filter logs logic for History Tab with sorting & date range
  const historyList = Array.isArray(history) ? history : [];
  
  const todayStr = (() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();

  const rawFilteredHistory = historyList.filter(record => {
    if (analyticsFilter === "PASS" && record.decision !== "PASS") return false;
    if (analyticsFilter === "FAIL" && record.decision === "PASS") return false;
    if (analyticsBatchFilter !== "ALL" && record.batch !== analyticsBatchFilter) return false;
    if (analyticsMachineFilter !== "ALL" && (record.machineNo || "PROBER01") !== analyticsMachineFilter) return false;
    
    // Date Filtering
    const recDate = normalizeRecordDate(record);
    const recMs = getRecordTimestampMs(record);
    const nowMs = Date.now();

    if (dateRangePreset === "TODAY") {
      if (recDate && recDate !== todayStr) return false;
    } else if (dateRangePreset === "7D") {
      if (recMs > 0 && recMs < (nowMs - 7 * 86400000)) return false;
    } else if (dateRangePreset === "30D") {
      if (recMs > 0 && recMs < (nowMs - 30 * 86400000)) return false;
    } else if (dateRangePreset === "CUSTOM") {
      if (startDate && recDate && recDate < startDate) return false;
      if (endDate && recDate && recDate > endDate) return false;
    } else if (analyticsDateFilter !== "ALL") {
      if (recDate !== analyticsDateFilter) return false;
    }

    // Search Filtering
    if (filterSearch.trim() !== "") {
      const q = filterSearch.toLowerCase().trim();
      const searchableStr = [
        record.machineNo, record.batch, record.waferNo, record.xyCoord,
        record.site, record.pad, record.timeShort, record.timestamp, record.dateTime,
        record.decision, record.reason, record.productSetup, record.temp, record.id
      ].join(" ").toLowerCase();
      if (!searchableStr.includes(q)) return false;
    }
    return true;
  });

  const filteredHistory = sortRecords(rawFilteredHistory, sortField, sortOrder);

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
  const [hasInitializedThresholds, setHasInitializedThresholds] = useState(false);

  useEffect(() => {
    setTempIp(edgeIp);
  }, [edgeIp]);

  useEffect(() => {
    if (activeConfig?.computed && !hasInitializedThresholds) {
      if (activeConfig.computed.failDistanceUm != null) {
        setSettingsFailDist(Number(activeConfig.computed.failDistanceUm));
      }
      if (activeConfig.computed.maxAreaRatioPct != null) {
        setSettingsMaxArea(Number(activeConfig.computed.maxAreaRatioPct));
      }
      setHasInitializedThresholds(true);
    }
  }, [activeConfig, hasInitializedThresholds]);

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

  const fetchActiveConfig = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/config/active`);
      if (res.ok) {
        const data = await res.json();
        setActiveConfig(data);
        return data;
      }
    } catch (err) {
      console.warn("Failed fetching active config:", err);
    }
    return null;
  }, [apiBase]);

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
        setConfigUploadStatus(data.message || "Thresholds updated successfully");
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
  const renderCanvas = useCallback(() => {
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

    const drawDieContent = (c, showOverlays, targetW = 600, targetH = 600, label = "") => {
      if (!showOverlays && loadedRawImage) {
        c.drawImage(loadedRawImage, 0, 0, targetW, targetH);
        return;
      }
      if (showOverlays && loadedImage) {
        c.drawImage(loadedImage, 0, 0, targetW, targetH);
        return;
      }

      // High-contrast Standby viewport
      c.fillStyle = isLight ? "#e2e8f0" : "#0a0d14";
      c.fillRect(0, 0, targetW, targetH);

      // Subtle inner background grid
      c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.07)" : "rgba(255, 255, 255, 0.05)";
      c.lineWidth = 1;
      const gridStep = 40;
      for (let x = gridStep; x < targetW; x += gridStep) {
        c.beginPath(); c.moveTo(x, 0); c.lineTo(x, targetH); c.stroke();
      }
      for (let y = gridStep; y < targetH; y += gridStep) {
        c.beginPath(); c.moveTo(0, y); c.lineTo(targetW, y); c.stroke();
      }

      // Reticle / Alignment corner brackets
      c.strokeStyle = isLight ? "rgba(71, 85, 105, 0.6)" : "rgba(99, 102, 241, 0.6)";
      c.lineWidth = 2.5;
      const rl = 36, rPad = 18;
      c.beginPath(); c.moveTo(rPad, rPad + rl); c.lineTo(rPad, rPad); c.lineTo(rPad + rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, rPad + rl); c.lineTo(targetW - rPad, rPad); c.lineTo(targetW - rPad - rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(rPad, targetH - rPad - rl); c.lineTo(rPad, targetH - rPad); c.lineTo(rPad + rl, targetH - rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, targetH - rPad - rl); c.lineTo(targetW - rPad, targetH - rPad); c.lineTo(targetW - rPad - rl, targetH - rPad); c.stroke();

      // Center crosshair
      c.strokeStyle = isLight ? "rgba(71, 85, 105, 0.35)" : "rgba(255, 255, 255, 0.18)";
      c.lineWidth = 1.5;
      const cx = targetW / 2, cy = targetH / 2;
      c.beginPath(); c.moveTo(cx - 20, cy); c.lineTo(cx + 20, cy); c.stroke();
      c.beginPath(); c.moveTo(cx, cy - 20); c.lineTo(cx, cy + 20); c.stroke();

      // Standby title text & Subtitle
      c.fillStyle = isLight ? "#0f172a" : "#f1f5f9";
      c.font = "bold 14px 'Inter', sans-serif";
      c.textAlign = "center";
      c.fillText(label || "STANDBY • WAITING FOR PROBER SCAN", cx, cy - 24);

      c.fillStyle = isLight ? "#475569" : "#94a3b8";
      c.font = "600 11px 'Inter', sans-serif";
      c.fillText("OPTICAL CAMERA & NPU INFERENCE READY", cx, cy + 30);
    };

    if (compareMode === "overlay") {
      drawDieContent(ctx, true, 600, 600, "AI MASK OVERLAY FEED");
    } else {
      // Split mode: 1200 x 600
      ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(600, 0); ctx.lineTo(600, 600); ctx.stroke();

      const paneSize = 530;
      const leftX = (600 - paneSize) / 2;
      const rightX = 600 + (600 - paneSize) / 2;
      const topY = 50;

      // Header Label 1: RAW CAMERA FEED
      ctx.fillStyle = isLight ? "#1e293b" : "#cbd5e1";
      ctx.font = "bold 16px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("1. RAW CAMERA FEED", 300, 32);

      ctx.save();
      ctx.translate(leftX, topY);
      drawDieContent(ctx, false, paneSize, paneSize, "RAW DIE OPTICAL CAPTURE");
      ctx.restore();

      // Header Label 2: AI SEGMENTATION
      ctx.fillStyle = isLight ? "#0284c7" : "#38bdf8";
      ctx.font = "bold 16px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("2. AI SEGMENTATION & RULES", 900, 32);

      ctx.save();
      ctx.translate(rightX, topY);
      drawDieContent(ctx, true, paneSize, paneSize, "AI DEFECT SEGMENTATION");
      ctx.restore();
    }
  }, [compareMode, isLight, filters, loadedImage, loadedRawImage, currentInspection, canvasRef]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // ==========================================
  // CHARTS CONFIGURATION ENGINE (Chart.js React)
  // Dynamic calculation based on filteredHistory
  // ==========================================
  const chartDataSource = filteredHistory.length > 0 ? filteredHistory : [];
  const passCountChart = chartDataSource.filter(r => r.decision === "PASS").length;
  const failCountChart = chartDataSource.filter(r => r.decision !== "PASS").length;

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
  chartDataSource.forEach(r => {
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

  const latencyRecent = chartDataSource.slice(0, 15).reverse();
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

  // ==========================================
  // REPORT DATA EXPORT (CSV SPREADSHEET)
  // ==========================================
  const exportToCSV = () => {
    const exportList = filteredHistory.length > 0 ? filteredHistory : historyList;
    if (exportList.length === 0) {
      alert("No inspection records available to export.");
      return;
    }
    const csvRows = [
      ["Timestamp", "Machine no", "Batch/Wafer no", "Pad", "Site", "XY Coordinate", "Temp", "Result", "Failure Reason", "Latency (ms)"]
    ];
    exportList.forEach(rec => {
      const bw = formatBatchWafer(rec);
      csvRows.push([
        `"${getRecordDisplayDateTime(rec)}"`,
        `"${rec.machineNo || "WP288"}"`,
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

    const downloadFilename = generateExportFilename({
      machine: analyticsMachineFilter,
      batch: analyticsBatchFilter,
      now: new Date()
    });

    link.setAttribute("download", downloadFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter logs logic for Analytics Tab
  const uniqueDates = Array.from(new Set(historyList.map(getRecordDate).filter(Boolean)));
  const uniqueBatches = Array.from(new Set(historyList.map(item => item.batch).filter(b => b && b !== "-")));
  const uniqueMachines = Array.from(new Set(historyList.map(item => item.machineNo || "PROBER01").filter(m => m && m !== "-")));

  // Calculate local yields
  const totalScans = historyList.length;
  const passCount = historyList.filter(h => h.decision === "PASS").length;
  const failCount = historyList.filter(h => h.decision !== "PASS").length;
  const yieldRate = totalScans > 0 ? ((passCount / totalScans) * 100).toFixed(2) : "0.00";


  const value = {
    activeAlarms,
    activeConfig,
    activeTab,
    analyticsBatchFilter,
    analyticsDateFilter,
    analyticsFilter,
    analyticsMachineFilter,
    animateScannerLine,
    apiBase,
    barCanvasRef,
    barChartData,
    barChartOptions,
    benchmarkActiveSubTab,
    benchmarkDataset,
    benchmarkDatasetsList,
    benchmarkFileInputRef,
    benchmarkFilter,
    benchmarkKpis,
    benchmarkLimit,
    benchmarkModalComment,
    benchmarkModel,
    benchmarkPage,
    benchmarkPageSize,
    benchmarkProgress,
    benchmarkReportData,
    benchmarkReportModalOpen,
    benchmarkResults,
    benchmarkRules,
    benchmarkSearch,
    benchmarkSplitModalIndex,
    benchmarkSplitModalItem,
    benchmarkZipFile,
    bigMarkChart,
    canvasRef,
    clockStr,
    closeModal,
    compareMode,
    configUploadStatus,
    convertingModelName,
    currentDieImage,
    currentInspection,
    dbType,
    donutCanvasRef,
    donutChartData,
    donutChartOptions,
    edgeIp,
    effectiveBenchmarkPage,
    effectiveHistoryPage,
    exportToCSV,
    failCount,
    failCountChart,
    fetchActiveConfig,
    fetchBenchmarkDatasets,
    fetchBenchmarkProgress,
    fetchBenchmarkResults,
    fetchModels,
    fileInputRef,
    filterSearch,
    filteredBenchmarkResults,
    filteredHistory,
    filters,
    formatBatchWafer,
    getActiveModalList,
    getDefaultEdgeIp,
    getRecordDate,
    handleActivateModel,
    handleApplyPreset,
    handleBatchReview,
    handleCustomBenchmarkUpload,
    handleDeleteModel,
    handleExportBenchmarkCSV,
    handleMachineUpload,
    handleNextBenchmarkItem,
    handleNextModalItem,
    handlePauseBenchmark,
    handlePrevBenchmarkItem,
    handlePrevModalItem,
    handleProductUpload,
    handleResumeBenchmark,
    handleSaveHumanReview,
    handleSaveIp,
    handleSaveThresholds,
    handleStartBenchmark,
    handleStopBenchmark,
    handleTestPing,
    handleUploadFile,
    handleViewReport,
    history,
    historyList,
    historyPage,
    historyPageSize,
    historyViewMode,
    isBackendConnected,
    isBenchmarkDragging,
    isBenchmarkStarting,
    isDragging,
    isLight,
    isModelConverting,
    isPinging,
    isSavingThresholds,
    isSimRunning,
    isUploadingMachine,
    isUploadingProduct,
    latencyRecent,
    lineCanvasRef,
    lineChartData,
    lineChartOptions,
    loadedImage,
    loadedRawImage,
    mapInspectionData,
    modalViewMode,
    modelsList,
    openModalWithItem,
    paginatedBenchmarkResults,
    paginatedHistory,
    passCount,
    passCountChart,
    pingResult,
    preloadImages,
    priority_dispatcher_status_color,
    renderCanvas,
    resolveImageUrl,
    runSingleOfflineInspection,
    saveIpSuccess,
    scannerRef,
    selectedClasses,
    selectedModalIndex,
    selectedModalItem,
    setActiveAlarms,
    setActiveConfig,
    setActiveTab,
    setAnalyticsBatchFilter,
    setAnalyticsDateFilter,
    setAnalyticsFilter,
    setAnalyticsMachineFilter,
    setBenchmarkActiveSubTab,
    setBenchmarkDataset,
    setBenchmarkDatasetsList,
    setBenchmarkFilter,
    setBenchmarkKpis,
    setBenchmarkLimit,
    setBenchmarkModalComment,
    setBenchmarkModel,
    setBenchmarkPage,
    setBenchmarkPageSize,
    setBenchmarkProgress,
    setBenchmarkReportData,
    setBenchmarkReportModalOpen,
    setBenchmarkResults,
    setBenchmarkRules,
    setBenchmarkSearch,
    setBenchmarkSplitModalIndex,
    setBenchmarkSplitModalItem,
    setBenchmarkZipFile,
    setClockStr,
    setCompareMode,
    setConfigUploadStatus,
    setConvertingModelName,
    setCurrentDieImage,
    setCurrentInspection,
    setDbType,
    setEdgeIp,
    setFilterSearch,
    setFilters,
    setHistory,
    setHistoryPage,
    setHistoryPageSize,
    setHistoryViewMode,
    setIsBackendConnected,
    setIsBenchmarkDragging,
    setIsBenchmarkStarting,
    setIsDragging,
    setIsLight,
    setIsModelConverting,
    setIsPinging,
    setIsSavingThresholds,
    setIsSimRunning,
    setIsUploadingMachine,
    setIsUploadingProduct,
    setLoadedImage,
    setLoadedRawImage,
    setModalViewMode,
    setModelsList,
    setPingResult,
    setSaveIpSuccess,
    setSelectedClasses,
    setSelectedModalIndex,
    setSelectedModalItem,
    setSettingsFailDist,
    setSettingsMaxArea,
    setSimIndex,
    setSimSpeed,
    setSysStats,
    setTempIp,
    settingsFailDist,
    settingsMaxArea,
    simIndex,
    simSpeed,
    sysStats,
    tempIp,
    totalBenchmarkPages,
    totalHistoryPages,
    totalScans,
    getRecordDisplayDateTime,
    generateExportFilename,
    isDateRangeInvalid,
    dateRangePreset,
    setDateRangePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    handleSort,
    resetAllFilters,
    uniqueBatches,
    uniqueDates,
    uniqueMachines,
    updateEdgeIp,
    yieldRate
  };

  return (
    <InspectionContext.Provider value={value}>
      {children}
    </InspectionContext.Provider>
  );
}
