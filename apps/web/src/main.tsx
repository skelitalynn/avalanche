import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
const LiveApp = lazy(() => import("./live/LiveApp"));
const mode = new URLSearchParams(location.search).get("mode");
const isLive =
  mode === "live" ||
  (mode !== "mock" && import.meta.env.VITE_DEFAULT_MODE === "live");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<p>正在连接本地服务…</p>}>
      {isLive ? <LiveApp /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
