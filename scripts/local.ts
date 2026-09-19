import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";

const children = new Set<ChildProcess>();
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    [...children].map(async (p) => {
      const closed = once(p, "close");
      p.kill("SIGTERM");
      const timeout = setTimeout(() => p.kill("SIGKILL"), 5000);
      await closed;
      clearTimeout(timeout);
    }),
  );
  process.exitCode = code;
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
function start(
  label: string,
  args: string[],
  env = process.env,
  quiet = false,
  finite = false,
) {
  if (stopping) throw Error("Startup cancelled");
  const p = spawn(process.execPath, args, {
    env,
    stdio: quiet ? "ignore" : "inherit",
  });
  children.add(p);
  p.once("close", (code) => {
    children.delete(p);
    if (!stopping && (!finite || code !== 0)) {
      console.error(`${label} exited (${code}); stopping local services.`);
      void stop(1);
    }
  });
  p.once("error", () => {
    console.error(`${label} failed to start`);
    void stop(1);
  });
  return p;
}
async function wait(check: () => Promise<unknown>) {
  const until = Date.now() + 60000;
  for (;;) {
    if (stopping) throw Error("Startup cancelled");
    try {
      return await check();
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
async function freePort(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        Error(
          `Port ${port} is occupied. Stop the other service before starting; it has not been changed.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}
try {
  for (const port of [5174, 3001, 8545]) await freePort(port);
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545", { retryCount: 0, timeout: 1000 }),
  });
  start(
    "Hardhat",
    [
      "node_modules/hardhat/dist/src/cli.js",
      "node",
      "--network",
      "local",
      "--hostname",
      "127.0.0.1",
    ],
    process.env,
    true,
  );
  await wait(() => client.getChainId());
  if ((await client.getChainId()) !== 31337)
    throw Error("Local runner refuses non-local chains");
  const sessionId = randomUUID();
  const dataDir = resolve(".local/runs", sessionId);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const deploymentFile = resolve(dataDir, "deployment.json");
  const childEnv = { ...process.env, LOCAL_DEPLOYMENT_FILE: deploymentFile };
  const deployment = start(
    "Deployment",
    ["--import", "tsx", "scripts/deploy.ts", "--local"],
    childEnv,
    false,
    true,
  );
  const [code] = await once(deployment, "close");
  if (code !== 0) throw Error("Local deployment failed");
  const key = randomBytes(32).toString("hex");
  await writeFile(resolve(dataDir, "encryption.key"), key, { mode: 0o600 });
  const origin = "http://127.0.0.1:5174";
  start("API", ["--import", "tsx", "apps/api/src/server.ts"], {
    ...process.env,
    DATA_ENCRYPTION_KEY: key,
    APP_ORIGIN: origin,
    DATABASE_PATH: resolve(dataDir, "situationshit.sqlite"),
    DEPLOYMENT_FILE: deploymentFile,
    API_PORT: "3001",
    LOCAL_SESSION_ID: sessionId,
  });
  await wait(async () => {
    const response = await fetch("http://127.0.0.1:3001/api/v1/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw Error("API not ready");
  });
  start("Frontend", [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--config",
    "apps/web/vite.config.ts",
    "--outDir",
    "apps/web/dist",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ]);
  await wait(async () => {
    if (
      !(
        await fetch(origin + "/api/v1/health", {
          signal: AbortSignal.timeout(2000),
        })
      ).ok
    )
      throw Error("Frontend not ready");
  });
  await writeFile(
    ".local/current.json",
    JSON.stringify({ dataDir, deploymentFile, origin }, null, 2),
  );
  console.log(
    `Local MVP ready: ${origin}/\nMock: ${origin}/?mode=mock\nSession: ${dataDir}\nCtrl+C stops this session. Restart creates a fresh local chain and database.`,
  );
} catch (error) {
  if (!stopping) {
    console.error((error as Error).message);
    await stop(1);
  }
}
