import { dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, avalancheFuji } from "viem/chains";
import { FUJI } from "../packages/shared/src/index.js";
const local = process.argv.includes("--local");
if (!local && !process.argv.includes("--fuji"))
  throw Error("Choose --local or --fuji");
if (!local && process.env.CONFIRM_FUJI_DEPLOY !== "yes")
  throw Error(
    "Set CONFIRM_FUJI_DEPLOY=yes only after deployment is authorized",
  );
const chain = local ? hardhat : avalancheFuji;
const rpc = local
  ? "http://127.0.0.1:8545"
  : process.env.FUJI_RPC_URL || FUJI.rpc;
const client = createPublicClient({ chain, transport: http(rpc) });
if ((await client.getChainId()) !== chain.id) throw Error("Wrong network");
const account = local
  ? (
      await createWalletClient({ chain, transport: http(rpc) }).getAddresses()
    )[0]
  : privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
if (!account) throw Error("No deployer available");
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
async function deploy(name: string, args: unknown[] = []) {
  const artifact = JSON.parse(
    await readFile(
      `contracts/artifacts/contracts/src/${name}.sol/${name}.json`,
      "utf8",
    ),
  );
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress)
    throw Error("Deployment failed");
  return { address: r.contractAddress, transactionHash: hash };
}
const token = local ? (await deploy("TestUSDC")).address : FUJI.token;
const abi = parseAbi([
  "function decimals() view returns(uint8)",
  "function mint(address,uint256)",
]);
if (
  !(await client.getCode({ address: token })) ||
  (await client.readContract({
    address: token,
    abi,
    functionName: "decimals",
  })) !== 6
)
  throw Error("Invalid USDC");
const factory = await deploy("SituationFactory", [token]);
if (local) {
  for (const address of (
    await createWalletClient({ chain, transport: http(rpc) }).getAddresses()
  ).slice(0, 5)) {
    const hash = await wallet.writeContract({
      address: token,
      abi,
      functionName: "mint",
      args: [address, 1000_000000n],
    });
    if ((await client.waitForTransactionReceipt({ hash })).status !== "success")
      throw Error("Local funding failed");
  }
}
const result = {
  chainId: chain.id,
  rpc,
  tokenAddress: token,
  factoryAddress: factory.address,
  transactionHash: factory.transactionHash,
  mode: local ? "local EVM, test token" : "Fuji official test USDC",
};
const output = local
  ? (process.env.LOCAL_DEPLOYMENT_FILE ?? ".local/deployment-31337.json")
  : ".local/deployment-43113.json";
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
