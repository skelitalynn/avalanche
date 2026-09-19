import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fixture, STORAGE_KEY } from "../apps/web/src/data/mockService";
import type { Scenario } from "../apps/web/src/data/types";
const samples: [string, Scenario, string][] = [
  ["01-home", "active", "home"],
  ["02-create", "active", "create"],
  ["03-agreement", "invite", "invite"],
  ["04-relationship", "active", "relationship"],
  ["05-dispute", "dispute", "dispute"],
  ["06-jury", "dispute", "jury"],
  ["07-settlement", "ended", "ended"],
];
for (const size of [
  { width: 1440, height: 1000, label: "desktop" },
  { width: 390, height: 844, label: "mobile" },
])
  test(`AC-002-08 export ${size.label} screenshots`, async ({ page }) => {
    await page.setViewportSize(size);
    await mkdir("artifacts/screenshots", { recursive: true });
    for (const [name, scene, route] of samples) {
      await page.goto("/");
      await page.evaluate(
        ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
        { key: STORAGE_KEY, state: fixture(scene) },
      );
      await page.goto(`/?present=1#/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByText("演示模式 · 模拟数据")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "演示控制", exact: true }),
      ).not.toBeVisible();
      if (size.label === "mobile") {
        await page.screenshot({
          path: `artifacts/screenshots/mobile-${name}-viewport.png`,
          fullPage: false,
          animations: "disabled",
        });
      }
      await page.screenshot({
        path: `artifacts/screenshots/${size.label}-${name}.png`,
        fullPage: true,
        animations: "disabled",
        // Long exports put the mobile navigation below all content.
        style: ".app{position:relative}@media(max-width:760px){.mobile-nav{position:absolute;bottom:0}}",
      });
    }
  });
