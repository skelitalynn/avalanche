export type Role = "a" | "b" | "j0" | "j1" | "j2";
export type Stage =
  | "invited"
  | "funding"
  | "active"
  | "ending"
  | "appeal"
  | "voting"
  | "ended";
export type Scenario = "active" | "invite" | "dispute" | "ended";
export type Page =
  | "home"
  | "create"
  | "invite"
  | "relationship"
  | "dispute"
  | "jury"
  | "ended";
export interface Terms {
  ghostDays: number;
  meetings: number;
  confirmationDays: number;
  recovery: number;
  bond: number;
}
export interface Check {
  requester: "a" | "b";
  sentAt: number;
  deadline: number;
  repliedAt?: number;
}
export interface Situation {
  id: string;
  names: [string, string];
  friends: [string, string, string];
  terms: Terms;
  stage: Stage;
  createdAt: number;
  activatedAt: number;
  supervisors: boolean[];
  funded: [boolean, boolean];
  meetingCount: number;
  meetingPending: boolean;
  meetingRequester?: "a" | "b";
  confirmationRequester?: "a" | "b";
  confirmedAt: number;
  check?: Check;
  appealDeadline?: number;
  voteDeadline?: number;
  votes: (boolean | null)[];
  endRequester?: Role;
  outcome?: "mutual" | "breach-a" | "breach-b" | "rejected" | "timeout";
  payouts: [number, number];
  activities: { title: string; detail: string; at: number }[];
}
export interface DemoState {
  version: 1;
  role: Role;
  now: number;
  situation: Situation;
}
export type DemoAction =
  | { type: "role"; role: Role }
  | { type: "scenario"; scenario: Scenario }
  | { type: "reset" }
  | {
      type: "create";
      names: [string, string];
      friends: [string, string, string];
      terms: Terms;
    }
  | { type: "accept" }
  | { type: "accept-supervisors" }
  | { type: "deposit" }
  | { type: "send-check" }
  | { type: "respond" }
  | { type: "claim" }
  | { type: "escalate" }
  | { type: "vote"; breach: boolean }
  | { type: "request-end" }
  | { type: "confirm-end" }
  | { type: "meeting" }
  | { type: "confirm-meeting" }
  | { type: "relationship-check" }
  | { type: "advance"; hours: number }
  | { type: "timeout" };
export interface SituationService {
  getSnapshot(): DemoState;
  subscribe(listener: () => void): () => void;
  dispatch(action: DemoAction): Promise<DemoState>;
  readonly mode: "mock";
  readonly recoveryMessage: string;
}
export const DAY = 86400000;
export const money = (units: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 6 }).format(
    units / 1e6,
  );
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{1,6})?$/.test(value))
    throw new Error("金额最多支持 6 位小数");
  const [a, b = ""] = value.split(".");
  const units = Number(a) * 1e6 + Number(b.padEnd(6, "0"));
  if (!Number.isSafeInteger(units) || units < 10000 || units > 1e9)
    throw new Error("每类金额应在 0.01 至 1000 USDC 之间");
  return units;
}
export const isParticipant = (role: Role) => role === "a" || role === "b";
