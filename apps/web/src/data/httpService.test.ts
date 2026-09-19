import { describe, expect, it, vi } from "vitest";
import { createHttpSituationService, mapApiSnapshot } from "./httpService";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const listItem = {
  address: "0x1111111111111111111111111111111111111111",
  role: "B",
  state: "ACTIVE",
};
const detail = {
  chain: {
    state: "ACTIVE",
    createdAt: "1700000000",
    activatedAt: "1700000100",
    supervisorsAccepted: [true, true, false],
    funded: [true, true],
    entitlement: ["70000000", "70000000"],
  },
  commitment: {
    participantA: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    participantB: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    supervisors: [
      "0xcccccccccccccccccccccccccccccccccccccccc",
      "0xdddddddddddddddddddddddddddddddddddddddd",
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    ],
    recoveryAmount: "50000000",
    bondAmount: "20000000",
    ghostWindow: "604800",
    meetingTarget: 2,
    confirmationEveryDays: 14,
  },
  meetingCount: 3,
  relationshipConfirmedAt: "1700000200",
};

describe("HTTP SituationService", () => {
  it("maps the frozen API view without floating-point amounts", () => {
    const state = mapApiSnapshot(listItem, detail);
    expect(state.role).toBe("b");
    expect(state.situation.stage).toBe("active");
    expect(state.situation.terms).toEqual({
      ghostDays: 7,
      meetings: 2,
      confirmationDays: 14,
      recovery: 50000000,
      bond: 20000000,
    });
    expect(state.situation.funded).toEqual([true, true]);
    expect(state.situation.payouts).toEqual([70000000, 70000000]);
  });

  it("stops at auth when the session is missing", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/health")
        ? json({ status: "ok" })
        : String(input).endsWith("/config")
        ? json({ chainId: 43113 })
        : json({ message: "unauthorized" }, 401),
    ) as unknown as typeof fetch;
    const service = createHttpSituationService({
      baseUrl: "/api/v1",
      fetcher,
      provider: { request: vi.fn() },
    });
    await service.initialize();
    expect(service.getConnectionSnapshot()).toMatchObject({
      phase: "needs-auth",
      chainId: 43113,
    });
  });

  it("uses wallet SIWE, cookies and then loads the current relationship", async () => {
    let authenticated = false;
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/health")) return json({ status: "ok" });
      if (url.endsWith("/config")) return json({ chainId: 43113 });
      if (url.endsWith("/auth/challenge"))
        return json({ message: "example.test wants you to sign in" });
      if (url.endsWith("/auth/verify")) {
        authenticated = true;
        return json({ address: "0x872c00000000000000000000000000000000c479" });
      }
      if (url.endsWith("/situations"))
        return authenticated
          ? json({ items: [listItem], nextCursor: null })
          : json({ message: "unauthorized" }, 401);
      if (url.includes("/situations/0x1111")) return json(detail);
      return json({ message: "not found" }, 404);
    }) as unknown as typeof fetch;
    const requested: string[] = [];
    const provider = {
      async request({ method }: { method: string }) {
        requested.push(method);
        if (method === "eth_requestAccounts")
          return ["0x872c00000000000000000000000000000000c479"];
        if (method === "eth_chainId") return "0xa869";
        if (method === "personal_sign") return "0xsigned";
        return null;
      },
    };
    const service = createHttpSituationService({
      baseUrl: "/api/v1/",
      fetcher,
      provider,
    });
    await service.initialize();
    await service.connect();
    expect(requested).toEqual([
      "eth_requestAccounts",
      "eth_chainId",
      "personal_sign",
    ]);
    expect(service.getConnectionSnapshot()).toMatchObject({
      phase: "ready",
      account: "0x872c00000000000000000000000000000000c479",
      situationAddress: listItem.address,
    });
    expect(service.getSnapshot().situation.meetingCount).toBe(3);
    expect(calls.every((call) => call.init?.credentials === "include")).toBe(
      true,
    );
    expect(calls.find((call) => call.url.endsWith("/auth/verify"))?.init)
      .toMatchObject({ method: "POST" });
  });

  it("never reports unsupported chain writes as successful", async () => {
    const service = createHttpSituationService({
      fetcher: vi.fn() as unknown as typeof fetch,
      provider: { request: vi.fn() },
    });
    await expect(service.dispatch({ type: "deposit" })).rejects.toThrow(
      "不会用 Mock 伪造成功",
    );
  });
});
