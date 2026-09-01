import React from "react";
import { BrowserRouter } from "react-router-dom";
import { InspectionProvider } from "./context/InspectionContext";
import MainLayout from "./layouts/MainLayout";

export default function App() {
  return (
    <BrowserRouter>
      <InspectionProvider>
        <MainLayout />
      </InspectionProvider>
    </BrowserRouter>
  );
}
