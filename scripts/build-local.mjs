import { spawnSync } from "node:child_process";
for (const args of [
  [
    "node_modules/typescript/bin/tsc",
    "--noEmit",
    "-p",
    "apps/web/tsconfig.json",
  ],
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "apps/web",
    "--config",
    "apps/web/vite.config.ts",
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEFAULT_MODE: "live",
      VITE_LOCAL_WALLETS: "true",
    },
  });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}
