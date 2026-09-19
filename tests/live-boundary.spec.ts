import { expect, test } from "@playwright/test";
for (const failure of ["html", "unavailable", "wrong-network"]) {
  test(`AC-001-35 real mode fails closed: ${failure}`, async ({ page }) => {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/api/"))
        writes.push(request.url());
    });
    await page.route("**/api/v1/config", async (route) => {
      if (failure === "html")
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<html>fallback</html>",
        });
      else if (failure === "unavailable")
        await route.fulfill({
          status: 503,
          json: {
            error: { code: "DEPENDENCY_UNAVAILABLE", message: "后台不可用" },
          },
        });
      else await route.fulfill({ json: { data: { chainId: 1 } } });
    });
    await page.goto("/?mode=live");
    await expect(page.getByRole("alert")).toContainText("真实服务尚未配置");
    await expect(page.getByText("已通过签名登录")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "创建约定", exact: true }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: /^本地钱包/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "演示控制", exact: true }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
