import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
afterEach(() => vi.unstubAllGlobals());
it("rejects HTML fallback and malformed success instead of reporting a completed write", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("<html>fallback</html>")),
  );
  await expect(api("/agreements", {})).rejects.toThrow("未返回 JSON");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ error: { message: "wrong proxy" } })),
  );
  await expect(api("/config")).rejects.toThrow("响应格式");
});
it("preserves API failures and uses cookies and per-write idempotency keys", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ data: { id: "saved" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await api("/agreements", { document: {} })).toEqual({ id: "saved" });
  expect(fetch.mock.calls[0][0]).toBe("/api/v1/agreements");
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: "same-origin",
    method: "POST",
  });
  expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toMatch(
    /^[\da-f-]{36}$/,
  );
  fetch.mockResolvedValue(
    Response.json(
      { error: { code: "UNAUTHENTICATED", message: "请登录" } },
      { status: 401 },
    ),
  );
  await expect(api("/situations")).rejects.toMatchObject({
    status: 401,
    code: "UNAUTHENTICATED",
  });
});
