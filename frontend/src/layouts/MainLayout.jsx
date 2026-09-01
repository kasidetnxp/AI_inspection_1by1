import React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useInspection } from "../context/InspectionContext";
import InspectPage from "../pages/InspectPage";
import AnalyticsPage from "../pages/AnalyticsPage";
import ModelsPage from "../pages/ModelsPage";
import SettingsPage from "../pages/SettingsPage";
import SplitViewModal from "../components/SplitViewModal";
import BenchmarkReportModal from "../components/BenchmarkReportModal";
import HistoryDetailModal from "../components/HistoryDetailModal";

export default function MainLayout() {
  const {
    clockStr,
    isLight,
    setIsLight,
    benchmarkSplitModalItem,
    benchmarkReportModalOpen,
    benchmarkReportData,
    selectedModalItem
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
            to="/history"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            HISTORY
          </NavLink>
          <NavLink
            to="/models"
            className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}
          >
            MODELS
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
            <button id="btn-theme-dark" className={`view-btn ${!isLight ? "active" : ""}`} onClick={() => setIsLight(false)}>Dark</button>
            <button id="btn-theme-light" className={`view-btn ${isLight ? "active" : ""}`} onClick={() => setIsLight(true)}>Light</button>
          </div>
        </div>
      </header>

      {/* ROUTES CONTENT */}
      <Routes>
        <Route path="/" element={<Navigate to="/inspect" replace />} />
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/history" element={<AnalyticsPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/inspect" replace />} />
      </Routes>

      {/* GLOBAL MODALS */}
      {benchmarkSplitModalItem && <SplitViewModal />}
      {benchmarkReportModalOpen && benchmarkReportData && <BenchmarkReportModal />}
      {selectedModalItem && <HistoryDetailModal />}
    </div>
  );
}
