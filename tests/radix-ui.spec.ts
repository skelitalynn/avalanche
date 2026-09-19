import { expect, test } from "@playwright/test";

test("AC-002-12 Radix Select keyboard selection and Dialog focus return", async ({
  page,
}) => {
  await page.goto("/?mode=mock#/relationship");
  await page.getByRole("button", { name: "演示控制", exact: true }).click();
  const role = page.getByRole("combobox", { name: "当前演示身份" });
  await role.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: /^A ·/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /^B ·/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(role).toContainText("B · 一帆");
  await expect(page.getByRole("status")).toHaveText("已切换演示身份");
  await page.getByRole("button", { name: "争议投票", exact: true }).click();
  await page.getByRole("button", { name: "演示控制", exact: true }).click();
  await role.click();
  await page.getByRole("option", { name: /^好友 2 ·/ }).click();
  await expect(page.getByRole("status")).toHaveText("已切换演示身份");
  await expect(role).toContainText("好友 2 · 许乐");
  await page.getByRole("button", { name: "关闭演示控制" }).click();
  const vote = page.getByRole("button", { name: "构成违约", exact: true });
  await vote.click();
  await expect(page.getByRole("button", { name: "再想一下" })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCSS(
    "background-color",
    "rgb(255, 254, 250)",
  );
  await expect(page.getByRole("dialog")).toHaveCSS("box-shadow", "none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(vote).toBeFocused();
  await expect(vote).toBeEnabled();
});

test("AC-002-11 narrow 320px layouts keep every page within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const route of [
    "home",
    "create",
    "invite",
    "relationship",
    "dispute",
    "jury",
    "ended",
  ]) {
    await page.goto(`/?mode=mock#/${route}`);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
