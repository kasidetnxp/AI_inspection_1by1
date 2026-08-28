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

      // Clean 'STANDBY' placeholder when no real camera or file image is loaded
      c.fillStyle = isLight ? "#f8fafc" : "#0d0e15";
      c.fillRect(0, 0, targetW, targetH);

      if (filters.grid) {
        c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";
        c.lineWidth = 1;
        for (let i = 50; i < targetW; i += 50) {
          c.beginPath(); c.moveTo(i, 0); c.lineTo(i, targetH); c.stroke();
          c.beginPath(); c.moveTo(0, i); c.lineTo(targetW, i); c.stroke();
        }
      }

      c.fillStyle = isLight ? "#94a3b8" : "#475569";
      c.font = "600 15px 'JetBrains Mono', monospace";
      c.textAlign = "center";
      c.fillText("STANDBY • NO DIE LOADED", targetW / 2, targetH / 2);

      c.strokeStyle = isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.25)";
      c.lineWidth = 2;
      const rl = 35, rPad = 18;
      c.beginPath(); c.moveTo(rPad, rPad + rl); c.lineTo(rPad, rPad); c.lineTo(rPad + rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, rPad + rl); c.lineTo(targetW - rPad, rPad); c.lineTo(targetW - rPad - rl, rPad); c.stroke();
      c.beginPath(); c.moveTo(rPad, targetH - rPad - rl); c.lineTo(rPad, targetH - rPad); c.lineTo(rPad + rl, targetH - rPad); c.stroke();
      c.beginPath(); c.moveTo(targetW - rPad, targetH - rPad - rl); c.lineTo(targetW - rPad, targetH - rPad); c.lineTo(targetW - rPad - rl, targetH - rPad); c.stroke();
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
  }, [currentDieImage, compareMode, isLight, filters, loadedImage, loadedRawImage, currentInspection, canvasRef]);

  return (
    <div className="canvas-wrapper">
      <div id="scanner-line" ref={scannerRef}></div>
      <canvas id="waferCanvas" ref={canvasRef} />
    </div>
  );
}
