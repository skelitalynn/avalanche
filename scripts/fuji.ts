import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { preview, type PreviewServer } from "vite";
import { createApp } from "../apps/api/src/app.js";
import { createChain } from "../apps/api/src/chain.js";
import { FUJI, same } from "../packages/shared/src/index.js";
import type { Address, Hex } from "viem";

const home = resolve(process.env.FUJI_DATA_HOME ?? ".local/fuji");
const lock = join(home, "runner.lock");
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:5174";
let ownsLock = false;
let app: ReturnType<typeof createApp>["app"] | undefined;
let web: PreviewServer | undefined;
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (web) await new Promise<void>((r) => web!.httpServer.close(() => r()));
  if (app) await app.close();
  if (ownsLock) await rm(lock, { recursive: true });
}
for (const signal of ["SIGINT", "SIGTERM", "disconnect"] as const)
  process.once(signal, () => void stop());
process.once("message", (message) => {
  if (message === "shutdown") void stop();
});
try {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw Error("Use Node 24.13 or newer Node 24");
  for (const port of [3001, 5174])
    await new Promise<void>((done, reject) => {
      const socket = createServer();
      socket.once("error", () =>
        reject(Error(`Port ${port} is occupied; existing service preserved`)),
      );
      socket.listen(port, "127.0.0.1", () => socket.close(() => done()));
    });
  const deploymentPath = resolve(
    process.env.DEPLOYMENT_FILE ?? "deployments/fuji.json",
  );
  let deployment: {
    chainId: number;
    tokenAddress: Address;
    factoryAddress: Address;
    transactionHash: Hex;
  };
  try {
    deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  } catch {
    throw Error(
      "Missing Fuji deployment manifest. Save the verified deployment as deployments/fuji.json or set DEPLOYMENT_FILE.",
    );
  }
  if (
    deployment.chainId !== 43113 ||
    !same(deployment.tokenAddress, FUJI.token)
  )
    throw Error("Fuji requires chain 43113 and Circle official test USDC");
  const configuration = {
    rpc: process.env.FUJI_RPC_URL ?? FUJI.rpc,
    chainId: 43113,
    factory: deployment.factoryAddress,
    token: FUJI.token,
  };
  const chain = createChain(configuration);
  await chain.validateDeployment();
  const receipt = await chain.client.getTransactionReceipt({
    hash: deployment.transactionHash,
  });
  if (
    receipt.status !== "success" ||
    !receipt.contractAddress ||
    !same(receipt.contractAddress, deployment.factoryAddress)
  )
    throw Error("Fuji deployment receipt mismatch");
  await mkdir(home, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const old = Number(await readFile(join(lock, "pid"), "utf8"));
    if (!Number.isSafeInteger(old) || old <= 0)
      throw Error("Invalid Fuji runner lock; preserve for inspection");
    try {
      process.kill(old, 0);
      throw Error("A Fuji runner already owns this directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
    await rm(lock, { recursive: true });
    await mkdir(lock);
  }
  ownsLock = true;
  await writeFile(join(lock, "pid"), String(process.pid), { mode: 0o600 });
  const database = join(home, "situationshit.sqlite");
  const privateFile = join(home, "private.json");
  let saved: { key: string; factory: Address; chainId: number };
  try {
    saved = JSON.parse(await readFile(privateFile, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    let databaseExists = true;
    try {
      await stat(database);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        databaseExists = false;
      else throw e;
    }
    if (databaseExists)
      throw Error("Existing Fuji database has no key; original data preserved");
    saved = {
      key: randomBytes(32).toString("hex"),
      factory: deployment.factoryAddress,
      chainId: 43113,
    };
    await writeFile(privateFile, JSON.stringify(saved), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (
    !/^[a-f0-9]{64}$/.test(saved.key) ||
    saved.chainId !== 43113 ||
    !same(saved.factory, deployment.factoryAddress)
  )
    throw Error("Fuji database/key/deployment binding mismatch");
  const built = spawnSync(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "build",
      "apps/web",
      "--config",
      "apps/web/vite.config.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_DEFAULT_MODE: "live",
        VITE_LOCAL_WALLETS: "false",
      },
    },
  );
  if (built.status !== 0) throw Error("Fuji frontend build failed");
  if (stopping) throw Error("Startup cancelled");
  ({ app } = createApp({
    ...configuration,
    origin,
    database,
    encryptionKey: saved.key,
    walletConnectConfigured: Boolean(process.env.VITE_WALLETCONNECT_PROJECT_ID),
  }));
  await app.listen({ host: "127.0.0.1", port: 3001 });
  web = await preview({
    configFile: "apps/web/vite.config.ts",
    root: "apps/web",
    build: { outDir: "dist" },
    preview: {
      host: "127.0.0.1",
      port: 5174,
      strictPort: true,
      allowedHosts: [new URL(origin).hostname],
    },
  });
  console.log(
    `Fuji ready: ${origin}/\nChain: 43113 / 0xa869\nUSDC: ${FUJI.token}\nFactory: ${deployment.factoryAddress}\nCore Extension: connect and sign with your own wallet.\nCore Mobile: ${process.env.VITE_WALLETCONNECT_PROJECT_ID ? "WalletConnect configured; real-device verification still required" : "set VITE_WALLETCONNECT_PROJECT_ID in .env.fuji.local"}\nCtrl+C stops local services; chain and private data are preserved.`,
  );
} catch (e) {
  console.error((e as Error).message);
  await stop();
  process.exitCode = 1;
}
