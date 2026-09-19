import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersistentChain } from "./persistent-chain.js";
import { createPublicClient, createWalletClient, custom } from "viem";
import { hardhat } from "viem/chains";

test(
  "AC-001-38/39 persistent Hardhat replays receipts, state, time and an interrupted acknowledgement",
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "Situation SHIT 恢复-"));
    let chain = await createPersistentChain(dir);
    try {
      const client = createPublicClient({
        chain: hardhat,
        transport: custom(chain as any),
      });
      const accounts = (await chain.request({
        method: "eth_accounts",
      })) as `0x${string}`[];
      const wallet = createWalletClient({
        chain: hardhat,
        account: accounts[0],
        transport: custom(chain as any),
      });
      const artifact = JSON.parse(
        await readFile(
          "contracts/artifacts/contracts/src/TestUSDC.sol/TestUSDC.json",
          "utf8",
        ),
      );
      const tx = await wallet.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
      });
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      assert.equal(receipt.status, "success");
      const mint = await wallet.writeContract({
        address: receipt.contractAddress!,
        abi: artifact.abi,
        functionName: "mint",
        args: [accounts[1], 70000000n],
      });
      await client.waitForTransactionReceipt({ hash: mint });
      await chain.request({ method: "evm_increaseTime", params: [3600] });
      await chain.request({ method: "evm_mine", params: [] });
      const lastBlock = await client.getBlock();
      const before = chain.sequence;
      await wallet.signMessage({
        message: "private login text is not part of the chain journal",
      });
      assert.equal(chain.sequence, before);
      await assert.rejects(
        chain.request({ method: "hardhat_reset", params: [] }),
      );
      const count = chain.sequence;
      await chain.close();
      // Simulate termination after a durable intent and before its result was acknowledged.
      await rm(join(dir, `${String(count).padStart(10, "0")}.result.json`));
      chain = await createPersistentChain(dir);
      const restored = createPublicClient({
        chain: hardhat,
        transport: custom(chain as any),
      });
      assert.deepEqual(
        await restored.getTransactionReceipt({ hash: tx }),
        receipt,
      );
      assert.equal((await restored.getBlock()).hash, lastBlock.hash);
      assert.equal(
        await restored.readContract({
          address: receipt.contractAddress!,
          abi: artifact.abi,
          functionName: "balanceOf",
          args: [accounts[1]],
        }),
        70000000n,
      );
      assert.equal(chain.sequence, count);
      assert.ok(
        (await readdir(dir)).includes(
          `${String(count).padStart(10, "0")}.result.json`,
        ),
      );
      const corrupt = dir + "-corrupt";
      await cp(dir, corrupt, { recursive: true });
      try {
        const path = join(corrupt, "0000000001.intent.json");
        const entry = JSON.parse(await readFile(path, "utf8"));
        entry.operation.method = "hardhat_reset";
        const damaged = JSON.stringify(entry);
        await writeFile(path, damaged);
        await assert.rejects(
          createPersistentChain(corrupt),
          /CHAIN_JOURNAL_INVALID/,
        );
        assert.equal(
          await readFile(path, "utf8"),
          damaged,
          "corrupt evidence must not be overwritten",
        );
      } finally {
        await rm(corrupt, { recursive: true, force: true });
      }
    } finally {
      await chain.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);
