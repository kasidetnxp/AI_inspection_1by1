import React, { createContext, useContext, useState, useEffect, useRef } from "react";
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
  const [compareMode, setCompareMode] = useState("split");
  const [isLight, setIsLight] = useState(true);
  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("DISCONNECTED"); // "CONNECTED" | "CONNECTING" | "DISCONNECTED"
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

  // DOM Canvas & Scanner Refs
  const canvasRef = useRef(null);
  const scannerRef = useRef(null);

  // Analytics Tab Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState("ALL");
  const [analyticsBatchFilter, setAnalyticsBatchFilter] = useState("ALL");
  const [analyticsMachineFilter, setAnalyticsMachineFilter] = useState("ALL");

  // Historical Inspection Image Modal State
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [selectedModalIndex, setSelectedModalIndex] = useState(null);
  const [modalViewMode, setModalViewMode] = useState("split");

  // Model validation lab states
  const fileInputRef = useRef(null);
  const benchmarkFileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBenchmarkDragging, setIsBenchmarkDragging] = useState(false);
  const [loadedImage, setLoadedImage] = useState(null);
  const [loadedRawImage, setLoadedRawImage] = useState(null);
  const [modelsList, setModelsList] = useState([]);
  const [isModelConverting, setIsModelConverting] = useState(false);
  const [convertingModelName, setConvertingModelName] = useState("");

  const [benchmarkActiveSubTab, setBenchmarkActiveSubTab] = useState("hub");
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

  const [benchmarkFilter, setBenchmarkFilter] = useState("ALL");
  const [benchmarkSearch, setBenchmarkSearch] = useState("");
  const [benchmarkSplitModalItem, setBenchmarkSplitModalItem] = useState(null);
  const [benchmarkSplitModalIndex, setBenchmarkSplitModalIndex] = useState(0);
  const [benchmarkReportModalOpen, setBenchmarkReportModalOpen] = useState(false);
  const [benchmarkReportData, setBenchmarkReportData] = useState(null);
  const [isBenchmarkStarting, setIsBenchmarkStarting] = useState(false);

  // Edge Node IP Configuration
  const getDefaultEdgeIp = () => {
    const saved = localStorage.getItem("IMX8_EDGE_IP");
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
    const sanitized = (newIp || "").trim();
    setIsBackendConnected(false);
    setConnectionStatus("CONNECTING");
    setEdgeIp(sanitized);
    localStorage.setItem("IMX8_EDGE_IP", sanitized);
  };

  // Active Health Check Probe
  const testConnection = async (targetIp) => {
    const ip = (targetIp || edgeIp).trim();
    const url = `http://${ip}:8001/api/sys-stats`;
    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - startTime);
      if (res.ok) {
        const data = await res.json();
        return { ok: true, latency, data, message: `Connected (${latency} ms)` };
      }
      return { ok: false, latency, message: `HTTP ${res.status}: ${res.statusText}` };
    } catch (err) {
      const latency = Math.round(performance.now() - startTime);
      if (err.name === "AbortError") {
        return { ok: false, latency, message: "Connection timed out (Host Unreachable / Power Off)" };
      }
      return { ok: false, latency, message: err.message || "Connection refused / Offline" };
    }
  };

  // Filter logs logic
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

  const getActiveModalList = () => {
    return filteredHistory.length > 0 ? filteredHistory : historyList;
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

  const handlePrevBenchmarkItem = () => {
    if (!benchmarkResults || benchmarkResults.length === 0) return;
    const curIdx = benchmarkSplitModalIndex >= 0 ? benchmarkSplitModalIndex : 0;
    const prevIdx = (curIdx - 1 + benchmarkResults.length) % benchmarkResults.length;
    setBenchmarkSplitModalIndex(prevIdx);
    setBenchmarkSplitModalItem(benchmarkResults[prevIdx]);
  };

  const handleNextBenchmarkItem = () => {
    if (!benchmarkResults || benchmarkResults.length === 0) return;
    const curIdx = benchmarkSplitModalIndex >= 0 ? benchmarkSplitModalIndex : 0;
    const nextIdx = (curIdx + 1) % benchmarkResults.length;
    setBenchmarkSplitModalIndex(nextIdx);
    setBenchmarkSplitModalItem(benchmarkResults[nextIdx]);
  };

  // Keyboard Hotkeys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore single-character hotkeys if typing in inputs/textareas
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
          handleSaveHumanReview(benchmarkSplitModalItem, "PASS", benchmarkSplitModalItem.notes || "");
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          handleSaveHumanReview(benchmarkSplitModalItem, "FAIL", benchmarkSplitModalItem.notes || "");
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
  }, [selectedModalItem, selectedModalIndex, benchmarkSplitModalItem, benchmarkSplitModalIndex, benchmarkResults, history, analyticsFilter, analyticsBatchFilter, analyticsMachineFilter, filterSearch]);

  // Model & Benchmark API calls
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
          setBenchmarkProgress(data);
          if (data.kpis && data.kpis.total_tested > 0) setBenchmarkKpis(data.kpis);
        }
      })
      .catch(err => console.error("Error fetching benchmark progress:", err));
  };

  const fetchBenchmarkResults = (sessionId, filter = "ALL") => {
    const query = new URLSearchParams();
    if (sessionId) query.append("session_id", sessionId);
    if (filter) query.append("filter", filter);

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

  const handleStopBenchmark = () => {
    fetch(`${apiBase}/api/model/benchmark/stop`, { method: "POST" })
      .then(res => res.json())
      .then(() => {
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
    formData.append("fail_distance_um", benchmarkRules.fail_distance_um);
    formData.append("max_area_ratio_pct", benchmarkRules.max_area_ratio_pct);
    formData.append("min_area_ratio_pct", benchmarkRules.min_area_ratio_pct);
    formData.append("missing_mark_action", benchmarkRules.missing_mark_action);

    setIsBenchmarkStarting(true);
    fetch(`${apiBase}/api/model/benchmark/upload-images`, {
      method: "POST",
      body: formData
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        setIsBenchmarkStarting(false);
        setBenchmarkResults([]);
        fetchBenchmarkProgress();
      })
      .catch(err => {
        setIsBenchmarkStarting(false);
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
      .then((data) => {
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
      .then(() => {
        alert(`Deleted model '${model.name}' successfully!`);
        fetchModels();
      })
      .catch(() => {
        setModelsList(prev => prev.filter(m => m.name !== model.name));
      });
  };

  // Sync Theming
  useEffect(() => {
    if (isLight) {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  }, [isLight]);

  // Real-time Clock
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

  useEffect(() => {
    fetchModels();
  }, [edgeIp]);

  // Connected Mode: WebSockets & API client with quiet exponential backoff
  useEffect(() => {
    let ws = null;
    let pollStats = null;
    let reconnectTimeout = null;
    let isCancelled = false;
    let backoffDelay = 4000;

    setIsBackendConnected(false);
    setConnectionStatus("CONNECTING");

    const tryConnect = async () => {
      if (isCancelled) return;

      // ponytail: silent fetch probe prevents browser console ERR_CONNECTION_REFUSED spam
      try {
        const probe = await fetch(`${apiBase}/api/sys-stats`, {
          signal: AbortSignal.timeout(2000)
        });
        if (!probe.ok) throw new Error("Endpoint returned non-200");
      } catch (err) {
        if (isCancelled) return;
        setIsBackendConnected(false);
        setConnectionStatus("DISCONNECTED");
        backoffDelay = Math.min(backoffDelay * 1.5, 20000);
        reconnectTimeout = setTimeout(tryConnect, backoffDelay);
        return;
      }

      // If probe succeeds, backend is verified live -> open WebSocket cleanly
      backoffDelay = 4000;
      setConnectionStatus("CONNECTING");

      try {
        ws = new WebSocket(`ws://${edgeIp}:8001/ws`);

        ws.onopen = () => {
          if (isCancelled) {
            try { ws.close(); } catch (e) {}
            return;
          }
          setIsBackendConnected(true);
          setConnectionStatus("CONNECTED");
          setIsSimRunning(false);
          fetchModels();

          // Fetch initial logs
          fetch(`${apiBase}/api/history`)
            .then(r => r.json())
            .then(data => setHistory(Array.isArray(data) ? data : []))
            .catch(() => setHistory([]));

          // Fetch latest scan data
          fetch(`${apiBase}/api/latest-inspection`)
            .then(r => r.json())
            .then(data => {
              if (data && data.id) {
                mapInspectionData(data);
              }
            })
            .catch(() => {});

          fetchBenchmarkDatasets();
          fetchBenchmarkProgress();
          fetchBenchmarkResults();

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
              .catch(() => {
                setIsBackendConnected(false);
                setConnectionStatus("DISCONNECTED");
              });

            fetchBenchmarkProgress();
          }, 3000);
        };

        ws.onmessage = (event) => {
          if (isCancelled) return;
          try {
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
              setBenchmarkProgress(payload.data);
              if (payload.data.kpis && payload.data.kpis.total_tested > 0) {
                setBenchmarkKpis(payload.data.kpis);
              }
              if (payload.data.latest_result) {
                setBenchmarkResults(prev => {
                  const list = Array.isArray(prev) ? prev : [];
                  const exists = list.some(r => r.id === payload.data.latest_result.id);
                  if (exists) return list.map(r => r.id === payload.data.latest_result.id ? payload.data.latest_result : r);
                  return [payload.data.latest_result, ...list];
                });
              }
            } else if (payload.event === "BENCHMARK_REVIEW_UPDATED" && payload.data) {
              if (payload.data.kpis) setBenchmarkKpis(payload.data.kpis);
              setBenchmarkResults(prev => (Array.isArray(prev) ? prev : []).map(r => r.id === payload.data.result_id ? { ...r, human_decision: payload.data.human_decision } : r));
            }
          } catch (e) {}
        };

        ws.onerror = () => {
          setIsBackendConnected(false);
          setConnectionStatus("DISCONNECTED");
          if (ws) ws.close();
        };

        ws.onclose = () => {
          if (isCancelled) return;
          setIsBackendConnected(false);
          setConnectionStatus("DISCONNECTED");
          if (pollStats) clearInterval(pollStats);
          reconnectTimeout = setTimeout(tryConnect, backoffDelay);
        };
      } catch (err) {
        setIsBackendConnected(false);
        setConnectionStatus("DISCONNECTED");
        if (!isCancelled) {
          reconnectTimeout = setTimeout(tryConnect, backoffDelay);
        }
      }
    };

    tryConnect();

    return () => {
      isCancelled = true;
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      if (pollStats) clearInterval(pollStats);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      setIsBackendConnected(false);
      setConnectionStatus("DISCONNECTED");
    };
  }, [edgeIp]);

  // Real-time Hardware Monitoring WebSocket
  useEffect(() => {
    let hwWs = null;
    let reconnectTimeout = null;
    let isSubscribed = true;

    const connectHardwareMonitor = () => {
      const hostname = typeof window !== "undefined" ? (window.location.hostname || "localhost") : "localhost";
      const pcWsUrl = `ws://${hostname}:3000/ws/hardware`;
      const targetUrl = pcWsUrl;

      try {
        hwWs = new WebSocket(targetUrl);

        hwWs.onopen = () => {
          console.log(`[HMI] Real-time Hardware WebSocket connected: ${targetUrl}`);
        };

        hwWs.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.event === "SYS_STATS_STREAM" && msg.data) {
              setSysStats(prev => ({
                ...prev,
                cpu: msg.data.cpu ?? prev.cpu,
                npu: msg.data.npu ?? prev.npu,
                ram: msg.data.ram ?? prev.ram,
                temp: msg.data.temp ?? prev.temp
              }));
              if (msg.data.db) setDbType(msg.data.db);
            }
          } catch (e) {
            console.error("[HMI] Failed to parse hardware telemetry frame:", e);
          }
        };

        hwWs.onerror = () => {
          hwWs.close();
        };

        hwWs.onclose = () => {
          if (isSubscribed) {
            reconnectTimeout = setTimeout(connectHardwareMonitor, 3000);
          }
        };
      } catch (err) {
        console.error("[HMI] Hardware WebSocket creation error:", err);
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connectHardwareMonitor, 3000);
        }
      }
    };

    connectHardwareMonitor();

    return () => {
      isSubscribed = false;
      if (hwWs) hwWs.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const animateScannerLine = () => {
    if (scannerRef.current) {
      scannerRef.current.style.transition = "none";
      scannerRef.current.style.top = "0%";
      scannerRef.current.style.opacity = "1";
      setTimeout(() => {
        if (scannerRef.current) {
          scannerRef.current.style.transition = "top 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
          scannerRef.current.style.top = "100%";
        }
      }, 50);
    }
  };

  const mapInspectionData = (data) => {
    if (!data) return;

    if (data.imageUrl || data.annotated_image_url || data.rawImageUrl || data.raw_image_url) {
      const imgTarget = data.annotated_image_url || data.imageUrl;
      const rawTarget = data.raw_image_url || data.rawImageUrl;

      const img = new Image();
      img.src = resolveImageUrl(imgTarget);
      img.onload = () => {
        setLoadedImage(img);
        if (rawTarget) {
          const rawImg = new Image();
          rawImg.src = resolveImageUrl(rawTarget);
          rawImg.onload = () => setLoadedRawImage(rawImg);
          rawImg.onerror = () => setLoadedRawImage(img);
        } else {
          setLoadedRawImage(img);
        }
      };
      img.onerror = () => {
        setLoadedImage(null);
        setLoadedRawImage(null);
      };

      animateScannerLine();
      setTimeout(() => {
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
      }, 400);
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

  // Offline Simulation
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
        { dx: -70, dy: -60, rx: 26, ry: 18, rot: 0.8 }
      ];
      alarms.push({ name: "Edge Clearance Violation (<8µm)", time: clockStr.split(" ")[1] });
    } else {
      marksList = [
        { dx: 5, dy: -5, rx: 25, ry: 18, rot: 0.1 }
      ];
    }

    const isPass = anomalyType === 0;
    const padNames = ["VDD_CORE", "GND_SENSE", "OUT_CH1", "GPIO_12", "CLK_IN", "VREF_P", "TEST_EN"];
    const reasonText = isPass ? "All probe marks verified inside clearance limits" : (alarms[0]?.name || "Clearance Rule Violation");

    setTimeout(() => {
      const newScan = {
        id: `#WF-${String(Math.floor(Math.random() * 89999 + 10000))}`,
        batch: "B2026-NXP",
        waferNo: "W04",
        xyCoord: `X${Math.floor(Math.random() * 160 + 20)}:Y${Math.floor(Math.random() * 160 + 20)}`,
        site: `SITE-${Math.floor(Math.random() * 4) + 1}`,
        pad: padNames[Math.floor(Math.random() * padNames.length)],
        temp: `${(54 + Math.random() * 6).toFixed(1)}°C`,
        padsTotal: 1,
        padsDetected: 1,
        probeMarks: marksList.length,
        grains: isPass ? 0 : (anomalyType === 3 ? 4 : 1),
        confidence: confidence,
        inferenceTime: infTime,
        ruleTime: 1.2,
        decision: isPass ? "PASS" : "FAIL",
        machineAction: isPass ? "PROBE_NEXT_DIE" : "HALT_NOTIFY",
        reason: reasonText,
        timeShort: clockStr.split(" ")[1] || "12:00:00",
        timestamp: clockStr || "19-Aug-2026 12:00:00",
        machineNo: "PROBER01",
        productSetup: "NXP_AUTOMOTIVE_S32G",
        alarms: alarms
      };

      setCurrentInspection(newScan);
      setCurrentDieImage({
        pads: [{
          id: 1,
          x: 300,
          y: 300,
          detected: true,
          marks: marksList
        }],
        grains: Array(newScan.grains).fill(0).map((_, i) => ({
          id: i,
          x: 300 + (Math.random() - 0.5) * 80,
          y: 300 + (Math.random() - 0.5) * 80
        }))
      });

      setActiveAlarms(alarms);
      setHistory(prev => {
        const list = Array.isArray(prev) ? prev : [];
        return [newScan, ...list.slice(0, 499)];
      });
      setSimIndex(s => s + 1);
    }, 400);
  };

  // Helper to format Batch/Wafer
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

  // CSV Export
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

  // Chart data calculations
  const passCountChart = historyList.filter(r => r.decision === "PASS").length;
  const failCountChart = historyList.filter(r => r.decision !== "PASS").length;

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
          font: { size: 11, weight: "600", family: "'JetBrains Mono', monospace" },
          padding: 14,
          usePointStyle: true,
          pointStyle: "circle"
        }
      },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleFont: { size: 12, weight: "bold" },
        bodyFont: { size: 12 },
        padding: 10,
        borderColor: "rgba(255,255,255,0.1)",
        borderWidth: 1
      }
    }
  };

  const defectCounts = {
    "Edge Clearance": 0,
    "Missing Mark": 0,
    "Double Hit": 0,
    "Scratch Defect": 0,
    "Surface Particle": 0
  };

  historyList.filter(r => r.decision === "FAIL").forEach(r => {
    const reason = r.reason || "";
    if (reason.includes("Clearance") || reason.includes("<8µm") || reason.includes("Edge")) {
      defectCounts["Edge Clearance"]++;
    } else if (reason.includes("Missing")) {
      defectCounts["Missing Mark"]++;
    } else if (reason.includes("Double")) {
      defectCounts["Double Hit"]++;
    } else if (reason.includes("Scratch")) {
      defectCounts["Scratch Defect"]++;
    } else {
      defectCounts["Surface Particle"]++;
    }
  });

  const barChartData = {
    labels: Object.keys(defectCounts),
    datasets: [
      {
        label: "Defect Instances",
        data: Object.values(defectCounts),
        backgroundColor: [
          "rgba(239, 68, 68, 0.8)",
          "rgba(245, 158, 11, 0.8)",
          "rgba(168, 85, 247, 0.8)",
          "rgba(236, 72, 153, 0.8)",
          "rgba(100, 116, 139, 0.8)"
        ],
        borderRadius: 4,
        borderWidth: 1,
        borderColor: [
          "#ef4444",
          "#f59e0b",
          "#a855f7",
          "#ec4899",
          "#64748b"
        ]
      }
    ]
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        titleFont: { size: 12, weight: "bold" },
        bodyFont: { size: 12 },
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isLight ? "#64748b" : "#94a3b8",
          font: { size: 10, family: "'JetBrains Mono', monospace" }
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" },
        ticks: {
          precision: 0,
          color: isLight ? "#64748b" : "#94a3b8",
          font: { size: 10, family: "'JetBrains Mono', monospace" }
        }
      }
    }
  };

  const recentTen = historyList.slice(0, 15).reverse();
  const lineChartData = {
    labels: recentTen.map((_, i) => `#${i + 1}`),
    datasets: [
      {
        label: "Latency (ms)",
        data: recentTen.map(r => r.inferenceTime ?? 18.5),
        fill: true,
        borderColor: "#0ea5e9",
        backgroundColor: "rgba(14, 165, 233, 0.12)",
        tension: 0.35,
        pointBackgroundColor: "#0ea5e9",
        pointRadius: 3,
        pointHoverRadius: 5
      }
    ]
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isLight ? "#64748b" : "#94a3b8",
          font: { size: 9, family: "'JetBrains Mono', monospace" }
        }
      },
      y: {
        beginAtZero: false,
        grid: { color: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.05)" },
        ticks: {
          color: isLight ? "#64748b" : "#94a3b8",
          font: { size: 9, family: "'JetBrains Mono', monospace" }
        }
      }
    }
  };

  const uniqueBatches = [...new Set(historyList.map(r => r.batch).filter(Boolean))];
  const uniqueMachines = [...new Set(historyList.map(r => r.machineNo || "PROBER01").filter(Boolean))];

  const totalScans = historyList.length;
  const passCount = historyList.filter(r => r.decision === "PASS").length;
  const failCount = historyList.filter(r => r.decision !== "PASS").length;
  const yieldRate = totalScans > 0 ? ((passCount / totalScans) * 100).toFixed(2) : "0.00";

  const value = {
    compareMode, setCompareMode,
    isLight, setIsLight,
    isBackendConnected,
    connectionStatus,
    testConnection,
    dbType,
    filters, setFilters,
    currentInspection, setCurrentInspection,
    currentDieImage, setCurrentDieImage,
    activeAlarms, setActiveAlarms,
    history, setHistory,
    historyList, filteredHistory,
    sysStats, setSysStats,
    isSimRunning, setIsSimRunning,
    simIndex, setSimIndex,
    simSpeed, setSimSpeed,
    runSingleOfflineInspection,
    clockStr,
    canvasRef, scannerRef, animateScannerLine,
    filterSearch, setFilterSearch,
    analyticsFilter, setAnalyticsFilter,
    analyticsBatchFilter, setAnalyticsBatchFilter,
    analyticsMachineFilter, setAnalyticsMachineFilter,
    selectedModalItem, setSelectedModalItem,
    selectedModalIndex, setSelectedModalIndex,
    modalViewMode, setModalViewMode,
    openModalWithItem, closeModal,
    handlePrevModalItem, handleNextModalItem,
    fileInputRef, benchmarkFileInputRef,
    isDragging, setIsDragging,
    isBenchmarkDragging, setIsBenchmarkDragging,
    loadedImage, setLoadedImage,
    loadedRawImage, setLoadedRawImage,
    modelsList, setModelsList,
    isModelConverting, setIsModelConverting,
    convertingModelName, setConvertingModelName,
    benchmarkActiveSubTab, setBenchmarkActiveSubTab,
    benchmarkModel, setBenchmarkModel,
    benchmarkZipFile, setBenchmarkZipFile,
    benchmarkDataset, setBenchmarkDataset,
    benchmarkDatasetsList, setBenchmarkDatasetsList,
    benchmarkLimit, setBenchmarkLimit,
    benchmarkRules, setBenchmarkRules,
    benchmarkProgress, setBenchmarkProgress,
    benchmarkResults, setBenchmarkResults,
    benchmarkKpis, setBenchmarkKpis,
    benchmarkFilter, setBenchmarkFilter,
    benchmarkSearch, setBenchmarkSearch,
    benchmarkSplitModalItem, setBenchmarkSplitModalItem,
    benchmarkSplitModalIndex, setBenchmarkSplitModalIndex,
    benchmarkReportModalOpen, setBenchmarkReportModalOpen,
    benchmarkReportData, setBenchmarkReportData,
    isBenchmarkStarting, setIsBenchmarkStarting,
    handlePrevBenchmarkItem, handleNextBenchmarkItem,
    fetchModels, fetchBenchmarkDatasets, fetchBenchmarkProgress, fetchBenchmarkResults,
    handleStartBenchmark, handleStopBenchmark, handleSaveHumanReview, handleBatchReview,
    handleCustomBenchmarkUpload, handleViewReport, handleExportBenchmarkCSV,
    handleUploadFile, handleActivateModel, handleDeleteModel,
    edgeIp, setEdgeIp, updateEdgeIp, apiBase, resolveImageUrl,
    mapInspectionData, formatBatchWafer, exportToCSV,
    donutChartData, donutChartOptions,
    barChartData, barChartOptions,
    lineChartData, lineChartOptions,
    uniqueBatches, uniqueMachines,
    totalScans, passCount, failCount, yieldRate
  };

  return (
    <InspectionContext.Provider value={value}>
      {children}
    </InspectionContext.Provider>
  );
}
