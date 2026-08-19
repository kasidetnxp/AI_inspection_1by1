import React from "react";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { useInspection } from "../context/InspectionContext";

export default function AnalyticsPage() {
  const {
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
    filteredHistory,
    history,
    setHistory,
    exportToCSV,
    apiBase,
    donutChartData,
    donutChartOptions,
    barChartData,
    barChartOptions,
    lineChartData,
    lineChartOptions,
    openModalWithItem,
    formatBatchWafer
  } = useInspection();

  return (
    <div className="tab-content active-tab" id="view-analytics">
      <main className="analytics-layout">
        {/* TOP FILTER BAR */}
        <div
          className="analytics-top-bar"
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            padding: "12px 20px"
          }}
        >
          <div
            className="filter-controls"
            style={{
              display: "flex",
              gap: "14px",
              alignItems: "center",
              flexWrap: "wrap",
              flex: 1
            }}
          >
            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Result:</label>
              <div className="filter-pill-group" id="filter-pills">
                {["ALL", "PASS", "FAIL"].map((pill) => (
                  <button
                    key={pill}
                    className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`}
                    onClick={() => setAnalyticsFilter(pill)}
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
                  onChange={(e) => setAnalyticsMachineFilter(e.target.value)}
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
                  onChange={(e) => setAnalyticsBatchFilter(e.target.value)}
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

            <div
              className="filter-item"
              style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}
            >
              <input
                type="text"
                id="filter-search"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search Batch, Wafer, XY, Site, Pad, Reason..."
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

            {(filterSearch ||
              analyticsFilter !== "ALL" ||
              analyticsBatchFilter !== "ALL" ||
              analyticsMachineFilter !== "ALL") && (
              <button
                style={{
                  padding: "5px 12px",
                  borderRadius: "6px",
                  border: "none",
                  background: "rgba(255,50,50,0.2)",
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
                }}
              >
                Reset Filter
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button className="excel-export-btn" id="btn-export-excel" onClick={exportToCSV}>
              <span className="excel-icon"></span> Export spreadsheet (.csv)
            </button>
            <button
              className="clear-history-btn"
              id="btn-clear-db-history"
              title="Clear all stored inspection history from database"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all history records from database?")) {
                  fetch(`${apiBase}/api/history`, { method: "DELETE" })
                    .then((r) => r.json())
                    .then(() => {
                      setHistory([]);
                      alert("Database history cleared successfully!");
                    })
                    .catch((e) => alert("Failed to clear history: " + e));
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* ANALYTICS GRID */}
        <div className="analytics-dashboard-grid">
          {/* Left side: KPIs + Donut + Defect Bar */}
          <div className="analytics-dashboard-col left-dashboard-col">
            <div className="analytics-kpi-subgrid">
              <div className="analytics-stat-card">
                <span className="stat-lbl">Processed Wafers</span>
                <span className="stat-val font-mono" id="an-total-inspected">
                  {history.length}
                </span>
              </div>
              <div className="analytics-stat-card card-green">
                <span className="stat-lbl">Yield Rate (Pass)</span>
                <span className="stat-val font-mono" id="an-yield-rate">
                  {(history.length > 0
                    ? (history.filter((h) => h.decision === "PASS").length / history.length) * 100
                    : 0
                  ).toFixed(2)}
                  %
                </span>
              </div>
              <div className="analytics-stat-card card-red">
                <span className="stat-lbl">Defect Rate (Fail)</span>
                <span className="stat-val font-mono" id="an-defect-rate">
                  {(history.length > 0
                    ? (history.filter((h) => h.decision !== "PASS").length / history.length) * 100
                    : 0
                  ).toFixed(2)}
                  %
                </span>
              </div>
              <div className="analytics-stat-card card-blue">
                <span className="stat-lbl">Avg Confidence</span>
                <span className="stat-val font-mono" id="an-avg-confidence">
                  {(history.length > 0
                    ? history.reduce((sum, h) => sum + (h.confidence || 0), 0) / history.length
                    : 0
                  ).toFixed(1)}
                  %
                </span>
              </div>
            </div>

            <div className="hmi-card donut-chart-card">
              <div className="card-header">
                <h3>YIELD DISTRIBUTION</h3>
              </div>
              <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                <Doughnut data={donutChartData} options={donutChartOptions} />
              </div>
            </div>

            <div className="hmi-card bar-chart-card">
              <div className="card-header">
                <h3>DEFECT CAUSES BREAKDOWN</h3>
              </div>
              <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                <Bar data={barChartData} options={barChartOptions} />
              </div>
            </div>
          </div>

          {/* Right side: Line chart + Table */}
          <div className="analytics-dashboard-col right-dashboard-col">
            <div className="hmi-card line-chart-card">
              <div className="card-header">
                <h3>LATENCY HISTORY (MS)</h3>
              </div>
              <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                <Line data={lineChartData} options={lineChartOptions} />
              </div>
            </div>

            <div className="hmi-card analytics-table-card">
              <div className="card-header">
                <h3>DETAILED PRODUCTION REPORT</h3>
                <span className="pill-id" id="report-row-count">
                  {filteredHistory.length} Records
                </span>
              </div>
              <div className="card-body table-container">
                <table className="history-table report-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Machine no</th>
                      <th>Batch/Wafer no</th>
                      <th>Pad</th>
                      <th>Site</th>
                      <th>XY Coordinate</th>
                      <th>Temp</th>
                      <th>Result</th>
                      <th>Failure Reason</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody id="analytics-table-body">
                    {filteredHistory.map((rec, index) => (
                      <tr
                        key={index}
                        onClick={() => openModalWithItem(rec, index)}
                        title="Click to view inspection image"
                      >
                        <td>{rec.timestamp || rec.timeShort || "-"}</td>
                        <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                        <td className="font-mono">{formatBatchWafer(rec)}</td>
                        <td className="font-mono">{rec.pad || "-"}</td>
                        <td className="font-mono">{rec.site || "-"}</td>
                        <td className="font-mono">{rec.xyCoord || "-"}</td>
                        <td className="font-mono">{rec.temp || "-"}</td>
                        <td>
                          <span className={`badge-result ${rec.decision.toLowerCase()}`}>{rec.decision}</span>
                        </td>
                        <td
                          className="font-mono"
                          style={{
                            fontSize: "13px",
                            color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit"
                          }}
                        >
                          {rec.reason || "-"}
                        </td>
                        <td className="font-mono">{rec.inferenceTime ?? 0} ms</td>
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
  );
}
