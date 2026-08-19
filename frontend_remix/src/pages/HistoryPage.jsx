import React, { useState } from "react";
import { useInspection } from "../context/InspectionContext";

export default function HistoryPage() {
  const {
    history,
    setHistory,
    historyList,
    filteredHistory,
    analyticsFilter,
    setAnalyticsFilter,
    analyticsMachineFilter,
    setAnalyticsMachineFilter,
    analyticsBatchFilter,
    setAnalyticsBatchFilter,
    filterSearch,
    setFilterSearch,
    uniqueMachines,
    uniqueBatches,
    openModalWithItem,
    formatBatchWafer,
    exportToCSV,
    apiBase,
    setCurrentInspection,
    setLoadedImage,
    setLoadedRawImage
  } = useInspection();

  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(filteredHistory.length / pageSize) || 1;
  const paginatedData = filteredHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const passCount = filteredHistory.filter((h) => h.decision === "PASS").length;
  const failCount = filteredHistory.filter((h) => h.decision !== "PASS").length;
  const localYield = filteredHistory.length > 0 ? ((passCount / filteredHistory.length) * 100).toFixed(2) : "0.00";

  return (
    <div className="tab-content active-tab" id="view-history">
      <main className="analytics-layout" style={{ padding: "16px 24px", maxWidth: "1600px", margin: "0 auto" }}>
        {/* HEADER & CONTROLS */}
        <div
          className="analytics-top-bar"
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            padding: "16px 20px",
            background: "var(--bg-card)",
            borderRadius: "8px",
            border: "1px solid var(--border-color)"
          }}
        >
          <div
            className="filter-controls"
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              flex: 1
            }}
          >
            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Result:</label>
              <div className="filter-pill-group">
                {["ALL", "PASS", "FAIL"].map((pill) => (
                  <button
                    key={pill}
                    className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`}
                    onClick={() => {
                      setAnalyticsFilter(pill);
                      setCurrentPage(1);
                    }}
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>

            {uniqueMachines.length > 0 && (
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Machine:</label>
                <select
                  value={analyticsMachineFilter}
                  onChange={(e) => {
                    setAnalyticsMachineFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "13px"
                  }}
                >
                  <option value="ALL">All Machines ({uniqueMachines.length})</option>
                  {uniqueMachines.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {uniqueBatches.length > 0 && (
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Batch:</label>
                <select
                  value={analyticsBatchFilter}
                  onChange={(e) => {
                    setAnalyticsBatchFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-input)",
                    color: "var(--text-main)",
                    fontSize: "13px"
                  }}
                >
                  <option value="ALL">All Batches ({uniqueBatches.length})</option>
                  {uniqueBatches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "220px" }}>
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => {
                  setFilterSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search Wafer ID, Batch, XY Coord, Pad, Reason..."
                style={{
                  width: "100%",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  fontSize: "13px"
                }}
              />
            </div>

            {(filterSearch || analyticsFilter !== "ALL" || analyticsBatchFilter !== "ALL" || analyticsMachineFilter !== "ALL") && (
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "rgba(255,50,50,0.15)",
                  color: "#ff6b6b",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "bold"
                }}
                onClick={() => {
                  setFilterSearch("");
                  setAnalyticsFilter("ALL");
                  setAnalyticsBatchFilter("ALL");
                  setAnalyticsMachineFilter("ALL");
                  setCurrentPage(1);
                }}
              >
                Reset Filter
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button className="excel-export-btn" onClick={exportToCSV}>
              <span className="excel-icon"></span> Export CSV
            </button>
            <button
              className="clear-history-btn"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all history records from database?")) {
                  fetch(`${apiBase}/api/history`, { method: "DELETE" })
                    .then(() => {
                      setHistory([]);
                      setCurrentInspection({
                        id: "-", batch: "-", waferNo: "-", xyCoord: "-", site: "-", pad: "-", temp: "-",
                        padsTotal: 0, padsDetected: 0, probeMarks: 0, grains: 0,
                        confidence: 0, inferenceTime: 0, ruleTime: 0, decision: "-", machineAction: "WAITING"
                      });
                      setLoadedImage(null);
                      setLoadedRawImage(null);
                      alert("Database history cleared successfully!");
                    })
                    .catch((e) => alert("Failed to clear history: " + e));
                }
              }}
            >
              Clear DB
            </button>
          </div>
        </div>

        {/* METRICS SUMMARY BAR */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
            marginTop: "16px"
          }}
        >
          <div className="analytics-stat-card">
            <span className="stat-lbl">MATCHED LOGS</span>
            <span className="stat-val font-mono">{filteredHistory.length} <small style={{ fontSize: "12px", color: "var(--text-muted)" }}>/ {historyList.length}</small></span>
          </div>
          <div className="analytics-stat-card card-green">
            <span className="stat-lbl">PASS COUNT</span>
            <span className="stat-val font-mono" style={{ color: "var(--color-pass)" }}>{passCount}</span>
          </div>
          <div className="analytics-stat-card card-red">
            <span className="stat-lbl">FAIL COUNT</span>
            <span className="stat-val font-mono" style={{ color: "var(--color-fail)" }}>{failCount}</span>
          </div>
          <div className="analytics-stat-card card-blue">
            <span className="stat-lbl">PASS YIELD</span>
            <span className="stat-val font-mono" style={{ color: "var(--color-info)" }}>{localYield}%</span>
          </div>
        </div>

        {/* FULL LOG TABLE */}
        <div className="hmi-card" style={{ marginTop: "16px" }}>
          <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>ALL INSPECTION RECORDS</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-color)",
                  fontSize: "12px"
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="card-body table-container" style={{ maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
            <table className="history-table report-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Machine No</th>
                  <th>Batch / Wafer ID</th>
                  <th>Pad</th>
                  <th>Site</th>
                  <th>XY Coord</th>
                  <th>Temp</th>
                  <th>AI Result</th>
                  <th>Failure Reason</th>
                  <th>Latency</th>
                  <th style={{ textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                      No inspection records found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((rec, idx) => {
                    const globalIdx = (currentPage - 1) * pageSize + idx;
                    return (
                      <tr
                        key={idx}
                        onClick={() => openModalWithItem(rec, globalIdx)}
                        style={{ cursor: "pointer" }}
                        title="Click to view full wafer die image"
                      >
                        <td className="font-mono" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                          {globalIdx + 1}
                        </td>
                        <td>{rec.timestamp || rec.timeShort || "-"}</td>
                        <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                        <td className="font-mono" style={{ fontWeight: "600" }}>{formatBatchWafer(rec)}</td>
                        <td className="font-mono">{rec.pad || "-"}</td>
                        <td className="font-mono">{rec.site || "-"}</td>
                        <td className="font-mono">{rec.xyCoord || "-"}</td>
                        <td className="font-mono">{rec.temp || "-"}</td>
                        <td>
                          <span className={`badge-result ${rec.decision.toLowerCase()}`}>
                            {rec.decision}
                          </span>
                        </td>
                        <td
                          className="font-mono"
                          style={{
                            fontSize: "12px",
                            color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit"
                          }}
                        >
                          {rec.reason || "-"}
                        </td>
                        <td className="font-mono">{rec.inferenceTime ?? 0} ms</td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            className="action-btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openModalWithItem(rec, globalIdx);
                            }}
                          >
                            VIEW
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION FOOTER */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 20px",
                borderTop: "1px solid var(--border-color)",
                fontSize: "12px",
                color: "var(--text-muted)"
              }}
            >
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredHistory.length)} of {filteredHistory.length} entries
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <button
                  className="view-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
                >
                  ◀ Prev
                </button>
                <span className="font-mono" style={{ fontWeight: "bold", padding: "0 8px" }}>
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="view-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ opacity: currentPage === totalPages ? 0.5 : 1 }}
                >
                  Next ▶
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
