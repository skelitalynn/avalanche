import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createPublicClient, http } from "viem";
import { atomicJson } from "./persistent-chain.js";

const children = new Set<ChildProcess>();
const home = resolve(process.env.LOCAL_DATA_HOME ?? ".local");
const lock = join(home, "runner.lock");
const owner = randomUUID();
let ownsLock = false;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    [...children].map(async (p) => {
      if (p.exitCode !== null || p.signalCode) return;
      const closed = once(p, "close");
      if (p.connected) p.send("shutdown", () => {});
      const gentle = setTimeout(() => p.kill("SIGTERM"), 1000);
      const force = setTimeout(() => p.kill("SIGKILL"), 5000);
      await closed;
      clearTimeout(gentle);
      clearTimeout(force);
    }),
  );
  if (ownsLock) {
    const current = JSON.parse(
      await readFile(join(lock, "owner.json"), "utf8"),
    );
    if (current.owner === owner) await rm(lock, { recursive: true });
  }
  process.exitCode = code;
  if (process.connected) process.disconnect?.();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
process.once("disconnect", () => void stop());
process.once("message", (message) => {
  if (message === "shutdown") void stop();
});
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
    stdio: ["ignore", quiet ? "ignore" : "inherit", "inherit", "ipc"],
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
  const until = Date.now() + 90000;
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
async function acquireLock() {
  await mkdir(home, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const previous = JSON.parse(
      await readFile(join(lock, "owner.json"), "utf8"),
    );
    if (!Number.isInteger(previous.pid) || previous.pid <= 0)
      throw Error("Invalid local runner lock; preserve it for inspection");
    let alive = true;
    try {
      process.kill(previous.pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    if (alive) throw Error("A local runner already owns this data directory");
    await rm(lock, { recursive: true });
    await mkdir(lock);
  }
  await atomicJson(join(lock, "owner.json"), { pid: process.pid, owner });
  ownsLock = true;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
try {
  await acquireLock();
  for (const port of [5174, 3001, 8545]) await freePort(port);
  let current:
    { version: number; sessionId: string; dataDir: string } | undefined;
  if (!process.argv.includes("--new")) {
    try {
      current = JSON.parse(await readFile(join(home, "current.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw Error(
          "Local session pointer is damaged; original data preserved",
        );
    }
  }
  if (
    current &&
    (current.version !== 1 ||
      !/^[a-f0-9-]{36}$/.test(current.sessionId) ||
      resolve(current.dataDir) !== join(home, "runs", current.sessionId))
  )
    throw Error(
      "Unsupported local session. Original data preserved; use npm run mvp:new for a separate fresh session.",
    );
  const fresh = !current;
  const sessionId = current?.sessionId ?? randomUUID();
  const dataDir = join(home, "runs", sessionId);
  const deploymentFile = join(dataDir, "deployment.json");
  const database = join(dataDir, "situationshit.sqlite");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const keyFile = join(dataDir, "encryption-key.json");
  const manifestFile = join(dataDir, "session.json");
  let key: string;
  if (fresh) {
    key = randomBytes(32).toString("hex");
    await atomicJson(keyFile, { key });
    await atomicJson(manifestFile, {
      version: 1,
      sessionId,
      keyHash: hash(key),
      ready: false,
    });
  } else {
    key = JSON.parse(await readFile(keyFile, "utf8")).key;
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    if (
      manifest.version !== 1 ||
      manifest.sessionId !== sessionId ||
      !manifest.ready ||
      typeof key !== "string" ||
      !/^[a-f0-9]{64}$/.test(key) ||
      manifest.keyHash !== hash(key)
    )
      throw Error(
        "Local session/key binding mismatch; original data preserved",
      );
    await stat(database);
    await stat(join(dataDir, "chain", "chain.json"));
  }
  start(
    "Persistent Hardhat",
    ["--import", "tsx", "scripts/local-chain.ts"],
    { ...process.env, LOCAL_CHAIN_DIRECTORY: join(dataDir, "chain") },
    true,
  );
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545", { retryCount: 0, timeout: 2000 }),
  });
  await wait(() => client.getChainId());
  if ((await client.getChainId()) !== 31337)
    throw Error("Local runner refuses non-local chains");
  if (fresh) {
    const deployment = start(
      "Deployment",
      ["--import", "tsx", "scripts/deploy.ts", "--local"],
      { ...process.env, LOCAL_DEPLOYMENT_FILE: deploymentFile },
      false,
      true,
    );
    const [code] = await once(deployment, "close");
    if (code !== 0) throw Error("Local deployment failed");
  }
  const deployment = JSON.parse(await readFile(deploymentFile, "utf8"));
  const receipt = await client.getTransactionReceipt({
    hash: deployment.transactionHash,
  });
  if (
    deployment.chainId !== 31337 ||
    receipt.status !== "success" ||
    receipt.contractAddress?.toLowerCase() !==
      deployment.factoryAddress.toLowerCase() ||
    !(await client.getCode({ address: deployment.tokenAddress }))
  )
    throw Error(
      "Restored chain/deployment mismatch; refusing to open the database",
    );
  const binding = JSON.stringify({
    sessionId,
    factory: deployment.factoryAddress,
    token: deployment.tokenAddress,
    genesis: (await client.getBlock({ blockNumber: 0n })).hash,
    keyHash: hash(key),
  });
  const db = new DatabaseSync(database);
  try {
    if (fresh) {
      db.exec(
        "CREATE TABLE local_binding (id INTEGER PRIMARY KEY CHECK(id=1), binding TEXT NOT NULL)",
      );
      db.prepare("INSERT INTO local_binding VALUES (1, ?)").run(binding);
    } else if (
      (db.prepare("SELECT binding FROM local_binding WHERE id=1").get() as any)
        ?.binding !== binding
    )
      throw Error(
        "Database/chain binding mismatch; original database preserved",
      );
  } finally {
    db.close();
  }
  // Catch deadlines up to wall time after offline recovery, without shortening any window.
  const block = await client.getBlock();
  await client.request({
    method: "evm_setNextBlockTimestamp" as any,
    params: [
      Number(
        block.timestamp > BigInt(Math.floor(Date.now() / 1000))
          ? block.timestamp + 1n
          : BigInt(Math.floor(Date.now() / 1000)),
      ),
    ] as any,
  });
  await client.request({ method: "evm_mine" as any, params: [] as any });
  const origin = "http://127.0.0.1:5174";
  start("API", ["--import", "tsx", "apps/api/src/server.ts"], {
    ...process.env,
    DATA_ENCRYPTION_KEY: key,
    APP_ORIGIN: origin,
    DATABASE_PATH: database,
    DEPLOYMENT_FILE: deploymentFile,
    API_PORT: "3001",
    LOCAL_SESSION_ID: sessionId,
  });
  await wait(async () => {
    if (
      !(
        await fetch("http://127.0.0.1:3001/api/v1/health", {
          signal: AbortSignal.timeout(2000),
        })
      ).ok
    )
      throw Error("API not ready");
  });
  start("Frontend", ["--import", "tsx", "scripts/local-web.ts"]);
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
  await atomicJson(manifestFile, {
    version: 1,
    sessionId,
    keyHash: hash(key),
    ready: true,
  });
  await atomicJson(join(home, "current.json"), {
    version: 1,
    sessionId,
    dataDir,
    deploymentFile,
    origin,
  });
  console.log(
    `Local MVP ready: ${origin}/\nMock: ${origin}/?mode=mock\nSession: ${dataDir}\n${fresh ? "Created" : "Recovered"} local chain and database. Ctrl+C stops services; restart resumes this session. Use npm run mvp:new for a separate fresh session.`,
  );
} catch (error) {
  if (!stopping) {
    console.error((error as Error).message);
    await stop(1);
  }
}
