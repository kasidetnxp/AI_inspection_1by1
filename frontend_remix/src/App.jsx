import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { InspectionProvider } from "./context/InspectionContext";
import MainLayout from "./layouts/MainLayout";
import InspectPage from "./pages/InspectPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ModelsPage from "./pages/ModelsPage";
import HistoryPage from "./pages/HistoryPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <InspectionProvider>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Navigate to="/inspect" replace />} />
            <Route path="inspect" element={<InspectPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/inspect" replace />} />
          </Route>
        </Routes>
      </InspectionProvider>
    </BrowserRouter>
  );
}
