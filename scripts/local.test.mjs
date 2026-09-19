import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../apps/api/src/store.ts";
const ports = [5174, 3001, 8545];
function run(home, fresh = false) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local.ts", ...(fresh ? ["--new"] : [])],
    {
      env: { ...process.env, LOCAL_DATA_HOME: home },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let output = "";
  child.stdout.on("data", (v) => (output += v));
  child.stderr.on("data", (v) => (output += v));
  return { child, closed: once(child, "close"), output: () => output };
}
async function ready(proc) {
  const until = Date.now() + 90000;
  while (!proc.output().includes("Local MVP ready:")) {
    assert.equal(proc.child.exitCode, null, proc.output());
    if (Date.now() > until) throw Error(proc.output() + "\nTimed out");
    await delay(100);
  }
}
async function shutdown(proc) {
  if (proc.child.connected) proc.child.send("shutdown");
  const timer = setTimeout(() => proc.child.kill("SIGKILL"), 10000);
  const result = await proc.closed;
  clearTimeout(timer);
  return result;
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
async function released() {
  const until = Date.now() + 10000;
  for (const port of ports)
    for (;;) {
      try {
        await close(await bind(port));
        break;
      } catch (e) {
        if (Date.now() > until) throw e;
        await delay(100);
      }
    }
}
async function rpc(method, params = []) {
  const body = await (
    await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  ).json();
  assert.equal(body.error, undefined, JSON.stringify(body.error));
  return body.result;
}
test(
  "AC-001-38/39/40/41: port protection, durable chain/private data, crash recovery, explicit new session, binding rejection",
  { timeout: 240000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "Situation 测试 "));
    let proc;
    try {
      for (const port of ports) {
        const blocker = await bind(port);
        proc = run(home);
        try {
          const [code] = await proc.closed;
          assert.equal(code, 1, proc.output());
          assert.match(proc.output(), new RegExp(`Port ${port} is occupied`));
          assert.ok(blocker.listening);
        } finally {
          await shutdown(proc);
          await close(blocker);
        }
      }
      proc = run(home);
      await ready(proc);
      const current = JSON.parse(
        await readFile(join(home, "current.json"), "utf8"),
      );
      const configuration = await (
        await fetch("http://127.0.0.1:5174/api/v1/config")
      ).json();
      assert.equal(configuration.data.chainId, 31337);
      const second = run(home);
      const [secondCode] = await second.closed;
      assert.equal(secondCode, 1);
      assert.match(second.output(), /already owns/);
      const accounts = await rpc("eth_accounts");
      const tx = await rpc("eth_sendTransaction", [
        { from: accounts[0], to: accounts[1], value: "0x1234" },
      ]);
      const receipt = await rpc("eth_getTransactionReceipt", [tx]);
      const balance = await rpc("eth_getBalance", [accounts[1], "latest"]);
      const keyPath = join(current.dataDir, "encryption-key.json");
      const key = JSON.parse(await readFile(keyPath, "utf8")).key;
      let store = new Store(join(current.dataDir, "situationshit.sqlite"), key);
      const body = store.seal({ private: "恢复后才可解密的记录" });
      store.db
        .prepare("INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, 0, 1)")
        .run(
          "recovery-proof",
          "local-only",
          "meeting",
          accounts[0],
          "proof",
          body,
        );
      store.close();
      assert.equal((await shutdown(proc))[0], 0, proc.output());
      await released();
      proc = run(home);
      await ready(proc);
      assert.match(proc.output(), /Recovered local chain/);
      assert.deepEqual(
        JSON.parse(await readFile(join(home, "current.json"), "utf8")),
        current,
      );
      assert.deepEqual(await rpc("eth_getTransactionReceipt", [tx]), receipt);
      assert.equal(
        await rpc("eth_getBalance", [accounts[1], "latest"]),
        balance,
      );
      store = new Store(join(current.dataDir, "situationshit.sqlite"), key);
      assert.deepEqual(
        store.open(
          store.db
            .prepare("SELECT body FROM records WHERE id=?")
            .get("recovery-proof").body,
        ),
        { private: "恢复后才可解密的记录" },
      );
      store.close();
      // Kill only the supervisor: IPC disconnection must release all child services.
      proc.child.kill("SIGKILL");
      await proc.closed;
      await released();
      proc = run(home);
      await ready(proc);
      assert.deepEqual(await rpc("eth_getTransactionReceipt", [tx]), receipt);
      await shutdown(proc);
      await released();
      // A swapped encryption key must never open the old database or silently reset it.
      await writeFile(keyPath, JSON.stringify({ key: "00".repeat(32) }));
      proc = run(home);
      assert.equal((await proc.closed)[0], 1);
      assert.match(proc.output(), /binding mismatch/);
      await writeFile(keyPath, JSON.stringify({ key }));
      store = new Store(join(current.dataDir, "situationshit.sqlite"), key);
      store.db
        .prepare("UPDATE local_binding SET binding=? WHERE id=1")
        .run("wrong-chain");
      store.close();
      proc = run(home);
      assert.equal((await proc.closed)[0], 1);
      assert.match(proc.output(), /Database\/chain binding mismatch/);
      await released();
      proc = run(home, true);
      await ready(proc);
      const next = JSON.parse(
        await readFile(join(home, "current.json"), "utf8"),
      );
      assert.notEqual(next.sessionId, current.sessionId);
      assert.ok((await stat(current.dataDir)).isDirectory());
      assert.equal(await rpc("eth_getTransactionReceipt", [tx]), null);
      await shutdown(proc);
      await released();
    } finally {
      if (proc) await shutdown(proc);
      await rm(home, { recursive: true, force: true });
    }
  },
);
