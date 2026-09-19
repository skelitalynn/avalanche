import { expect, it } from "vitest";
import { reconcileLocalSession } from "./session";
it("keeps pending hashes within one local chain session and discards them after a restart", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  expect(reconcileLocalSession("first", storage)).toBe(true);
  storage.setItem("situation-pending", "receipt-to-query");
  expect(reconcileLocalSession("first", storage)).toBe(false);
  expect(storage.getItem("situation-pending")).toBe("receipt-to-query");
  expect(reconcileLocalSession("second", storage)).toBe(true);
  expect(storage.getItem("situation-pending")).toBe(null);
});
