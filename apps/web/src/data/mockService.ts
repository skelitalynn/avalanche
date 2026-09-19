import { DAY, isParticipant } from "./types";
import type {
  DemoAction,
  DemoState,
  Scenario,
  SituationService,
} from "./types";
const NOW = Date.parse("2026-09-19T12:00:00+08:00");
export const STORAGE_KEY = "situationshit-demo-v1";
export function fixture(scenario: Scenario = "active"): DemoState {
  const state: DemoState = {
    version: 1,
    role: "a",
    now: NOW,
    situation: {
      id: "ST-0826",
      names: ["小夏", "一帆"],
      friends: ["阿宁", "许乐", "乔乔"],
      terms: {
        ghostDays: 7,
        meetings: 2,
        confirmationDays: 7,
        recovery: 50000000,
        bond: 20000000,
      },
      stage: "active",
      createdAt: NOW - 43 * DAY,
      activatedAt: NOW - 42 * DAY,
      supervisors: [true, true, true],
      funded: [true, true],
      meetingCount: 1,
      meetingPending: false,
      confirmedAt: NOW - 4 * DAY,
      votes: [null, null, null],
      payouts: [0, 0],
      activities: [
        {
          title: "我们一起确认了这段关系",
          detail: "一帆和小夏 · 关系确认",
          at: NOW - 4 * DAY,
        },
        {
          title: "又多了一次好好见面的日子",
          detail: "双方已确认 · 本月第 1 次",
          at: NOW - 6 * DAY,
        },
        {
          title: "属于我们的约定，正式开始",
          detail: "双方签署 · 恢复基金与保证金已存入",
          at: NOW - 42 * DAY,
        },
      ],
    },
  };
  const s = state.situation;
  if (scenario === "invite") {
    s.stage = "invited";
    s.funded = [false, false];
    s.supervisors = [false, false, false];
    s.createdAt = NOW;
    s.activatedAt = 0;
    s.activities = [];
    state.role = "b";
  }
  if (scenario === "dispute" || scenario === "ended") {
    s.stage = "voting";
    s.check = {
      requester: "b",
      sentAt: NOW - 12 * DAY,
      deadline: NOW - 5 * DAY,
    };
    s.appealDeadline = NOW - DAY;
    s.voteDeadline = NOW + 2 * DAY;
    state.role = "j0";
  }
  if (scenario === "ended") {
    s.stage = "ended";
    s.outcome = "breach-a";
    s.payouts = [s.terms.recovery, s.terms.recovery + s.terms.bond * 2];
    s.votes = [true, true, null];
    state.role = "a";
  }
  return state;
}
function requireThat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function reduceDemo(previous: DemoState, action: DemoAction): DemoState {
  if (action.type === "scenario") return fixture(action.scenario);
  if (action.type === "reset") return fixture();
  const n = structuredClone(previous);
  const s = n.situation;
  const participant = isParticipant(n.role);
  const idx = n.role === "a" ? 0 : 1;
  const log = (title: string, detail: string) =>
    s.activities.unshift({ title, detail, at: n.now });
  const settle = (outcome: NonNullable<typeof s.outcome>) => {
    s.outcome = outcome;
    s.stage = "ended";
    const { recovery: r, bond: b } = s.terms;
    s.payouts =
      outcome === "breach-a"
        ? [r, r + b * 2]
        : outcome === "breach-b"
          ? [r + b * 2, r]
          : [r + b, r + b];
    log("关系已结束，资金已模拟结算", "仅为演示记录，不代表真实到账");
  };
  switch (action.type) {
    case "role":
      n.role = action.role;
      return n;
    case "advance":
      requireThat(
        action.hours > 0 && action.hours <= 168,
        "每次演示最多推进 7 天",
      );
      n.now += action.hours * 3600000;
      return n;
    case "create": {
      const t = action.terms;
      requireThat(
        action.names.every((x) => x.trim().length > 0 && x.length <= 12),
        "请填写双方昵称（最多 12 字）",
      );
      requireThat(
        action.friends.every((x) => x.trim().length > 0 && x.length <= 12) &&
          new Set(action.friends).size === 3,
        "请填写三位不同好友",
      );
      requireThat(
        [t.recovery, t.bond].every(
          (x) => Number.isSafeInteger(x) && x >= 10000 && x <= 1e9,
        ),
        "金额应在 0.01 至 1000 USDC 之间",
      );
      requireThat(
        Number.isInteger(t.ghostDays) &&
          t.ghostDays >= 1 &&
          t.ghostDays <= 30 &&
          Number.isInteger(t.meetings) &&
          t.meetings >= 0 &&
          t.meetings <= 31 &&
          Number.isInteger(t.confirmationDays) &&
          t.confirmationDays >= 1 &&
          t.confirmationDays <= 90,
        "请检查约定数值",
      );
      const fresh = fixture("invite");
      fresh.role = "a";
      fresh.situation.names = action.names;
      fresh.situation.friends = action.friends;
      fresh.situation.terms = t;
      fresh.situation.id = "ST-DEMO";
      return fresh;
    }
    case "accept":
      requireThat(
        n.role === "b" && s.stage === "invited",
        "仅受邀的另一方可以签署",
      );
      s.stage = "funding";
      log("双方已模拟签署约定", "下一步：好友接受监督，双方存入资金");
      break;
    case "accept-supervisors":
      requireThat(
        ["invited", "funding"].includes(s.stage),
        "好友接受仅适用于生效前",
      );
      s.supervisors = [true, true, true];
      break;
    case "deposit":
      requireThat(
        participant &&
          s.stage === "funding" &&
          s.supervisors.every(Boolean) &&
          !s.funded[idx],
        "请先完成双签与好友接受，且每人只存入一次",
      );
      s.funded[idx] = true;
      if (s.funded.every(Boolean)) {
        s.stage = "active";
        s.activatedAt = n.now;
        s.confirmedAt = n.now;
        s.meetingCount = 0;
        log("属于我们的约定，正式开始", "双方资金已模拟存入");
      }
      break;
    case "send-check":
      requireThat(
        participant && ["active", "ending"].includes(s.stage) && !s.check,
        "当前无法发起新的正式确认",
      );
      s.check = {
        requester: n.role as "a" | "b",
        sentAt: n.now,
        deadline: n.now + s.terms.ghostDays * DAY,
      };
      log("发出了一次正式确认", `${s.names[idx]}希望收到对方的回应`);
      break;
    case "respond":
      requireThat(
        participant &&
          s.check &&
          s.check.requester !== n.role &&
          !s.check.repliedAt &&
          s.stage !== "ended",
        "仅接收方可以回应本次确认",
      );
      s.check.repliedAt = n.now;
      if (n.now <= s.check.deadline) {
        s.check = undefined;
        log("正式确认已得到回应", "在约定时间内回应，关系继续");
      }
      break;
    case "claim":
      requireThat(
        participant &&
          s.check?.requester === n.role &&
          ["active", "ending"].includes(s.stage) &&
          n.now > s.check.deadline &&
          n.now <= s.check.deadline + 7 * DAY,
        "只有确认发起方可以在逾期后 7 天内申诉",
      );
      s.stage = "appeal";
      s.appealDeadline = n.now + 2 * DAY;
      s.voteDeadline = n.now + 5 * DAY;
      s.endRequester = undefined;
      log("本次申诉进入说明窗口", "双方可在 48 小时内说明情况");
      break;
    case "escalate":
      requireThat(
        participant &&
          s.stage === "appeal" &&
          s.appealDeadline &&
          n.now > s.appealDeadline &&
          n.now <= (s.voteDeadline ?? 0),
        "说明窗口结束后，双方任一方可提交好友监督",
      );
      s.stage = "voting";
      break;
    case "vote": {
      requireThat(
        n.role.startsWith("j") &&
          s.stage === "voting" &&
          n.now <= (s.voteDeadline ?? 0),
        "仅指定好友可以在投票窗口内判断",
      );
      const j = Number(n.role[1]);
      requireThat(s.votes[j] === null, "每位好友只能投一次票");
      s.votes[j] = action.breach;
      if (s.votes.filter((x) => x === true).length >= 2)
        settle(s.check?.requester === "a" ? "breach-b" : "breach-a");
      else if (s.votes.filter((x) => x === false).length >= 2)
        settle("rejected");
      break;
    }
    case "request-end":
      requireThat(
        participant && s.stage === "active",
        "仅双方可在进行中提出结束",
      );
      s.stage = "ending";
      s.endRequester = n.role;
      break;
    case "confirm-end":
      requireThat(
        participant && s.stage === "ending" && s.endRequester !== n.role,
        "需要另一方确认，单方不能结束",
      );
      settle("mutual");
      break;
    case "meeting":
      requireThat(
        participant && s.stage === "active" && !s.meetingPending,
        "当前无法登记见面",
      );
      s.meetingRequester = n.role as "a" | "b";
      s.meetingPending = true;
      break;
    case "confirm-meeting":
      requireThat(
        participant &&
          n.role !== s.meetingRequester &&
          s.stage === "active" &&
          s.meetingPending,
        "请由另一方确认见面",
      );
      s.meetingPending = false;
      s.meetingCount += 1;
      log("又一次见面，被我们记住了", "双方共同确认");
      break;
    case "relationship-check":
      requireThat(participant && s.stage === "active", "关系进行中才可使用");
      requireThat(s.confirmationRequester !== n.role, "等待另一方确认");
      if (s.confirmationRequester) {
        s.confirmationRequester = undefined;
        s.confirmedAt = n.now;
        log("我们一起确认了这段关系", "双方都选择了继续");
      } else s.confirmationRequester = n.role as "a" | "b";
      break;
    case "timeout":
      requireThat(
        ["appeal", "voting"].includes(s.stage) &&
          n.now > (s.voteDeadline ?? Infinity),
        "投票窗口尚未结束",
      );
      settle("timeout");
      break;
  }
  return n;
}
export function createMockService(
  storage?: Pick<Storage, "getItem" | "setItem">,
  delay = 160,
): SituationService {
  let state = fixture();
  let recoveryMessage = "";
  const connection = {
    mode: "mock" as const,
    phase: "ready" as const,
    message: "本机 Mock 数据",
  };
  const listeners = new Set<() => void>();
  let busy = false;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const p: unknown = JSON.parse(raw);
      requireThat(validSave(p), "存档无效");
      state = p;
    }
  } catch {
    recoveryMessage = "演示存档无法读取，已恢复初始场景";
  }

  return {
    mode: "mock",
    get recoveryMessage() {
      return recoveryMessage;
    },
    getSnapshot: () => state,
    getConnectionSnapshot: () => connection,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async initialize() {},
    async connect() {},
    async disconnect() {},
    async refresh() {},
    async dispatch(action) {
      requireThat(!busy, "上一步操作尚未完成");
      busy = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const next = reduceDemo(state, action);
        try {
          storage?.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          recoveryMessage = "浏览器无法保存，刷新后会恢复初始演示";
        }
        state = next;
        listeners.forEach((fn) => fn());
        return state;
      } finally {
        busy = false;
      }
    },
  };
}

function validSave(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const p = value as DemoState;
  const s = p.situation;
  const number = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;
  const person = (r: unknown) => r === "a" || r === "b";
  const text = (x: unknown) =>
    typeof x === "string" && x.length > 0 && x.length <= 200;
  const strings = (a: unknown, len: number) =>
    Array.isArray(a) && a.length === len && a.every(text);
  const bools = (a: unknown, len: number) =>
    Array.isArray(a) &&
    a.length === len &&
    a.every((v) => typeof v === "boolean");
  const ints = (a: unknown, len: number) =>
    Array.isArray(a) &&
    a.length === len &&
    a.every((v) => Number.isSafeInteger(v) && v >= 0);
  if (
    !(
      p.version === 1 &&
      number(p.now) &&
      ["a", "b", "j0", "j1", "j2"].includes(p.role) &&
      s &&
      text(s.id) &&
      strings(s.names, 2) &&
      strings(s.friends, 3) &&
      bools(s.supervisors, 3) &&
      bools(s.funded, 2) &&
      ints(s.payouts, 2) &&
      Array.isArray(s.votes) &&
      s.votes.length === 3 &&
      s.votes.every((v) => v === null || typeof v === "boolean") &&
      [
        "invited",
        "funding",
        "active",
        "ending",
        "appeal",
        "voting",
        "ended",
      ].includes(s.stage)
    )
  )
    return false;
  const t = s.terms;
  if (
    !(
      t &&
      [t.recovery, t.bond].every(
        (v) => Number.isSafeInteger(v) && v >= 10000 && v <= 1e9,
      ) &&
      Number.isInteger(t.ghostDays) &&
      t.ghostDays >= 1 &&
      t.ghostDays <= 30 &&
      Number.isInteger(t.meetings) &&
      t.meetings >= 0 &&
      t.meetings <= 31 &&
      Number.isInteger(t.confirmationDays) &&
      t.confirmationDays >= 1 &&
      t.confirmationDays <= 90
    )
  )
    return false;
  if (
    !(
      [s.createdAt, s.activatedAt, s.confirmedAt, s.meetingCount].every(
        number,
      ) &&
      typeof s.meetingPending === "boolean" &&
      Array.isArray(s.activities) &&
      s.activities.every(
        (a) => a && text(a.title) && text(a.detail) && number(a.at),
      )
    )
  )
    return false;
  if (
    s.check &&
    !(
      person(s.check.requester) &&
      number(s.check.sentAt) &&
      number(s.check.deadline) &&
      (s.check.repliedAt === undefined || number(s.check.repliedAt))
    )
  )
    return false;
  if (
    [s.appealDeadline, s.voteDeadline].some(
      (v) => v !== undefined && !number(v),
    )
  )
    return false;
  if (
    [s.endRequester, s.meetingRequester, s.confirmationRequester].some(
      (r) => r !== undefined && !person(r),
    )
  )
    return false;
  if (
    ["appeal", "voting"].includes(s.stage) &&
    (!s.check || !s.appealDeadline || !s.voteDeadline)
  )
    return false;
  if (s.meetingPending && !s.meetingRequester) return false;
  if (s.stage === "ending" && !s.endRequester) return false;
  if (
    s.stage === "ended" &&
    !["mutual", "breach-a", "breach-b", "rejected", "timeout"].includes(
      s.outcome ?? "",
    )
  )
    return false;
  return true;
}
