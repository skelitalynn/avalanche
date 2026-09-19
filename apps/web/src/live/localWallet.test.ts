import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function load(hostname = "127.0.0.1", enabled = "true") {
  vi.stubGlobal("location", { hostname });
  vi.stubEnv("VITE_LOCAL_WALLETS", enabled);
  return import("./localWallet");
}
it("never offers development wallets on remote sites or without explicit opt-in", async () => {
  let m = await load("example.com");
  expect(m.localConnectors).toEqual([]);
  await expect(
    m.localProvider(0).request({ method: "eth_accounts" }),
  ).rejects.toThrow("仅限本机");
  vi.resetModules();
  m = await load("127.0.0.1", "false");
  expect(m.localConnectors).toEqual([]);
});
it("refuses Fuji and checks the sender before forwarding signatures or transactions", async () => {
  const m = await load();
  const address = "0x1111111111111111111111111111111111111111";
  const send = vi.fn(async (method: string): Promise<any> =>
    method === "eth_chainId" ? "0xa869" : [address],
  );
  const provider = m.localProvider(0, send);
  await expect(
    provider.request({ method: "eth_sendTransaction" }),
  ).rejects.toThrow("非31337");
  expect(send).toHaveBeenCalledTimes(1);
  send.mockImplementation(async (method) =>
    method === "eth_chainId" ? "0x7a69" : [address],
  );
  expect(await provider.request({ method: "eth_accounts" })).toEqual([]);
  expect(await provider.request({ method: "eth_requestAccounts" })).toEqual([
    address,
  ]);
  await expect(
    provider.request({ method: "personal_sign", params: ["0x00", "0xwrong"] }),
  ).rejects.toThrow("账户不匹配");
  await expect(
    provider.request({
      method: "eth_sendTransaction",
      params: [{ from: "0xwrong" }],
    }),
  ).rejects.toThrow("账户不匹配");
  await expect(
    provider.request({ method: "hardhat_setBalance" }),
  ).rejects.toThrow("不支持");
  expect(send.mock.calls.map(([method]) => method)).not.toContain(
    "eth_sendTransaction",
  );
});
