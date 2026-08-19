import React, { useEffect } from "react";
import { useInspection } from "../context/InspectionContext";

export default function WaferCanvas() {
  const {
    canvasRef,
    scannerRef,
    compareMode,
    isLight,
    filters,
    loadedImage,
    loadedRawImage,
    currentDieImage,
    currentInspection
  } = useInspection();

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

    const drawDieContent = (c, showOverlays) => {
      if (!showOverlays && loadedRawImage) {
        c.drawImage(loadedRawImage, 0, 0, 600, 600);
        return;
      }
      if (showOverlays && loadedImage) {
        c.drawImage(loadedImage, 0, 0, 600, 600);
        return;
      }

      // Clean 'STANDBY' placeholder when no real camera or file image is loaded
      c.fillStyle = isLight ? "#f8fafc" : "#0d0e15";
      c.fillRect(0, 0, 600, 600);

      if (filters.grid) {
        c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
        c.lineWidth = 1;
        for (let i = 50; i < 600; i += 50) {
          c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 600); c.stroke();
          c.beginPath(); c.moveTo(0, i); c.lineTo(600, i); c.stroke();
        }
      }

      c.fillStyle = isLight ? "#94a3b8" : "#475569";
      c.font = "600 13px 'JetBrains Mono', monospace";
      c.textAlign = "center";
      c.fillText("STANDBY • NO DIE LOADED", 300, 305);

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
  }, [currentDieImage, compareMode, isLight, filters, loadedImage, loadedRawImage, currentInspection, canvasRef]);

  return (
    <div className="canvas-wrapper">
      <div id="scanner-line" ref={scannerRef}></div>
      <canvas id="waferCanvas" ref={canvasRef} />
    </div>
  );
}
