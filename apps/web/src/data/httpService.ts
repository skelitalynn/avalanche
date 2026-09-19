import { fixture } from "./mockService";
import type {
  ConnectionSnapshot,
  DemoAction,
  DemoState,
  Role,
  SituationService,
  Stage,
} from "./types";

type JsonObject = Record<string, unknown>;
type Fetcher = typeof fetch;
type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export interface HttpServiceOptions {
  baseUrl?: string;
  situationAddress?: string;
  fetcher?: Fetcher;
  provider?: Eip1193Provider;
}

const FUJI_CHAIN_ID = 43113;
const FUJI_HEX = "0xa869";

const object = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value ? value : fallback;
const integer = (value: unknown, fallback = 0) => {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : fallback;
};
const milliseconds = (value: unknown) => integer(value) * 1000;
const amount = (value: unknown, fallback: number) => {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : fallback;
};
const short = (value: string) =>
  value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
const normalizeBase = (value: string) => value.replace(/\/$/, "");

const stageFrom = (value: unknown, disputeStatus: unknown): Stage => {
  const lifecycle = text(value).toUpperCase();
  const dispute = text(disputeStatus).toUpperCase();
  if (lifecycle === "INVITED") return "invited";
  if (lifecycle === "FUNDING") return "funding";
  if (lifecycle === "ACTIVE") return "active";
  if (lifecycle === "ENDING") return "ending";
  if (lifecycle === "DISPUTED")
    return dispute === "VOTING" ? "voting" : "appeal";
  if (["SETTLING", "ENDED", "CANCELLED"].includes(lifecycle))
    return "ended";
  throw new Error(`后台返回了未知关系状态：${lifecycle || "空值"}`);
};

const roleFrom = (value: unknown): Role => {
  const role = text(value).toLowerCase().replaceAll("-", "_");
  if (["a", "participant_a", "participanta"].includes(role)) return "a";
  if (["b", "participant_b", "participantb"].includes(role)) return "b";
  const supervisor = role.match(/(?:j|supervisor_?)([0-2])$/);
  return supervisor ? (`j${supervisor[1]}` as Role) : "a";
};

export function mapApiSnapshot(
  listItem: unknown,
  detailValue: unknown,
): DemoState {
  const item = object(listItem);
  const detail = object(detailValue);
  const chain = object(detail.chain);
  const commitment = object(detail.commitment);
  const document = object(detail.document ?? commitment.document);
  const participantA = text(
    document.participantA ?? commitment.participantA,
    "参与者 A",
  );
  const participantB = text(
    document.participantB ?? commitment.participantB,
    "参与者 B",
  );
  const supervisors = array(
    document.supervisors ?? commitment.supervisors,
  ).map((entry) => text(entry));
  const supervisorNames = [0, 1, 2].map((index) =>
    short(supervisors[index] || `监督人 ${index + 1}`),
  ) as [string, string, string];
  const names = array(commitment.names ?? detail.names);
  const entitlements = array(chain.entitlement);
  const votes = array(object(detail.dispute).votes).map((vote) =>
    Number(vote) === 1 ? true : Number(vote) === 2 ? false : null,
  );
  const state = stageFrom(chain.state ?? item.state, object(detail.dispute).status);
  const termination = text(chain.terminationReason).toUpperCase();
  const outcome =
    termination === "MUTUAL_END"
      ? "mutual"
      : termination === "BREACH_A"
        ? "breach-a"
        : termination === "BREACH_B"
          ? "breach-b"
          : termination === "REJECTED"
            ? "rejected"
            : termination === "TIMED_OUT"
              ? "timeout"
              : undefined;
  const ghostWindow = integer(
    document.ghostWindowSeconds ?? commitment.ghostWindow,
    7 * 86400,
  );
  return {
    version: 1,
    role: roleFrom(item.role),
    now: Date.now(),
    situation: {
      id: text(item.address ?? detail.address, "未命名关系"),
      names: [
        text(names[0], short(participantA)),
        text(names[1], short(participantB)),
      ],
      friends: supervisorNames,
      terms: {
        ghostDays: Math.max(1, Math.round(ghostWindow / 86400)),
        meetings: integer(
          document.meetingTarget ?? commitment.meetingTarget,
          0,
        ),
        confirmationDays: integer(
          document.confirmationEveryDays ??
            commitment.confirmationEveryDays,
          7,
        ),
        recovery: amount(
          document.recoveryAmount ?? commitment.recoveryAmount,
          0,
        ),
        bond: amount(document.bondAmount ?? commitment.bondAmount, 0),
      },
      stage: state,
      createdAt: milliseconds(chain.createdAt),
      activatedAt: milliseconds(chain.activatedAt),
      supervisors: array(chain.supervisorsAccepted)
        .slice(0, 3)
        .map(Boolean),
      funded: [
        Boolean(array(chain.funded)[0]),
        Boolean(array(chain.funded)[1]),
      ],
      meetingCount: integer(detail.meetingCount),
      meetingPending: Boolean(detail.meetingPending),
      confirmedAt: milliseconds(detail.relationshipConfirmedAt),
      appealDeadline: milliseconds(object(detail.dispute).appealDeadline) ||
        undefined,
      voteDeadline: milliseconds(object(detail.dispute).voteDeadline) ||
        undefined,
      votes: [votes[0] ?? null, votes[1] ?? null, votes[2] ?? null],
      outcome,
      payouts: [
        amount(entitlements[0], 0),
        amount(entitlements[1], 0),
      ],
      activities: array(detail.activities)
        .map((entry) => object(entry))
        .map((entry) => ({
          title: text(entry.title, "关系状态已更新"),
          detail: text(entry.detail, "来自后台"),
          at: milliseconds(entry.at),
        })),
    },
  };
}

export function createHttpSituationService(
  options: HttpServiceOptions = {},
): SituationService {
  const baseUrl = normalizeBase(options.baseUrl || "/api/v1");
  const fetcher = options.fetcher || fetch.bind(window);
  const provider =
    options.provider ||
    (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  let state = fixture("active");
  let connection: ConnectionSnapshot = {
    mode: "api",
    phase: "idle",
    message: "尚未连接后台",
  };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const setConnection = (next: ConnectionSnapshot) => {
    connection = next;
    emit();
  };
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetcher(`${baseUrl}${path}`, {
      credentials: "include",
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
    if (!response.ok) {
      const body = object(await response.json().catch(() => ({})));
      const error = new Error(
        text(body.message ?? body.error, `后台请求失败（${response.status}）`),
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  };
  const load = async () => {
    const listing = object(await request<unknown>("/situations"));
    const items = array(listing.items);
    const selected =
      items.find(
        (entry) =>
          text(object(entry).address).toLowerCase() ===
          options.situationAddress?.toLowerCase(),
      ) || items[0];
    if (!selected)
      throw new Error("后台已连接，但当前钱包还没有可显示的关系");
    const address = text(object(selected).address);
    if (!address) throw new Error("后台关系列表缺少 address");
    const detail = await request<unknown>(
      `/situations/${encodeURIComponent(address)}`,
    );
    state = mapApiSnapshot(selected, detail);
    setConnection({
      ...connection,
      phase: "ready",
      message: "后台数据已同步",
      situationAddress: address,
    });
  };
  const initialize = async () => {
    setConnection({ ...connection, phase: "loading", message: "正在检查后台…" });
    try {
      await request<unknown>("/health");
      const config = object(await request<unknown>("/config"));
      const chainId = integer(config.chainId);
      if (chainId !== FUJI_CHAIN_ID)
        throw new Error(`后台网络配置不是 Fuji（收到 ${chainId || "空值"}）`);
      connection = { ...connection, chainId };
      await load();
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      setConnection({
        ...connection,
        phase: status === 401 ? "needs-auth" : "error",
        message:
          status === 401
            ? "请连接钱包并登录后台"
            : error instanceof Error
              ? error.message
              : "无法连接后台",
      });
    }
  };
  const connect = async () => {
    if (!provider) throw new Error("未检测到 Core 或兼容的钱包扩展");
    setConnection({ ...connection, phase: "loading", message: "正在连接钱包…" });
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const account = text(accounts?.[0]).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(account))
        throw new Error("钱包没有返回有效地址");
      const currentChain = String(
        await provider.request({ method: "eth_chainId" }),
      ).toLowerCase();
      if (currentChain !== FUJI_HEX) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: FUJI_HEX }],
          });
        } catch (error) {
          if ((error as { code?: number }).code !== 4902) throw error;
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: FUJI_HEX,
                chainName: "Avalanche Fuji C-Chain",
                nativeCurrency: {
                  name: "Avalanche",
                  symbol: "AVAX",
                  decimals: 18,
                },
                rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
                blockExplorerUrls: ["https://testnet.snowtrace.io/"],
              },
            ],
          });
        }
      }
      const challenge = object(
        await request<unknown>("/auth/challenge", {
          method: "POST",
          body: JSON.stringify({ address: account }),
        }),
      );
      const message = text(challenge.message);
      if (!message) throw new Error("后台没有返回 SIWE 登录消息");
      const signature = text(
        await provider.request({
          method: "personal_sign",
          params: [message, account],
        }),
      );
      await request("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });
      connection = {
        ...connection,
        account,
        chainId: FUJI_CHAIN_ID,
      };
      await load();
    } catch (error) {
      setConnection({
        ...connection,
        phase: "error",
        message:
          error instanceof Error ? error.message : "钱包或后台登录失败",
      });
      throw error;
    }
  };
  return {
    mode: "api",
    recoveryMessage: "",
    getSnapshot: () => state,
    getConnectionSnapshot: () => connection,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    connect,
    async disconnect() {
      await request("/auth/session", { method: "DELETE" }).catch(() => undefined);
      setConnection({
        mode: "api",
        phase: "needs-auth",
        message: "已退出后台登录",
        chainId: FUJI_CHAIN_ID,
      });
    },
    async refresh() {
      await load();
    },
    async dispatch(_action: DemoAction) {
      throw new Error(
        "后台读取已接通；该操作需要对应合约交易或链下写接口，当前不会用 Mock 伪造成功。",
      );
    },
  };
}
