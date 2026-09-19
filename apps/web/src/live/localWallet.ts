import { injected } from "wagmi/connectors";

export const isLoopback = (hostname: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
export const localWalletEnabled =
  import.meta.env.VITE_LOCAL_WALLETS === "true" &&
  typeof location !== "undefined" &&
  isLoopback(location.hostname);
const rpc = "http://127.0.0.1:8545";

// The node holds disposable development accounts; no private keys enter the browser.
async function sendLocalRpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw Error(result.error?.message ?? "本地钱包不可用");
  return result.result;
}
export async function localAccounts(): Promise<string[]> {
  if (!localWalletEnabled || (await sendLocalRpc("eth_chainId")) !== "0x7a69")
    throw Error("本地开发钱包不可用");
  return (await sendLocalRpc("eth_accounts")).slice(0, 5);
}
export function localProvider(index: number, send = sendLocalRpc) {
  let authorized = false;
  return {
    on() {},
    removeListener() {},
    async request({
      method,
      params = [],
    }: {
      method: string;
      params?: unknown[];
    }) {
      if (!localWalletEnabled) throw Error("本地开发钱包仅限本机启用");
      if ((await send("eth_chainId")) !== "0x7a69")
        throw Error("本地开发钱包拒绝非31337网络");
      const accounts: string[] = await send("eth_accounts");
      const account = accounts[index];
      if (!account) throw Error("缺少本地开发账户");
      if (method === "eth_requestAccounts") {
        authorized = true;
        return [account];
      }
      if (method === "eth_accounts") return authorized ? [account] : [];
      if (method === "wallet_switchEthereumChain") {
        if ((params[0] as { chainId?: string })?.chainId !== "0x7a69")
          throw Error("本地开发钱包不能切换到外部网络");
        return null;
      }
      if (method === "wallet_requestPermissions")
        return [{ parentCapability: "eth_accounts" }];
      if (method === "wallet_revokePermissions") {
        authorized = false;
        return null;
      }
      if (
        ["personal_sign", "eth_sendTransaction"].includes(method) &&
        !authorized
      )
        throw Error("请先选择本地开发钱包");
      if (method === "personal_sign") {
        if (String(params[1]).toLowerCase() !== account.toLowerCase())
          throw Error("签名账户不匹配");
      } else if (method === "eth_sendTransaction") {
        if (
          String((params[0] as { from?: string })?.from).toLowerCase() !==
          account.toLowerCase()
        )
          throw Error("交易账户不匹配");
      } else if (
        ![
          "eth_chainId",
          "eth_getBalance",
          "eth_getTransactionCount",
          "eth_estimateGas",
          "eth_gasPrice",
          "eth_maxPriorityFeePerGas",
          "eth_feeHistory",
          "eth_getBlockByNumber",
          "eth_getTransactionReceipt",
          "eth_getTransactionByHash",
          "eth_blockNumber",
          "eth_call",
          "eth_getCode",
        ].includes(method)
      ) {
        throw Error("本地开发钱包不支持该方法：" + method);
      }
      return send(method, params);
    },
  };
}
export const localConnectors = localWalletEnabled
  ? ["参与者 A", "参与者 B", "A 的好友", "B 的好友", "共同好友"].map(
      (name, index) =>
        injected({
          target: {
            id: `local-dev-${index}`,
            name: `本地钱包 · ${name}`,
            provider: localProvider(index) as never,
          },
          shimDisconnect: true,
        }),
    )
  : [];
