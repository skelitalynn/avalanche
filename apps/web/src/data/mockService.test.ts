import { describe, expect, it } from "vitest";
import {
  createMockService,
  fixture,
  reduceDemo,
  STORAGE_KEY,
} from "./mockService";
import { DAY, parseMoney } from "./types";
import type { DemoAction, DemoState } from "./types";
const run = (start: DemoState, ...actions: DemoAction[]) =>
  actions.reduce(reduceDemo, start);
describe("AC-002-03: create, sign and fund", () => {
  it("requires B signature and supervisor consent; second deposit activates", () => {
    let s = run(fixture(), {
      type: "create",
      names: ["甲", "乙"],
      friends: ["一", "二", "三"],
      terms: {
        ghostDays: 3,
        meetings: 1,
        confirmationDays: 14,
        recovery: 12345678,
        bond: 20000000,
      },
    });
    expect(s.situation.stage).toBe("invited");
    expect(s.situation.terms.recovery).toBe(12345678);
    expect(() => reduceDemo(s, { type: "accept" })).toThrow();
    s = run(s, { type: "role", role: "b" }, { type: "accept" });
    expect(() => reduceDemo(s, { type: "deposit" })).toThrow();
    s = run(s, { type: "accept-supervisors" }, { type: "deposit" });
    expect(s.situation.stage).toBe("funding");
    expect(() => reduceDemo(s, { type: "deposit" })).toThrow();
    s = run(s, { type: "role", role: "a" }, { type: "deposit" });
    expect(s.situation.stage).toBe("active");
  });
  it("parses decimal USDC exactly and rejects excess precision / out of bounds", () => {
    expect(parseMoney("0.010001")).toBe(10001);
    expect(parseMoney("1000")).toBe(1000000000);
    for (const v of [
      "0",
      "1000.000001",
      "0.0001",
      "NaN",
      "12.1234567",
      "1e2",
      "-1",
    ])
      expect(() => parseMoney(v)).toThrow();
  });
});
describe("AC-002-04: settlement and deadlines", () => {
  it("cannot unilaterally end; refunds 70/70 only with counterparty consent", () => {
    let s = reduceDemo(fixture(), { type: "request-end" });
    expect(s.situation.payouts).toEqual([0, 0]);
    expect(() => reduceDemo(s, { type: "confirm-end" })).toThrow();
    s = run(s, { type: "role", role: "b" }, { type: "confirm-end" });
    expect(s.situation.payouts).toEqual([70000000, 70000000]);
    expect(() => reduceDemo(s, { type: "confirm-end" })).toThrow();
  });
  it("runs formal check through 48h appeal and 2/3 breach judgment", () => {
    let s = run(
      fixture(),
      { type: "role", role: "b" },
      { type: "send-check" },
      { type: "advance", hours: 168 },
    );
    expect(() => reduceDemo(s, { type: "claim" })).toThrow();
    s = run(s, { type: "advance", hours: 1 }, { type: "claim" });
    expect(s.situation.stage).toBe("appeal");
    expect(() => reduceDemo(s, { type: "escalate" })).toThrow();
    s = run(s, { type: "advance", hours: 49 }, { type: "escalate" });
    expect(() => reduceDemo(s, { type: "vote", breach: true })).toThrow();
    s = run(s, { type: "role", role: "j0" }, { type: "vote", breach: true });
    expect(s.situation.stage).toBe("voting");
    expect(() => reduceDemo(s, { type: "vote", breach: true })).toThrow();
    s = run(s, { type: "role", role: "j1" }, { type: "vote", breach: true });
    expect(s.situation.payouts).toEqual([50000000, 90000000]);
    expect(() => reduceDemo(s, { type: "vote", breach: true })).toThrow();
  });
  it("keeps own recovery protected for either accused and refunds on rejection/timeout", () => {
    let s = fixture("dispute");
    s.situation.check!.requester = "a";
    s = run(
      s,
      { type: "vote", breach: true },
      { type: "role", role: "j2" },
      { type: "vote", breach: true },
    );
    expect(s.situation.payouts).toEqual([90000000, 50000000]);
    s = run(
      fixture("dispute"),
      { type: "vote", breach: false },
      { type: "role", role: "j2" },
      { type: "vote", breach: false },
    );
    expect(s.situation.payouts).toEqual([70000000, 70000000]);
    s = fixture("dispute");
    s.now = s.situation.voteDeadline!;
    expect(() => reduceDemo(s, { type: "timeout" })).toThrow();
    s.now++;
    s = reduceDemo(s, { type: "timeout" });
    expect(s.situation.payouts).toEqual([70000000, 70000000]);
  });
  it("timely reply clears check; late reply is evidence and does not cancel appeal", () => {
    let s = run(
      fixture(),
      { type: "send-check" },
      { type: "role", role: "b" },
      { type: "respond" },
    );
    expect(s.situation.check).toBeUndefined();
    s = run(
      fixture(),
      { type: "send-check" },
      { type: "advance", hours: 168 },
      { type: "advance", hours: 1 },
      { type: "claim" },
      { type: "role", role: "b" },
      { type: "respond" },
    );
    expect(s.situation.stage).toBe("appeal");
    expect(s.situation.check!.repliedAt).toBe(s.now);
  });
  it("requires both participants for meeting and regular relationship confirmation", () => {
    let s = run(fixture(), { type: "role", role: "b" }, { type: "meeting" });
    expect(() => reduceDemo(s, { type: "confirm-meeting" })).toThrow();
    s = run(s, { type: "role", role: "a" }, { type: "confirm-meeting" });
    expect(s.situation.meetingCount).toBe(2);
    const before = s.situation.confirmedAt;
    s = reduceDemo(s, { type: "relationship-check" });
    expect(s.situation.confirmedAt).toBe(before);
    expect(() => reduceDemo(s, { type: "relationship-check" })).toThrow();
    s = run(s, { type: "role", role: "b" }, { type: "relationship-check" });
    expect(s.situation.confirmedAt).toBe(s.now);
  });
});
describe("AC-002-05: persistent service boundary", () => {
  it("persists and reloads; notifies subscribers and resets", async () => {
    const db = new Map<string, string>();
    const storage = {
      getItem: (k: string) => db.get(k) ?? null,
      setItem: (k: string, v: string) => {
        db.set(k, v);
      },
    };
    const svc = createMockService(storage, 0);
    let calls = 0;
    const unsub = svc.subscribe(() => calls++);
    await svc.dispatch({ type: "scenario", scenario: "ended" });
    expect(calls).toBe(1);
    expect(
      createMockService(storage, 0).getSnapshot().situation.payouts,
    ).toEqual([50000000, 90000000]);
    await svc.dispatch({ type: "reset" });
    expect(svc.getSnapshot().situation.stage).toBe("active");
    unsub();
  });
  it.each([
    "{broken",
    JSON.stringify({ version: 0 }),
    JSON.stringify({
      ...fixture(),
      situation: { ...fixture().situation, names: [null, null] },
    }),
  ])("recovers bad storage %s", (raw) => {
    const svc = createMockService({ getItem: () => raw, setItem: () => {} }, 0);
    expect(svc.recoveryMessage).toContain("已恢复");
    expect(svc.getSnapshot().situation.stage).toBe("active");
  });
  it("failed actions do not persist success and storage quota does not break session", async () => {
    let raw = "";
    const svc = createMockService(
      {
        getItem: () => null,
        setItem: (_, v) => {
          raw = v;
        },
      },
      0,
    );
    await expect(svc.dispatch({ type: "deposit" })).rejects.toThrow();
    expect(raw).toBe("");
    const limited = createMockService(
      {
        getItem: () => null,
        setItem: () => {
          throw Error("quota");
        },
      },
      0,
    );
    await limited.dispatch({ type: "advance", hours: 1 });
    expect(limited.recoveryMessage).toContain("无法保存");
    expect(limited.getSnapshot().now).toBe(fixture().now + DAY / 24);
    expect(STORAGE_KEY).toBeTruthy();
  });
});
