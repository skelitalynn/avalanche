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
import {
  TestUSDCAbi as T,
  SituationAgreementAbi as A,
} from "../packages/shared/src/index.js";
const base = "http://127.0.0.1:5174",
  rpc = "http://127.0.0.1:8545";
const client = createPublicClient({ chain: hardhat, transport: http(rpc) });
if ((await client.getChainId()) !== 31337)
  throw Error("Refuse non-local chain");
const deployment = JSON.parse(
  await readFile(
    JSON.parse(
      await readFile(
        `${process.env.LOCAL_DATA_HOME ?? ".local"}/current.json`,
        "utf8",
      ),
    ).deploymentFile,
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
  async function capture(name: string) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 844,
      });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
      )
        throw Error(`${name}: overflow at ${width}px`);
      if (width !== 320)
        await page.screenshot({
          path: `artifacts/live/${name}-${width}.png`,
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  let testedRejection = false;
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
    if (!testedRejection && !process.argv.includes("--recover")) {
      await capture("welcome");
      await page.route(rpc + "/", async (route) => {
        const request = route.request().postDataJSON();
        if (request.method === "personal_sign")
          await route.fulfill({
            json: {
              jsonrpc: "2.0",
              id: request.id,
              error: { code: 4001, message: "User rejected signing" },
            },
          });
        else await route.continue();
      });
      await page.getByRole("button", { name: "签名登录" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByText("已通过签名登录")).toHaveCount(0);
      await page.unroute(rpc + "/");
      testedRejection = true;
    }
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
    await capture("create");
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
    await capture("agreement");
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
  if (process.argv.includes("--recover")) {
    const saved = JSON.parse(
      await readFile("artifacts/live/result.json", "utf8"),
    );
    await open(0, saved.normal);
    await expect(page.getByText("70 USDC 应得", { exact: true })).toHaveCount(
      2,
    );
    await open(1, saved.breach);
    await expect(page.getByText("90 USDC 应得", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "artifacts/live/recovered.png",
      fullPage: true,
    });
    if (errors.length || externalRequests.length)
      throw Error("Recovery browser errors or external requests");
  } else {
    const normal = await create();
    await fund(normal);
    await open(0, normal);
    await page.getByRole("button", { name: "我的关系", exact: true }).click();
    await capture("relationship");
    const beforeRecords = await client.readContract({
      address: deployment.tokenAddress,
      abi: T,
      functionName: "balanceOf",
      args: [normal],
    });
    await click("登记 / 确认这天见面");
    await expect(page.getByText(/本月已确认见面 0 次/)).toBeVisible();
    await click("发起 / 完成关系确认");
    await open(1, normal);
    await page.getByRole("button", { name: "我的关系", exact: true }).click();
    await click("登记 / 确认这天见面");
    await expect(page.getByText(/本月已确认见面 1 次/)).toBeVisible();
    await click("发起 / 完成关系确认");
    if (
      (await client.readContract({
        address: deployment.tokenAddress,
        abi: T,
        functionName: "balanceOf",
        args: [normal],
      })) !== beforeRecords
    )
      throw Error("Private records changed deposits");
    await open(0, normal);
    await page.getByRole("button", { name: "我的关系", exact: true }).click();
    // Lose receipt responses after submission, reload, then query the saved hash.
    let sent = 0;
    await page.route(rpc + "/", async (route) => {
      const body = route.request().postDataJSON();
      const requests = Array.isArray(body) ? body : [body];
      if (requests.some((r) => r.method === "eth_sendTransaction")) sent++;
      if (requests.some((r) => r.method === "eth_getTransactionReceipt"))
        await route.abort();
      else await route.continue();
    });
    await page
      .getByRole("button", { name: "提出结束关系", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "有一笔交易需要确认" }),
    ).toBeVisible();
    await expect.poll(() => sent).toBe(1);
    await page.unroute(rpc + "/");
    await open(0, normal);
    await click("查询交易结果");
    await expect(
      page.getByRole("heading", { name: "有一笔交易需要确认" }),
    ).toHaveCount(0);
    if (sent !== 1) throw Error("Repeated transaction after RPC loss");
    await open(1, normal);
    await page.getByRole("button", { name: "结束与结算", exact: true }).click();
    await click("确认结束并各自退款");
    await expect(page.locator(".payout-grid h2")).toHaveText([
      "70 USDC 应得",
      "70 USDC 应得",
    ]);
    await capture("ended");
    await page.screenshot({
      path: "artifacts/live/normal-refund.png",
      fullPage: true,
    });
    const normalResult = await client.readContract({
      address: normal,
      abi: A,
      functionName: "snapshot",
    });
    if (
      normalResult.paid[0] !== 70000000n ||
      normalResult.paid[1] !== 70000000n
    )
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
    await capture("dispute");
    await page
      .getByLabel("文字说明（最多 4000 字）")
      .fill("本案授权说明，登记后由好友核对。");
    await expect(
      page.getByRole("button", { name: "保存私有材料并预览" }),
    ).toBeDisabled();
    await page
      .getByRole("checkbox", { name: "我主动授权给本次双方和三位监督人" })
      .check();
    await page.getByRole("button", { name: "保存私有材料并预览" }).click();
    await expect(
      page.getByText("本案授权说明，登记后由好友核对。", { exact: true }),
    ).toBeVisible();
    await click("预览无误，登记证据摘要");
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
      await capture("jury");
      await click("查看授权材料");
      await expect(
        page.getByText("本案授权说明，登记后由好友核对。", { exact: true }),
      ).toBeVisible();
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
  }
} catch (e) {
  if (page!)
    await page
      .screenshot({ path: "artifacts/live/failure.png", fullPage: true })
      .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
