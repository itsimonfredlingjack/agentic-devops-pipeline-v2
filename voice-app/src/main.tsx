import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { VisualScenarios } from "./visual/VisualScenarios";
import "./styles/global.css";

const rootComponent =
  window.location.pathname === "/__visual" ? <VisualScenarios /> : <App />;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {rootComponent}
  </React.StrictMode>,
);
