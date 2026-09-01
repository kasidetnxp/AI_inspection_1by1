import React from "react";
import { useInspection } from "../context/InspectionContext";

export default function BenchmarkReportModal() {
  const {
    benchmarkKpis,
    benchmarkModel,
    benchmarkReportData,
    benchmarkReportModalOpen,
    benchmarkRules,
    setBenchmarkReportModalOpen
  } = useInspection();

  if (!benchmarkReportModalOpen || !benchmarkReportData) return null;

  return (
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

                {/* Action Buttons */}
                <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                  <button className="select-file-btn" onClick={() => window.print()}>PRINT REPORT</button>
                  <button className="select-file-btn" style={{ background: "rgba(255, 255, 255, 0.1)" }} onClick={() => setBenchmarkReportModalOpen(false)}>CLOSE</button>
                </div>

              </div>
            </div>
          </div>
  );
}
