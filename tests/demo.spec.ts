import { test, expect, type Page } from "@playwright/test";
async function controls(page: Page) {
  if (!(await page.getByLabel("演示控制面板").isVisible()))
    await page.getByRole("button", { name: "演示控制", exact: true }).click();
}
async function role(page: Page, value: string) {
  await controls(page);
  await page.getByLabel("当前演示身份").selectOption(value);
  await expect(page.getByRole("status")).not.toContainText("正在更新");
  await page.getByRole("button", { name: "关闭演示控制" }).click();
}
async function scenario(page: Page, name: string) {
  await controls(page);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByLabel("演示控制面板")).not.toBeVisible();
  await expect(page.getByRole("status")).not.toContainText("正在更新");
}
async function advance(page: Page, name: string) {
  await controls(page);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("status")).not.toContainText("正在更新");
  await page.getByRole("button", { name: "关闭演示控制" }).click();
}
test("AC-002-03 creation, signature and both deposits", async ({ page }) => {
  await page.goto("/#/create");
  await page.getByLabel("你的昵称").fill("林林");
  await page.getByLabel("对方的昵称").fill("小满");
  await page.getByRole("button", { name: "生成模拟邀请" }).click();
  await expect(page).toHaveURL(/invite/);
  await expect(
    page.getByRole("button", { name: "等待对方接受并签署" }),
  ).toBeDisabled();
  await role(page, "b");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "接受并模拟签署" }).click();
  await expect(
    page.getByRole("button", { name: "模拟存入 70 USDC" }),
  ).toBeDisabled();
  await controls(page);
  await page.getByRole("button", { name: "模拟三位好友接受" }).click();
  await expect(page.getByRole("status")).not.toContainText("正在更新");
  await page.getByRole("button", { name: "关闭演示控制" }).click();
  await page.getByRole("button", { name: "模拟存入 70 USDC" }).click();
  await expect(
    page.getByRole("button", { name: "你已完成模拟存入" }),
  ).toBeDisabled();
  await role(page, "a");
  await page.getByRole("button", { name: "模拟存入 70 USDC" }).click();
  await expect(
    page.getByRole("button", { name: "回到我们的关系" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "回到我们的关系" }).click();
  await expect(page.locator(".couple")).toContainText("林林");
  await expect(page.locator(".card-top")).toContainText("进行中");
});
test("AC-002-04 normal end, cannot confirm own request, persisted payout", async ({
  page,
}) => {
  await page.goto("/#/relationship");
  await page.getByRole("button", { name: "提出结束关系" }).click();
  await expect(
    page.getByRole("button", { name: "等待对方确认结束" }),
  ).toBeDisabled();
  await role(page, "b");
  await page.getByRole("button", { name: "确认结束关系" }).click();
  await expect(page).toHaveURL(/ended/);
  await expect(page.locator(".payout-grid h2")).toHaveText([
    "70 USDC",
    "70 USDC",
  ]);
  await page.reload();
  await expect(page.locator(".payout-grid h2")).toHaveText([
    "70 USDC",
    "70 USDC",
  ]);
});
test("AC-002-04 formal check, appeal, two votes and 50/90 payout", async ({
  page,
}) => {
  await page.goto("/#/dispute");
  await role(page, "b");
  await page.getByRole("button", { name: "发起正式确认" }).click();
  await expect(
    page.getByRole("button", { name: "发起失联申诉" }),
  ).toBeDisabled();
  await advance(page, "推进 7 天");
  await expect(
    page.getByRole("button", { name: "发起失联申诉" }),
  ).toBeDisabled();
  await advance(page, "推进 1 小时");
  await page.getByRole("button", { name: "发起失联申诉" }).click();
  await expect(
    page.getByRole("button", { name: "提交好友监督" }),
  ).toBeDisabled();
  await advance(page, "推进 49 小时");
  await page.getByRole("button", { name: "提交好友监督" }).click();
  await page.getByRole("button", { name: "查看好友监督" }).click();
  await role(page, "j0");
  await page.getByRole("button", { name: "构成违约", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "再想一下" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "确认投票" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "构成违约", exact: true }).click();
  await page.getByRole("button", { name: "确认投票" }).click();
  await expect(
    page.getByRole("button", { name: "构成违约", exact: true }),
  ).toBeDisabled();
  await role(page, "j1");
  await page.getByRole("button", { name: "构成违约", exact: true }).click();
  await page.getByRole("button", { name: "确认投票" }).click();
  await expect(page).toHaveURL(/ended/);
  await expect(page.locator(".payout-grid h2")).toHaveText([
    "50 USDC",
    "90 USDC",
  ]);
});
test("AC-002-05 reset, invalid save and numeric error feedback", async ({
  page,
}) => {
  await page.goto("/#/relationship");
  await scenario(page, "结算结果");
  await controls(page);
  await page.getByRole("button", { name: "重置演示", exact: true }).click();
  await expect(page.locator(".card-top")).toContainText("进行中");
  await page.evaluate(() =>
    localStorage.setItem("situationshit-demo-v1", '{"version":999}'),
  );
  await page.reload();
  await expect(
    page.getByText("演示存档无法读取，已恢复初始场景"),
  ).toBeVisible();
  await page.goto("/#/create");
  await page.getByLabel("恢复基金 · 每人").fill("0.0000001");
  await page.getByRole("button", { name: "生成模拟邀请" }).click();
  await expect(page.getByRole("alert")).toContainText("6 位小数");
});
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
])
  test(`AC-002-02/06/07 seven routes ${viewport.width}, no overflow or external requests`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const external: string[] = [];
    const errors: string[] = [];
    page.on("request", (r) => {
      if (
        !r.url().startsWith("http://127.0.0.1:5173/") &&
        !r.url().startsWith("data:")
      )
        external.push(r.url());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    for (const route of [
      "home",
      "create",
      "invite",
      "relationship",
      "dispute",
      "jury",
      "ended",
    ]) {
      await page.goto(`/#/${route}`);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("演示模式 · 模拟数据")).toBeVisible();
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
    for (const scene of ["待签署", "争议投票", "结算结果"]) {
      await scenario(page, scene);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
