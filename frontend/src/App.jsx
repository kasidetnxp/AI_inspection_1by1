import React, { useState, useEffect, useRef } from "react";

export default function App() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [activeTab, setActiveTab] = useState("inspect");
  const [compareMode, setCompareMode] = useState("overlay");
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

  // Filter Search
  const [filterSearch, setFilterSearch] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState("ALL");

  // Historical Inspection Image Modal State
  const [selectedModalItem, setSelectedModalItem] = useState(null);
  const [modalViewMode, setModalViewMode] = useState("split");

  // Drag and drop uploading state
  const [isDragging, setIsDragging] = useState(false);
  const [loadedImage, setLoadedImage] = useState(null);
  const [loadedRawImage, setLoadedRawImage] = useState(null);
  const [selectedClasses, setSelectedClasses] = useState(3);
  const [uploadClassCount, setUploadClassCount] = useState(3);
  const [modelFilter, setModelFilter] = useState("ALL");
  const [modelsList, setModelsList] = useState([
    { name: "yolov8n-seg-wafer-v2.tflite", version: "v2.0.1", engine: "TFLite / NPU", size: "12.4 MB", accuracy: "97.8%", classes: 3, active: true },
    { name: "yolov8n-2class-padmark.tflite", version: "v2.1.0", engine: "TFLite / NPU", size: "10.2 MB", accuracy: "98.9%", classes: 2, active: false },
    { name: "unet-wafer-efficientnet.tflite", version: "v1.4.2", engine: "TFLite / CPU", size: "28.1 MB", accuracy: "98.5%", classes: 2, active: false },
    { name: "yolov8s-seg-wafer-v1.tflite", version: "v1.0.0", engine: "ONNX / CPU", size: "45.0 MB", accuracy: "96.4%", classes: 3, active: false }
  ]);



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
    if (saved && saved !== "10.42.0.1") return saved;
    const hostname = typeof window !== "undefined" ? window.location.hostname : "10.42.0.95";
    if (!hostname || hostname === "0.0.0.0" || hostname === "::" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "10.42.0.1") {
      return "10.42.0.95";
    }
    return hostname;
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

        // Start hardware stats fetch loop
        pollStats = setInterval(() => {
          fetch(`${apiBase}/api/sys-stats`)
            .then(r => r.json())
            .then(stats => {
              setSysStats({
                cpu: stats.cpu,
                npu: stats.npu,
                ram: stats.ram,
                temp: stats.temp
              });
              setDbType(stats.db);
            })
            .catch(e => console.error(e));
        }, 2000);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.event === "NEW_INSPECTION") {
          mapInspectionData(payload.data);

          // Refresh logs
          fetch(`${apiBase}/api/history`)
            .then(r => r.json())
            .then(data => setHistory(Array.isArray(data) ? data : []))
            .catch(e => setHistory([]));
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
      ctx.font = "bold 10px 'Outfit', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("RAW CAMERA FEED", 150, 30);

      ctx.save();
      ctx.translate(306, 150); ctx.scale(0.48, 0.48);
      drawDieContent(ctx, true);
      ctx.restore();

      ctx.fillStyle = "var(--color-info)";
      ctx.font = "bold 10px 'Outfit', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("AI SEGMENTATION", 450, 30);
    }
  }, [currentDieImage, compareMode, isLight, filters, loadedImage, loadedRawImage, currentInspection]);

  // ==========================================
  // CHARTS RENDERING ENGINE (WebGL/Canvas)
  // ==========================================
  useEffect(() => {
    if (activeTab !== "analytics") return;

    const scaleCanvasChart = (c) => {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      const w = rect.width || c.clientWidth || 300;
      const h = rect.height || c.clientHeight || 150;
      c.width = w * dpr;
      c.height = h * dpr;
      const context = c.getContext("2d");
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      return { w, h };
    };

    const drawDonutSlice = (c, cx, cy, rOut, rIn, sAngle, eAngle, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(cx, cy, rOut, sAngle, eAngle, false);
      c.arc(cx, cy, rIn, eAngle, sAngle, true);
      c.closePath();
      c.fill();
    };

    const drawLegendItem = (c, x, y, dotColor, labelText, txtColor) => {
      c.fillStyle = dotColor;
      c.beginPath(); c.arc(x, y - 3, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = txtColor;
      c.font = "600 10px 'Outfit', sans-serif"; c.textAlign = "left";
      c.fillText(labelText, x + 10, y);
    };

    const labelColor = isLight ? "#475569" : "#94a3b8";
    const gridColor = isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.03)";
    const textColor = isLight ? "#0f172a" : "#f1f5f9";

    const passColor = isLight ? "#059669" : "#10b981";
    const warnColor = isLight ? "#d97706" : "#f59e0b";
    const failColor = isLight ? "#dc2626" : "#ef4444";
    const infoColor = isLight ? "#0284c7" : "#38bdf8";

    // 1. DONUT CHART (PASS vs FAIL)
    const donutC = donutCanvasRef.current;
    if (donutC) {
      const { w, h } = scaleCanvasChart(donutC);
      const c = donutC.getContext("2d");
      c.clearRect(0, 0, w, h);

      let pass = 0, fail = 0;
      history.forEach(r => {
        if (r.decision === "PASS") pass++;
        else fail++;
      });
      const total = pass + fail;

      const cx = w * 0.35, cy = h * 0.5;
      const rOuter = Math.min(w * 0.28, h * 0.38), rInner = rOuter * 0.65;

      if (total === 0) {
        c.strokeStyle = gridColor; c.lineWidth = 12;
        c.beginPath(); c.arc(cx, cy, rOuter - 6, 0, Math.PI * 2); c.stroke();
        c.fillStyle = labelColor; c.font = "10px 'Outfit'"; c.textAlign = "center";
        c.fillText("No Data", cx, cy + 4);
      } else {
        const pPass = pass / total, pFail = fail / total;
        let startAngle = -Math.PI / 2;

        if (pPass > 0) {
          const e = startAngle + (Math.PI * 2 * pPass);
          drawDonutSlice(c, cx, cy, rOuter, rInner, startAngle, e, passColor);
          startAngle = e;
        }
        if (pFail > 0) {
          const e = startAngle + (Math.PI * 2 * pFail);
          drawDonutSlice(c, cx, cy, rOuter, rInner, startAngle, e, failColor);
          startAngle = e;
        }
        const yieldPct = total > 0 ? ((pass / total) * 100).toFixed(0) : 0;
        c.fillStyle = textColor; c.font = "bold 15px 'Outfit', sans-serif"; c.textAlign = "center";
        c.fillText(`${yieldPct}%`, cx, cy - 1);
        c.fillStyle = labelColor; c.font = "600 8px 'Outfit', sans-serif";
        c.fillText("YIELD", cx, cy + 9);
      }
      const lx = cx + rOuter + 20, ly = cy - 12, spacing = 24;
      drawLegendItem(c, lx, ly, passColor, `PASS: ${pass}`, labelColor);
      drawLegendItem(c, lx, ly + spacing, failColor, `FAIL: ${fail}`, labelColor);
    }

    // 2. BAR CHART (DEFECT CAUSE BREAKDOWN)
    const barC = barCanvasRef.current;
    if (barC) {
      const { w, h } = scaleCanvasChart(barC);
      const c = barC.getContext("2d");
      c.clearRect(0, 0, w, h);

      let bigMark = 0, closeEdge = 0, noMark = 0;
      history.forEach(r => {
        const r_str = (r.reason || "").toLowerCase();
        const a_str = (r.alarms || []).map(a => a.name.toLowerCase()).join(" ");
        if (r_str.includes("big") || r_str.includes("area too large") || a_str.includes("big")) {
          bigMark++;
        } else if (r_str.includes("no probe") || r_str.includes("missing") || r_str.includes("cannot classify") || a_str.includes("no probe") || a_str.includes("missing")) {
          noMark++;
        } else if (r.decision === "FAIL") {
          closeEdge++;
        }
      });

      const categories = [
        { label: "Big Probe Mark", count: bigMark, color: "#ef4444" },
        { label: "Close to Edge", count: closeEdge, color: "#f97316" },
        { label: "No Probe Mark", count: noMark, color: "#a855f7" }
      ];

      const maxCount = Math.max(5, ...categories.map(cat => cat.count));
      const marginL = 120, marginR = 30, marginT = 18, gap = 16, barH = 18;

      categories.forEach((cat, idx) => {
        const y = marginT + idx * (barH + gap);
        const barW = maxCount > 0 ? (cat.count / maxCount) * (w - marginL - marginR) : 0;

        // Label
        c.fillStyle = labelColor;
        c.font = "600 10px 'Outfit', sans-serif";
        c.textAlign = "right";
        c.fillText(cat.label, marginL - 10, y + 13);

        // Track
        c.fillStyle = gridColor;
        c.fillRect(marginL, y, w - marginL - marginR, barH);

        // Fill Bar
        if (barW > 0) {
          c.fillStyle = cat.color;
          c.fillRect(marginL, y, barW, barH);
        }

        // Count Text
        c.fillStyle = textColor;
        c.font = "bold 10px 'JetBrains Mono', monospace";
        c.textAlign = "left";
        c.fillText(`${cat.count}`, marginL + barW + 6, y + 13);
      });
    }

    // 2. LINE CHART
    const lineC = lineCanvasRef.current;
    if (lineC) {
      const { w, h } = scaleCanvasChart(lineC);
      const c = lineC.getContext("2d");
      c.clearRect(0, 0, w, h);

      const dataset = history.slice(-10);
      const marginL = 35, marginR = 15, marginT = 20, marginB = 25;
      const gw = w - marginL - marginR, gh = h - marginT - marginB;

      const maxDataVal = Math.max(30, ...dataset.map(d => Number(d.inferenceTime) || 0));
      const maxVal = Math.ceil((maxDataVal * 1.15) / 10) * 10 || 150;
      const stepVal = Math.round(maxVal / 3);
      const yTicks = [0, stepVal, stepVal * 2, maxVal];

      c.strokeStyle = gridColor; c.lineWidth = 1;
      c.fillStyle = labelColor; c.font = "500 8px 'JetBrains Mono', monospace"; c.textAlign = "right";

      yTicks.forEach(tick => {
        const y = marginT + gh - (tick / maxVal) * gh;
        c.beginPath(); c.moveTo(marginL, y); c.lineTo(w - marginR, y); c.stroke();
        c.fillText(`${tick}`, marginL - 6, y + 3);
      });

      if (dataset.length === 0) {
        c.textAlign = "center"; c.font = "10px 'Outfit'";
        c.fillText("No Trend Data Available", w / 2, h / 2);
      } else {
        const points = [];
        const stepX = dataset.length > 1 ? gw / (dataset.length - 1) : gw;
        dataset.forEach((data, index) => {
          const x = marginL + index * stepX;
          const y = marginT + gh - (data.inferenceTime / maxVal) * gh;
          points.push({ x, y, val: data.inferenceTime, id: data.id.replace("#WF-", "") });
        });

        // Area Gradient
        const grad = c.createLinearGradient(0, marginT, 0, marginT + gh);
        grad.addColorStop(0, isLight ? "rgba(2, 132, 199, 0.2)" : "rgba(56, 189, 248, 0.2)");
        grad.addColorStop(1, isLight ? "rgba(2, 132, 199, 0.0)" : "rgba(56, 189, 248, 0.0)");

        c.fillStyle = grad;
        c.beginPath();
        points.forEach((pt, idx) => {
          if (idx === 0) c.moveTo(pt.x, pt.y); else c.lineTo(pt.x, pt.y);
        });
        c.lineTo(points[points.length - 1].x, marginT + gh);
        c.lineTo(points[0].x, marginT + gh);
        c.closePath();
        c.fill();

        // Line Stroke
        c.strokeStyle = infoColor; c.lineWidth = 2; c.beginPath();
        points.forEach((pt, idx) => {
          if (idx === 0) c.moveTo(pt.x, pt.y); else c.lineTo(pt.x, pt.y);
        });
        c.stroke();

        // Data Points
        points.forEach(pt => {
          c.fillStyle = infoColor; c.beginPath(); c.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2); c.fill();
          c.strokeStyle = isLight ? "#ffffff" : "#0f172a"; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = textColor; c.font = "bold 8px 'JetBrains Mono', monospace"; c.textAlign = "center";
          c.fillText(pt.val.toFixed(0), pt.x, pt.y - 7);
          c.fillStyle = labelColor; c.font = "500 7px 'JetBrains Mono', monospace";
          c.fillText(pt.id, pt.x, marginT + gh + 12);
        });
      }
    }
  }, [history, activeTab, isLight]);

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

  // Filter logs logic
  const historyList = Array.isArray(history) ? history : [];
  const filteredHistory = historyList.filter(record => {
    const matchType = (analyticsFilter === "ALL" || record.decision === analyticsFilter);
    const matchQuery = (record.id.toUpperCase().includes(filterSearch.toUpperCase()));
    return matchType && matchQuery;
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
                <div className="status-pill online" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)", color: "var(--color-pass)", fontSize: "9px", padding: "4px 8px", borderRadius: "4px", fontWeight: "600", fontFamily: "var(--font-display)", textTransform: "uppercase" }}>
                  DB: {dbType}
                </div>
              )}
              <div className="status-pill" style={{ background: "rgba(2, 132, 199, 0.08)", border: "1px solid rgba(2, 132, 199, 0.25)", padding: "2px 6px", borderRadius: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "9px", fontWeight: "bold", color: "var(--color-info)" }}>EDGE IP:</span>
                <input 
                  type="text" 
                  value={edgeIp} 
                  onChange={(e) => updateEdgeIp(e.target.value)} 
                  style={{ background: "transparent", border: "none", color: "inherit", fontSize: "10px", fontFamily: "var(--font-mono)", width: "85px", outline: "none", fontWeight: "bold" }}
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

                    <div className="manual-overrides">
                      <button id="btn-action-continue" className={`override-btn ${currentInspection.decision === "PASS" ? "active" : ""}`}>CONTINUE</button>
                      <button id="btn-action-stop" className={`override-btn ${currentInspection.decision === "FAIL" ? "active" : ""}`}>STOP</button>
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
                  <div className="header-with-toggles">
                    <div className="view-header-title">
                      <h3>LIVE VIEW</h3>
                      <div className="compare-toggle">
                        <button id="btn-compare-overlay" className={`compare-btn ${compareMode === "overlay" ? "active" : ""}`} onClick={() => setCompareMode("overlay")}>Overlay</button>
                        <button id="btn-compare-split" className={`compare-btn ${compareMode === "split" ? "active" : ""}`} onClick={() => setCompareMode("split")}>Split Compare</button>
                      </div>
                    </div>

                    <div className="overlay-toggles">
                      <label className="toggle-cb label-pad">
                        <input type="checkbox" checked={filters.pad} onChange={() => setFilters(prev => ({ ...prev, pad: !prev.pad }))} />
                        <span className="cb-custom"></span> Pads
                      </label>
                      <label className="toggle-cb label-mark">
                        <input type="checkbox" checked={filters.mark} onChange={() => setFilters(prev => ({ ...prev, mark: !prev.mark }))} />
                        <span className="cb-custom"></span> Marks
                      </label>
                      <label className="toggle-cb label-grain">
                        <input type="checkbox" checked={filters.grain} onChange={() => setFilters(prev => ({ ...prev, grain: !prev.grain }))} />
                        <span className="cb-custom"></span> Grains
                      </label>
                      <label className="toggle-cb label-grid">
                        <input type="checkbox" checked={filters.grid} onChange={() => setFilters(prev => ({ ...prev, grid: !prev.grid }))} />
                        <span className="cb-custom"></span> Grid
                      </label>
                    </div>
                  </div>
                </div>

                <div className="card-body canvas-container">
                  <canvas ref={canvasRef} id="wafer-canvas"></canvas>
                  <div ref={scannerRef} className="scanning-bar" id="scanner-line"></div>

                  <div className="cam-overlay-info">
                    <span className="fps-counter" id="fps-val">30.0 FPS</span>
                    <span className="lens-tag font-mono">10X</span>
                  </div>
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
                      <span className="perf-val font-mono" id="npu-text">{sysStats.npu}%</span>
                    </div>
                    <div className="perf-tile">
                      <span className="perf-lbl">RAM</span>
                      <span className="perf-val font-mono" id="ram-text-short">{sysStats.ram}M</span>
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
                          <th>Time</th>
                          <th>ID</th>
                          <th>Result</th>
                          <th>Failure Reason</th>
                          <th>Confidence</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody id="history-table-body">
                        {history.slice(0, 15).map((item, index) => (
                          <tr key={index} onClick={() => { setSelectedModalItem(item); setCurrentInspection(item); }} title="Click to view inspection image">
                            <td>{item.timeShort}</td>
                            <td className="font-mono">{item.id}</td>
                            <td>
                              <span className={`badge-result ${item.decision.toLowerCase()}`}>{item.decision}</span>
                            </td>
                            <td className="font-mono" style={{ fontSize: "11px", color: item.reason && item.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                              {item.reason || "-"}
                            </td>
                            <td className="font-mono">{item.confidence}%</td>
                            <td className="font-mono" style={{ fontSize: "10px" }}>{item.machineAction}</td>
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
              <div className="analytics-top-bar">
                <div className="filter-controls">
                  <div className="filter-item">
                    <label>Result Filter:</label>
                    <div className="filter-pill-group" id="filter-pills">
                      {["ALL", "PASS", "FAIL"].map(pill => (
                        <button key={pill} className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`} onClick={() => setAnalyticsFilter(pill)}>{pill}</button>
                      ))}
                    </div>
                  </div>
                  <div className="filter-item">
                    <label htmlFor="filter-search">Search:</label>
                    <input type="text" id="filter-search" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search Wafer ID..." />
                  </div>
                </div>
                <button className="excel-export-btn" id="btn-export-excel" onClick={exportToCSV}>
                  <span className="excel-icon"></span> Export spreadsheet (.csv)
                </button>
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
                    <div className="card-body chart-body">
                      <canvas ref={donutCanvasRef} id="chart-yield-donut"></canvas>
                    </div>
                  </div>

                  <div className="hmi-card bar-chart-card">
                    <div className="card-header"><h3>DEFECT CAUSES BREAKDOWN</h3></div>
                    <div className="card-body chart-body">
                      <canvas ref={barCanvasRef} id="chart-defect-bar"></canvas>
                    </div>
                  </div>
                </div>

                {/* Right side: Line chart + Table */}
                <div className="analytics-dashboard-col right-dashboard-col">
                  <div className="hmi-card line-chart-card">
                    <div className="card-header"><h3>LATENCY HISTORY (MS)</h3></div>
                    <div className="card-body chart-body">
                      <canvas ref={lineCanvasRef} id="chart-latency-line"></canvas>
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
                            <th>Wafer ID</th>
                            <th>Decision</th>
                            <th>Failure Reason</th>
                            <th>Confidence</th>
                            <th>Latency</th>
                            <th>System Action</th>
                          </tr>
                        </thead>
                        <tbody id="analytics-table-body">
                          {filteredHistory.map((rec, index) => (
                            <tr key={index} onClick={() => setSelectedModalItem(rec)} title="Click to view inspection image">
                              <td>{rec.timestamp}</td>
                              <td className="font-mono">{rec.id}</td>
                              <td>
                                <span className={`badge-result ${rec.decision.toLowerCase()}`}>{rec.decision}</span>
                              </td>
                              <td className="font-mono" style={{ fontSize: "11px", color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                                {rec.reason || "-"}
                              </td>
                              <td className="font-mono">{rec.confidence}%</td>
                              <td className="font-mono">{rec.inferenceTime} ms</td>
                              <td className="font-mono" style={{ fontSize: "9px" }}>{rec.machineAction}</td>
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
                            const newModel = {
                              name: files[0].name,
                              version: "v1.0.0",
                              engine: files[0].name.endsWith(".tflite") ? "TFLite / NPU" : "ONNX / CPU",
                              size: `${(files[0].size / (1024 * 1024)).toFixed(1)} MB`,
                              accuracy: "95.0%",
                              classes: uploadClassCount,
                              active: false
                            };
                            setModelsList(prev => [newModel, ...prev]);
                          }
                        }}
                      >
                        <div className="upload-icon-box"></div>
                        <p className="upload-main-text">Drag & Drop model file here</p>
                        <p className="upload-sub-text">Imports as {uploadClassCount}-Class Model (.onnx, .tflite)</p>
                        <button className="select-file-btn" id="btn-select-file">Select File</button>
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
                              const originalIdx = modelsList.findIndex(m => m.name === model.name);
                              const isClassCompatible = (model.classes || 3) === selectedClasses;
                              return (
                                <tr key={idx} className={model.active ? "row-active-model" : ""}>
                                  <td className="font-mono">{model.name}</td>
                                  <td className="font-mono">{model.version}</td>
                                  <td className="font-mono">{model.engine}</td>
                                  <td className="font-mono">{model.size}</td>
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
                                  <td className="font-mono">{model.accuracy}</td>
                                  <td>
                                    <span className={`badge-result ${model.active ? "pass" : "warn"}`}>
                                      {model.active ? `ACTIVE RUNNING (${model.classes}C)` : "INACTIVE"}
                                    </span>
                                  </td>
                                  <td>
                                    {model.active ? (
                                      <button className="action-btn-sm active-green" disabled>IN USE</button>
                                    ) : (
                                      <div style={{ display: "flex", gap: "6px" }}>
                                        <button
                                          className="action-btn-sm"
                                          onClick={() => {
                                            setSelectedClasses(model.classes || 3);
                                            setModelsList(prev => prev.map((m, i) => ({ ...m, active: i === originalIdx })));
                                          }}
                                          title={`Activate model and switch system mode to ${model.classes || 3} Classes`}
                                        >
                                          ACTIVATE ({model.classes || 3}C)
                                        </button>
                                        <button className="action-btn-sm delete-red" onClick={() => {
                                          setModelsList(prev => prev.filter((_, i) => i !== originalIdx));
                                        }}>DELETE</button>
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
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h3>HISTORICAL INSPECTION: {selectedModalItem.id}</h3>
                  <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>
                    {selectedModalItem.decision}
                  </span>
                </div>
                <button className="clear-history-btn" onClick={() => setSelectedModalItem(null)}>✕ Close</button>
              </div>

              <div className="card-body modal-body-grid" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", padding: "16px" }}>
                <div className="modal-image-container" style={{ position: "relative", background: "#0b0f19", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "380px" }}>
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

                  <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "4px" }}>
                    <button
                      className={`compare-btn ${modalViewMode === "split" ? "active" : ""}`}
                      onClick={() => setModalViewMode("split")}
                    >
                      Split Compare
                    </button>
                    <button
                      className={`compare-btn ${modalViewMode === "annotated" ? "active" : ""}`}
                      onClick={() => setModalViewMode("annotated")}
                    >
                      Annotated
                    </button>
                    <button
                      className={`compare-btn ${modalViewMode === "raw" ? "active" : ""}`}
                      onClick={() => setModalViewMode("raw")}
                    >
                      Raw Image
                    </button>
                  </div>
                </div>

                <div className="modal-meta-panel" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="model-meta-box" style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div className="meta-row">
                      <span className="meta-lbl">Wafer ID:</span>
                      <span className="meta-val font-mono">{selectedModalItem.id}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Timestamp:</span>
                      <span className="meta-val font-mono">{selectedModalItem.timestamp}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Result:</span>
                      <span className={`badge-result ${selectedModalItem.decision.toLowerCase()}`}>{selectedModalItem.decision}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Failure Reason:</span>
                      <span className="meta-val font-mono" style={{ color: selectedModalItem.reason && selectedModalItem.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                        {selectedModalItem.reason || "-"}
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Machine Action:</span>
                      <span className="meta-val font-mono">{selectedModalItem.machineAction}</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Confidence:</span>
                      <span className="meta-val font-mono highlight-green">{selectedModalItem.confidence}%</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Inference Latency:</span>
                      <span className="meta-val font-mono highlight-blue">{selectedModalItem.inferenceTime} ms</span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-lbl">Rule Time:</span>
                      <span className="meta-val font-mono highlight-green">{selectedModalItem.ruleTime || 0} ms</span>
                    </div>
                  </div>

                  <button
                    className="override-btn active"
                    style={{ width: "100%", padding: "10px", fontSize: "11px", fontWeight: "bold", background: "var(--accent-blue)", color: "#fff", cursor: "pointer", borderRadius: "6px" }}
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
