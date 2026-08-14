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

  // Analytics Tab Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState("ALL");
  const [analyticsBatchFilter, setAnalyticsBatchFilter] = useState("ALL");
  const [analyticsMachineFilter, setAnalyticsMachineFilter] = useState("ALL");

  // Historical Inspection Image Modal State
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [modalViewMode, setModalViewMode] = useState("split");

  const handlePrevModalItem = (e) => {
    if (e) e.stopPropagation();
    const currentList = typeof filteredHistory !== "undefined" && filteredHistory.length > 0 ? filteredHistory : history;
    if (!selectedModalItem || currentList.length === 0) return;
    const idx = currentList.findIndex(item => item === selectedModalItem || (item.imageUrl && item.imageUrl === selectedModalItem.imageUrl) || (item.timestamp === selectedModalItem.timestamp && item.pad === selectedModalItem.pad && item.xyCoord === selectedModalItem.xyCoord));
    if (idx > 0) {
      setSelectedModalItem(currentList[idx - 1]);
    } else {
      setSelectedModalItem(currentList[currentList.length - 1]);
    }
  };

  const handleNextModalItem = (e) => {
    if (e) e.stopPropagation();
    const currentList = typeof filteredHistory !== "undefined" && filteredHistory.length > 0 ? filteredHistory : history;
    if (!selectedModalItem || currentList.length === 0) return;
    const idx = currentList.findIndex(item => item === selectedModalItem || (item.imageUrl && item.imageUrl === selectedModalItem.imageUrl) || (item.timestamp === selectedModalItem.timestamp && item.pad === selectedModalItem.pad && item.xyCoord === selectedModalItem.xyCoord));
    if (idx >= 0 && idx < currentList.length - 1) {
      setSelectedModalItem(currentList[idx + 1]);
    } else {
      setSelectedModalItem(currentList[0]);
    }
  };

  useEffect(() => {
    if (!selectedModalItem) return;
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        handlePrevModalItem();
      } else if (e.key === "ArrowRight") {
        handleNextModalItem();
      } else if (e.key === "Escape") {
        setSelectedModalItem(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedModalItem, history]);

  // Drag and drop uploading state
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedImage, setLoadedImage] = useState(null);
  const [loadedRawImage, setLoadedRawImage] = useState(null);
  const [selectedClasses, setSelectedClasses] = useState(3);
  const [uploadClassCount, setUploadClassCount] = useState(3);
  const [modelFilter, setModelFilter] = useState("ALL");
  const [modelsList, setModelsList] = useState([]);

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
        alert(`📥 [UPLOAD SUCCESS] Model '${file.name}' saved to i.MX8 node!`);
        fetchModels();
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
        setSelectedClasses(model.classes || 3);
        alert(`⚡ [NPU HOT-SWAP SUCCESS]\nModel '${model.name}' activated on i.MX8 NPU Delegate!`);
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
        alert(`🗑️ Deleted model '${model.name}' successfully!`);
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
  const apiBase = `http://${edgeIp}:8000`;

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
      console.log(`Attempting connection to FastAPI server at ${edgeIp}:8000...`);
      ws = new WebSocket(`ws://${edgeIp}:8000/ws`);

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
        }, 3000);
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
      const imx8WsUrl = `ws://${edgeIp}:8000/ws/hardware`;

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

  // ==========================================
  // REPORT DATA EXPORT (CSV SPREADSHEET)
  // ==========================================
  const exportToCSV = () => {
    if (history.length === 0) {
      alert("No data available to export.");
      return;
    }
    const csvRows = [
      ["Timestamp", "Wafer ID", "Decision", "Failure Reason", "Confidence Score (%)", "Inference Latency (ms)", "Rule Execution Time (ms)", "System Action"]
    ];
    history.forEach(rec => {
      csvRows.push([
        rec.timestamp, rec.id, rec.decision, rec.reason || "-",
        rec.confidence, rec.inferenceTime, rec.ruleTime || 0, rec.machineAction
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
  const historyList = Array.isArray(history) ? history : [];
  const uniqueBatches = Array.from(new Set(historyList.map(item => item.batch).filter(b => b && b !== "-")));
  const uniqueMachines = Array.from(new Set(historyList.map(item => item.machineNo || "PROBER01").filter(m => m && m !== "-")));

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
            <button className={`nav-tab ${activeTab === "analytics" ? "active" : ""}`} onClick={() => setActiveTab("analytics")}>ANALYTICS</button>
            <button className={`nav-tab ${activeTab === "models" ? "active" : ""}`} onClick={() => setActiveTab("models")}>MODELS</button>
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

                  <div className="machine-action-block">
                    <div className="machine-action-status" id="machine-action-text">{currentInspection.machineAction}</div>

                    <div className="manual-overrides" style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button id="btn-action-continue" className={`override-btn ${currentInspection.decision === "PASS" ? "active" : ""}`} style={{ flex: 1 }}>CONTINUE</button>
                        <button id="btn-action-stop" className={`override-btn ${currentInspection.decision === "FAIL" ? "active" : ""}`} style={{ flex: 1 }}>STOP</button>
                      </div>
                      <button 
                        className="override-btn" 
                        style={{ width: "100%", background: "rgba(255, 165, 0, 0.2)", border: "1px solid rgba(255, 165, 0, 0.6)", color: "#ffb703", fontWeight: "bold", padding: "8px" }}
                        title="Simulate Prober Machine sending .END.bmp signal to summarize batch judgement TXT"
                        onClick={() => {
                          fetch(`${apiBase}/api/simulate-end`, { method: "POST" })
                            .then(res => res.json())
                            .then(data => {
                              if (data.status === "success") {
                                alert(`🏁 [END SIGNAL TRIGGERED]\nSummarized ${data.totalImages} images!\nResult: ${data.decision} (${data.mask})\nJudgement File Saved: ${data.filename}`);
                              } else {
                                alert(`ℹ️ ${data.message || "No images in current batch queue to summarize."}`);
                              }
                            })
                            .catch(err => alert(`Error sending END signal: ${err}`));
                        }}
                      >
                        🏁 SIMULATE END SIGNAL
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUMMARY PANEL */}
              <div className="hmi-card summary-card">
                <div className="card-header">
                  <h3>SUMMARY</h3>
                  <span className="pill-id" id="wafer-id-tag">{currentInspection.id}</span>
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

            {/* BOTTOM ROW: ALARMS & HISTORY */}
            <section className="grid-row bottom-row">
                {/* ALARM PANEL */}
                <div className="hmi-card alarm-card">
                  <div className="card-header">
                    <h3>ALARMS</h3>
                    <span className="alarm-badge" id="alarm-count-badge">{activeAlarms.length}</span>
                  </div>
                  <div className="card-body">
                    <div className="alarm-list-container" id="alarm-container">
                      {activeAlarms.length === 0 ? (
                        <div className="alarm-empty-state" id="alarm-empty">OK</div>
                      ) : (
                        activeAlarms.map((alarm, idx) => (
                          <div className="alarm-entry-row" key={idx}>
                            <div className="alarm-indicator-red"></div>
                            <div className="alarm-body-content">
                              <div className="alarm-name-lbl">{alarm.name}</div>
                              <div className="alarm-time-lbl font-mono">{alarm.time}</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* HISTORY PANEL */}
                <div className="hmi-card history-card" style={{ flex: 1 }}>
                  <div className="card-header">
                    <h3>HISTORY</h3>
                    <button className="clear-history-btn" id="btn-clear-history" onClick={() => {
                      setHistory([]);
                      setCurrentInspection({
                        id: "-", padsTotal: 0, padsDetected: 0, probeMarks: 0, grains: 0,
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
                          <th>Machine no</th>
                          <th>Batch</th>
                          <th>Wafer no</th>
                          <th>XY Coordinate</th>
                          <th>Time</th>
                          <th>Result</th>
                          <th>Failure Reason</th>
                        </tr>
                      </thead>
                      <tbody id="history-table-body">
                        {history.slice(0, 15).map((item, index) => (
                          <tr key={index} onClick={() => { setSelectedModalItem(item); setCurrentInspection(item); }} title="Click to view inspection image">
                            <td className="font-mono">{item.machineNo || "PROBER01"}</td>
                            <td className="font-mono">{item.batch || "-"}</td>
                            <td className="font-mono">{item.waferNo || item.id || "-"}</td>
                            <td className="font-mono">{item.xyCoord || "-"}</td>
                            <td>{item.timeShort}</td>
                            <td>
                              <span className={`badge-result ${item.decision.toLowerCase()}`}>{item.decision}</span>
                            </td>
                            <td className="font-mono" style={{ fontSize: "13px", color: item.reason && item.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                              {item.reason || "-"}
                            </td>
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
            TAB CONTENT 2: ANALYTICS & REPORTS (Excel Export)
            ========================================== */}
        {activeTab === "analytics" && (
          <div className="tab-content active-tab" id="view-analytics">
            <main className="analytics-layout">
              <div className="analytics-top-bar" style={{ display: "flex", gap: "16px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "12px 20px" }}>
                <div className="filter-controls" style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Result:</label>
                    <div className="filter-pill-group" id="filter-pills">
                      {["ALL", "PASS", "FAIL"].map(pill => (
                        <button key={pill} className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`} onClick={() => setAnalyticsFilter(pill)}>{pill}</button>
                      ))}
                    </div>
                  </div>

                  {uniqueMachines.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Machine:</label>
                      <select 
                        value={analyticsMachineFilter} 
                        onChange={(e) => setAnalyticsMachineFilter(e.target.value)}
                        style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13px" }}
                      >
                        <option value="ALL">All Machines ({uniqueMachines.length})</option>
                        {uniqueMachines.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {uniqueBatches.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Batch:</label>
                      <select 
                        value={analyticsBatchFilter} 
                        onChange={(e) => setAnalyticsBatchFilter(e.target.value)}
                        style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13px" }}
                      >
                        <option value="ALL">All Batches ({uniqueBatches.length})</option>
                        {uniqueBatches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
                    <span style={{ fontSize: "14px" }}>🔍</span>
                    <input 
                      type="text" 
                      id="filter-search" 
                      value={filterSearch} 
                      onChange={(e) => setFilterSearch(e.target.value)} 
                      placeholder="Search Batch, Wafer, XY, Site, Pad, Reason..." 
                      style={{ width: "100%", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13px" }}
                    />
                  </div>

                  {(filterSearch || analyticsFilter !== "ALL" || analyticsBatchFilter !== "ALL" || analyticsMachineFilter !== "ALL") && (
                    <button 
                      style={{ padding: "5px 12px", borderRadius: "6px", border: "none", background: "rgba(255,50,50,0.2)", color: "#ff6b6b", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                      onClick={() => { setFilterSearch(""); setAnalyticsFilter("ALL"); setAnalyticsBatchFilter("ALL"); setAnalyticsMachineFilter("ALL"); }}
                    >
                      Reset Filter ✕
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="excel-export-btn" id="btn-export-excel" onClick={exportToCSV}>
                    <span className="excel-icon"></span> Export spreadsheet (.csv)
                  </button>
                  <button 
                    style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: "bold", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
                    title="Clear all stored inspection history from database"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear all history records from database?")) {
                        fetch(`${apiBase}/api/history`, { method: "DELETE" })
                          .then(r => r.json())
                          .then(res => {
                            setHistory([]);
                            alert("🧹 Database history cleared successfully!");
                          })
                          .catch(e => alert("Failed to clear history: " + e));
                      }
                    }}
                  >
                    Clear DB History 🗑️
                  </button>
                </div>
              </div>

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

                {/* Right side: Line chart + Table */}
                <div className="analytics-dashboard-col right-dashboard-col">
                  <div className="hmi-card line-chart-card">
                    <div className="card-header"><h3>LATENCY HISTORY (MS)</h3></div>
                    <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                      <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                  </div>

                  <div className="hmi-card analytics-table-card">
                    <div className="card-header">
                      <h3>DETAILED PRODUCTION REPORT</h3>
                      <span className="pill-id" id="report-row-count">{filteredHistory.length} Records</span>
                    </div>
                    <div className="card-body table-container">
                      <table className="history-table report-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Machine no</th>
                            <th>Batch</th>
                            <th>Wafer no</th>
                            <th>Pad / Site</th>
                            <th>XY Coordinate</th>
                            <th>Decision</th>
                            <th>Failure Reason</th>
                            <th>Latency</th>
                          </tr>
                        </thead>
                        <tbody id="analytics-table-body">
                          {filteredHistory.map((rec, index) => (
                            <tr key={index} onClick={() => setSelectedModalItem(rec)} title="Click to view inspection image">
                              <td>{rec.timestamp}</td>
                              <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                              <td className="font-mono">{rec.batch || "-"}</td>
                              <td className="font-mono">{rec.waferNo || rec.id || "-"}</td>
                              <td className="font-mono" style={{ color: "var(--accent-color, #3b82f6)", fontWeight: "bold" }}>
                                {rec.pad ? `${rec.pad}${rec.site && rec.site !== '-' ? ` (${rec.site})` : ''}` : "-"}
                              </td>
                              <td className="font-mono">{rec.xyCoord || "-"}</td>
                              <td>
                                <span className={`badge-result ${rec.decision.toLowerCase()}`}>{rec.decision}</span>
                              </td>
                              <td className="font-mono" style={{ fontSize: "13px", color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                                {rec.reason || "-"}
                              </td>
                              <td className="font-mono">{rec.inferenceTime} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        )}

        {/* ==========================================
            TAB CONTENT 3: AI MODEL MANAGER
            ========================================== */}
        {activeTab === "models" && (
          <div className="tab-content active-tab" id="view-models">
            <main className="models-layout">
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
            </main>
          </div>
        )}

        {/* ==========================================
            HISTORICAL INSPECTION IMAGE PREVIEW MODAL
            ========================================== */}
        {selectedModalItem && (
          <div className="modal-overlay" onClick={() => setSelectedModalItem(null)}>
            <div className="modal-content-box hmi-card" onClick={(e) => e.stopPropagation()}>
              <div className="card-header modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <h3 style={{ margin: 0 }}>HISTORICAL INSPECTION</h3>
                  <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                    {selectedModalItem.decision}
                  </span>
                  {history.length > 0 && (
                    <span className="modal-counter-badge">
                      ( ภาพที่ {history.findIndex(item => item.id === selectedModalItem.id) + 1} / {history.length} )
                    </span>
                  )}
                </div>

                <button className="clear-history-btn" onClick={() => setSelectedModalItem(null)}>✕ Close</button>
              </div>

              <div className="card-body modal-body-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "16px", padding: "16px" }}>
                <div className="modal-image-container" style={{ position: "relative", background: "#0b0f19", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "380px" }}>
                  {history.length > 1 && (
                    <>
                      <button 
                        className="modal-nav-arrow left" 
                        onClick={handlePrevModalItem} 
                        title="Previous Image (Left Arrow ◀)"
                      >
                        ◀
                      </button>
                      <button 
                        className="modal-nav-arrow right" 
                        onClick={handleNextModalItem} 
                        title="Next Image (Right Arrow ▶)"
                      >
                        ▶
                      </button>
                    </>
                  )}

                  {selectedModalItem.comparisonImageUrl || selectedModalItem.imageUrl ? (
                    <img
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
                      <div style={{ fontSize: "36px", marginBottom: "8px" }}>🔍</div>
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
                  </div>

                  <button
                    className="override-btn active"
                    style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "bold", background: "var(--accent-blue)", color: "#fff", cursor: "pointer", borderRadius: "6px" }}
                    onClick={() => {
                      setCurrentInspection(selectedModalItem);
                      setActiveTab("inspect");
                      setSelectedModalItem(null);
                    }}
                  >
                    LOAD INTO LIVE VIEW 🖥️
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
