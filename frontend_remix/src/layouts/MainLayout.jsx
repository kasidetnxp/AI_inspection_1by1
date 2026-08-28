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
            <img
              src="/nxp_logo.webp"
              alt="NXP Semiconductors"
              className="brand-logo"
            />
            <span className="brand-subtitle">iMX8 AI INSPECTION</span>
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
