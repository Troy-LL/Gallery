import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./wheel.css";
import "./preview.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
