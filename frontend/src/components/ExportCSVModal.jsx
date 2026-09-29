import React, { useState } from "react";
import { downloadCSVBlob, saveCSVToDownloadsServer } from "../utils/historyHelpers";

export default function ExportCSVModal({
  isOpen,
  onClose,
  title = "CSV Export Preview",
  filename = "export.csv",
  headers = [],
  rows = [],
  csvContent = "",
  apiBase = "http://localhost:8001"
}) {
  const [copied, setCopied] = useState(false);
  const [serverSavedStatus, setServerSavedStatus] = useState(null);
  const [isSavingServer, setIsSavingServer] = useState(false);

  if (!isOpen) return null;

  // Generate Tab-Separated Values for 1-click clipboard paste directly into Excel
  const handleCopyClipboard = async () => {
    try {
      const tsvContent = [
        headers.join("\t"),
        ...rows.map(row => row.map(cell => String(cell ?? "").replace(/"/g, "")).join("\t"))
      ].join("\n");

      await navigator.clipboard.writeText(tsvContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
      // Fallback to simple CSV copy
      try {
        await navigator.clipboard.writeText(csvContent);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (e2) {
        alert("Unable to copy to clipboard.");
      }
    }
  };

  // Direct backend save to /home/nxp1/Downloads
  const handleSaveToDownloads = async () => {
    setIsSavingServer(true);
    setServerSavedStatus(null);
    try {
      const res = await saveCSVToDownloadsServer(apiBase, filename, csvContent);
      if (res.success) {
        setServerSavedStatus({
          type: "success",
          message: `Saved to ${res.data?.path || `~/Downloads/${filename}`}`
        });
      } else {
        setServerSavedStatus({
          type: "error",
          message: `Could not save to ~/Downloads (${res.error || "Server error"}). Use Download File button instead.`
        });
      }
    } catch (err) {
      setServerSavedStatus({
        type: "error",
        message: `Error: ${err.message}`
      });
    } finally {
      setIsSavingServer(false);
    }
  };

  const handleDownloadFile = async () => {
    await downloadCSVBlob(filename, csvContent);
  };

  const previewLimit = 100;
  const displayedRows = rows.slice(0, previewLimit);

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
          width: "1100px",
          maxWidth: "96vw",
          height: "720px",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "8px",
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-card)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
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
            background: "var(--bg-subtle)",
            flexShrink: 0
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>📊</span>
              <span>{title}</span>
            </h3>
            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
              Preview formatted spreadsheet before saving or copying to Excel
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn-secondary"
            style={{
              width: "32px",
              height: "32px",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "16px",
              fontWeight: "bold"
            }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* METADATA BAR */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            background: "var(--bg-input)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-muted)" }}>Filename:</span>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "12px",
                background: "rgba(2, 132, 199, 0.12)",
                color: "var(--color-info)",
                padding: "4px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(2, 132, 199, 0.25)"
              }}
            >
              {filename}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "600",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "1px solid rgba(16, 185, 129, 0.25)"
              }}
            >
              {rows.length.toLocaleString()} total rows
            </span>
          </div>

          {serverSavedStatus && (
            <div
              style={{
                fontSize: "12px",
                padding: "4px 10px",
                borderRadius: "4px",
                fontWeight: "600",
                background: serverSavedStatus.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                color: serverSavedStatus.type === "success" ? "#10b981" : "#ef4444",
                border: `1px solid ${serverSavedStatus.type === "success" ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`
              }}
            >
              {serverSavedStatus.type === "success" ? "✅ " : "⚠️ "}
              {serverSavedStatus.message}
            </div>
          )}
        </div>

        {/* PREVIEW TABLE */}
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          {rows.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
              No records available to preview.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                textAlign: "left"
              }}
            >
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--bg-subtle)",
                  zIndex: 2,
                  boxShadow: "0 1px 0 var(--border-color)"
                }}
              >
                <tr>
                  <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)", color: "var(--text-muted)", width: "40px" }}>
                    #
                  </th>
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        color: "var(--text-muted)",
                        fontWeight: "600",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r, rowIndex) => (
                  <tr
                    key={rowIndex}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: rowIndex % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.02)"
                    }}
                  >
                    <td style={{ padding: "6px 12px", color: "var(--text-muted)", fontFamily: "monospace", fontSize: "11px" }}>
                      {rowIndex + 1}
                    </td>
                    {r.map((cell, cellIndex) => {
                      const strCell = String(cell ?? "").replace(/^"|"$/g, "");
                      const isPass = strCell === "PASS" || strCell === "AGREE";
                      const isFail = strCell === "FAIL" || strCell === "DISAGREE";

                      return (
                        <td
                          key={cellIndex}
                          style={{
                            padding: "6px 12px",
                            whiteSpace: "nowrap",
                            color: isPass ? "var(--color-pass, #10b981)" : isFail ? "var(--color-fail, #ef4444)" : "var(--text-main)",
                            fontWeight: isPass || isFail ? "700" : "normal"
                          }}
                        >
                          {strCell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-subtle)",
            flexShrink: 0,
            gap: "12px",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {rows.length > previewLimit && (
              <span>Showing first {previewLimit} rows of {rows.length.toLocaleString()} total • </span>
            )}
            <span>UTF-8 BOM Included (Microsoft Excel Ready)</span>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* COPY TO CLIPBOARD */}
            <button
              type="button"
              onClick={handleCopyClipboard}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: copied ? "rgba(16, 185, 129, 0.2)" : "var(--bg-card)",
                color: copied ? "#10b981" : "var(--text-main)",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
              title="Copy table to paste directly into Excel or Google Sheets (Ctrl+V)"
            >
              <span>{copied ? "✅" : "📋"}</span>
              <span>{copied ? "Copied to Clipboard!" : "Copy to Clipboard"}</span>
            </button>

            {/* SAVE TO DOWNLOADS */}
            <button
              type="button"
              onClick={handleSaveToDownloads}
              disabled={isSavingServer}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid rgba(2, 132, 199, 0.3)",
                background: "rgba(2, 132, 199, 0.15)",
                color: "var(--color-info)",
                fontSize: "13px",
                fontWeight: "600",
                cursor: isSavingServer ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
              title="Save directly into ~/Downloads with exact formatted filename"
            >
              <span>💾</span>
              <span>{isSavingServer ? "Saving..." : "Save to ~/Downloads"}</span>
            </button>

            {/* BROWSER DOWNLOAD */}
            <button
              type="button"
              onClick={handleDownloadFile}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                background: "var(--color-pass, #10b981)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)"
              }}
              title="Download CSV via browser"
            >
              <span>⬇️</span>
              <span>Download .CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
