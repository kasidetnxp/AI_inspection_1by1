import React, { useState, useEffect } from "react";
import { useInspection } from "../context/InspectionContext";

export default function AuditLogModal({ isOpen, onClose }) {
  const { auditLogs, auditLoading, auditError, fetchAuditLogs, exportAuditCSV } = useInspection();
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const categories = ["ALL", "SETTINGS", "RECIPE", "MACHINE", "MODEL", "NETWORK"];

  useEffect(() => {
    if (isOpen) {
      fetchAuditLogs(selectedCategory, searchQuery);
    }
  }, [isOpen, selectedCategory, fetchAuditLogs]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAuditLogs(selectedCategory, searchQuery);
  };

  if (!isOpen) return null;

  const displayedLogs = (auditLogs || []).filter((log) => {
    if (selectedCategory !== "ALL" && log.category !== selectedCategory) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchAction = (log.action || "").toLowerCase().includes(q);
      const matchDetails = (log.details || "").toLowerCase().includes(q);
      const matchAuthor = (log.author || "").toLowerCase().includes(q);
      if (!matchAction && !matchDetails && !matchAuthor) return false;
    }
    return true;
  });

  const getCategoryBadgeStyle = (category) => {
    switch (category) {
      case "SETTINGS":
        return { background: "rgba(59, 130, 246, 0.15)", color: "#2563eb", border: "1px solid rgba(59, 130, 246, 0.3)" };
      case "RECIPE":
        return { background: "rgba(168, 85, 247, 0.15)", color: "#9333ea", border: "1px solid rgba(168, 85, 247, 0.3)" };
      case "MACHINE":
        return { background: "rgba(14, 165, 233, 0.15)", color: "#0284c7", border: "1px solid rgba(14, 165, 233, 0.3)" };
      case "MODEL":
        return { background: "rgba(16, 185, 129, 0.15)", color: "#059669", border: "1px solid rgba(16, 185, 129, 0.3)" };
      case "NETWORK":
        return { background: "rgba(245, 158, 11, 0.15)", color: "#d97706", border: "1px solid rgba(245, 158, 11, 0.3)" };
      default:
        return { background: "rgba(100, 116, 139, 0.15)", color: "var(--text-muted)", border: "1px solid var(--border-color)" };
    }
  };

  return (
    <div
      className="split-view-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
        boxSizing: "border-box"
      }}
    >
      <div
        className="hmi-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "1000px",
          maxWidth: "96vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "8px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-card)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
          overflow: "hidden"
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-subtle)"
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>
              AUDIT LOG
            </h3>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              System settings and configuration history
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              width: "30px",
              height: "30px",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            ✕
          </button>
        </div>

        {/* CONTROLS */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          {/* CATEGORIES */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: isActive ? "700" : "500",
                    border: isActive ? "1px solid #3b82f6" : "1px solid var(--border-color)",
                    background: isActive ? "rgba(59, 130, 246, 0.15)" : "transparent",
                    color: isActive ? "#2563eb" : "var(--text-muted)",
                    cursor: "pointer"
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* SEARCH & ACTIONS */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <form onSubmit={handleSearchSubmit}>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "6px 10px",
                  fontSize: "12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-input)",
                  background: "var(--bg-input)",
                  color: "var(--text-main)",
                  width: "180px",
                  outline: "none"
                }}
              />
            </form>

            <button
              onClick={() => fetchAuditLogs(selectedCategory, searchQuery)}
              className="btn-secondary"
              style={{ padding: "6px 12px", fontSize: "12px", borderRadius: "6px", cursor: "pointer" }}
            >
              Refresh
            </button>

            <button
              onClick={() => exportAuditCSV(selectedCategory, searchQuery)}
              className="btn-secondary"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                borderRadius: "6px",
                cursor: "pointer",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#059669",
                border: "1px solid rgba(16, 185, 129, 0.3)"
              }}
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* LOGS TABLE */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 20px",
            minHeight: "320px",
            maxHeight: "56vh"
          }}
        >
          {auditLoading ? (
            <div style={{ padding: "50px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Loading audit logs...
            </div>
          ) : auditError ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "var(--color-fail)", fontSize: "13px" }}>
              Failed to load audit logs: {auditError}
            </div>
          ) : displayedLogs.length === 0 ? (
            <div style={{ padding: "50px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              No audit records found.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: "13px"
              }}
            >
              <thead>
                <tr
                  style={{
                    position: "sticky",
                    top: 0,
                    backgroundColor: "var(--bg-card)",
                    borderBottom: "1px solid var(--border-color)",
                    zIndex: 2
                  }}
                >
                  <th style={{ padding: "12px 8px", width: "160px", color: "var(--text-muted)", fontWeight: "600", fontSize: "11px" }}>TIMESTAMP</th>
                  <th style={{ padding: "12px 8px", width: "100px", color: "var(--text-muted)", fontWeight: "600", fontSize: "11px" }}>CATEGORY</th>
                  <th style={{ padding: "12px 8px", width: "170px", color: "var(--text-muted)", fontWeight: "600", fontSize: "11px" }}>ACTION</th>
                  <th style={{ padding: "12px 8px", color: "var(--text-muted)", fontWeight: "600", fontSize: "11px" }}>DETAILS</th>
                  <th style={{ padding: "12px 8px", width: "100px", color: "var(--text-muted)", fontWeight: "600", fontSize: "11px" }}>AUTHOR</th>
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map((log, idx) => (
                  <tr
                    key={log.id || idx}
                    style={{
                      borderBottom: "1px solid var(--border-color)"
                    }}
                  >
                    <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {log.timestamp}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "700",
                          ...getCategoryBadgeStyle(log.category)
                        }}
                      >
                        {log.category}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: "600", color: "var(--text-main)", fontFamily: "monospace", fontSize: "12px" }}>
                      {log.action}
                    </td>
                    <td style={{ padding: "10px 8px", color: "var(--text-main)", lineHeight: "1.4" }}>
                      {log.details}
                    </td>
                    <td style={{ padding: "10px 8px", color: "var(--text-muted)", fontSize: "12px", whiteSpace: "nowrap" }}>
                      {log.author || "Operator"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-subtle)"
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Total: <strong>{displayedLogs.length}</strong> events
          </div>
          <button
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: "6px 18px", fontSize: "12px", borderRadius: "6px", cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
