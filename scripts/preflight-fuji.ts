import { createPublicClient, http, erc20Abi } from "viem";
import { FUJI } from "../packages/shared/src/index.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  mode: "read-only; no signatures, deployments or transactions",
  chainId: FUJI.chainId,
  token: FUJI.token,
  walletConnectConfigured: Boolean(process.env.VITE_WALLETCONNECT_PROJECT_ID),
  missing: [
    "Core desktop/mobile device acceptance",
    "Five independent test wallets and their test AVAX/USDC balances",
    "Authorized Fuji deployment and receipt",
    "Real 48-hour appeal and 72-hour voting windows",
  ],
};
try {
  const client = createPublicClient({
    transport: http(FUJI.rpc, { timeout: 15000, retryCount: 0 }),
  });
  const chainId = await client.getChainId();
  if (chainId !== FUJI.chainId) throw Error("Unexpected network");
  if (!(await client.getCode({ address: FUJI.token })))
    throw Error("Token has no code");
  const decimals = await client.readContract({
    address: FUJI.token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (decimals !== 6) throw Error("Token decimals mismatch");
  report.network = {
    verified: true,
    blockNumber: String(await client.getBlockNumber()),
    decimals,
  };
} catch {
  report.network = {
    verified: false,
    reason: "RPC unavailable or network/token mismatch; not accepted",
  };
  process.exitCode = 1;
}
try {
  const deployment = JSON.parse(
    await readFile(".local/deployment-43113.json", "utf8"),
  );
  report.deploymentManifestPresent = Boolean(deployment.factoryAddress);
} catch {
  report.deploymentManifestPresent = false;
}
await mkdir("artifacts/fuji", { recursive: true });
await writeFile(
  "artifacts/fuji/preflight.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
