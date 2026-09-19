import { readFile } from "node:fs/promises";
import { createApp } from "./app.js";
import type { Address } from "viem";
const deployment = JSON.parse(
  await readFile(
    process.env.DEPLOYMENT_FILE ?? ".local/deployment-31337.json",
    "utf8",
  ),
);
const origin = process.env.APP_ORIGIN ?? "http://localhost:5173";
const key = process.env.DATA_ENCRYPTION_KEY;
if (!key)
  throw Error(
    "DATA_ENCRYPTION_KEY is required; never put it in VITE_ variables",
  );
const { app } = createApp({
  origin,
  rpc: deployment.rpc,
  chainId: deployment.chainId,
  factory: deployment.factoryAddress as Address,
  token: deployment.tokenAddress as Address,
  database: process.env.DATABASE_PATH ?? ".local/situationshit.sqlite",
  encryptionKey: key,
  walletConnectConfigured: !!process.env.VITE_WALLETCONNECT_PROJECT_ID,
  localSessionId: process.env.LOCAL_SESSION_ID,
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.API_PORT ?? 3001),
});
console.log("SituationSHIT API listening on loopback:3001");
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
