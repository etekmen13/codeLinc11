import "@fontsource-variable/fraunces/full.css"; // wght, opsz, SOFT, WONK
import "@fontsource-variable/inter-tight";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTokens } from "./design/applyTokens";
import "./index.css";
import { setupMotion } from "./motion/config";

setupMotion();
applyTokens();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
