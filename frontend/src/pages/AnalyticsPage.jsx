import React from "react";
import { useInspection } from "../context/InspectionContext";
import { Doughnut, Bar, Line } from "react-chartjs-2";

export default function AnalyticsPage() {
  const {
    activeAlarms,
    analyticsBatchFilter,
    analyticsDateFilter,
    analyticsFilter,
    analyticsMachineFilter,
    apiBase,
    barChartData,
    barChartOptions,
    donutChartData,
    donutChartOptions,
    effectiveHistoryPage,
    exportToCSV,
    filterSearch,
    filteredHistory,
    formatBatchWafer,
    history,
    historyList,
    historyPageSize,
    openModalWithItem,
    paginatedHistory,
    setAnalyticsBatchFilter,
    setAnalyticsDateFilter,
    setAnalyticsFilter,
    setAnalyticsMachineFilter,
    setFilterSearch,
    setHistory,
    setHistoryPage,
    setHistoryPageSize,
    totalHistoryPages,
    uniqueBatches,
    uniqueDates,
    uniqueMachines,
    dateRangePreset,
    setDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sortField,
    sortOrder,
    handleSort,
    resetAllFilters,
    getRecordDisplayDateTime
  } = useInspection();

  const passCount = filteredHistory.filter((h) => h.decision === "PASS").length;
  const failCount = filteredHistory.filter((h) => h.decision !== "PASS").length;
  const yieldPct = filteredHistory.length > 0 ? ((passCount / filteredHistory.length) * 100).toFixed(2) : "0.00";
  const defectPct = filteredHistory.length > 0 ? ((failCount / filteredHistory.length) * 100).toFixed(2) : "0.00";

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
          <div className="tab-content active-tab" id="view-analytics">
            <main className="analytics-layout">
              
              {/* TOP TOOLBAR & CONTROLS */}
              <div className="analytics-top-bar" style={{ display: "flex", gap: "14px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", padding: "10px 16px", background: "var(--bg-card)", borderBottom: "1px solid var(--border-color)", borderRadius: "8px" }}>
                
                {/* Filter Controls */}
                <div className="filter-controls" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                  
                  {/* Result Pill Filter */}
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Result:</label>
                    <div className="filter-pill-group" id="filter-pills">
                      {["ALL", "PASS", "FAIL"].map(pill => (
                        <button key={pill} className={`filter-pill ${analyticsFilter === pill ? "active" : ""}`} onClick={() => { setAnalyticsFilter(pill); setHistoryPage(1); }}>{pill}</button>
                      ))}
                    </div>
                  </div>

                  {/* Date Range Preset Pills */}
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Date:</label>
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
                          setHistoryPage(1);
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
                          setHistoryPage(1);
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
                    <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Sort:</label>
                    <button
                      type="button"
                      onClick={() => handleSort("timestamp")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        background: sortField === "timestamp" ? "rgba(2,132,199,0.15)" : "var(--bg-input)",
                        color: sortField === "timestamp" ? "var(--color-info)" : "var(--text-main)",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Click to toggle Newest / Oldest inspection order"
                    >
                      <span>{sortField === "timestamp" ? (sortOrder === "desc" ? "Newest First" : "Oldest First") : `Sort: ${sortField}`}</span>
                      <span>{sortOrder === "desc" ? "▼" : "▲"}</span>
                    </button>
                  </div>

                  {/* Machine Filter */}
                  {uniqueMachines.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Machine:</label>
                      <select
                        value={analyticsMachineFilter}
                        onChange={(e) => { setAnalyticsMachineFilter(e.target.value); setHistoryPage(1); }}
                        style={{ padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                      >
                        <option value="ALL">All Machines ({uniqueMachines.length})</option>
                        {uniqueMachines.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Batch Filter */}
                  {uniqueBatches.length > 0 && (
                    <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <label style={{ fontSize: "14px", fontWeight: "bold", color: "var(--text-muted)" }}>Batch:</label>
                      <select
                        value={analyticsBatchFilter}
                        onChange={(e) => { setAnalyticsBatchFilter(e.target.value); setHistoryPage(1); }}
                        style={{ padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                      >
                        <option value="ALL">All Batches ({uniqueBatches.length})</option>
                        {uniqueBatches.map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Search Input */}
                  <div className="filter-item" style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: "200px" }}>
                    <input
                      type="text"
                      id="filter-search"
                      value={filterSearch}
                      onChange={(e) => { setFilterSearch(e.target.value); setHistoryPage(1); }}
                      placeholder="Search Batch, Wafer, XY, Site, Pad, Reason..."
                      style={{ width: "100%", padding: "6px 12px", borderRadius: "5px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px" }}
                    />
                  </div>

                  {/* Reset Filter Button */}
                  {isFilterActive && (
                    <button
                      style={{ padding: "6px 12px", borderRadius: "5px", border: "none", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", cursor: "pointer", fontSize: "13.5px", fontWeight: "bold" }}
                      onClick={() => { resetAllFilters(); }}
                    >
                      Reset Filter
                    </button>
                  )}
                </div>

                {/* Actions: Export & Clear */}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <button className="excel-export-btn" id="btn-export-excel" onClick={exportToCSV} style={{ padding: "7px 16px", fontSize: "14px" }}>
                    <span className="excel-icon"></span> Export (.csv)
                  </button>
                  
                  <button
                    className="clear-history-btn"
                    id="btn-clear-db-history"
                    title="Clear all stored inspection history from database"
                    style={{ padding: "7px 14px", fontSize: "14px" }}
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear all history records from database?")) {
                        fetch(`${apiBase}/api/history`, { method: "DELETE" })
                          .then(r => r.json())
                          .then(res => {
                            setHistory([]);
                            alert("Database history cleared successfully!");
                          })
                          .catch(e => alert("Failed to clear history: " + e));
                      }
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* MAIN HISTORY DASHBOARD CONTENT */}
              <div className="analytics-dashboard-grid">
                {/* Left side: KPIs + Donut + Defect Bar */}
                <div className="analytics-dashboard-col left-dashboard-col">
                  <div className="analytics-kpi-subgrid">
                    <div className="analytics-stat-card span-full">
                      <span className="stat-lbl">Matched Wafers</span>
                      <span className="stat-val font-mono" id="an-total-inspected">
                        {filteredHistory.length} <small style={{ fontSize: "12px", color: "var(--text-muted)" }}>/ {historyList.length}</small>
                      </span>
                    </div>
                    <div className="analytics-stat-card card-green">
                      <span className="stat-lbl">Yield Rate (Pass)</span>
                      <span className="stat-val font-mono" id="an-yield-rate">
                        {yieldPct}%
                      </span>
                      <span className="stat-sub font-mono">
                        ({passCount})
                      </span>
                    </div>
                    <div className="analytics-stat-card card-red">
                      <span className="stat-lbl">Defect Rate (Fail)</span>
                      <span className="stat-val font-mono" id="an-defect-rate">
                        {defectPct}%
                      </span>
                      <span className="stat-sub font-mono">
                        ({failCount})
                      </span>
                    </div>
                  </div>

                  <div className="hmi-card donut-chart-card">
                    <div className="card-header"><h3>YIELD DISTRIBUTION</h3></div>
                    <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                      <Doughnut data={donutChartData} options={donutChartOptions} />
                    </div>
                  </div>

                  <div className="hmi-card bar-chart-card">
                    <div className="card-header"><h3>DEFECT CAUSES BREAKDOWN</h3></div>
                    <div className="card-body chart-body" style={{ height: "180px", position: "relative" }}>
                      <Bar data={barChartData} options={barChartOptions} />
                    </div>
                  </div>
                </div>

                {/* Right side: Table with Full Height */}
                <div className="analytics-dashboard-col right-dashboard-col">
                  <div className="hmi-card analytics-table-card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
                    <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3>DETAILED PRODUCTION RECORDS</h3>
                      <span className="pill-id" id="report-row-count">{filteredHistory.length} Records</span>
                    </div>
                    
                    <div className="card-body table-container" style={{ flex: 1, overflowY: "auto" }}>
                      <table className="history-table report-table" style={{ width: "100%", tableLayout: "auto" }}>
                        <thead>
                          <tr>
                            <th className={`sortable-th ${sortField === "timestamp" ? "active-sort" : ""}`} onClick={() => handleSort("timestamp")} title="Click to sort by Timestamp" style={{ width: "165px", minWidth: "165px" }}>
                              Timestamp {renderSortIndicator("timestamp")}
                            </th>
                            <th className={`sortable-th ${sortField === "machineNo" ? "active-sort" : ""}`} onClick={() => handleSort("machineNo")} title="Click to sort by Machine No" style={{ width: "115px", minWidth: "115px" }}>
                              Machine no {renderSortIndicator("machineNo")}
                            </th>
                            <th className={`sortable-th ${sortField === "batch" ? "active-sort" : ""}`} onClick={() => handleSort("batch")} title="Click to sort by Batch / Wafer ID" style={{ width: "155px", minWidth: "155px" }}>
                              Batch/Wafer no {renderSortIndicator("batch")}
                            </th>
                            <th className={`sortable-th ${sortField === "pad" ? "active-sort" : ""}`} onClick={() => handleSort("pad")} title="Click to sort by Pad" style={{ width: "65px", minWidth: "65px" }}>
                              Pad {renderSortIndicator("pad")}
                            </th>
                            <th className={`sortable-th ${sortField === "site" ? "active-sort" : ""}`} onClick={() => handleSort("site")} title="Click to sort by Site" style={{ width: "65px", minWidth: "65px" }}>
                              Site {renderSortIndicator("site")}
                            </th>
                            <th className={`sortable-th ${sortField === "xyCoord" ? "active-sort" : ""}`} onClick={() => handleSort("xyCoord")} title="Click to sort by XY Coordinate" style={{ width: "95px", minWidth: "95px" }}>
                              XY Coordinate {renderSortIndicator("xyCoord")}
                            </th>
                            <th className={`sortable-th ${sortField === "temp" ? "active-sort" : ""}`} onClick={() => handleSort("temp")} title="Click to sort by Temperature" style={{ width: "80px", minWidth: "80px" }}>
                              Temp {renderSortIndicator("temp")}
                            </th>
                            <th className={`sortable-th ${sortField === "decision" ? "active-sort" : ""}`} onClick={() => handleSort("decision")} title="Click to sort by Result" style={{ width: "100px", minWidth: "100px" }}>
                              Result {renderSortIndicator("decision")}
                            </th>
                            <th className={`sortable-th ${sortField === "reason" ? "active-sort" : ""}`} onClick={() => handleSort("reason")} title="Click to sort by Failure Reason" style={{ minWidth: "150px" }}>
                              Failure Reason {renderSortIndicator("reason")}
                            </th>
                          </tr>
                        </thead>
                        <tbody id="analytics-table-body">
                          {paginatedHistory.map((rec, index) => {
                            const absoluteIndex = (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + index;
                            const recDecision = String(rec.decision || "-");
                            return (
                              <tr key={rec.id ? `${rec.id}-${absoluteIndex}` : absoluteIndex} onClick={() => openModalWithItem(rec, absoluteIndex)} title="Click to view inspection image" style={{ cursor: "pointer" }}>
                                <td>{getRecordDisplayDateTime(rec)}</td>
                                <td className="font-mono">{rec.machineNo || "PROBER01"}</td>
                                <td className="font-mono">{formatBatchWafer(rec)}</td>
                                <td className="font-mono">{rec.pad || "-"}</td>
                                <td className="font-mono">{rec.site || "-"}</td>
                                <td className="font-mono">{rec.xyCoord || "-"}</td>
                                <td className="font-mono">{rec.temp || "-"}</td>
                                <td>
                                  <span className={`badge-result ${recDecision.toLowerCase()}`}>{recDecision}</span>
                                </td>
                                <td className="font-mono" style={{ fontSize: "14px", color: rec.reason && rec.reason !== "-" ? "var(--color-fail)" : "inherit" }}>
                                  {rec.reason || "-"}
                                </td>
                              </tr>
                            );
                          })}
                          {paginatedHistory.length === 0 && (
                            <tr>
                              <td colSpan="9" style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)", fontSize: "14px" }}>
                                No records found matching current filter criteria.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="table-pagination-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderTop: "1px solid var(--border-color)", background: "rgba(0,0,0,0.03)", flexWrap: "wrap", gap: "10px", fontSize: "13.5px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)" }}>
                        <span>
                          Showing <strong>{filteredHistory.length === 0 ? 0 : (effectiveHistoryPage - 1) * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)) + 1}</strong> - <strong>{Math.min(effectiveHistoryPage * (historyPageSize === "ALL" ? filteredHistory.length : Number(historyPageSize)), filteredHistory.length)}</strong> of <strong>{filteredHistory.length}</strong>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>Page Size:</span>
                          <select
                            value={historyPageSize}
                            onChange={(e) => { setHistoryPageSize(e.target.value === "ALL" ? "ALL" : Number(e.target.value)); setHistoryPage(1); }}
                            style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "13.5px" }}
                          >
                            <option value={15}>15</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value="ALL">All ({filteredHistory.length})</option>
                          </select>
                        </div>
                      </div>

                      {historyPageSize !== "ALL" && totalHistoryPages > 1 && (
                        <div className="pagination-btn-group" style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(1)} title="First Page">⏮</button>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))} title="Previous Page">◀</button>
                          <span style={{ padding: "0 6px", fontWeight: "bold" }}>Page {effectiveHistoryPage} of {totalHistoryPages}</span>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} title="Next Page">▶</button>
                          <button className="pagination-nav-btn" disabled={effectiveHistoryPage >= totalHistoryPages} onClick={() => setHistoryPage(totalHistoryPages)} title="Last Page">⏭</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
  );
}
