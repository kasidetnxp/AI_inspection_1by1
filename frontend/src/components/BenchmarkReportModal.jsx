import React from "react";
import { useInspection } from "../context/InspectionContext";

export default function BenchmarkReportModal() {
  const {
    benchmarkReportData,
    benchmarkReportModalOpen,
    setBenchmarkReportModalOpen
  } = useInspection();

  if (!benchmarkReportModalOpen || !benchmarkReportData) return null;

  const { session, kpis, summary } = benchmarkReportData;
  const totalReviewed = kpis.total_reviewed ?? 0;
  const totalImages = session.total_images ?? 0;
  const reviewPct = totalImages > 0 ? Math.round((totalReviewed / totalImages) * 100) : 0;
  const cm = kpis.confusion_matrix || { tp: 0, fp: 0, tn: 0, fn: 0 };

  // คำนวณ Sensitivity, Specificity, Precision
  const sensitivity = (cm.tp + cm.fn) > 0 ? (((cm.tp) / (cm.tp + cm.fn)) * 100).toFixed(1) : "-";
  const specificity = (cm.tn + cm.fp) > 0 ? (((cm.tn) / (cm.tn + cm.fp)) * 100).toFixed(1) : "-";
  const precision = (cm.tp + cm.fp) > 0 ? (((cm.tp) / (cm.tp + cm.fp)) * 100).toFixed(1) : "-";

  // แปลงสถานะ Verdict ให้อ่านเข้าใจง่าย เป็นมิตร สบายตา
  const getVerdictSummary = (verdict) => {
    switch (verdict) {
      case "PRODUCTION READY":
        return {
          title: "ผ่านเกณฑ์มาตรฐาน — พร้อมใช้งานในกระบวนการผลิต (Production Ready)",
          note: "โมเดลผ่านเกณฑ์การทดสอบคุณภาพทั้งหมด โดยไม่พบของเสียหลุดตรวจจับ (Zero Escape) และอัตราคัดทิ้งของดีอยู่ในเกณฑ์",
          tone: "pass"
        };
      case "PENDING HUMAN REVIEW":
        return {
          title: "รอการตรวจสอบยืนยันผลจากผู้เชี่ยวชาญ (Pending Review)",
          note: "ยังไม่มีการตรวจสอบยืนยันผลจริง (Ground Truth) ในหน้า Human Review Station สำหรับรอบการทดสอบนี้",
          tone: "pending"
        };
      case "DEFECT ESCAPE RISK (CRITICAL)":
        return {
          title: "ไม่ผ่านเกณฑ์ — พบของเสียหลุดตรวจจับ (Defect Escape Risk)",
          note: "มีชิ้นงานเสียแต่ระบบตัดสินว่าผ่าน เสี่ยงส่งผลกระทบต่อคุณภาพชิ้นงาน ควรปรับลดเกณฑ์หรือเทรนโมเดลใหม่",
          tone: "fail"
        };
      case "TUNING REQUIRED":
        return {
          title: "ต้องปรับจูนพารามิเตอร์เพิ่มเติม (Tuning Required)",
          note: "อัตราปฏิเสธของดีเกินเกณฑ์กำหนด หรือความสอดคล้องกับผู้ตรวจต่ำกว่าเป้าหมายที่ตั้งไว้",
          tone: "warn"
        };
      default:
        return {
          title: verdict || "อยู่ระหว่างการประเมิน",
          note: "ระบบกำลังรวบรวมข้อมูลผลการตรวจสอบ",
          tone: "neutral"
        };
    }
  };

  const verdictInfo = getVerdictSummary(summary?.verdict);

  return (
    <div className="split-view-modal-backdrop" onClick={() => setBenchmarkReportModalOpen(false)}>
      <div
        className="split-view-modal-content benchmark-report-print-container clean-report-doc"
        style={{
          maxWidth: "920px",
          width: "920px",
          height: "auto",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ส่วนหัวรายงาน (Report Header) */}
        <div className="report-doc-header">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
            <div>
              <div className="report-org-subtitle">WAFER DEFECT INSPECTION — AI PERFORMANCE EVALUATION REPORT</div>
              <h2 className="report-main-title">รายงานผลการทดสอบและประเมินประสิทธิภาพโมเดล AI</h2>
              <div className="report-meta-line">
                <span>รหัสรายงาน: <strong>VAL-BM-{session.id || "001"}</strong></span>
                <span className="meta-sep">•</span>
                <span>โมเดล: <strong>{session.model_name}</strong></span>
                <span className="meta-sep">•</span>
                <span>ชุดข้อมูล: <strong>{session.dataset_name}</strong></span>
                <span className="meta-sep">•</span>
                <span>วันที่ออกรายงาน: <strong>{summary?.generated_at}</strong></span>
              </div>
            </div>
            <button className="close-btn no-print" onClick={() => setBenchmarkReportModalOpen(false)}>✕</button>
          </div>

          {/* สรุปสถานะภาพรวมแบบข้อความชัดเจน ไม่ใช้กล่องนีออน */}
          <div className="report-verdict-summary">
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
              <span className="report-verdict-label">ผลการประเมินภาพรวม:</span>
              <span className={`report-verdict-text ${verdictInfo.tone}`}>
                {verdictInfo.title}
              </span>
            </div>
            <div className="report-verdict-note">{verdictInfo.note}</div>
          </div>
        </div>

        {/* เนื้อหารายงานแบบเลื่อนอ่านได้ (Report Body) */}
        <div className="report-doc-body">
          {/* หมวดที่ 1: ข้อมูลสรุปการทดสอบ */}
          <div className="report-section">
            <h3 className="report-section-title">1. ข้อมูลสรุปภาพรวมการทดสอบ (Test Overview)</h3>
            <table className="report-summary-table">
              <tbody>
                <tr>
                  <td className="sum-label">โมเดล AI ที่ทดสอบ</td>
                  <td className="sum-value font-mono">{session.model_name}</td>
                  <td className="sum-label">ชุดข้อมูลทดสอบ</td>
                  <td className="sum-value">{session.dataset_name}</td>
                </tr>
                <tr>
                  <td className="sum-label">จำนวนตัวอย่างทั้งหมด</td>
                  <td className="sum-value">{totalImages} ชิ้นงาน</td>
                  <td className="sum-label">การตรวจสอบโดยผู้ตรวจ (QA)</td>
                  <td className="sum-value">
                    {totalReviewed} / {totalImages} ชิ้นงาน ({reviewPct}%)
                  </td>
                </tr>
                <tr>
                  <td className="sum-label">ผลการตัดสินโดย AI</td>
                  <td className="sum-value">
                    ผ่าน {kpis.ai_pass_count ?? 0} / เสีย {kpis.ai_fail_count ?? 0} (Yield {Number(kpis.ai_yield ?? 0).toFixed(2)}%)
                  </td>
                  <td className="sum-label">ความเร็วประมวลผลเฉลี่ย</td>
                  <td className="sum-value">
                    {kpis.avg_inference_time_ms ? `${Number(kpis.avg_inference_time_ms).toFixed(1)} ms / ภาพ` : "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* หมวดที่ 2: ตัวชี้วัดคุณภาพและความแม่นยำ */}
          <div className="report-section">
            <h3 className="report-section-title">2. ตัวชี้วัดความแม่นยำและคุณภาพ (Quality & Accuracy Evaluation)</h3>
            <table className="report-clean-table">
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>ตัวชี้วัด (Performance Metric)</th>
                  <th style={{ width: "24%" }}>คำอธิบาย</th>
                  <th style={{ width: "18%" }}>ผลที่วัดได้ (Result)</th>
                  <th style={{ width: "12%" }}>เกณฑ์กำหนด</th>
                  <th style={{ width: "12%", textAlign: "right" }}>ผลประเมิน</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>ของเสียหลุดตรวจจับ (Underkill / Defect Escape)</strong>
                  </td>
                  <td className="sub-desc">ของเสียแต่ AI ตัดสินว่าผ่าน (เสี่ยงหลุดไปลูกค้า)</td>
                  <td className="font-mono">
                    {totalReviewed === 0
                      ? "รอตรวจสอบ"
                      : `${Number(kpis.underkill_rate ?? 0).toFixed(2)}% (${kpis.underkill_count ?? 0} ชิ้น)`}
                  </td>
                  <td className="font-mono">0.00%</td>
                  <td style={{ textAlign: "right" }}>
                    {totalReviewed === 0 ? (
                      <span className="eval-status pending">รอตรวจสอบ</span>
                    ) : kpis.underkill_rate === 0 ? (
                      <span className="eval-status pass">ผ่านเกณฑ์</span>
                    ) : (
                      <span className="eval-status fail">ไม่ผ่านเกณฑ์</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>ปฏิเสธของดีเกินจริง (Overkill / False Scrap)</strong>
                  </td>
                  <td className="sub-desc">ของดีแต่ AI ตัดสินว่าเสีย (สูญเสียผลผลิต)</td>
                  <td className="font-mono">
                    {totalReviewed === 0
                      ? "รอตรวจสอบ"
                      : `${Number(kpis.overkill_rate ?? 0).toFixed(2)}% (${kpis.overkill_count ?? 0} ชิ้น)`}
                  </td>
                  <td className="font-mono">&lt; 3.00%</td>
                  <td style={{ textAlign: "right" }}>
                    {totalReviewed === 0 ? (
                      <span className="eval-status pending">รอตรวจสอบ</span>
                    ) : kpis.overkill_rate <= 3.0 ? (
                      <span className="eval-status pass">ผ่านเกณฑ์</span>
                    ) : (
                      <span className="eval-status warn">เกินเกณฑ์</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>ความสอดคล้องกับผู้เชี่ยวชาญ (Agreement Rate)</strong>
                  </td>
                  <td className="sub-desc">ความเห็นตรงกันทั้งหมดระหว่างคนกับ AI</td>
                  <td className="font-mono">
                    {totalReviewed === 0
                      ? "รอตรวจสอบ"
                      : `${Number(kpis.agreement_rate ?? 0).toFixed(2)}% (${kpis.agreement_count ?? 0} ชิ้น)`}
                  </td>
                  <td className="font-mono">&ge; 95.00%</td>
                  <td style={{ textAlign: "right" }}>
                    {totalReviewed === 0 ? (
                      <span className="eval-status pending">รอตรวจสอบ</span>
                    ) : kpis.agreement_rate >= 95.0 ? (
                      <span className="eval-status pass">ผ่านเกณฑ์</span>
                    ) : (
                      <span className="eval-status warn">ต่ำกว่าเกณฑ์</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* หมวดที่ 3: ตารางจำแนกผลการตัดสิน */}
          <div className="report-section">
            <h3 className="report-section-title">3. ตารางจำแนกผลการตัดสิน (Classification Summary)</h3>
            <table className="report-clean-table report-matrix-table">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>การตัดสินโดย AI \ ผลยืนยันจริง (คน)</th>
                  <th style={{ width: "36%", textAlign: "center" }}>ผู้ตรวจยืนยัน: เสีย (Actual Defect)</th>
                  <th style={{ width: "36%", textAlign: "center" }}>ผู้ตรวจยืนยัน: ผ่าน (Actual Good)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>AI ตัดสินว่า เสีย (Defect)</strong></td>
                  <td style={{ textAlign: "center" }}>
                    <div className="matrix-number">{cm.tp}</div>
                    <div className="matrix-sub">ตรวจพบของเสียถูกต้อง (TP)</div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div className="matrix-number">{cm.fp}</div>
                    <div className="matrix-sub">ของดีถูกคัดทิ้งเกินจริง (FP / Overkill)</div>
                  </td>
                </tr>
                <tr>
                  <td><strong>AI ตัดสินว่า ผ่าน (Good)</strong></td>
                  <td style={{ textAlign: "center" }}>
                    <div className="matrix-number">{cm.fn}</div>
                    <div className="matrix-sub">ของเสียหลุดตรวจจับ (FN / Underkill)</div>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div className="matrix-number">{cm.tn}</div>
                    <div className="matrix-sub">ของดีผ่านถูกต้อง (TN)</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* สรุปสถิติประสิทธิภาพแบบบรรทัดข้อความสบายตา */}
            <div className="report-stat-summary-line">
              <span>ความแม่นยำตรวจจับของเสีย (Sensitivity / Recall): <strong>{sensitivity !== "-" ? `${sensitivity}%` : "N/A"}</strong></span>
              <span className="stat-bullet">•</span>
              <span>ความแม่นยำระบุของดี (Specificity): <strong>{specificity !== "-" ? `${specificity}%` : "N/A"}</strong></span>
              <span className="stat-bullet">•</span>
              <span>ความแม่นยำเมื่อแจ้งเตือนว่าเสีย (Precision): <strong>{precision !== "-" ? `${precision}%` : "N/A"}</strong></span>
            </div>

            {totalReviewed < totalImages && (
              <div className="report-audit-note">
                * หมายเหตุ: ตัวชี้วัดความแม่นยำและตารางจำแนกผลคำนวณจากตัวอย่างที่ได้รับการยืนยันโดยผู้เชี่ยวชาญแล้ว {totalReviewed} จาก {totalImages} ภาพ (สามารถตรวจสอบภาพที่เหลือได้ที่หน้า Human Review Station)
              </div>
            )}
          </div>
        </div>

        {/* ส่วนท้ายรายงานและปุ่มพิมพ์ (Footer Actions) */}
        <div className="report-doc-footer no-print">
          <button className="select-file-btn" style={{ padding: "8px 20px" }} onClick={() => window.print()}>
            พิมพ์รายงาน / PDF
          </button>
          <button
            className="select-file-btn"
            style={{
              padding: "8px 18px",
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-color)"
            }}
            onClick={() => setBenchmarkReportModalOpen(false)}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
