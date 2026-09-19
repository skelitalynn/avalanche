import {
  chromium,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  createTestClient,
  http,
  type Address,
} from "viem";
import { hardhat } from "viem/chains";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SituationAgreementAbi as A } from "../packages/shared/src/index.js";
const base = "http://127.0.0.1:5174",
  rpc = "http://127.0.0.1:8545";
const client = createPublicClient({ chain: hardhat, transport: http(rpc) });
if ((await client.getChainId()) !== 31337)
  throw Error("Refuse non-local chain");
const deployment = JSON.parse(
  await readFile(
    JSON.parse(await readFile(".local/current.json", "utf8")).deploymentFile,
    "utf8",
  ),
);
const config = await (await fetch(base + "/api/v1/config")).json();
if (
  config.data.factoryAddress !== deployment.factoryAddress ||
  config.data.chainId !== 31337
)
  throw Error("API deployment mismatch");
const accounts = await createWalletClient({
  chain: hardhat,
  transport: http(rpc),
}).getAddresses();
const testClient = createTestClient({
  mode: "hardhat",
  chain: hardhat,
  transport: http(rpc),
});
const browser = await chromium.launch({
  env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "unix:path=/nonexistent" },
  args: ["--disable-gpu"],
});
const contexts: BrowserContext[] = [],
  errors: string[] = [],
  externalRequests: string[] = [];
let page!: Page;
await mkdir("artifacts/live", { recursive: true });
try {
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    context.setDefaultTimeout(20000);
  }
  async function open(i: number, address?: Address) {
    if (page) await page.close();
    page = await contexts[i].newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["127.0.0.1", "localhost"].includes(url.hostname)
      )
        externalRequests.push(url.origin);
    });
    await page.goto(base + "/");
    await expect(
      page.getByRole("button", { name: /本地钱包|签名登录/ }).first(),
    ).toBeVisible();
    if (
      await page
        .getByRole("button", {
          name: [
            "本地钱包 · 参与者 A",
            "本地钱包 · 参与者 B",
            "本地钱包 · A 的好友",
            "本地钱包 · B 的好友",
            "本地钱包 · 共同好友",
          ][i],
          exact: true,
        })
        .isVisible()
    )
      await page
        .getByRole("button", {
          name: [
            "本地钱包 · 参与者 A",
            "本地钱包 · 参与者 B",
            "本地钱包 · A 的好友",
            "本地钱包 · B 的好友",
            "本地钱包 · 共同好友",
          ][i],
          exact: true,
        })
        .click();
    await expect(page.getByRole("button", { name: "签名登录" })).toBeEnabled();
    await page.getByRole("button", { name: "签名登录" }).click();
    await expect(page.getByText("已通过签名登录")).toBeVisible();
    await expect(page.locator(".wallet-bar strong")).toHaveText(
      new RegExp(accounts[i].slice(0, 6) + "…" + accounts[i].slice(-4), "i"),
    );
    if (address) {
      await page
        .locator(".live-list button")
        .filter({ hasText: address.slice(0, 6) + "…" + address.slice(-4) })
        .click();
      await expect(page.locator(".live-summary")).toContainText(
        address.slice(0, 6),
      );
    }
    console.log("Opened wallet", i, address ?? "new");
    return page;
  }
  async function click(label: string) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("已核对最新结果", {
      timeout: 20000,
    });
  }
  async function create() {
    await open(0);
    await page.getByRole("button", { name: "创建约定", exact: true }).click();
    await page.getByLabel("B 的钱包地址").fill(accounts[1]);
    for (let i = 0; i < 3; i++)
      await page
        .getByLabel(["A 指定的好友", "B 指定的好友", "共同好友"][i])
        .fill(accounts[i + 2]);
    await page.getByLabel("每人恢复基金（USDC）").fill("50");
    await page.getByLabel("每人承诺保证金（USDC）").fill("20");
    await page.getByLabel("失联期限（天）").fill("1");
    await page.getByRole("button", { name: "保存协议并用钱包创建" }).click();
    await expect(page.locator(".live-summary")).toContainText("待接受", {
      timeout: 20000,
    });
    const link = await page.locator(".live-invite a").getAttribute("href");
    const id = new URL(link!, base).searchParams.get("agreement")!;
    const response = await page.request.get(base + "/api/v1/agreements/" + id);
    return (await response.json()).data.situationAddress as Address;
  }
  async function fund(address: Address) {
    await open(1, address);
    await click("接受并签署相同协议");
    for (let i = 2; i < 5; i++) {
      await open(i, address);
      await click("我接受本次监督职责");
      await expect(
        page.getByRole("button", { name: "你已接受监督" }),
      ).toBeDisabled();
    }
    for (let i = 0; i < 2; i++) {
      await open(i, address);
      await click("授权本次精确金额");
      await click("存入恢复基金与保证金");
    }
    await expect(page.locator(".live-summary")).toContainText("进行中");
  }
  const normal = await create();
  await fund(normal);
  await open(0, normal);
  await page.getByRole("button", { name: "我的关系", exact: true }).click();
  await click("提出结束关系");
  await open(1, normal);
  await page.getByRole("button", { name: "结束与结算", exact: true }).click();
  await click("确认结束并各自退款");
  await expect(page.locator(".payout-grid h2")).toHaveText([
    "70 USDC 应得",
    "70 USDC 应得",
  ]);
  await page.screenshot({
    path: "artifacts/live/normal-refund.png",
    fullPage: true,
  });
  const normalResult = await client.readContract({
    address: normal,
    abi: A,
    functionName: "snapshot",
  });
  if (normalResult.paid[0] !== 70000000n || normalResult.paid[1] !== 70000000n)
    throw Error("Normal refund chain mismatch");
  console.log("Normal refund passed");
  const disputed = await create();
  await fund(disputed);
  await page.getByRole("button", { name: "确认与申诉", exact: true }).click();
  await click("发起正式确认");
  await expect(
    page.getByRole("button", { name: "发起失联申诉" }),
  ).toBeDisabled();
  let s = await client.readContract({
    address: disputed,
    abi: A,
    functionName: "snapshot",
  });
  const check = await client.readContract({
    address: disputed,
    abi: A,
    functionName: "getCheck",
    args: [s.currentCheckId],
  });
  await testClient.setNextBlockTimestamp({ timestamp: check.deadline + 1n });
  await testClient.mine({ blocks: 1 });
  await click("刷新链上状态");
  await click("发起失联申诉");
  s = await client.readContract({
    address: disputed,
    abi: A,
    functionName: "snapshot",
  });
  const dispute = await client.readContract({
    address: disputed,
    abi: A,
    functionName: "getDispute",
    args: [s.currentDisputeId],
  });
  await testClient.setNextBlockTimestamp({
    timestamp: dispute.appealDeadline + 1n,
  });
  await testClient.mine({ blocks: 1 });
  await click("刷新链上状态");
  await click("提交好友监督");
  for (let i = 2; i < 4; i++) {
    await open(i, disputed);
    await click("构成违约");
  }
  await expect(page.locator(".payout-grid h2")).toHaveText([
    "50 USDC 应得",
    "90 USDC 应得",
  ]);
  await page.screenshot({
    path: "artifacts/live/breach-settlement.png",
    fullPage: true,
  });
  const actual = await client.readContract({
    address: disputed,
    abi: A,
    functionName: "snapshot",
  });
  if (actual.paid[0] !== 50000000n || actual.paid[1] !== 90000000n)
    throw Error("Payout chain mismatch");
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    !(await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ))
  )
    throw Error("Mobile overflow");
  await page.screenshot({
    path: "artifacts/live/mobile-live.png",
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join("\n"));
  if (externalRequests.length)
    throw Error("Unexpected remote requests: " + externalRequests.join(", "));
  await writeFile(
    "artifacts/live/result.json",
    JSON.stringify(
      {
        mode: "local EVM + real API + built-in local development wallets; not real Core/Fuji",
        chainId: 31337,
        normal,
        breach: disputed,
        normalPaid: ["70000000", "70000000"],
        breachPaid: actual.paid.map(String),
        browserErrors: errors,
        externalRequests,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: five wallet identities, SIWE, signatures, supervision, deposits, normal 70/70, breach 50/90, mobile no overflow.",
  );
} catch (e) {
  if (page!)
    await page
      .screenshot({ path: "artifacts/live/failure.png", fullPage: true })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
