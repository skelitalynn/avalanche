import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const ports = [5174, 3001, 8545];
function run() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local.ts"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (v) => (output += v));
  child.stderr.on("data", (v) => (output += v));
  const closed = once(child, "close");
  return { child, closed, output: () => output };
}
async function ready(proc) {
  const until = Date.now() + 90000;
  while (!proc.output().includes("Local MVP ready:")) {
    assert.equal(proc.child.exitCode, null, proc.output());
    if (Date.now() > until) throw Error(proc.output() + "\nTimed out");
    await delay(200);
  }
}
async function shutdown(proc) {
  if (proc.child.exitCode === null && !proc.child.signalCode)
    proc.child.kill("SIGTERM");
  return Promise.race([
    proc.closed,
    delay(10000).then(() => {
      throw Error("Process did not exit");
    }),
  ]);
}
async function bind(port) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}
async function close(server) {
  await new Promise((r) => server.close(r));
}

test(
  "AC-001-36: occupied ports are preserved; shutdown releases services and restart isolates data",
  { timeout: 180000 },
  async () => {
    for (const port of ports) {
      const blocker = await bind(port);
      const proc = run();
      try {
        const [code] = await Promise.race([
          proc.closed,
          delay(10000).then(() => {
            throw Error("Conflict not detected");
          }),
        ]);
        assert.equal(code, 1, proc.output());
        assert.match(proc.output(), new RegExp(`Port ${port} is occupied`));
        assert.equal(blocker.listening, true);
      } finally {
        await shutdown(proc);
        await close(blocker);
      }
    }
    let previous;
    for (let iteration = 0; iteration < 2; iteration++) {
      const proc = run();
      try {
        await ready(proc);
        const health = await (
          await fetch("http://127.0.0.1:5174/api/v1/health")
        ).json();
        assert.equal(health.data.status, "ok");
        const config = await (
          await fetch("http://127.0.0.1:5174/api/v1/config")
        ).json();
        assert.equal(config.data.chainId, 31337);
        const current = JSON.parse(
          await readFile(".local/current.json", "utf8"),
        );
        assert.notEqual(current.dataDir, previous);
        if (previous) assert.ok((await stat(previous)).isDirectory());
        previous = current.dataDir;
      } finally {
        const [code] = await shutdown(proc);
        assert.equal(code, 0, proc.output());
      }
      for (const port of ports) await close(await bind(port));
    }
  },
);
