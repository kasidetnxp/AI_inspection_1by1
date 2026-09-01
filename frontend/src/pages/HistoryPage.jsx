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
    dateRangePreset,
    setDatePreset,
    setDateRangePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sortField,
    sortOrder,
    handleSort,
    resetAllFilters,
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
    setLoadedRawImage,
    getRecordDisplayDateTime
  } = useInspection();

  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(filteredHistory.length / pageSize) || 1;
  const paginatedData = filteredHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const passCount = filteredHistory.filter((h) => h.decision === "PASS").length;
  const failCount = filteredHistory.filter((h) => h.decision !== "PASS").length;
  const localYield = filteredHistory.length > 0 ? ((passCount / filteredHistory.length) * 100).toFixed(2) : "0.00";

  const renderSortIndicator = (field) => {
    if (sortField === field) {
      return <span className="sort-indicator">{sortOrder === "desc" ? "▼" : "▲"}</span>;
    }
    return <span className="sort-indicator">⇅</span>;
  };

  const isFilterActive =
    filterSearch ||
    analyticsFilter !== "ALL" ||
    analyticsBatchFilter !== "ALL" ||
    analyticsMachineFilter !== "ALL" ||
    dateRangePreset !== "ALL" ||
    startDate ||
    endDate;

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
            {/* Result Filter */}
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

            {/* Date Range Preset Pills */}
            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Date:</label>
              <div className="filter-pill-group">
                {[
                  { label: "All", value: "ALL" },
                  { label: "Today", value: "TODAY" },
                  { label: "7D", value: "7D" },
                  { label: "30D", value: "30D" },
                  { label: "Custom", value: "CUSTOM" }
                ].map((item) => (
                  <button
                    key={item.value}
                    className={`filter-pill ${dateRangePreset === item.value ? "active" : ""}`}
                    onClick={() => {
                      setDatePreset(item.value);
                      setCurrentPage(1);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Range Picker */}
            {dateRangePreset === "CUSTOM" && (
              <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <input
                  type="date"
                  className={`date-input-field ${startDate && endDate && startDate > endDate ? "input-error" : ""}`}
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  title="Start Date"
                  style={startDate && endDate && startDate > endDate ? { borderColor: "#ef4444", boxShadow: "0 0 0 1px #ef4444" } : {}}
                />
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>to</span>
                <input
                  type="date"
                  className={`date-input-field ${startDate && endDate && startDate > endDate ? "input-error" : ""}`}
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCurrentPage(1);
                  }}
                  title="End Date"
                  style={startDate && endDate && startDate > endDate ? { borderColor: "#ef4444", boxShadow: "0 0 0 1px #ef4444" } : {}}
                />
                {startDate && endDate && startDate > endDate && (
                  <span style={{ fontSize: "11.5px", color: "#ef4444", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
                    ⚠️ Start date must be before End date
                  </span>
                )}
              </div>
            )}

            {/* Sort Order Selector */}
            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Sort:</label>
              <button
                type="button"
                onClick={() => handleSort("timestamp")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  background: sortField === "timestamp" ? "rgba(2,132,199,0.15)" : "var(--bg-input)",
                  color: sortField === "timestamp" ? "var(--color-info)" : "var(--text-main)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
                title="Click to toggle Newest / Oldest inspection order"
              >
                <span>{sortField === "timestamp" ? (sortOrder === "desc" ? "Newest First" : "Oldest First") : `Sorted by ${sortField}`}</span>
                <span>{sortOrder === "desc" ? "▼" : "▲"}</span>
              </button>
            </div>

            {/* Machine Filter */}
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

            {/* Batch Filter */}
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

            {/* Search Input */}
            <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
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

            {/* Reset Filter Button */}
            {isFilterActive && (
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
                  resetAllFilters();
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
            <table className="history-table report-table" style={{ width: "100%", tableLayout: "auto" }}>
              <thead>
                <tr>
                  <th style={{ width: "45px", minWidth: "45px", textAlign: "center" }}>#</th>
                  <th className={`sortable-th ${sortField === "timestamp" ? "active-sort" : ""}`} onClick={() => handleSort("timestamp")} title="Click to sort by Timestamp" style={{ width: "165px", minWidth: "165px" }}>
                    Timestamp {renderSortIndicator("timestamp")}
                  </th>
                  <th className={`sortable-th ${sortField === "machineNo" ? "active-sort" : ""}`} onClick={() => handleSort("machineNo")} title="Click to sort by Machine No" style={{ width: "115px", minWidth: "115px" }}>
                    Machine No {renderSortIndicator("machineNo")}
                  </th>
                  <th className={`sortable-th ${sortField === "batch" ? "active-sort" : ""}`} onClick={() => handleSort("batch")} title="Click to sort by Batch / Wafer ID" style={{ width: "155px", minWidth: "155px" }}>
                    Batch / Wafer ID {renderSortIndicator("batch")}
                  </th>
                  <th className={`sortable-th ${sortField === "pad" ? "active-sort" : ""}`} onClick={() => handleSort("pad")} title="Click to sort by Pad" style={{ width: "65px", minWidth: "65px" }}>
                    Pad {renderSortIndicator("pad")}
                  </th>
                  <th className={`sortable-th ${sortField === "site" ? "active-sort" : ""}`} onClick={() => handleSort("site")} title="Click to sort by Site" style={{ width: "65px", minWidth: "65px" }}>
                    Site {renderSortIndicator("site")}
                  </th>
                  <th className={`sortable-th ${sortField === "xyCoord" ? "active-sort" : ""}`} onClick={() => handleSort("xyCoord")} title="Click to sort by XY Coordinate" style={{ width: "95px", minWidth: "95px" }}>
                    XY Coord {renderSortIndicator("xyCoord")}
                  </th>
                  <th className={`sortable-th ${sortField === "temp" ? "active-sort" : ""}`} onClick={() => handleSort("temp")} title="Click to sort by Temperature" style={{ width: "80px", minWidth: "80px" }}>
                    Temp {renderSortIndicator("temp")}
                  </th>
                  <th className={`sortable-th ${sortField === "decision" ? "active-sort" : ""}`} onClick={() => handleSort("decision")} title="Click to sort by AI Result" style={{ width: "100px", minWidth: "100px" }}>
                    AI Result {renderSortIndicator("decision")}
                  </th>
                  <th className={`sortable-th ${sortField === "reason" ? "active-sort" : ""}`} onClick={() => handleSort("reason")} title="Click to sort by Failure Reason" style={{ minWidth: "150px" }}>
                    Failure Reason {renderSortIndicator("reason")}
                  </th>
                  <th className={`sortable-th ${sortField === "inferenceTime" ? "active-sort" : ""}`} onClick={() => handleSort("inferenceTime")} title="Click to sort by Latency" style={{ width: "100px", minWidth: "100px" }}>
                    Latency {renderSortIndicator("inferenceTime")}
                  </th>
                  <th style={{ width: "75px", minWidth: "75px", textAlign: "center" }}>Action</th>
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
                    const recDecision = String(rec.decision || "-");
                    return (
                      <tr
                        key={rec.id ? `${rec.id}-${globalIdx}` : globalIdx}
                        onClick={() => openModalWithItem(rec, globalIdx)}
                        style={{ cursor: "pointer" }}
                        title="Click to view full wafer die image"
                      >
                        <td className="font-mono" style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "center" }}>
                          {globalIdx + 1}
                        </td>
                        <td>{getRecordDisplayDateTime(rec)}</td>
                        <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                        <td className="font-mono" style={{ fontWeight: "600" }}>{formatBatchWafer(rec)}</td>
                        <td className="font-mono">{rec.pad || "-"}</td>
                        <td className="font-mono">{rec.site || "-"}</td>
                        <td className="font-mono">{rec.xyCoord || "-"}</td>
                        <td className="font-mono">{rec.temp || "-"}</td>
                        <td>
                          <span className={`badge-result ${recDecision.toLowerCase()}`}>
                            {recDecision}
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
                            type="button"
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
