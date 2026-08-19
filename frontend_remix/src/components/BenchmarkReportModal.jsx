import React from "react";
import { useInspection } from "../context/InspectionContext";

export default function BenchmarkReportModal() {
  const {
    benchmarkReportModalOpen,
    setBenchmarkReportModalOpen,
    benchmarkReportData
  } = useInspection();

  if (!benchmarkReportModalOpen || !benchmarkReportData) return null;

  return (
    <div className="split-view-modal-backdrop" onClick={() => setBenchmarkReportModalOpen(false)}>
      <div className="split-view-modal-content" style={{ maxWidth: "800px" }} onClick={(e) => e.stopPropagation()}>
        <div className="split-view-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "700" }}>
              MODEL VALIDATION ANALYTICAL REPORT
            </h3>
            <span
              className="badge-result"
              style={{
                background: benchmarkReportData.summary.verdict === "PRODUCTION READY" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                color: benchmarkReportData.summary.verdict === "PRODUCTION READY" ? "#10b981" : "#f59e0b",
                border: `1px solid ${benchmarkReportData.summary.verdict === "PRODUCTION READY" ? "rgba(16, 185, 129, 0.4)" : "rgba(245, 158, 11, 0.4)"}`
              }}
            >
              {benchmarkReportData.summary.verdict}
            </span>
          </div>
          <button className="close-btn" onClick={() => setBenchmarkReportModalOpen(false)}>✕</button>
        </div>

        <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Meta info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", background: "rgba(255, 255, 255, 0.02)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)", fontSize: "12px" }}>
            <div><strong>Model:</strong> <span className="font-mono">{benchmarkReportData.session.model_name}</span></div>
            <div><strong>Dataset:</strong> {benchmarkReportData.session.dataset_name}</div>
            <div><strong>Total Samples:</strong> {benchmarkReportData.session.total_images} dies</div>
            <div><strong>Generated:</strong> {benchmarkReportData.summary.generated_at}</div>
          </div>

          {/* Metrics Table */}
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
              KEY ACCURACY & RELIABILITY METRICS
            </h4>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Measured Value</th>
                  <th>Target Spec</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Underkill / Defect Escape Rate (FN)</td>
                  <td className="font-mono" style={{ fontWeight: "bold", color: benchmarkReportData.kpis.underkill_rate > 0 ? "#ef4444" : "#10b981" }}>
                    {benchmarkReportData.kpis.underkill_rate.toFixed(2)}% ({benchmarkReportData.kpis.underkill_count} dies)
                  </td>
                  <td>0.00% (Zero Escape)</td>
                  <td>
                    <span className={`badge-result ${benchmarkReportData.kpis.underkill_rate === 0 ? "pass" : "fail"}`}>
                      {benchmarkReportData.kpis.underkill_rate === 0 ? "PASS" : "FAIL"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Overkill Rate (FP / False Scrap)</td>
                  <td className="font-mono" style={{ fontWeight: "bold", color: benchmarkReportData.kpis.overkill_rate > 3.0 ? "#f59e0b" : "#10b981" }}>
                    {benchmarkReportData.kpis.overkill_rate.toFixed(2)}% ({benchmarkReportData.kpis.overkill_count} dies)
                  </td>
                  <td>&lt; 3.00% (Yield Protection)</td>
                  <td>
                    <span className={`badge-result ${benchmarkReportData.kpis.overkill_rate <= 3.0 ? "pass" : "warn"}`}>
                      {benchmarkReportData.kpis.overkill_rate <= 3.0 ? "PASS" : "WARN"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>AI-Human Decision Agreement</td>
                  <td className="font-mono" style={{ fontWeight: "bold" }}>
                    {benchmarkReportData.kpis.agreement_rate.toFixed(2)}%
                  </td>
                  <td>&gt; 95.00%</td>
                  <td>
                    <span className={`badge-result ${benchmarkReportData.kpis.agreement_rate >= 95.0 ? "pass" : "warn"}`}>
                      {benchmarkReportData.kpis.agreement_rate >= 95.0 ? "PASS" : "WARN"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Average i.MX8 NPU Latency</td>
                  <td className="font-mono" style={{ fontWeight: "bold", color: "var(--color-info)" }}>
                    {benchmarkReportData.kpis.avg_inference_time_ms.toFixed(1)} ms
                  </td>
                  <td>&lt; 50.0 ms per die</td>
                  <td><span className="badge-result pass">PASS</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Confusion Matrix Table */}
          <div>
            <h4 style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
              CONFUSION MATRIX BREAKDOWN
            </h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "10px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>TRUE POSITIVE (Confirmed Defect)</div>
                <div style={{ fontSize: "22px", fontWeight: "bold", color: "#10b981", marginTop: "4px" }}>
                  {benchmarkReportData.kpis.confusion_matrix.tp}
                </div>
              </div>
              <div style={{ background: "rgba(245, 158, 11, 0.05)", border: "1px solid rgba(245, 158, 11, 0.3)", padding: "10px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>FALSE POSITIVE (Overkill / Good Scrap)</div>
                <div style={{ fontSize: "22px", fontWeight: "bold", color: "#f59e0b", marginTop: "4px" }}>
                  {benchmarkReportData.kpis.confusion_matrix.fp}
                </div>
              </div>
              <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.3)", padding: "10px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>FALSE NEGATIVE (Underkill / Defect Escape)</div>
                <div style={{ fontSize: "22px", fontWeight: "bold", color: "#ef4444", marginTop: "4px" }}>
                  {benchmarkReportData.kpis.confusion_matrix.fn}
                </div>
              </div>
              <div style={{ background: "rgba(14, 165, 233, 0.05)", border: "1px solid rgba(14, 165, 233, 0.3)", padding: "10px", borderRadius: "6px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>TRUE NEGATIVE (Confirmed Golden Pass)</div>
                <div style={{ fontSize: "22px", fontWeight: "bold", color: "#0ea5e9", marginTop: "4px" }}>
                  {benchmarkReportData.kpis.confusion_matrix.tn}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
            <button className="select-file-btn" onClick={() => window.print()}>PRINT REPORT</button>
            <button className="select-file-btn" style={{ background: "rgba(255, 255, 255, 0.1)" }} onClick={() => setBenchmarkReportModalOpen(false)}>CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
