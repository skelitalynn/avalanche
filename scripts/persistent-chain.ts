import { network } from "hardhat";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value));
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, path);
  // Windows cannot open directories for fsync; the file itself has been flushed.
  try {
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !["EPERM", "EISDIR", "EINVAL", "EACCES"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      throw error;
  }
}
const mutations = new Set([
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "evm_mine",
  "hardhat_mine",
  "evm_setNextBlockTimestamp",
  "evm_increaseTime",
  "hardhat_setBalance",
  "hardhat_setCode",
  "hardhat_setStorageAt",
  "hardhat_setNonce",
]);
const mining = new Set([
  "eth_sendTransaction",
  "eth_sendRawTransaction",
  "evm_mine",
  "hardhat_mine",
]);
const reads =
  /^(eth_(accounts|blockNumber|call|chainId|estimateGas|feeHistory|gasPrice|get\w+|maxPriorityFeePerGas|newBlockFilter|newFilter|newPendingTransactionFilter|sign|signTypedData_v4|syncing|uninstallFilter)|personal_sign|web3_clientVersion|net_version|net_listening|hardhat_metadata)$/;
interface Operation {
  sequence: number;
  previous: string;
  method: string;
  params: unknown[];
  timestamp?: string;
}
interface Outcome {
  result?: unknown;
  error?: { code: number; message: string };
}
function failure(error: unknown) {
  const e = error as { code?: number; message?: string };
  return {
    code: typeof e.code === "number" ? e.code : -32603,
    message: e.message ?? "Local RPC request failed",
  };
}

/** Local-only deterministic Hardhat journal. All state-changing calls pass through this queue. */
export async function createPersistentChain(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metaFile = join(directory, "chain.json");
  const versions = {
    hardhat: JSON.parse(
      await readFile("node_modules/hardhat/package.json", "utf8"),
    ).version,
    edr: JSON.parse(
      await readFile("node_modules/@nomicfoundation/edr/package.json", "utf8"),
    ).version,
  };
  let meta: { version: number; initialDate: string; versions: typeof versions };
  try {
    meta = JSON.parse(await readFile(metaFile, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw Error("CHAIN_JOURNAL_INVALID: chain metadata unreadable");
    const files = await readdir(directory);
    if (files.some((f) => /^\d+\./.test(f)))
      throw Error("CHAIN_JOURNAL_INVALID: missing chain metadata");
    meta = { version: 1, initialDate: new Date().toISOString(), versions };
    await atomicJson(metaFile, meta);
  }
  if (meta.version !== 1 || digest(meta.versions) !== digest(versions))
    throw Error(
      "CHAIN_VERSION_MISMATCH: keep the original dependencies or start an explicit new session",
    );
  const connection = await network.create({
    network: "local",
    override: {
      initialDate: meta.initialDate,
      hardfork: "cancun",
      throwOnTransactionFailures: false,
      mining: { auto: true, interval: 0 },
    },
  });
  const provider = connection.provider;
  let sequence = 0;
  let previous = digest(meta);
  let poisoned = false;
  let queue: Promise<unknown> = Promise.resolve();
  const filename = (number: number, kind: string) =>
    join(directory, `${String(number).padStart(10, "0")}.${kind}.json`);
  async function execute(operation: Operation): Promise<Outcome> {
    try {
      if (operation.timestamp)
        await provider.request({
          method: "evm_setNextBlockTimestamp",
          params: [operation.timestamp],
        });
      return {
        result: await provider.request({
          method: operation.method,
          params: operation.params as any[],
        }),
      };
    } catch (error) {
      return { error: failure(error) };
    }
  }
  async function proof(outcome: Outcome) {
    const block = (await provider.request({
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    })) as { hash: string; number: string };
    // Error prose can include platform paths; its code and resulting block are authoritative.
    return {
      blockHash: block.hash,
      blockNumber: block.number,
      outcome: digest(outcome.error ? { error: outcome.error.code } : outcome),
    };
  }
  async function commit(operation: Operation, hash: string, expected?: any) {
    const outcome = await execute(operation);
    const result = { intent: hash, ...(await proof(outcome)) };
    if (expected && digest(expected) !== digest(result))
      throw Error(`CHAIN_REPLAY_MISMATCH: operation ${operation.sequence}`);
    if (!expected)
      await atomicJson(filename(operation.sequence, "result"), result);
    sequence = operation.sequence;
    previous = digest(result);
    return outcome;
  }
  try {
    const files = await readdir(directory);
    const intents = files
      .filter((f) => /^\d{10}\.intent\.json$/.test(f))
      .sort();
    for (const name of intents) {
      const entry = JSON.parse(
        await readFile(join(directory, name), "utf8"),
      ) as { operation: Operation; hash: string };
      if (
        entry.operation.sequence !== sequence + 1 ||
        name !== `${String(sequence + 1).padStart(10, "0")}.intent.json` ||
        entry.operation.previous !== previous ||
        entry.hash !== digest(entry.operation) ||
        !mutations.has(entry.operation.method)
      )
        throw Error("CHAIN_JOURNAL_INVALID: sequence or checksum mismatch");
      let expected;
      try {
        expected = JSON.parse(
          await readFile(filename(sequence + 1, "result"), "utf8"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      // Only the last intent can be unfinished; an acknowledged gap is corruption.
      if (!expected && name !== intents.at(-1))
        throw Error("CHAIN_JOURNAL_INVALID: missing acknowledged operation");
      await commit(entry.operation, entry.hash, expected);
    }
    if (
      files
        .filter((f) => /^\d{10}\.result\.json$/.test(f))
        .some((f) => Number(f.slice(0, 10)) > sequence)
    )
      throw Error("CHAIN_JOURNAL_INVALID: orphan result");
  } catch (error) {
    await connection.close();
    throw error;
  }
  async function perform(method: string, params: unknown[] = []) {
    if (poisoned)
      throw Error(
        "CHAIN_UNAVAILABLE: restart required after a persistence failure",
      );
    if (!mutations.has(method)) {
      if (!reads.test(method))
        throw Object.assign(
          Error("Method unavailable on the persistent local chain"),
          { code: -32601 },
        );
      return provider.request({ method, params: params as any[] });
    }
    const operation: Operation = {
      sequence: sequence + 1,
      previous,
      method,
      params,
    };
    if (mining.has(method)) {
      const pending = (await provider.request({
        method: "eth_getBlockByNumber",
        params: ["pending", false],
      })) as { timestamp: string };
      operation.timestamp = pending.timestamp;
    }
    const hash = digest(operation);
    let outcome: Outcome;
    try {
      await atomicJson(filename(operation.sequence, "intent"), {
        operation,
        hash,
      });
      outcome = await commit(operation, hash);
    } catch (error) {
      poisoned = true;
      throw error;
    }
    if (outcome.error)
      throw Object.assign(Error(outcome.error.message), {
        code: outcome.error.code,
      });
    return outcome.result;
  }
  return {
    request(request: { method: string; params?: unknown[] }) {
      const result = queue.then(() => perform(request.method, request.params));
      queue = result.catch(() => {});
      return result;
    },
    async close() {
      await queue;
      await connection.close();
    },
    get sequence() {
      return sequence;
    },
  };
}
export type PersistentChain = Awaited<ReturnType<typeof createPersistentChain>>;
