import { useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import StageCalculator from "./pages/StageCalculator";
import ComponentManager from "./pages/ComponentManager";
import CalculationHistory from "./pages/CalculationHistory";
import { Toaster } from "./components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<StageCalculator />} />
          <Route path="/components" element={<ComponentManager />} />
          <Route path="/history" element={<CalculationHistory />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </div>
  );
}

export default App;