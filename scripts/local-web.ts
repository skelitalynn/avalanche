import { preview } from "vite";
const web = await preview({
  configFile: "apps/web/vite.config.ts",
  root: "apps/web",
  build: { outDir: "dist" },
  preview: { host: "127.0.0.1", port: 5174, strictPort: true },
});
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  await new Promise<void>((resolve) => web.httpServer.close(() => resolve()));
  if (process.connected) process.disconnect?.();
}
for (const signal of ["SIGTERM", "SIGINT", "disconnect"] as const)
  process.once(signal, () => void stop());
process.once("message", (message) => {
  if (message === "shutdown") void stop();
});
