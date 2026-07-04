import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import "./lib/theme";
import { initNative } from "./lib/nativeInit";
import { registerPwa, initInstallPrompt } from "./lib/pwa";

void initNative();
void registerPwa();
initInstallPrompt();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
