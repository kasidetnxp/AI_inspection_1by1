import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useInspection } from "../context/InspectionContext";
import HistoryDetailModal from "../components/HistoryDetailModal";
import SplitViewModal from "../components/SplitViewModal";
import BenchmarkReportModal from "../components/BenchmarkReportModal";

export default function MainLayout() {
  const {
    isLight,
    setIsLight,
    isBackendConnected,
    connectionStatus,
    dbType,
    edgeIp,
    updateEdgeIp,
    clockStr
  } = useInspection();

  return (
    <div id="app-wrapper" className="desktop-layout">
      {/* HEADER BAR */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-area">
            <span className="logo-icon"></span>
            <h1>WAFER AI</h1>
          </div>
        </div>

        <nav className="header-nav">
          <NavLink
            to="/inspect"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            INSPECT
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            ANALYTICS
          </NavLink>
          <NavLink
            to="/models"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            MODELS
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            HISTORY
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            SETTINGS
          </NavLink>
        </nav>

        <div className="header-center">
          <div className="status-indicator-group">
            {isBackendConnected && (
              <div
                className="status-pill online"
                style={{
                  background: "rgba(16, 185, 129, 0.05)",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  color: "var(--color-pass)",
                  fontSize: "12px",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontWeight: "600",
                  fontFamily: "var(--font-display)",
                  textTransform: "uppercase"
                }}
              >
                DB: {dbType}
              </div>
            )}
            <div
              className="status-pill"
              style={{
                background: "rgba(2, 132, 199, 0.08)",
                border: "1px solid rgba(2, 132, 199, 0.25)",
                padding: "2px 6px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--color-info)" }}>EDGE IP:</span>
              <input
                type="text"
                value={edgeIp}
                onChange={(e) => updateEdgeIp(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  width: "95px",
                  outline: "none",
                  fontWeight: "bold"
                }}
                title="Change i.MX8 Edge Node IP Address"
              />
            </div>
            <div className={`status-pill ${connectionStatus === "CONNECTED" ? "online" : connectionStatus === "CONNECTING" ? "connecting" : "offline"}`} id="imx8-status">
              <span className="status-dot"></span>
              <span className="status-label">
                {connectionStatus === "CONNECTED" ? "EDGE: ONLINE" : connectionStatus === "CONNECTING" ? "EDGE: CONNECTING..." : "EDGE: OFFLINE"}
              </span>
            </div>
            <div className={`status-pill ${connectionStatus === "CONNECTED" ? "online" : "offline"}`} id="prober-status">
              <span className="status-dot"></span>
              <span className="status-label">{connectionStatus === "CONNECTED" ? "PROBER: READY" : "PROBER: OFFLINE"}</span>
            </div>
          </div>
        </div>

        <div className="header-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div className="datetime-display" id="live-time">{clockStr}</div>

          <div className="toggle-group theme-group" style={{ display: "flex", gap: "2px" }}>
            <button
              id="btn-theme-dark"
              className={`view-btn ${!isLight ? "active" : ""}`}
              onClick={() => setIsLight(false)}
            >
              Dark
            </button>
            <button
              id="btn-theme-light"
              className={`view-btn ${isLight ? "active" : ""}`}
              onClick={() => setIsLight(true)}
            >
              Light
            </button>
          </div>
        </div>
      </header>

      {/* RENDER CURRENT PAGE */}
      <Outlet />

      {/* GLOBAL MODALS */}
      <HistoryDetailModal />
      <SplitViewModal />
      <BenchmarkReportModal />
    </div>
  );
}
