import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createPublicClient, http } from "viem";
import { SituationAgreementAbi } from "../packages/shared/src/index.ts";
import { Store } from "../apps/api/src/store.ts";
const home = await mkdtemp(join(tmpdir(), "situation-acceptance-"));
const env = { ...process.env, LOCAL_DATA_HOME: home };
let runner;
async function start() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local.ts"],
    { env, stdio: ["ignore", "pipe", "pipe", "ipc"] },
  );
  runner = { child, closed: once(child, "close") };
  let output = "";
  child.stdout.on("data", (b) => {
    output += b;
  });
  child.stderr.on("data", (b) => {
    output += b;
  });
  const deadline = Date.now() + 90000;
  while (!output.includes("Local MVP ready:")) {
    if (child.exitCode !== null || Date.now() > deadline) throw Error(output);
    await delay(100);
  }
}
async function stop() {
  if (!runner) return;
  if (runner.child.connected) runner.child.send("shutdown");
  const timeout = setTimeout(() => runner.child.kill("SIGKILL"), 10000);
  await runner.closed;
  clearTimeout(timeout);
}
async function smoke(recover = false) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/smoke-live.ts",
      ...(recover ? ["--recover"] : []),
    ],
    { env, stdio: "inherit" },
  );
  const [code] = await once(child, "close");
  assert.equal(code, 0, "Real browser acceptance failed");
}
try {
  await start();
  await smoke();
  const current = JSON.parse(
    await readFile(join(home, "current.json"), "utf8"),
  );
  const result = JSON.parse(
    await readFile("artifacts/live/result.json", "utf8"),
  );
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });
  const snapshots = async () =>
    Promise.all(
      [result.normal, result.breach].map((address) =>
        client.readContract({
          address,
          abi: SituationAgreementAbi,
          functionName: "snapshot",
        }),
      ),
    );
  const before = await snapshots();
  const key = JSON.parse(
    await readFile(join(current.dataDir, "encryption-key.json"), "utf8"),
  ).key;
  const privateData = () => {
    const store = new Store(join(current.dataDir, "situationshit.sqlite"), key);
    try {
      return ["agreements", "records", "evidence"].map((table) =>
        store.db
          .prepare(`SELECT id, body FROM ${table} ORDER BY id`)
          .all()
          .map((row) => ({ id: row.id, content: store.open(row.body) })),
      );
    } finally {
      store.close();
    }
  };
  const privateBefore = privateData();
  assert.ok(privateBefore[0].length >= 2);
  await stop();
  await start();
  assert.deepEqual(await snapshots(), before);
  assert.deepEqual(privateData(), privateBefore);
  await smoke(true);
  await writeFile(
    "artifacts/live/recovery.json",
    JSON.stringify(
      {
        chainSnapshots: "identical",
        encryptedPrivateRecords: "identical",
        authenticatedBrowserAfterRestart: "passed",
        mode: "local EVM, not Fuji",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real business state and private data survive full service restart; authenticated browser reads restored agreements.",
  );
} finally {
  await stop();
  await rm(home, { recursive: true, force: true });
}
