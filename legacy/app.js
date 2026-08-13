/**
 * AI Wafer Inspection System HMI Controller
 * Running on NXP i.MX8 Edge Device
 */

document.addEventListener("DOMContentLoaded", () => {
  
  // ==========================================
  // HMI STATE & VARIABLES
  // ==========================================
  const state = {
    activeTab: "inspect", // inspect, analytics, models
    compareMode: "overlay", // overlay, split
    isContinuousRunning: false,
    cycleTimeout: null,
    cycleRateMs: 3000,
    inspectionCount: 0,
    analyticsFilter: "ALL", // ALL, PASS, WARNING, FAIL
    stats: {
      total: 1420,
      pass: 1312,
      warn: 78,
      fail: 30,
      overkill: 0.45,
      underkill: 0.02
    },
    activeAlarms: [],
    history: [], // Stores all inspection records
    currentInspection: {
      id: "#WF-2940",
      padsTotal: 12,
      padsDetected: 12,
      probeMarks: 12,
      grains: 0,
      confidence: 99.2,
      inferenceTime: 18.2,
      ruleTime: 0.4,
      decision: "PASS",
      machineAction: "CONTINUE PROCESS"
    },
    // Visual toggles
    filters: {
      pad: true,
      mark: true,
      grain: true,
      grid: true
    },
    currentDieImage: {
      seed: 0.42,
      pads: [],
      grains: []
    },
    // AI Model list
    models: [
      { name: "yolov8n-seg", version: "v2.1", type: "ONNX / TFLite", size: "14.2 MB", map: "0.945", active: true },
      { name: "u-net-wafer", version: "v1.0", type: "TFLite", size: "22.5 MB", map: "0.932", active: true },
      { name: "yolov8s-seg-v2", version: "v2.2", type: "ONNX", size: "42.1 MB", map: "0.958", active: false },
      { name: "fast-seg-v1", version: "v0.9", type: "TFLite", size: "8.4 MB", map: "0.910", active: false }
    ]
  };

  // ==========================================
  // DOM ELEMENT REFERENCES
  // ==========================================
  const els = {
    appWrapper: document.getElementById("app-wrapper"),
    btnThemeDark: document.getElementById("btn-theme-dark"),
    btnThemeLight: document.getElementById("btn-theme-light"),
    btnRoleOperator: document.getElementById("btn-role-operator"),
    btnRoleEngineer: document.getElementById("btn-role-engineer"),
    operatorFilename: document.getElementById("operator-filename"),
    
    // Navigation Tabs
    tabInspect: document.getElementById("tab-inspect"),
    tabAnalytics: document.getElementById("tab-analytics"),
    tabModels: document.getElementById("tab-models"),
    
    viewInspect: document.getElementById("view-inspect"),
    viewAnalytics: document.getElementById("view-analytics"),
    viewModels: document.getElementById("view-models"),
    
    // Header
    imx8Status: document.getElementById("imx8-status"),
    proberStatus: document.getElementById("prober-status"),
    liveTime: document.getElementById("live-time"),
    
    // Canvas & Controls
    canvas: document.getElementById("wafer-canvas"),
    scannerLine: document.getElementById("scanner-line"),
    fpsVal: document.getElementById("fps-val"),
    chkPad: document.getElementById("chk-pad"),
    chkMark: document.getElementById("chk-mark"),
    chkGrain: document.getElementById("chk-grain"),
    chkGrid: document.getElementById("chk-grid"),
    
    btnCompareOverlay: document.getElementById("btn-compare-overlay"),
    btnCompareSplit: document.getElementById("btn-compare-split"),
    
    btnSimStart: document.getElementById("btn-sim-start"),
    btnSimStep: document.getElementById("btn-sim-step"),
    btnSimDefect: document.getElementById("btn-sim-defect"),
    selSpeed: document.getElementById("sel-speed"),
    
    // Decision & Summary
    decisionIndicator: document.getElementById("decision-indicator"),
    machineActionText: document.getElementById("machine-action-text"),
    btnActionContinue: document.getElementById("btn-action-continue"),
    btnActionWarning: document.getElementById("btn-action-warning"),
    btnActionStop: document.getElementById("btn-action-stop"),
    
    valPadCount: document.getElementById("val-pad-count"),
    valMarkCount: document.getElementById("val-mark-count"),
    valGrainCount: document.getElementById("val-grain-count"),
    valConfidence: document.getElementById("val-confidence"),
    valInferenceTime: document.getElementById("val-inference-time"),
    valRuleTime: document.getElementById("val-rule-time"),
    
    // Stats Panel
    statTotal: document.getElementById("stat-total"),
    statPass: document.getElementById("stat-pass"),
    statWarn: document.getElementById("stat-warn"),
    statFail: document.getElementById("stat-fail"),
    statYield: document.getElementById("stat-yield"),
    statOverkill: document.getElementById("stat-overkill"),
    statUnderkill: document.getElementById("stat-underkill"),
    
    // Performance
    cpuText: document.getElementById("cpu-text"),
    cpuBar: document.getElementById("cpu-bar"),
    npuText: document.getElementById("npu-text"),
    npuBar: document.getElementById("npu-bar"),
    ramText: document.getElementById("ram-text"),
    ramTextShort: document.getElementById("ram-text-short"),
    ramBar: document.getElementById("ram-bar"),
    tempText: document.getElementById("temp-text"),
    tempBar: document.getElementById("temp-bar"),
    
    activeModelName: document.getElementById("active-model-name"),
    activeModelClassifier: document.getElementById("active-model-classifier"),
    
    // Alarms & History
    alarmContainer: document.getElementById("alarm-container"),
    alarmEmpty: document.getElementById("alarm-empty"),
    alarmCountBadge: document.getElementById("alarm-count-badge"),
    historyTableBody: document.getElementById("history-table-body"),
    btnClearHistory: document.getElementById("btn-clear-history"),
    
    // Analytics panel elements
    filterSearch: document.getElementById("filter-search"),
    btnExportExcel: document.getElementById("btn-export-excel"),
    anTotalInspected: document.getElementById("an-total-inspected"),
    anYieldRate: document.getElementById("an-yield-rate"),
    anDefectRate: document.getElementById("an-defect-rate"),
    anAvgConfidence: document.getElementById("an-avg-confidence"),
    analyticsTableBody: document.getElementById("analytics-table-body"),
    reportRowCount: document.getElementById("report-row-count"),
    
    // Canvas Charts
    chartYieldDonut: document.getElementById("chart-yield-donut"),
    chartLatencyLine: document.getElementById("chart-latency-line"),
    
    // Models uploader elements
    uploadZone: document.getElementById("upload-zone"),
    fileUploaderInput: document.getElementById("file-uploader-input"),
    btnSelectFile: document.getElementById("btn-select-file"),
    uploadProgressBox: document.getElementById("upload-progress-box"),
    uploadFileName: document.getElementById("upload-file-name"),
    uploadPercentText: document.getElementById("upload-percent-text"),
    uploadProgressFill: document.getElementById("upload-progress-fill"),
    uploadStatusText: document.getElementById("upload-status-text"),
    modelsTableBody: document.getElementById("models-table-body")
  };

  // Setup contexts for charts
  const donutCtx = els.chartYieldDonut.getContext("2d");
  const lineCtx = els.chartLatencyLine.getContext("2d");
  const ctx = els.canvas.getContext("2d");

  // ==========================================
  // INITIALIZATION
  // ==========================================
  function init() {
    setupEventListeners();
    setupCanvas();
    setupResizeObserver();
    startClock();
    
    // Run startup connection sequence
    runConnectionSequence();
    
    // Generate initial wafer die simulation data
    generateDieSimulationData(false); 
    renderWafer();
    
    // Populate database
    populateInitialHistory();
    updateStatsUI();
    renderModelsList();
    
    // Check if Python backend is available
    checkBackendConnection();
  }

  // ==========================================
  // CONNECTION SEQUENCE SIMULATOR
  // ==========================================
  function runConnectionSequence() {
    setTimeout(() => {
      els.imx8Status.classList.remove("offline");
      els.imx8Status.classList.add("online");
      els.imx8Status.querySelector(".status-label").textContent = "EDGE: ONLINE";
      
      setTimeout(() => {
        els.proberStatus.classList.remove("offline");
        els.proberStatus.classList.add("online");
        els.proberStatus.querySelector(".status-label").textContent = "PROBER: READY";
      }, 1000);
    }, 800);
  }

  // ==========================================
  // DATETIME CLOCK
  // ==========================================
  function startClock() {
    function updateClock() {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      els.liveTime.textContent = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
  }

  // ==========================================
  // CANVAS CONFIGURATION & DYNAMIC HIGH-DPI SCALING
  // ==========================================
  function scaleCanvasWafer(canvas) {
    const dpr = window.devicePixelRatio || 1;
    
    // Get actual client layout size (always square)
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width || canvas.clientWidth || 600, rect.height || canvas.clientHeight || 600);
    const val = size > 0 ? size : 600;
    
    canvas.width = val * dpr;
    canvas.height = val * dpr;
    
    const context = canvas.getContext("2d");
    context.setTransform(1, 0, 0, 1, 0, 0); // reset scale transform matrix
    
    // Scale context so drawing in virtual 600x600 maps to physical pixels
    context.scale((val * dpr) / 600, (val * dpr) / 600);
  }

  function scaleCanvasChart(canvas) {
    const dpr = window.devicePixelRatio || 1;
    
    // Get client layout bounds from CSS container flex dimensions
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 300;
    const h = rect.height || canvas.clientHeight || 150;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    
    const context = canvas.getContext("2d");
    context.setTransform(1, 0, 0, 1, 0, 0); // reset transform matrix
    context.scale(dpr, dpr); // scale context by physical pixel ratio
    
    return { w, h };
  }

  function setupCanvas() {
    scaleCanvasWafer(els.canvas);
  }

  function setupResizeObserver() {
    let waferSize = { w: 0, h: 0 };
    let donutSize = { w: 0, h: 0 };
    let lineSize = { w: 0, h: 0 };

    const observer = new ResizeObserver((entries) => {
      // Throttle redraws using requestAnimationFrame and check size adjustments to prevent infinite loops
      requestAnimationFrame(() => {
        for (let entry of entries) {
          const rect = entry.contentRect;
          const w = Math.floor(rect.width);
          const h = Math.floor(rect.height);
          
          if (entry.target === els.canvas.parentElement) {
            if (w !== waferSize.w || h !== waferSize.h) {
              waferSize = { w, h };
              renderWafer();
            }
          } else if (entry.target === els.chartYieldDonut.parentElement) {
            if (w !== donutSize.w || h !== donutSize.h) {
              donutSize = { w, h };
              if (state.activeTab === "analytics") renderCharts();
            }
          } else if (entry.target === els.chartLatencyLine.parentElement) {
            if (w !== lineSize.w || h !== lineSize.h) {
              lineSize = { w, h };
              if (state.activeTab === "analytics") renderCharts();
            }
          }
        }
      });
    });
    
    if (els.canvas.parentElement) observer.observe(els.canvas.parentElement);
    if (els.chartYieldDonut.parentElement) observer.observe(els.chartYieldDonut.parentElement);
    if (els.chartLatencyLine.parentElement) observer.observe(els.chartLatencyLine.parentElement);
  }

  function generateDieSimulationData(forceDefect = false) {
    const grains = [];
    state.activeAlarms = [];
    
    let anomalyType = 0;
    if (forceDefect) {
      // 1: Missing Mark, 2: Double Hits, 3: passivation Scratch, 4: Grains, 5: Misaligned Edge Hit
      anomalyType = Math.floor(Math.random() * 5) + 1;
    } else {
      if (Math.random() < 0.18) {
        anomalyType = Math.floor(Math.random() * 5) + 1;
      }
    }

    let confidence = +(97.8 + Math.random() * 2.0).toFixed(1);
    let infTime = +(15.8 + Math.random() * 3.5).toFixed(1);
    
    let marksList = [];
    let isPadDetectedByAI = true;
    
    if (anomalyType === 1) {
      // Missed hit (No probe mark)
      marksList = [];
      state.activeAlarms.push({ name: "Probe Mark Missing (Missed Hit)", time: getShortTime() });
    } else if (anomalyType === 2) {
      // Double hit ovals
      marksList = [
        { dx: -25, dy: -20, rx: 24, ry: 16, rot: 0.2 },
        { dx: 30, dy: 25, rx: 20, ry: 14, rot: -0.3 }
      ];
      state.activeAlarms.push({ name: "Double Hit Detected", time: getShortTime() });
    } else if (anomalyType === 3) {
      // Passivation Scratch
      marksList = [
        { dx: -10, dy: 10, rx: 24, ry: 16, rot: 0.1 },
        { dx: 15, dy: 15, isScratch: true } 
      ];
      state.activeAlarms.push({ name: "Critical Passivation Scratch", time: getShortTime() });
    } else if (anomalyType === 5) {
      // Misaligned Hit (Border Hit)
      marksList = [
        { dx: 165, dy: -140, rx: 26, ry: 18, rot: 0.4 }
      ];
      state.activeAlarms.push({ name: "Probe Mark Misaligned (Border Hit)", time: getShortTime() });
    } else {
      // Normal centered single hit
      const dx = -15 + Math.random() * 30;
      const dy = -15 + Math.random() * 30;
      marksList = [
        { dx: dx, dy: dy, rx: 24, ry: 16, rot: 0.1 }
      ];
    }

    // Generate dust grains directly on the pad area (120 to 480 px)
    let grainCount = 0;
    if (anomalyType === 4) {
      grainCount = Math.floor(Math.random() * 4) + 3;
      state.activeAlarms.push({ name: "Dust Contamination Alert", time: getShortTime() });
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

    // Low confidence alarm
    if (anomalyType === 5 && Math.random() < 0.3) {
      confidence = +(81.4 + Math.random() * 6.0).toFixed(1);
      state.activeAlarms.push({ name: "AI Inference Confidence Alert", time: getShortTime() });
    }

    // Process rule engine results
    let decision = "PASS";
    let proberAction = "CONTINUE PROCESS";
    
    const activeAlarmNames = state.activeAlarms.map(a => a.name);
    const hasCritical = activeAlarmNames.some(n => n.includes("Missing") || n.includes("Scratch") || n.includes("Contamination"));
    const hasWarning = activeAlarmNames.some(n => n.includes("Double Hit") || n.includes("Misaligned") || n.includes("Confidence"));

    if (hasCritical || grains.length >= 3) {
      decision = "FAIL";
      proberAction = "STOP MACHINE";
    } else if (hasWarning || grains.length > 0) {
      decision = "WARNING";
      proberAction = "WARN OPERATOR";
    }

    state.currentInspection = {
      id: `#WF-${2940 + state.inspectionCount}`,
      padsTotal: 1, 
      padsDetected: isPadDetectedByAI ? 1 : 0,
      probeMarks: marksList.length,
      grains: grains.length,
      confidence: confidence,
      inferenceTime: infTime,
      ruleTime: +(0.2 + Math.random() * 0.1).toFixed(1),
      decision: decision,
      machineAction: proberAction
    };

    state.currentDieImage.pads = [{
      id: 1,
      x: 300,
      y: 300,
      detected: isPadDetectedByAI,
      marks: marksList
    }];
    state.currentDieImage.grains = grains;
  }

  // ==========================================
  // WAFER DYNAMIC CANVAS RENDERER
  // ==========================================
  function renderWafer() {
    scaleCanvasWafer(els.canvas);
    
    if (state.compareMode === "overlay") {
      drawDieContent(true);
    } else {
      const w = 600;
      const h = 600;
      const isLight = document.body.classList.contains("light-theme");
      
      // Draw divider line
      ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      
      // LEFT HALF: RAW SENSOR FEED
      ctx.save();
      ctx.translate(6, 150); // Shift slightly and center vertically
      ctx.scale(0.48, 0.48);
      drawDieContent(false);
      ctx.restore();
      
      ctx.fillStyle = isLight ? "#64748b" : "#94a3b8";
      ctx.font = "bold 10px 'Outfit', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("RAW CAMERA FEED", w / 4, 30);
      
      // RIGHT HALF: AI OVERLAYS
      ctx.save();
      ctx.translate(w / 2 + 6, 150); // Shift slightly and center vertically
      ctx.scale(0.48, 0.48);
      drawDieContent(true);
      ctx.restore();
      
      ctx.fillStyle = "var(--color-info)";
      ctx.font = "bold 10px 'Outfit', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AI SEGMENTATION", (3 * w) / 4, 30);
    }
  }

  function drawRoundedRect(c, x, y, width, height, radius, fill, stroke) {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + width, y, x + width, y + height, radius);
    c.arcTo(x + width, y + height, x, y + height, radius);
    c.arcTo(x, y + height, x, y, radius);
    c.arcTo(x, y, x + width, y, radius);
    c.closePath();
    if (fill) c.fill();
    if (stroke) c.stroke();
  }

  function drawProbeMarkScratch(c, x, y, rx, ry, rot) {
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
  }

  function drawDieContent(showOverlays) {
    const w = els.canvas.width;
    const h = els.canvas.height;
    const isLight = document.body.classList.contains("light-theme");
    
    // Substrate background
    ctx.fillStyle = isLight ? "#cbd5e1" : "#0d0e15";
    ctx.fillRect(0, 0, w, h);
    
    const padX = 120;
    const padY = 120;
    const padW = 360;
    const padH = 360;
    const r = 24;

    // Passivation Layer Ring (outer border)
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, padX - 8, padY - 8, padW + 16, padH + 16, r + 4, false, true);

    // Draw Gold Bonding Pad
    const padGrad = ctx.createLinearGradient(padX, padY, padX + padW, padY + padH);
    if (isLight) {
      padGrad.addColorStop(0, "#ca8a04");
      padGrad.addColorStop(1, "#eab308");
    } else {
      padGrad.addColorStop(0, "#854d0e");
      padGrad.addColorStop(1, "#ca8a04");
    }
    ctx.fillStyle = padGrad;
    ctx.strokeStyle = isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.1)";
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, padX, padY, padW, padH, r, true, true);

    // Inner contact surface
    ctx.fillStyle = isLight ? "#fef08a" : "#ca8a04";
    ctx.globalAlpha = isLight ? 0.35 : 0.08;
    drawRoundedRect(ctx, padX + 24, padY + 24, padW - 48, padH - 48, r - 4, true, false);
    ctx.globalAlpha = 1.0;

    // Passivation grid overlay (micro traces inside the pad)
    if (state.filters.grid) {
      ctx.strokeStyle = isLight ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      
      // Horizontal traces
      for (let offset = 60; offset < padH - 40; offset += 60) {
        ctx.beginPath();
        ctx.moveTo(padX + 24, padY + offset);
        ctx.lineTo(padX + padW - 24, padY + offset);
        ctx.stroke();
      }
      // Vertical traces
      for (let offset = 60; offset < padW - 40; offset += 60) {
        ctx.beginPath();
        ctx.moveTo(padX + offset, padY + 24);
        ctx.lineTo(padX + offset, padY + padH - 24);
        ctx.stroke();
      }
    }

    // AI pad segment overlay
    if (showOverlays && state.filters.pad) {
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.strokeStyle = "var(--color-pass)";
      ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, padX, padY, padW, padH, r, true, true);
      
      ctx.fillStyle = "var(--color-pass)";
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.fillText("PAD [99.8%]", padX + 12, padY + 20);
    }

    // Draw Probe Marks
    const padData = state.currentDieImage.pads[0];
    if (padData && padData.marks) {
      padData.marks.forEach(mark => {
        const mx = padData.x + mark.dx;
        const my = padData.y + mark.dy;
        
        if (mark.isScratch) {
          // Passivation Crack/Scratch extending out of the pad!
          ctx.strokeStyle = isLight ? "#334155" : "#e2e8f0";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(mx - 20, my - 20);
          ctx.lineTo(mx, my);
          ctx.lineTo(mx + 110, my + 130);
          ctx.stroke();
          
          if (showOverlays && state.filters.mark) {
            ctx.strokeStyle = "var(--color-fail)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(mx - 30, my - 30, 155, 175);
            
            ctx.fillStyle = "var(--color-fail)";
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.fillText("SCRATCH [95.2%]", mx + 10, my + 125);
          }
        } else {
          // Normal Ellipse Needle Mark
          drawProbeMarkScratch(ctx, mx, my, mark.rx, mark.ry, mark.rot);
          
          if (showOverlays && state.filters.mark) {
            ctx.fillStyle = "rgba(14, 165, 233, 0.22)";
            ctx.strokeStyle = "var(--color-info)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(mx, my, mark.rx + 4, mark.ry + 4, mark.rot, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = "var(--color-info)";
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.fillText("PROBE MARK [97.5%]", mx - 45, my - mark.ry - 10);
          }
        }
      });

      // Special alert drawing for Missing mark
      if (padData.marks.length === 0 && showOverlays && state.filters.mark) {
        ctx.strokeStyle = "var(--color-fail)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(220, 220, 160, 160);
        ctx.setLineDash([]);
        
        ctx.fillStyle = "var(--color-fail)";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillText("CRITICAL: NO PROBE MARK", 228, 305);
      }
    }

    // Draw Grains
    if (state.filters.grain) {
      state.currentDieImage.grains.forEach(grain => {
        if (showOverlays) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
          ctx.strokeStyle = "var(--color-fail)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const steps = 8;
          for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const r = grain.radius + (Math.sin(angle * 3.5) * 1.8);
            const x = grain.x + Math.cos(angle) * r;
            const y = grain.y + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = "var(--color-fail)";
          ctx.font = "bold 8px 'JetBrains Mono', monospace";
          ctx.fillText("GRAIN [91.8%]", grain.x + grain.radius + 3, grain.y + 3);
        } else {
          ctx.fillStyle = isLight ? "#475569" : "#334155";
          ctx.beginPath();
          ctx.arc(grain.x, grain.y, grain.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Camera reticles
    ctx.strokeStyle = isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    const retLength = 25;
    const rPad = 15;
    
    ctx.beginPath();
    ctx.moveTo(rPad, rPad + retLength);
    ctx.lineTo(rPad, rPad);
    ctx.lineTo(rPad + retLength, rPad);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w - rPad, rPad + retLength);
    ctx.lineTo(w - rPad, rPad);
    ctx.lineTo(w - rPad - retLength, rPad);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(rPad, h - rPad - retLength);
    ctx.lineTo(rPad, h - rPad);
    ctx.lineTo(rPad + retLength, h - rPad);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(w - rPad, h - rPad - retLength);
    ctx.lineTo(w - rPad, h - rPad);
    ctx.lineTo(w - rPad - retLength, h - rPad);
    ctx.stroke();
  }

  // ==========================================
  // EVENT LISTENERS & HANDLERS
  // ==========================================
  function setupEventListeners() {
    
    els.tabInspect.addEventListener("click", () => switchTab("inspect"));
    els.tabAnalytics.addEventListener("click", () => switchTab("analytics"));
    els.tabModels.addEventListener("click", () => switchTab("models"));

    els.btnCompareOverlay.addEventListener("click", () => {
      state.compareMode = "overlay";
      els.btnCompareOverlay.classList.add("active");
      els.btnCompareSplit.classList.remove("active");
      renderWafer();
    });
    
    els.btnCompareSplit.addEventListener("click", () => {
      state.compareMode = "split";
      els.btnCompareSplit.classList.add("active");
      els.btnCompareOverlay.classList.remove("active");
      renderWafer();
    });

    els.btnThemeDark.addEventListener("click", () => {
      els.btnThemeDark.classList.add("active");
      els.btnThemeLight.classList.remove("active");
      document.body.classList.remove("light-theme");
      renderWafer();
    });
    
    els.btnThemeLight.addEventListener("click", () => {
      els.btnThemeLight.classList.add("active");
      els.btnThemeDark.classList.remove("active");
      document.body.classList.add("light-theme");
      renderWafer();
    });
    


    els.btnRoleOperator.addEventListener("click", () => {
      els.btnRoleOperator.classList.add("active");
      els.btnRoleEngineer.classList.remove("active");
      document.body.classList.add("role-operator");
      // Force return to Inspect view in Operator Mode
      switchTab("inspect");
      renderWafer();
    });
    
    els.btnRoleEngineer.addEventListener("click", () => {
      els.btnRoleEngineer.classList.add("active");
      els.btnRoleOperator.classList.remove("active");
      document.body.classList.remove("role-operator");
      renderWafer();
    });

    els.chkPad.addEventListener("change", (e) => {
      state.filters.pad = e.target.checked;
      renderWafer();
    });
    els.chkMark.addEventListener("change", (e) => {
      state.filters.mark = e.target.checked;
      renderWafer();
    });
    els.chkGrain.addEventListener("change", (e) => {
      state.filters.grain = e.target.checked;
      renderWafer();
    });
    els.chkGrid.addEventListener("change", (e) => {
      state.filters.grid = e.target.checked;
      renderWafer();
    });

    els.btnSimStart.addEventListener("click", toggleSimulation);
    els.btnSimStep.addEventListener("click", () => triggerInspection(false));
    els.btnSimDefect.addEventListener("click", () => triggerInspection(true));
    
    els.selSpeed.addEventListener("change", (e) => {
      state.cycleRateMs = parseInt(e.target.value);
      if (state.isContinuousRunning) {
        clearInterval(state.cycleTimeout);
        state.cycleTimeout = setInterval(() => triggerInspection(false), state.cycleRateMs);
      }
    });

    els.btnActionContinue.addEventListener("click", () => setManualAction("CONTINUE", els.btnActionContinue));
    els.btnActionWarning.addEventListener("click", () => setManualAction("WARN OPERATOR", els.btnActionWarning));
    els.btnActionStop.addEventListener("click", () => setManualAction("STOP MACHINE", els.btnActionStop));

    els.btnClearHistory.addEventListener("click", () => {
      els.historyTableBody.innerHTML = "";
      state.history = [];
      updateStatsUI();
      if (state.activeTab === "analytics") populateAnalyticsReport();
    });
    
    // Bind touch-friendly filter pills
    const pills = document.querySelectorAll(".filter-pill");
    pills.forEach(pill => {
      pill.addEventListener("click", (e) => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        state.analyticsFilter = pill.getAttribute("data-value");
        populateAnalyticsReport();
      });
    });
    
    els.filterSearch.addEventListener("input", populateAnalyticsReport);
    els.btnExportExcel.addEventListener("click", exportToCSV);
    
    els.btnSelectFile.addEventListener("click", () => {
      els.fileUploaderInput.click();
    });
    els.fileUploaderInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) handleModelUpload(e.target.files[0]);
    });
    
    els.uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.uploadZone.classList.add("dragover");
    });
    els.uploadZone.addEventListener("dragleave", () => {
      els.uploadZone.classList.remove("dragover");
    });
    els.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.uploadZone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) handleModelUpload(e.dataTransfer.files[0]);
    });
  }

  // ==========================================
  // TAB NAVIGATION ROUTER
  // ==========================================
  function switchTab(tabId) {
    state.activeTab = tabId;
    
    els.tabInspect.classList.remove("active");
    els.tabAnalytics.classList.remove("active");
    els.tabModels.classList.remove("active");
    
    els.viewInspect.classList.remove("active-tab");
    els.viewAnalytics.classList.remove("active-tab");
    els.viewModels.classList.remove("active-tab");
    
    if (tabId === "inspect") {
      els.tabInspect.classList.add("active");
      els.viewInspect.classList.add("active-tab");
      renderWafer();
    } else if (tabId === "analytics") {
      els.tabAnalytics.classList.add("active");
      els.viewAnalytics.classList.add("active-tab");
      populateAnalyticsReport();
    } else if (tabId === "models") {
      els.tabModels.classList.add("active");
      els.viewModels.classList.add("active-tab");
      renderModelsList();
    }
  }

  // ==========================================
  // SIMULATION & INSPECTION TRIGGER ENGINE
  // ==========================================
  function toggleSimulation() {
    state.isContinuousRunning = !state.isContinuousRunning;
    
    if (state.isContinuousRunning) {
      els.btnSimStart.textContent = "PAUSE";
      els.btnSimStart.classList.remove("glow-green");
      els.btnSimStart.classList.add("red-btn");
      triggerInspection(false);
      state.cycleTimeout = setInterval(() => triggerInspection(false), state.cycleRateMs);
    } else {
      els.btnSimStart.textContent = "AUTO RUN";
      els.btnSimStart.classList.add("glow-green");
      els.btnSimStart.classList.remove("red-btn");
      clearInterval(state.cycleTimeout);
    }
  }

  function triggerInspection(forceDefect = false) {
    els.cpuText.textContent = `${Math.floor(72 + Math.random() * 15)}%`;
    els.npuText.textContent = "95%";
    
    els.scannerLine.style.top = "0%";
    els.scannerLine.style.opacity = "1";
    els.scannerLine.style.transition = "none";
    
    setTimeout(() => {
      els.scannerLine.style.transition = "top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
      els.scannerLine.style.top = "100%";
      setTimeout(() => {
        els.scannerLine.style.opacity = "0";
      }, 400);
    }, 50);

    setTimeout(() => {
      state.inspectionCount++;
      generateDieSimulationData(forceDefect);
      restorePerformanceStats();
      renderWafer();
      updateInspectionUI();
      appendHistoryRow();
      updateStatistics();
      
      // Real-time Dashboard Update: Draw charts and table if Analytics tab is active
      if (state.activeTab === "analytics") {
        populateAnalyticsReport();
      }
    }, 450);
  }

  // ==========================================
  // INSPECTION UI PANEL CONTROLLER
  // ==========================================
  function updateInspectionUI() {
    const insp = state.currentInspection;
    
    const waferIdTag = document.getElementById("wafer-id-tag");
    if (waferIdTag) waferIdTag.textContent = insp.id;
    
    els.valPadCount.textContent = `${insp.padsDetected}/${insp.padsTotal}`;
    els.valMarkCount.textContent = `${insp.probeMarks}/${insp.padsTotal}`;
    els.valGrainCount.textContent = insp.grains;
    els.valConfidence.textContent = `${insp.confidence}%`;
    els.valInferenceTime.textContent = `${insp.inferenceTime} ms`;
    
    els.decisionIndicator.className = "decision-display";
    const decTitle = els.decisionIndicator.querySelector(".decision-title");
    
    if (insp.decision === "PASS") {
      els.decisionIndicator.classList.add("state-pass");
      decTitle.textContent = "PASS";
      setOverrideActiveButton(els.btnActionContinue);
    } else if (insp.decision === "WARNING") {
      els.decisionIndicator.classList.add("state-warn");
      decTitle.textContent = "WARN";
      setOverrideActiveButton(els.btnActionWarning);
    } else {
      els.decisionIndicator.classList.add("state-fail");
      decTitle.textContent = "FAIL";
      setOverrideActiveButton(els.btnActionStop);
    }
    
    els.machineActionText.textContent = insp.machineAction;
    updateAlarmPanel();
    
    // Update operator mode filename display
    if (els.operatorFilename) {
      const cleanId = insp.id.replace("#", "");
      const dateStamp = getFileDateStamp();
      els.operatorFilename.textContent = `IMAGE FILE: WF_IMG_${cleanId}_${insp.decision}_${dateStamp}.PNG`;
    }
  }

  function setManualAction(actionName, activeButton) {
    els.machineActionText.textContent = actionName;
    setOverrideActiveButton(activeButton);
  }

  function setOverrideActiveButton(btn) {
    els.btnActionContinue.classList.remove("active");
    els.btnActionWarning.classList.remove("active");
    els.btnActionStop.classList.remove("active");
    btn.classList.add("active");
  }

  function updateAlarmPanel() {
    els.alarmContainer.innerHTML = "";
    
    if (state.activeAlarms.length === 0) {
      els.alarmEmpty.style.display = "flex";
      els.alarmContainer.appendChild(els.alarmEmpty);
      els.alarmCountBadge.className = "alarm-badge";
      els.alarmCountBadge.textContent = "0";
    } else {
      els.alarmEmpty.style.display = "none";
      
      state.activeAlarms.forEach(alarm => {
        const item = document.createElement("div");
        item.className = "alarm-item";
        item.innerHTML = `
          <span class="alarm-name">${alarm.name.toUpperCase()}</span>
          <span class="alarm-time">${alarm.time}</span>
        `;
        els.alarmContainer.appendChild(item);
      });
      
      els.alarmCountBadge.className = "alarm-badge active-alarms";
      els.alarmCountBadge.textContent = `${state.activeAlarms.length}`;
    }
  }

  // ==========================================
  // RUNNING STATISTICS & YIELD ENGINE
  // ==========================================
  function updateStatistics() {
    const insp = state.currentInspection;
    
    state.stats.total++;
    if (insp.decision === "PASS") state.stats.pass++;
    else if (insp.decision === "WARNING") state.stats.warn++;
    else state.stats.fail++;
    
    const overkillDiff = -0.02 + Math.random() * 0.04;
    const underkillDiff = -0.001 + Math.random() * 0.002;
    state.stats.overkill = Math.max(0.1, +(state.stats.overkill + overkillDiff).toFixed(2));
    state.stats.underkill = Math.max(0.005, +(state.stats.underkill + underkillDiff).toFixed(3));
    
    updateStatsUI();
  }

  function updateStatsUI() {
    els.statTotal.textContent = state.stats.total.toLocaleString();
    els.statPass.textContent = state.stats.pass.toLocaleString();
    els.statWarn.textContent = state.stats.warn.toLocaleString();
    els.statFail.textContent = state.stats.fail.toLocaleString();
    
    const yieldRate = ((state.stats.pass / state.stats.total) * 100).toFixed(2);
    els.statYield.textContent = `${yieldRate}%`;
    els.statOverkill.textContent = `${state.stats.overkill}%`;
    els.statUnderkill.textContent = `${state.stats.underkill}%`;
  }

  // ==========================================
  // INSPECTION HISTORY TABLE & DATABASE
  // ==========================================
  function appendHistoryRow() {
    const insp = state.currentInspection;
    const timeStr = getShortTime();
    
    const newRecord = {
      timestamp: getFullDateTime(),
      timeShort: timeStr,
      id: insp.id,
      decision: insp.decision,
      padsTotal: insp.padsTotal,
      padsDetected: insp.padsDetected,
      probeMarks: insp.probeMarks,
      grains: insp.grains,
      confidence: insp.confidence,
      inferenceTime: insp.inferenceTime,
      ruleTime: insp.ruleTime,
      machineAction: insp.machineAction
    };
    
    state.history.unshift(newRecord);
    
    const row = document.createElement("tr");
    let resultClass = "";
    if (insp.decision === "PASS") resultClass = "pass";
    else if (insp.decision === "WARNING") resultClass = "warn";
    else resultClass = "fail";
    
    row.innerHTML = `
      <td>${timeStr}</td>
      <td class="font-mono">${insp.id}</td>
      <td><span class="badge-result ${resultClass}">${insp.decision}</span></td>
      <td class="font-mono">${insp.padsDetected}/${insp.padsTotal}</td>
      <td class="font-mono">${insp.probeMarks}</td>
      <td class="font-mono ${insp.grains > 0 ? 'red-text' : ''}">${insp.grains}</td>
      <td class="font-mono">${insp.confidence}%</td>
      <td class="font-mono" style="font-size: 10px;">${insp.machineAction}</td>
    `;
    
    els.historyTableBody.insertBefore(row, els.historyTableBody.firstChild);
    
    if (els.historyTableBody.rows.length > 15) {
      els.historyTableBody.removeChild(els.historyTableBody.lastChild);
    }
  }

  function populateInitialHistory() {
    const mockData = [
      { id: "#WF-2939", dec: "PASS", pads: 12, padsD: 12, marks: 12, grains: 0, conf: 99.4, action: "CONTINUE", offset: 1 },
      { id: "#WF-2938", dec: "WARNING", pads: 12, padsD: 12, marks: 13, grains: 1, conf: 98.1, action: "WARN OPERATOR", offset: 3 },
      { id: "#WF-2937", dec: "PASS", pads: 12, padsD: 12, marks: 12, grains: 0, conf: 99.6, action: "CONTINUE", offset: 4 },
      { id: "#WF-2936", dec: "FAIL", pads: 12, padsD: 12, marks: 12, grains: 4, conf: 96.2, action: "STOP MACHINE", offset: 6 },
      { id: "#WF-2935", dec: "PASS", pads: 12, padsD: 12, marks: 12, grains: 0, conf: 99.1, action: "CONTINUE", offset: 8 },
      { id: "#WF-2934", dec: "PASS", pads: 12, padsD: 12, marks: 12, grains: 0, conf: 99.5, action: "CONTINUE", offset: 11 },
      { id: "#WF-2933", dec: "PASS", pads: 12, padsD: 12, marks: 12, grains: 0, conf: 98.9, action: "CONTINUE", offset: 14 },
      { id: "#WF-2932", dec: "WARNING", pads: 12, padsD: 12, marks: 11, grains: 0, conf: 97.4, action: "WARN OPERATOR", offset: 17 },
    ];
    
    mockData.forEach(item => {
      const now = new Date();
      const pastTime = new Date(now.getTime() - item.offset * 60000);
      const day = String(pastTime.getDate()).padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[pastTime.getMonth()];
      const year = pastTime.getFullYear();
      const hours = String(pastTime.getHours()).padStart(2, '0');
      const minutes = String(pastTime.getMinutes()).padStart(2, '0');
      const seconds = String(pastTime.getSeconds()).padStart(2, '0');
      
      const timeStr = `${hours}:${minutes}:${seconds}`;
      const fullDateStr = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
      
      const record = {
        timestamp: fullDateStr,
        timeShort: timeStr,
        id: item.id,
        decision: item.dec,
        padsTotal: item.pads,
        padsDetected: item.padsD,
        probeMarks: item.marks,
        grains: item.grains,
        confidence: item.conf,
        inferenceTime: +(15.0 + Math.random() * 5).toFixed(1),
        ruleTime: 0.4,
        machineAction: item.action
      };
      
      state.history.push(record);
      
      let resClass = "";
      if (item.dec === "PASS") resClass = "pass";
      else if (item.dec === "WARNING") resClass = "warn";
      else resClass = "fail";
      
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${timeStr}</td>
        <td class="font-mono">${item.id}</td>
        <td><span class="badge-result ${resClass}">${item.dec}</span></td>
        <td class="font-mono">${item.padsD}/${item.pads}</td>
        <td class="font-mono">${item.marks}</td>
        <td class="font-mono ${item.grains > 0 ? 'red-text' : ''}">${item.grains}</td>
        <td class="font-mono">${item.conf}%</td>
        <td class="font-mono" style="font-size: 10px;">${item.action}</td>
      `;
      
      els.historyTableBody.appendChild(row);
    });
  }

  // ==========================================
  // TAB CONTENT 2: ANALYTICS REPORT CONTROLLER
  // ==========================================
  function populateAnalyticsReport() {
    els.analyticsTableBody.innerHTML = "";
    
    const filterType = state.analyticsFilter;
    const filterQuery = els.filterSearch.value.toUpperCase();
    
    // Filter history records
    const filteredRecords = state.history.filter(record => {
      const matchType = (filterType === "ALL" || record.decision === filterType);
      const matchQuery = (record.id.toUpperCase().includes(filterQuery));
      return matchType && matchQuery;
    });

    els.reportRowCount.textContent = `${filteredRecords.length} Records`;
    
    let totalCount = filteredRecords.length;
    let passCount = 0;
    let failCount = 0;
    let confidenceSum = 0;
    
    filteredRecords.forEach(rec => {
      if (rec.decision === "PASS") passCount++;
      if (rec.decision === "FAIL") failCount++;
      confidenceSum += rec.confidence;
      
      const row = document.createElement("tr");
      let resClass = "";
      if (rec.decision === "PASS") resClass = "pass";
      else if (rec.decision === "WARNING") resClass = "warn";
      else resClass = "fail";
      
      row.innerHTML = `
        <td>${rec.timestamp}</td>
        <td class="font-mono">${rec.id}</td>
        <td><span class="badge-result ${resClass}">${rec.decision}</span></td>
        <td class="font-mono">${rec.padsDetected}/${rec.padsTotal}</td>
        <td class="font-mono">${rec.probeMarks}</td>
        <td class="font-mono ${rec.grains > 0 ? 'red-text' : ''}">${rec.grains}</td>
        <td class="font-mono">${rec.confidence}%</td>
        <td class="font-mono">${rec.inferenceTime} ms</td>
        <td class="font-mono" style="font-size: 9px; color: var(--text-muted);">U-Net-Wafer</td>
        <td class="font-mono" style="font-size: 10px;">${rec.machineAction}</td>
      `;
      els.analyticsTableBody.appendChild(row);
    });

    // Update KPIs
    els.anTotalInspected.textContent = totalCount.toLocaleString();
    if (totalCount > 0) {
      els.anYieldRate.textContent = `${((passCount / totalCount) * 100).toFixed(2)}%`;
      els.anDefectRate.textContent = `${((failCount / totalCount) * 100).toFixed(2)}%`;
      els.anAvgConfidence.textContent = `${(confidenceSum / totalCount).toFixed(1)}%`;
    } else {
      els.anYieldRate.textContent = "0.00%";
      els.anDefectRate.textContent = "0.00%";
      els.anAvgConfidence.textContent = "0.0%";
    }

    // Trigger Canvas charts draw
    renderCharts();
  }

  // ==========================================
  // DYNAMIC CHART RENDERING ENGINE (HTML5 Canvas)
  // ==========================================
  function renderCharts() {
    const isLight = document.body.classList.contains("light-theme");
    const labelColor = isLight ? "#475569" : "#94a3b8";
    const gridColor = isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.03)";
    const textColor = isLight ? "#0f172a" : "#f1f5f9";
    
    // ----------------------------------------
    // 1. YIELD DONUT CHART (100% responsive, undistorted)
    // ----------------------------------------
    const donutSize = scaleCanvasChart(els.chartYieldDonut);
    const wDonut = donutSize.w;
    const hDonut = donutSize.h;
    
    donutCtx.clearRect(0, 0, wDonut, hDonut);
    
    // Count stats in full history database
    let pass = 0, warn = 0, fail = 0;
    state.history.forEach(r => {
      if (r.decision === "PASS") pass++;
      else if (r.decision === "WARNING") warn++;
      else if (r.decision === "FAIL") fail++;
    });
    
    const total = pass + warn + fail;
    
    // Center donut based on actual layout size!
    const cx = wDonut * 0.35;
    const cy = hDonut * 0.5;
    const rOuter = Math.min(wDonut * 0.28, hDonut * 0.38);
    const rInner = rOuter * 0.65;
    
    if (total === 0) {
      donutCtx.strokeStyle = gridColor;
      donutCtx.lineWidth = 12;
      donutCtx.beginPath();
      donutCtx.arc(cx, cy, rOuter - 6, 0, Math.PI * 2);
      donutCtx.stroke();
      
      donutCtx.fillStyle = labelColor;
      donutCtx.font = "10px 'Outfit'";
      donutCtx.textAlign = "center";
      donutCtx.fillText("No Data", cx, cy + 4);
    } else {
      const pPass = pass / total;
      const pWarn = warn / total;
      const pFail = fail / total;
      
      let startAngle = -Math.PI / 2;
      
      if (pPass > 0) {
        const endAngle = startAngle + (Math.PI * 2 * pPass);
        drawDonutSlice(cx, cy, rOuter, rInner, startAngle, endAngle, "var(--color-pass)");
        startAngle = endAngle;
      }
      if (pWarn > 0) {
        const endAngle = startAngle + (Math.PI * 2 * pWarn);
        drawDonutSlice(cx, cy, rOuter, rInner, startAngle, endAngle, "var(--color-warn)");
        startAngle = endAngle;
      }
      if (pFail > 0) {
        const endAngle = startAngle + (Math.PI * 2 * pFail);
        drawDonutSlice(cx, cy, rOuter, rInner, startAngle, endAngle, "var(--color-fail)");
        startAngle = endAngle;
      }
      
      const yieldPct = ((pass / total) * 100).toFixed(0);
      donutCtx.fillStyle = textColor;
      donutCtx.font = "bold 15px 'Outfit', sans-serif";
      donutCtx.textAlign = "center";
      donutCtx.fillText(`${yieldPct}%`, cx, cy - 1);
      
      donutCtx.fillStyle = labelColor;
      donutCtx.font = "600 8px 'Outfit', sans-serif";
      donutCtx.fillText("YIELD", cx, cy + 9);
    }
    
    // Draw Legend aligned next to the donut
    const lx = cx + rOuter + 20;
    const ly = cy - 22;
    const spacing = 22;
    
    drawLegendItem(donutCtx, lx, ly, "var(--color-pass)", `PASS: ${pass}`, labelColor);
    drawLegendItem(donutCtx, lx, ly + spacing, "var(--color-warn)", `WARN: ${warn}`, labelColor);
    drawLegendItem(donutCtx, lx, ly + spacing * 2, "var(--color-fail)", `FAIL: ${fail}`, labelColor);

    // ----------------------------------------
    // 2. LATENCY TREND LINE CHART (Last 10 inspections)
    // ----------------------------------------
    const lineSize = scaleCanvasChart(els.chartLatencyLine);
    const wLine = lineSize.w;
    const hLine = lineSize.h;
    
    lineCtx.clearRect(0, 0, wLine, hLine);
    
    const dataset = state.history.slice(0, 10).reverse();
    
    const marginL = 30;
    const marginR = 15;
    const marginT = 20;
    const marginB = 25;
    
    const gw = wLine - marginL - marginR;
    const gh = hLine - marginT - marginB;
    
    const maxVal = 30;
    const yTicks = [0, 10, 20, 30];
    
    lineCtx.strokeStyle = gridColor;
    lineCtx.lineWidth = 1;
    lineCtx.fillStyle = labelColor;
    lineCtx.font = "500 8px 'JetBrains Mono', monospace";
    lineCtx.textAlign = "right";
    
    yTicks.forEach(tick => {
      const y = marginT + gh - (tick / maxVal) * gh;
      
      lineCtx.beginPath();
      lineCtx.moveTo(marginL, y);
      lineCtx.lineTo(wLine - marginR, y);
      lineCtx.stroke();
      
      lineCtx.fillText(`${tick}`, marginL - 6, y + 3);
    });

    if (dataset.length === 0) {
      lineCtx.textAlign = "center";
      lineCtx.font = "10px 'Outfit'";
      lineCtx.fillText("No Trend Data Available", wLine / 2, hLine / 2);
    } else {
      const points = [];
      const stepX = dataset.length > 1 ? gw / (dataset.length - 1) : gw;
      
      dataset.forEach((data, index) => {
        const x = marginL + index * stepX;
        const y = marginT + gh - (data.inferenceTime / maxVal) * gh;
        points.push({ x, y, val: data.inferenceTime, id: data.id.replace("#WF-", "") });
      });
      
      lineCtx.strokeStyle = "var(--color-info)";
      lineCtx.lineWidth = 1.5;
      lineCtx.beginPath();
      points.forEach((pt, idx) => {
        if (idx === 0) lineCtx.moveTo(pt.x, pt.y);
        else lineCtx.lineTo(pt.x, pt.y);
      });
      lineCtx.stroke();
      
      points.forEach(pt => {
        lineCtx.fillStyle = "var(--color-info)";
        lineCtx.beginPath();
        lineCtx.arc(pt.x, pt.y, 3, 0, Math.PI*2);
        lineCtx.fill();
        
        lineCtx.strokeStyle = isLight ? "#fff" : "var(--bg-card)";
        lineCtx.lineWidth = 1;
        lineCtx.stroke();
        
        lineCtx.fillStyle = textColor;
        lineCtx.font = "bold 7px 'JetBrains Mono', monospace";
        lineCtx.textAlign = "center";
        lineCtx.fillText(pt.val.toFixed(0), pt.x, pt.y - 6);
        
        lineCtx.fillStyle = labelColor;
        lineCtx.font = "500 7px 'JetBrains Mono', monospace";
        lineCtx.fillText(pt.id, pt.x, marginT + gh + 12);
      });
    }
  }

  // Chart Draw Helpers
  function drawDonutSlice(cx, cy, rOut, rIn, startAngle, endAngle, color) {
    donutCtx.fillStyle = color;
    donutCtx.beginPath();
    donutCtx.arc(cx, cy, rOut, startAngle, endAngle, false);
    donutCtx.arc(cx, cy, rIn, endAngle, startAngle, true);
    donutCtx.closePath();
    donutCtx.fill();
  }

  function drawLegendItem(c, x, y, dotColor, labelText, textColor) {
    c.fillStyle = dotColor;
    c.beginPath();
    c.arc(x, y - 3, 4, 0, Math.PI * 2);
    c.fill();
    
    c.fillStyle = textColor;
    c.font = "600 10px 'Outfit', sans-serif";
    c.textAlign = "left";
    c.fillText(labelText, x + 10, y);
  }

  // EXCEL SPREADSHEET CSV EXPORTER
  function exportToCSV() {
    if (state.history.length === 0) {
      alert("No data available to export.");
      return;
    }
    const csvRows = [
      ["Timestamp", "Wafer ID", "Decision", "Pads Detected", "Probe Marks", "Contamination Grains", "Confidence Score (%)", "Inference Latency (ms)", "System Action"]
    ];
    state.history.forEach(rec => {
      csvRows.push([
        rec.timestamp,
        rec.id,
        rec.decision,
        `${rec.padsDetected}/${rec.padsTotal}`,
        rec.probeMarks,
        rec.grains,
        rec.confidence,
        rec.inferenceTime,
        rec.machineAction
      ]);
    });
    
    const csvContent = "\uFEFF" + csvRows.map(r => r.map(val => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `wafer_production_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ==========================================
  // TAB CONTENT 3: MODELS DB & UPLOADER
  // ==========================================
  function renderModelsList() {
    els.modelsTableBody.innerHTML = "";
    
    state.models.forEach((model, index) => {
      const row = document.createElement("tr");
      
      let statusHtml = "";
      let actionHtml = "";
      
      if (model.active) {
        statusHtml = `<span class="badge-result pass" style="font-size: 8px;">ACTIVE</span>`;
        actionHtml = `<button class="action-btn-sm" disabled style="opacity:0.4; cursor:not-allowed;">Active</button>`;
      } else {
        statusHtml = `<span class="badge-result" style="background:rgba(255,255,255,0.02); color:var(--text-muted); border:1px solid var(--border-color); font-size: 8px;">INACTIVE</span>`;
        actionHtml = `
          <button class="action-btn-sm active-green" onclick="window.activateModel(${index})">Activate</button>
          <button class="action-btn-sm delete-red" onclick="window.deleteModel(${index})">Delete</button>
        `;
      }
      
      row.innerHTML = `
        <td class="font-mono" style="font-weight:600;">${model.name}</td>
        <td class="font-mono">${model.version}</td>
        <td class="font-mono">${model.type}</td>
        <td class="font-mono">${model.size}</td>
        <td class="font-mono highlight-blue">${model.map}</td>
        <td>${statusHtml}</td>
        <td><div style="display:flex; gap:4px;">${actionHtml}</div></td>
      `;
      els.modelsTableBody.appendChild(row);
    });
  }

  window.activateModel = function(index) {
    const selectedModel = state.models[index];
    state.models.forEach((m, idx) => {
      m.active = (idx === index);
    });
    els.activeModelName.textContent = selectedModel.name;
    els.activeModelClassifier.textContent = selectedModel.type.split(" / ")[0].toLowerCase();
    renderModelsList();
  };

  window.deleteModel = function(index) {
    if (confirm(`Delete ${state.models[index].name} model from NXP edge storage?`)) {
      state.models.splice(index, 1);
      renderModelsList();
    }
  };

  function handleModelUpload(file) {
    els.uploadProgressBox.style.display = "block";
    els.uploadFileName.textContent = file.name;
    els.uploadPercentText.textContent = "0%";
    els.uploadProgressFill.style.width = "0%";
    els.uploadStatusText.textContent = "Initializing upload to i.MX8 device storage...";
    
    let percent = 0;
    const interval = setInterval(() => {
      percent += Math.floor(Math.random() * 15) + 5;
      if (percent >= 100) {
        percent = 100;
        clearInterval(interval);
        
        els.uploadPercentText.textContent = "100%";
        els.uploadProgressFill.style.width = "100%";
        els.uploadStatusText.textContent = "Optimizing tensor graphs and compiling...";
        
        setTimeout(() => {
          const rawName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const ext = file.name.substring(file.name.lastIndexOf('.') + 1).toUpperCase();
          
          const newModel = {
            name: rawName,
            version: "v1.0",
            type: ext,
            size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            map: (0.91 + Math.random() * 0.04).toFixed(3),
            active: false
          };
          
          state.models.push(newModel);
          renderModelsList();
          
          setTimeout(() => {
            els.uploadProgressBox.style.display = "none";
            els.fileUploaderInput.value = "";
          }, 1500);
          
        }, 1000);
      } else {
        els.uploadPercentText.textContent = `${percent}%`;
        els.uploadProgressFill.style.width = `${percent}%`;
        if (percent > 40 && percent < 80) {
          els.uploadStatusText.textContent = "Writing byte streams to NPU cache...";
        } else if (percent >= 80) {
          els.uploadStatusText.textContent = "Validating binary headers and check-sums...";
        }
      }
    }, 150);
  }

  // ==========================================
  // HARDWARE DEVICE STATS SIMULATION
  // ==========================================
  let cpuBase = 42;
  let tempBase = 54.8;
  let ramBase = 512;
  
  function simulateDeviceStats() {
    setInterval(() => {
      if (!state.isContinuousRunning) {
        cpuBase = 35 + Math.floor(Math.random() * 8);
        tempBase = 53.5 + +(Math.random() * 1.5).toFixed(1);
        ramBase = 508 + Math.floor(Math.random() * 12);
        restorePerformanceStats();
      } else {
        cpuBase = 46 + Math.floor(Math.random() * 10);
        tempBase = 56.2 + +(Math.random() * 2.0).toFixed(1);
        ramBase = 515 + Math.floor(Math.random() * 15);
        
        els.cpuText.textContent = `${cpuBase}%`;
        els.cpuBar.style.width = `${cpuBase}%`;
        els.npuText.textContent = `${84 + Math.floor(Math.random() * 6)}%`;
        els.npuBar.style.width = els.npuText.textContent;
        els.ramText.textContent = `${ramBase} MB / 1.0 GB`;
        if (els.ramTextShort) els.ramTextShort.textContent = `${ramBase}M`;
        els.ramBar.style.width = `${(ramBase / 1000) * 100}%`;
        els.tempText.textContent = `${tempBase.toFixed(1)}°C`;
        els.tempBar.style.width = `${(tempBase / 90) * 100}%`;
      }
      
      const fps = +(29.5 + Math.random() * 0.9).toFixed(1);
      els.fpsVal.textContent = `${fps} FPS`;
    }, 2000);
  }

  function restorePerformanceStats() {
    els.cpuText.textContent = `${cpuBase}%`;
    els.cpuBar.style.width = `${cpuBase}%`;
    els.npuText.textContent = state.isContinuousRunning ? "88%" : "12%";
    els.npuBar.style.width = els.npuText.textContent;
    els.ramText.textContent = `${ramBase} MB / 1.0 GB`;
    if (els.ramTextShort) els.ramTextShort.textContent = `${ramBase}M`;
    els.ramBar.style.width = `${(ramBase / 1000) * 100}%`;
    els.tempText.textContent = `${tempBase.toFixed(1)}°C`;
    els.tempBar.style.width = `${(tempBase / 90) * 100}%`;
    
    if (tempBase > 58) els.tempText.style.color = "var(--color-fail)";
    else els.tempText.style.color = "var(--text-main)";
  }

  // Helpers
  function getShortTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function getFullDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  }

  function getFileDateStamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}_${hh}${mm}${ss}`;
  }

  // ==========================================
  // BACKEND INTEGRATION CLIENT
  // ==========================================
  let lastInspectionId = null;

  function checkBackendConnection() {
    fetch("/api/latest-inspection")
      .then(r => r.json())
      .then(data => {
        console.log("Connected to Python backend! Shifting HMI to Live Connected Mode.");
        state.isBackendConnected = true;
        
        els.imx8Status.classList.remove("offline");
        els.imx8Status.classList.add("online");
        els.imx8Status.querySelector(".status-label").textContent = "EDGE: ONLINE";
        
        // Start polling endpoints
        state.backendInterval = setInterval(fetchLatestFromBackend, 1000);
        state.sysStatsInterval = setInterval(fetchSystemStats, 2000);
        
        // Deactivate manual simulation triggers since folder watcher handles inputs
        els.btnSimStart.style.opacity = "0.6";
        els.btnSimStart.style.pointerEvents = "none";
        els.btnSimStart.textContent = "EDGE LIVE";
        
        fetchHistoryFromBackend();
      })
      .catch(err => {
        console.log("Running in stand-alone Client Simulation Mode.");
        state.isBackendConnected = false;
        // Start local client-side background simulation stats
        simulateDeviceStats();
      });
  }

  function fetchLatestFromBackend() {
    fetch("/api/latest-inspection")
      .then(r => r.json())
      .then(data => {
        if (!data || !data.id || data.id === lastInspectionId) return;
        lastInspectionId = data.id;
        
        // Trigger scan sweep visual
        animateScanner();
        
        // Map backend record to local state format
        state.currentInspection = {
          id: data.id,
          padsTotal: data.padsTotal,
          padsDetected: data.padsDetected,
          probeMarks: data.probeMarks,
          grains: data.grains,
          confidence: data.confidence,
          inferenceTime: data.inferenceTime,
          ruleTime: data.ruleTime,
          decision: data.decision,
          machineAction: data.machineAction
        };
        
        state.currentDieImage.pads = [{
          id: 1,
          x: 300,
          y: 300,
          detected: data.padsDetected > 0,
          marks: data.marks || []
        }];
        state.currentDieImage.grains = data.grainList || [];
        state.activeAlarms = data.alarms || [];
        
        renderWafer();
        updateInspectionUI();
        
        // Update stats
        fetchHistoryFromBackend();
      })
      .catch(err => console.error("Error fetching latest scan:", err));
  }

  function fetchHistoryFromBackend() {
    fetch("/api/history")
      .then(r => r.json())
      .then(historyList => {
        state.history = historyList;
        els.historyTableBody.innerHTML = "";
        
        // Populate live table logs
        const recent = historyList.slice(-10).reverse();
        recent.forEach(item => {
          let resClass = "";
          if (item.decision === "PASS") resClass = "pass";
          else if (item.decision === "WARNING") resClass = "warn";
          else resClass = "fail";
          
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${item.timeShort}</td>
            <td class="font-mono">${item.id}</td>
            <td><span class="badge-result ${resClass}">${item.decision}</span></td>
            <td class="font-mono">${item.padsDetected}/${item.padsTotal}</td>
            <td class="font-mono">${item.probeMarks}</td>
            <td class="font-mono ${item.grains > 0 ? 'red-text' : ''}">${item.grains}</td>
            <td class="font-mono">${item.confidence}%</td>
            <td class="font-mono" style="font-size: 10px;">${item.machineAction}</td>
          `;
          els.historyTableBody.appendChild(row);
        });
        
        updateStatisticsFromHistory();
        
        if (state.activeTab === "analytics") {
          populateAnalyticsReport();
        }
      })
      .catch(err => console.error("Error syncing history:", err));
  }

  function updateStatisticsFromHistory() {
    let total = state.history.length;
    let pass = 0, warn = 0, fail = 0;
    
    state.history.forEach(r => {
      if (r.decision === "PASS") pass++;
      else if (r.decision === "WARNING") warn++;
      else if (r.decision === "FAIL") fail++;
    });
    
    const yieldRate = total > 0 ? (pass / total) * 100 : 0;
    
    // Update summary counts on Inspect tab
    const totalCountVal = document.getElementById("stat-total-count");
    const passCountVal = document.getElementById("stat-pass-count");
    const warnCountVal = document.getElementById("stat-warn-count");
    const failCountVal = document.getElementById("stat-fail-count");
    const yieldVal = document.getElementById("stat-yield-val");
    
    if (totalCountVal) totalCountVal.textContent = total;
    if (passCountVal) passCountVal.textContent = pass;
    if (warnCountVal) warnCountVal.textContent = warn;
    if (failCountVal) failCountVal.textContent = fail;
    if (yieldVal) yieldVal.textContent = `${yieldRate.toFixed(2)}%`;
  }

  function fetchSystemStats() {
    fetch("/api/sys-stats")
      .then(r => r.json())
      .then(stats => {
        els.cpuText.textContent = `${stats.cpu}%`;
        els.npuText.textContent = `${stats.npu}%`;
        
        const ramVal = document.getElementById("stat-ram-val");
        const tempVal = document.getElementById("stat-temp-val");
        if (ramVal) ramVal.textContent = `${stats.ram}M`;
        if (tempVal) tempVal.textContent = `${stats.temp}°C`;
        
        // Show DB indicator at the bottom header if present
        const dbStatus = document.getElementById("db-status-badge");
        if (dbStatus) dbStatus.textContent = `DB: ${stats.db}`;
      })
      .catch(err => console.error("Error fetching stats:", err));
  }

  function animateScanner() {
    els.scannerLine.style.top = "0%";
    els.scannerLine.style.opacity = "1";
    els.scannerLine.style.transition = "none";
    
    setTimeout(() => {
      els.scannerLine.style.transition = "top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)";
      els.scannerLine.style.top = "100%";
      setTimeout(() => {
        els.scannerLine.style.opacity = "0";
      }, 400);
    }, 50);
  }

  init();
});
