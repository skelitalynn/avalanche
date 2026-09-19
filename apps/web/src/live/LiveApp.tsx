import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  WagmiProvider,
  createConfig,
  http,
  useConnection,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createPublicClient,
  erc20Abi,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
  type Abi,
} from "viem";
import { hardhat, avalancheFuji } from "viem/chains";
import {
  ShieldCheck,
  ArrowRight,
  ArrowSquareOut,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  SituationFactoryAbi as F,
  SituationAgreementAbi as A,
  FUJI,
  lifecycles,
  documentSchema,
  hashDocument,
  assertPublicAgreement,
  same,
  type AgreementDocument,
} from "../../../../packages/shared/src/index";
import { api } from "./api";
import { reconcileLocalSession } from "./session";
import {
  localConnectors,
  localWalletEnabled,
  localAccounts,
} from "./localWallet";
import "./live.css";
import "../reference-theme.css";
import { ReferenceHero } from "../ReferenceHero";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  string | undefined;
const localRpc = import.meta.env.VITE_LOCAL_RPC_URL || "http://127.0.0.1:8545";
const config = createConfig({
  chains: [avalancheFuji, hardhat],
  connectors: [
    injected(),
    ...localConnectors,
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: {
              name: "SituationSHIT",
              description: "两个人共同确认的关系约定",
              url: location.origin,
              icons: [location.origin + "/assets/together.jpg"],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [avalancheFuji.id]: http(FUJI.rpc),
    [hardhat.id]: http(localRpc),
  },
  multiInjectedProviderDiscovery: true,
});
const queryClient = new QueryClient();
const short = (address?: string) =>
  address ? address.slice(0, 6) + "…" + address.slice(-4) : "未连接";
const date = (t: bigint | string | number) =>
  Number(t)
    ? new Date(Number(t) * 1000).toLocaleString("zh-CN", {
        timeZoneName: "short",
      })
    : "—";
const cash = (value: bigint | string) => formatUnits(BigInt(value), 6);
const randomHash = () =>
  ("0x" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")) as Hex;
function Button({
  children,
  onClick,
  disabled = false,
  secondary = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      className={"button " + (secondary ? "secondary" : "")}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function LiveApp() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Live />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
interface PublicConfig {
  chainId: number;
  tokenAddress: Address;
  factoryAddress: Address;
  walletConnectConfigured: boolean;
  localSessionId?: string;
}
interface Pending {
  hash: Hex;
  chainId: number;
  account: Address;
  kind: string;
  draftId?: string;
}
function Live() {
  const { address, chainId, isConnected } = useConnection();
  const { data: wallet } = useWalletClient();
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [settings, setSettings] = useState<PublicConfig | null>(null);
  const [devAccounts, setDevAccounts] = useState<string[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [selected, setSelected] = useState<Address | undefined>();
  const [draftId, setDraftId] = useState(
    new URLSearchParams(location.search).get("agreement") ?? "",
  );
  const [draft, setDraft] = useState<AgreementDocument | null>(null);
  const [model, setModel] = useState<any>(null);
  const [records, setRecords] = useState<any>(null);
  const [caseData, setCaseData] = useState<any>(null);
  const [evidenceBodies, setEvidenceBodies] = useState<any[]>([]);
  const [view, setView] = useState("overview");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("situation-pending") ?? "null");
    } catch {
      return null;
    }
  });
  const previousAccount = useRef<string | undefined>(undefined);
  const previousChain = useRef<number | undefined>(undefined);
  const client = useMemo(
    () =>
      settings
        ? createPublicClient({
            chain: settings.chainId === 31337 ? hardhat : avalancheFuji,
            transport: http(settings.chainId === 31337 ? localRpc : FUJI.rpc),
            pollingInterval: 1000,
          })
        : null,
    [settings],
  );
  const isParty =
    !!model &&
    !!address &&
    (same(model.participantA, address) || same(model.participantB, address));
  const participantIndex =
    model && address && same(model.participantA, address) ? 0 : 1;
  const supervisorIndex =
    model && address
      ? model.supervisors.findIndex((a: string) => same(a, address))
      : -1;
  const s = model?.snapshot;
  const lifecycle = s?.state;
  const now = BigInt(Math.floor(Date.now() / 1000));
  useEffect(() => {
    api<PublicConfig>("/config")
      .then((v) => {
        if (![31337, 43113].includes(v.chainId))
          throw Error("后端网络不受支持");
        if (v.chainId === 31337 && v.localSessionId) {
          try {
            if (reconcileLocalSession(v.localSessionId, localStorage))
              setPending(null);
          } catch {
            setPending(null);
          }
        }
        setSettings(v);
        if (localWalletEnabled && v.chainId === 31337)
          void localAccounts()
            .then(setDevAccounts)
            .catch((e) => setError(e.message));
      })
      .catch((e) => setError("真实服务尚未配置：" + e.message));
  }, []);
  useEffect(() => {
    if (
      previousAccount.current !== address ||
      previousChain.current !== chainId
    ) {
      setSignedIn(false);
      setDraft(null);
      setModel(null);
      setRecords(null);
      setCaseData(null);
      setEvidenceBodies([]);
      setList([]);
      setSelected(undefined);
      if (previousAccount.current)
        void api("/auth/session", undefined, "DELETE").catch(() => {});
      previousAccount.current = address;
      previousChain.current = chainId;
    }
  }, [address, chainId]);
  const savePending = (p: Pending | null) => {
    setPending(p);
    try {
      if (p) localStorage.setItem("situation-pending", JSON.stringify(p));
      else localStorage.removeItem("situation-pending");
    } catch {
      /* Receipt hash also remains visible this session. */
    }
  };
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("正在处理，请在钱包中确认…");
    try {
      await fn();
      setStatus("已核对最新结果");
    } catch (e) {
      const err = e as any;
      setError(err.shortMessage ?? err.message ?? "操作未完成");
      if (err.status === 401) setSignedIn(false);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function readSituation(
    target: Address,
    document?: AgreementDocument | null,
  ) {
    if (!client) throw Error("网络配置未就绪");
    const block = await client.getBlock();
    const blockNumber = block.number;
    const factory = settings!.factoryAddress;
    if (
      !(await client.readContract({
        address: factory,
        abi: F,
        functionName: "isSituation",
        args: [target],
        blockNumber,
      }))
    )
      throw Error("这不是本项目登记的关系");
    const get = (functionName: any, args?: any) =>
      client.readContract({
        address: target,
        abi: A,
        functionName,
        args,
        blockNumber,
      } as any) as Promise<any>;
    const [
      snapshot,
      participantA,
      participantB,
      supervisors,
      recoveryAmount,
      bondAmount,
      ghostWindow,
      agreementHash,
      registeredFactory,
    ] = await Promise.all([
      get("snapshot"),
      get("participantA"),
      get("participantB"),
      Promise.all([0n, 1n, 2n].map((i) => get("supervisors", [i]))),
      get("recoveryAmount"),
      get("bondAmount"),
      get("ghostWindow"),
      get("agreementHash"),
      get("factory"),
    ]);
    const next = {
      snapshot,
      participantA,
      participantB,
      supervisors,
      recoveryAmount,
      bondAmount,
      ghostWindow,
      agreementHash,
      factory: registeredFactory,
      address: target,
      chainTime: block.timestamp,
      check: snapshot.currentCheckId
        ? await get("getCheck", [snapshot.currentCheckId])
        : null,
    };
    if (document) assertPublicAgreement(document, next);
    setModel(next);
    setSelected(target);
    const party =
      address && (same(address, participantA) || same(address, participantB));
    if (party) {
      try {
        setRecords(await api("/situations/" + target));
      } catch (e) {
        if ((e as any).status !== 410) throw e;
        setRecords(null);
      }
    }
    if (snapshot.currentDisputeId) {
      try {
        setCaseData(
          await api(
            `/situations/${target}/disputes/${snapshot.currentDisputeId}`,
          ),
        );
      } catch (e) {
        setCaseData(null);
        if (![404, 410].includes((e as any).status)) throw e;
      }
    } else setCaseData(null);
  }
  async function refresh() {
    const data = await api<any>("/situations");
    setList(data.items);
    if (selected) await readSituation(selected, draft);
  }
  async function loadAgreement(id: string) {
    const data = await api<any>("/agreements/" + id);
    const parsed = documentSchema.parse(data.document);
    if (
      !settings ||
      parsed.chainId !== settings.chainId ||
      !same(parsed.factory, settings.factoryAddress) ||
      hashDocument(parsed) !== data.agreementHash
    )
      throw Error("协议摘要或网络不一致，不能签署");
    setDraft(parsed);
    setDraftId(id);
    if (data.situationAddress)
      await readSituation(data.situationAddress, parsed);
    setView("agreement");
  }
  async function login() {
    if (!address || !wallet || !settings) throw Error("先连接钱包");
    if (chainId !== settings.chainId) throw Error("请先切换到项目网络");
    const { message } = await api<{ message: string }>("/auth/challenge", {
      address,
    });
    const signature = await wallet.signMessage({ message });
    const verified = await api<{ address: string }>("/auth/verify", {
      message,
      signature,
    });
    if (!same(verified.address, address)) throw Error("登录钱包不一致");
    setSignedIn(true);
    const data = await api<any>("/situations");
    setList(data.items);
    if (draftId) await loadAgreement(draftId);
  }
  async function confirmed(p: Pending) {
    if (!client || !settings || p.chainId !== settings.chainId)
      throw Error("待确认交易属于其他网络");
    const receipt = await client.waitForTransactionReceipt({
      hash: p.hash,
      timeout: 60000,
    });
    if (receipt.status !== "success") {
      savePending(null);
      throw Error("链上交易已回滚，状态没有改变");
    }
    if (p.kind === "create" && p.draftId) {
      await api(`/agreements/${p.draftId}/link`, { txHash: p.hash });
      await loadAgreement(p.draftId);
    } else if (selected) await readSituation(selected, draft);
    savePending(null);
    const list = await api<any>("/situations");
    setList(list.items);
  }
  async function transaction(
    target: Address,
    abi: Abi,
    method: string,
    args: readonly unknown[] = [],
    kind = method,
    creationDraft?: string,
  ) {
    if (!wallet || !address || !client || !settings || !signedIn)
      throw Error("请连接钱包并签名登录");
    if (pending) throw Error("先查询上一次交易结果，避免重复提交");
    if (
      chainId !== settings.chainId ||
      (await wallet.getChainId()) !== settings.chainId
    )
      throw Error("钱包网络与项目网络不一致");
    await client.simulateContract({
      address: target,
      abi,
      functionName: method,
      args,
      account: address,
    });
    const tx = await wallet.writeContract({
      address: target,
      abi,
      functionName: method,
      args,
      chain: settings.chainId === 31337 ? hardhat : avalancheFuji,
      account: address,
    });
    const p = {
      hash: tx,
      chainId: settings.chainId,
      account: address,
      kind,
      draftId: creationDraft,
    };
    savePending(p);
    setStatus("交易已提交，正在等待回执及业务状态…");
    await confirmed(p);
  }
  const tx = (method: string, args: readonly unknown[] = []) =>
    void run(() => transaction(selected!, A, method, args));
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      if (!settings || !address) throw Error("先连接钱包");
      const text = (name: string) => String(form.get(name) || "");
      const amount = (name: string) => {
        const value = text(name);
        if (!/^\d+(\.\d{1,6})?$/.test(value)) throw Error("USDC 最多 6 位小数");
        return parseUnits(value, 6).toString();
      };
      const document = documentSchema.parse({
        version: 1,
        chainId: settings.chainId,
        factory: settings.factoryAddress,
        nonce: randomHash(),
        participantA: address,
        participantB: text("b"),
        supervisors: [text("j0"), text("j1"), text("j2")],
        recoveryAmount: amount("recovery"),
        bondAmount: amount("bond"),
        ghostWindowSeconds: Number(text("days")) * 86400,
        meetingTarget: Number(text("meetings")),
        confirmationEveryDays: Number(text("frequency")),
        policyVersion: "1",
        salt: randomHash(),
      });
      const draft = await api<any>("/agreements", { document });
      setDraft(document);
      setDraftId(draft.id);
      await transaction(
        settings.factoryAddress,
        F,
        "createSituation",
        [
          {
            participantB: document.participantB,
            supervisors: document.supervisors,
            recoveryAmount: BigInt(document.recoveryAmount),
            bondAmount: BigInt(document.bondAmount),
            ghostWindow: document.ghostWindowSeconds,
            agreementHash: hashDocument(document),
          },
        ],
        "create",
        draft.id,
      );
    });
  }
  async function openRow(row: any) {
    setCaseData(null);
    setRecords(null);
    setEvidenceBodies([]);
    if (row.agreementId) await loadAgreement(row.agreementId);
    else {
      setDraft(null);
      setDraftId("");
      await api(`/situations/${row.address}/supervision-invitation`);
      await readSituation(row.address);
      setView("jury");
    }
  }
  async function record(kind: "meetings" | "relationship-checks") {
    if (!selected) throw Error("先选择关系");
    const path = `/situations/${selected}`;
    const month = new Date().toISOString().slice(0, 7);
    const data = await api<any>(path + "/records?month=" + month);
    const pending =
      kind === "meetings"
        ? data.meetings.find(
            (r: any) =>
              r.date === new Date().toISOString().slice(0, 10) &&
              !r.confirmedAt,
          )
        : data.relationshipChecks.find((r: any) => !r.confirmedAt);
    if (pending) {
      if (same(pending.proposer, address!)) throw Error("等待另一方确认");
      await api(`${path}/${kind}/${pending.id}/confirm`, {});
    } else
      await api(
        `${path}/${kind}`,
        kind === "meetings"
          ? { date: new Date().toISOString().slice(0, 10) }
          : {},
      );
    await readSituation(selected, draft);
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      if (!selected || !s) throw Error("先选择争议");
      const file = data.get("file") as File;
      if (file?.size) {
        data.set("kind", "image");
        data.delete("text");
      } else {
        data.set("kind", "text");
        data.delete("file");
      }
      if (!consent) throw Error("请先明确授权本案接收人");
      data.set("consentVersion", "1");
      data.set("shareWithCasePanel", "true");
      const result = await api<any>(
        `/situations/${selected}/disputes/${s.currentDisputeId}/evidence`,
        data,
      );
      setEvidenceBodies((prev) => [
        ...prev,
        { ...result, text: result.normalizedPreview, unregistered: true },
      ]);
      setStatus("内容已保存为私有草稿，请核对下方预览并单独登记摘要");
      form.reset();
      setConsent(false);
    });
  }
  const currentDispute = caseData?.dispute;
  const canWrite =
    signedIn &&
    isConnected &&
    settings?.chainId === chainId &&
    !busy &&
    !pending;
  const chainTime = model?.chainTime ?? now;
  const action = (
    label: string,
    method: string,
    args: readonly unknown[] = [],
    enabled = true,
  ) => (
    <Button disabled={!canWrite || !enabled} onClick={() => tx(method, args)}>
      {label}
    </Button>
  );
  return (
    <div className="live-app">
      <header className="live-header">
        <a className="reference-brand" href="/">
          Situation<span>SHIT</span> ↗
        </a>
        <span className="pill">
          {settings?.chainId === 31337
            ? "本地 EVM · 测试代币"
            : settings
              ? "Fuji · 测试网"
              : "正在读取网络"}
        </span>
        <a href="/?mode=mock">返回 Mock 演示</a>
      </header>
      <div className="live-layout">
        <aside className="live-sidebar">
          {" "}
          <nav className="live-tabs" aria-label="真实流程导航">
            {[
              ["overview", "我的关系"],
              ["create", "创建约定"],
              ["agreement", "协议与入金"],
              ["dispute", "确认与申诉"],
              ["jury", "好友监督"],
              ["ended", "结束与结算"],
            ].map(([v, label]) => (
              <button
                key={v}
                disabled={!signedIn}
                onClick={() => setView(v)}
                className={view === v ? "selected" : ""}
              >
                {label}
              </button>
            ))}
          </nav>
          <p className="reference-note">
            约定需要双方同意，结束也有明确的处理方式。
          </p>
        </aside>
        <main className="live-main">
          {!signedIn ? (
            <ReferenceHero>
              <a className="button" href="#wallet-login">
                开始一段关系 <ArrowRight />
              </a>
            </ReferenceHero>
          ) : (
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === "create"
                    ? "填写约定 / 资金与好友"
                    : "SITUATIONSHIT / 你们的约定"}
                </span>
                <h1>
                  {
                    (
                      {
                        create: "写下你们的期待",
                        agreement: "这份约定，你们都同意吗？",
                        overview: "把彼此的期待说清楚",
                        dispute: "先听听双方的说法",
                        jury: "请根据争议信息判断",
                        ended: "查看资金去向",
                      } as Record<string, string>
                    )[view]
                  }
                </h1>
                <p>签名由你的钱包完成，资金状态按链上结果更新。</p>
              </div>
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              <WarningCircle />
              {error}
              <button aria-label="关闭错误" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {status && (
            <p className="live-status" role="status">
              {status}
            </p>
          )}
          <section className="card wallet-bar" id="wallet-login">
            <Wallet size={24} />
            <div>
              <strong>{isConnected ? short(address) : "连接你的钱包"}</strong>
              <p>{signedIn ? "已通过签名登录" : "登录签名不会授权转账"}</p>
            </div>
            <div className="button-row">
              {!isConnected ? (
                connectors
                  .filter(
                    (c) =>
                      !c.id.startsWith("local-dev-") ||
                      settings?.chainId === 31337,
                  )
                  .map((c) => (
                    <Button
                      key={c.uid}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await connectAsync({ connector: c });
                        })
                      }
                    >
                      {c.name}
                    </Button>
                  ))
              ) : (
                <>
                  {settings && chainId !== settings.chainId ? (
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await switchChainAsync({
                            chainId: settings.chainId as 31337 | 43113,
                          });
                        })
                      }
                    >
                      切换项目网络
                    </Button>
                  ) : (
                    !signedIn && (
                      <Button
                        disabled={busy || !wallet || !settings}
                        onClick={() => void run(login)}
                      >
                        签名登录
                      </Button>
                    )
                  )}
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api("/auth/session", undefined, "DELETE");
                        disconnect();
                        setSignedIn(false);
                      })
                    }
                  >
                    断开连接
                  </Button>
                </>
              )}
            </div>
          </section>
          {!projectId && (
            <p className="field-hint">
              手机 WalletConnect 尚未配置；桌面可使用 Core 扩展。
              {localWalletEnabled && settings?.chainId === 31337
                ? "本机体验也可选择本地开发钱包；仅操作测试代币。"
                : "未安装钱包时，请先安装 Core。"}
            </p>
          )}
          {devAccounts.length === 5 && (
            <details className="card">
              <summary>本地测试钱包地址</summary>
              <p>
                创建时已预填 B
                和三位好友。完成一个角色的操作后，断开连接，再选择下一个本地钱包并签名登录。
              </p>
              {devAccounts.map((a, i) => (
                <p key={a} className="mono">
                  {
                    [
                      "参与者 A",
                      "参与者 B",
                      "A 的好友",
                      "B 的好友",
                      "共同好友",
                    ][i]
                  }
                  ：{a}
                </p>
              ))}
            </details>
          )}
          {pending && (
            <section className="card pending-card">
              <h2>有一笔交易需要确认</h2>
              <p className="mono">{pending.hash}</p>
              <p>
                提交后遇到网络异常时，先查询结果。不会自动重新发送资金交易。
              </p>
              <Button
                disabled={
                  busy ||
                  !signedIn ||
                  !address ||
                  !same(address, pending.account)
                }
                onClick={() => void run(() => confirmed(pending))}
              >
                查询交易结果
              </Button>
            </section>
          )}
          {signedIn && (
            <>
              {view === "create" ? (
                <form className="card live-create" onSubmit={create}>
                  <h2>创建新的 Situation</h2>
                  <p>
                    你是 A。B
                    与三位好友需使用不同的钱包接受；创建成功后不能修改规则。
                  </p>
                  <div className="form-grid">
                    <label>
                      B 的钱包地址
                      <input
                        required
                        name="b"
                        placeholder="0x…"
                        defaultValue={devAccounts[1] ?? ""}
                      />
                    </label>
                    {[0, 1, 2].map((i) => (
                      <label key={i}>
                        {["A 指定的好友", "B 指定的好友", "共同好友"][i]}
                        <input
                          required
                          name={"j" + i}
                          placeholder="0x…"
                          defaultValue={devAccounts[i + 2] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="form-grid three">
                    <label>
                      失联期限（天）
                      <input
                        name="days"
                        type="number"
                        min="1"
                        max="30"
                        defaultValue="7"
                        required
                      />
                    </label>
                    <label>
                      每月见面次数
                      <input
                        name="meetings"
                        type="number"
                        min="0"
                        max="31"
                        defaultValue="1"
                        required
                      />
                    </label>
                    <label>
                      关系确认间隔（天）
                      <input
                        name="frequency"
                        type="number"
                        min="1"
                        max="90"
                        defaultValue="7"
                        required
                      />
                    </label>
                  </div>
                  <div className="form-grid">
                    <label>
                      每人恢复基金（USDC）
                      <input
                        name="recovery"
                        defaultValue="0.1"
                        required
                        inputMode="decimal"
                      />
                    </label>
                    <label>
                      每人承诺保证金（USDC）
                      <input
                        name="bond"
                        defaultValue="0.1"
                        required
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                  <div className="form-submit">
                    <span>恢复基金始终属于本人</span>
                    <Button type="submit" disabled={!canWrite}>
                      保存协议并用钱包创建 <ArrowRight />
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <section className="card">
                    <div className="section-title">
                      <h2>我的关系与监督邀请</h2>
                      <Button
                        secondary
                        disabled={busy}
                        onClick={() => void run(refresh)}
                      >
                        刷新链上状态
                      </Button>
                    </div>
                    {list.length ? (
                      <div className="live-list">
                        {list.map((row) => (
                          <button
                            key={row.address}
                            className={
                              selected && same(selected, row.address)
                                ? "selected"
                                : ""
                            }
                            disabled={busy}
                            onClick={() => void run(() => openRow(row))}
                          >
                            <span>
                              {row.role === "SUPERVISOR"
                                ? "好友监督"
                                : row.role === "A"
                                  ? "我创建的约定"
                                  : "我收到的约定"}
                            </span>
                            <strong>{short(row.address)}</strong>
                            <small>
                              {
                                [
                                  "待接受",
                                  "待入金",
                                  "进行中",
                                  "待结束",
                                  "争议中",
                                  "结算中",
                                  "已结束",
                                  "已取消",
                                ][lifecycles.indexOf(row.state)]
                              }
                            </small>
                            <ArrowRight />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>
                        还没有关系。你可以创建约定，或使用指定 B
                        钱包打开邀请链接。
                      </p>
                    )}
                  </section>
                  {model && (
                    <>
                      <section className="relationship-card live-summary">
                        <div className="card-top">
                          <span className="relationship-tag">
                            OUR SITUATION · {short(selected)}
                          </span>
                          <span className="pill">
                            {
                              [
                                "待接受",
                                "待入金",
                                "进行中",
                                "待双方结束",
                                "争议中",
                                "资金结算中",
                                "已结束",
                                "已取消",
                              ][lifecycle]
                            }
                          </span>
                        </div>
                        <h2>
                          {short(model.participantA)} <span>&</span>{" "}
                          {short(model.participantB)}
                        </h2>
                        <p>
                          {s.activatedAt
                            ? `已经走过 ${Math.max(0, Math.floor((Number(s.terminatedAt || model.chainTime) - Number(s.activatedAt)) / 86400))} 天`
                            : "关系尚未生效"}{" "}
                          · 每人恢复基金 {cash(model.recoveryAmount)} + 保证金{" "}
                          {cash(model.bondAmount)} USDC
                        </p>
                      </section>
                      {(view === "agreement" || view === "overview") &&
                        isParty && (
                          <section className="card">
                            <h2>共同确认的约定</h2>
                            {draft ? (
                              <>
                                <div className="live-metrics">
                                  <div>
                                    <strong>
                                      {draft.ghostWindowSeconds / 86400} 天
                                    </strong>
                                    <span>正式确认回应期限</span>
                                  </div>
                                  <div>
                                    <strong>
                                      {draft.meetingTarget} 次 / 月
                                    </strong>
                                    <span>约定见面次数</span>
                                  </div>
                                  <div>
                                    <strong>
                                      {draft.confirmationEveryDays} 天
                                    </strong>
                                    <span>关系确认频率</span>
                                  </div>
                                </div>
                                <p>
                                  双方核对的协议摘要：
                                  <span className="mono">
                                    {hashDocument(draft)}
                                  </span>
                                </p>
                              </>
                            ) : (
                              <p>完整协议需要指定参与者登录后读取。</p>
                            )}
                            <p>
                              监督接受：
                              {s.supervisorsAccepted.filter(Boolean).length} /
                              3；双方入金：
                              {s.funded
                                .map(
                                  (f: boolean, i: number) =>
                                    `${i ? "B" : "A"} ${f ? "已存入" : "待存入"}`,
                                )
                                .join("，")}
                            </p>
                            <div className="button-row">
                              {lifecycle === 0 &&
                                draft &&
                                action(
                                  "接受并签署相同协议",
                                  "acceptAgreement",
                                  [hashDocument(draft)],
                                  same(address!, model.participantB),
                                )}
                              {lifecycle === 1 && (
                                <>
                                  <Button
                                    disabled={
                                      !canWrite ||
                                      !s.supervisorsAccepted.every(Boolean) ||
                                      s.funded[participantIndex]
                                    }
                                    onClick={() =>
                                      void run(() =>
                                        transaction(
                                          settings!.tokenAddress,
                                          erc20Abi,
                                          "approve",
                                          [
                                            selected!,
                                            model.recoveryAmount +
                                              model.bondAmount,
                                          ],
                                        ),
                                      )
                                    }
                                  >
                                    授权本次精确金额
                                  </Button>
                                  {action(
                                    "存入恢复基金与保证金",
                                    "deposit",
                                    [],
                                    s.supervisorsAccepted.every(Boolean) &&
                                      !s.funded[participantIndex],
                                  )}
                                </>
                              )}
                              {[0, 1].includes(lifecycle) &&
                                action("取消未生效约定", "cancel")}
                              {[0, 1].includes(lifecycle) &&
                                action(
                                  "处理过期邀请 / 入金",
                                  "expire",
                                  [],
                                  chainTime >
                                    (lifecycle === 0
                                      ? s.invitationDeadline
                                      : s.fundingDeadline),
                                )}
                            </div>
                            {draftId && (
                              <div className="note-box live-invite">
                                邀请 B 在自己的浏览器打开：
                                <a
                                  href={`/?mode=live&agreement=${draftId}#/invite`}
                                >
                                  {location.origin}/?mode=live&agreement=
                                  {draftId}
                                  #/invite <ArrowSquareOut />
                                </a>
                                <span>
                                  好友用指定钱包登录此站点，即可看到自己的监督邀请。
                                </span>
                              </div>
                            )}
                          </section>
                        )}
                      {supervisorIndex >= 0 && (
                        <section className="card">
                          <h2>接受好友监督职责</h2>
                          <p>
                            你只能查看公开规则与本案必要信息。投票只能投一次，需两票同向形成结果。
                          </p>
                          {action(
                            s.supervisorsAccepted[supervisorIndex]
                              ? "你已接受监督"
                              : "我接受本次监督职责",
                            "acceptSupervision",
                            [model.agreementHash],
                            [0, 1].includes(lifecycle) &&
                              !s.supervisorsAccepted[supervisorIndex],
                          )}
                        </section>
                      )}
                      {view === "overview" && isParty && (
                        <section className="card">
                          <h2>关系里的小事</h2>
                          <p>
                            本月已确认见面 {records?.meetingCount ?? 0} 次 ·
                            下次确认{" "}
                            {records ? date(records.nextConfirmationAt) : "—"}
                          </p>
                          <div className="button-row">
                            <Button
                              disabled={!canWrite || lifecycle !== 2}
                              onClick={() => void run(() => record("meetings"))}
                            >
                              登记 / 确认今天见面
                            </Button>
                            <Button
                              secondary
                              disabled={!canWrite || lifecycle !== 2}
                              onClick={() =>
                                void run(() => record("relationship-checks"))
                              }
                            >
                              发起 / 完成关系确认
                            </Button>
                          </div>
                          <p className="field-hint">
                            一方发起，另一方确认；未完成的记录不计数，不影响资金。
                          </p>
                        </section>
                      )}
                      {["overview", "ended"].includes(view) && isParty && (
                        <section className="card">
                          <h2>好好告别</h2>
                          <div className="button-row">
                            {lifecycle === 2 &&
                              action("提出结束关系", "requestEnd")}
                            {lifecycle === 3 && (
                              <>
                                {action(
                                  "撤回结束请求",
                                  "withdrawEnd",
                                  [s.endRequestId],
                                  same(address!, s.endRequester),
                                )}
                                {action(
                                  "确认结束并各自退款",
                                  "confirmEnd",
                                  [s.endRequestId],
                                  !same(address!, s.endRequester),
                                )}
                              </>
                            )}
                          </div>
                          <p className="field-hint">
                            单方请求不会结算；需要另一方确认同一个请求。
                          </p>
                        </section>
                      )}
                      {["dispute", "jury"].includes(view) && (
                        <section className="card">
                          <h2>
                            {view === "jury"
                              ? "好友监督判断"
                              : "正式确认与失联申诉"}
                          </h2>
                          {isParty &&
                            !model.check &&
                            action(
                              "发起正式确认",
                              "sendCheck",
                              [],
                              [2, 3].includes(lifecycle),
                            )}
                          {model.check && (
                            <>
                              <dl className="facts">
                                <div>
                                  <dt>发起人 / 接收人</dt>
                                  <dd>
                                    {short(model.check.requester)} /{" "}
                                    {short(model.check.respondent)}
                                  </dd>
                                </div>
                                <div>
                                  <dt>正式确认发出</dt>
                                  <dd>{date(model.check.sentAt)}</dd>
                                </div>
                                <div>
                                  <dt>回应截止</dt>
                                  <dd>{date(model.check.deadline)}</dd>
                                </div>
                                <div>
                                  <dt>回应状态</dt>
                                  <dd>
                                    {model.check.respondedAt
                                      ? "及时回应"
                                      : model.check.lateRespondedAt
                                        ? "逾期回应"
                                        : "暂无回应"}
                                  </dd>
                                </div>
                              </dl>
                              {isParty && (
                                <div className="button-row">
                                  {action(
                                    "回应正式确认",
                                    "respond",
                                    [model.check.id],
                                    [2, 3, 4].includes(lifecycle) &&
                                      same(address!, model.check.respondent) &&
                                      !model.check.lateRespondedAt,
                                  )}
                                  {action(
                                    "撤回正式确认",
                                    "withdrawCheck",
                                    [model.check.id],
                                    [2, 3].includes(lifecycle) &&
                                      same(address!, model.check.requester),
                                  )}
                                  {action(
                                    "发起失联申诉",
                                    "openDispute",
                                    [model.check.id],
                                    [2, 3].includes(lifecycle) &&
                                      same(address!, model.check.requester) &&
                                      chainTime > model.check.deadline &&
                                      chainTime <= model.check.claimDeadline,
                                  )}
                                  {action(
                                    "关闭过期确认",
                                    "expireCheck",
                                    [model.check.id],
                                    [2, 3].includes(lifecycle) &&
                                      chainTime > model.check.claimDeadline,
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {currentDispute && (
                            <>
                              <dl className="facts">
                                <div>
                                  <dt>被申诉方</dt>
                                  <dd>{short(currentDispute.respondent)}</dd>
                                </div>
                                <div>
                                  <dt>说明窗口截止</dt>
                                  <dd>{date(currentDispute.appealDeadline)}</dd>
                                </div>
                                <div>
                                  <dt>投票截止</dt>
                                  <dd>{date(currentDispute.voteDeadline)}</dd>
                                </div>
                                <div>
                                  <dt>当前票数</dt>
                                  <dd>
                                    违约 {currentDispute.yesCount} / 否决{" "}
                                    {currentDispute.noCount}
                                  </dd>
                                </div>
                              </dl>
                              <div className="button-row">
                                {isParty &&
                                  action(
                                    "提交好友监督",
                                    "startVoting",
                                    [s.currentDisputeId],
                                    lifecycle === 4 &&
                                      currentDispute.status === "APPEAL" &&
                                      chainTime >
                                        BigInt(currentDispute.appealDeadline) &&
                                      chainTime <=
                                        BigInt(currentDispute.voteDeadline),
                                  )}
                                {supervisorIndex >= 0 && (
                                  <>
                                    {action(
                                      "构成违约",
                                      "vote",
                                      [s.currentDisputeId, true],
                                      lifecycle === 4 &&
                                        currentDispute.status === "VOTING" &&
                                        !currentDispute.votes[
                                          supervisorIndex
                                        ] &&
                                        chainTime <=
                                          BigInt(currentDispute.voteDeadline),
                                    )}
                                    {action(
                                      "不构成违约",
                                      "vote",
                                      [s.currentDisputeId, false],
                                      lifecycle === 4 &&
                                        currentDispute.status === "VOTING" &&
                                        !currentDispute.votes[
                                          supervisorIndex
                                        ] &&
                                        chainTime <=
                                          BigInt(currentDispute.voteDeadline),
                                    )}
                                  </>
                                )}
                                {action(
                                  "投票超时，各自返还",
                                  "finalizeTimeout",
                                  [s.currentDisputeId],
                                  lifecycle === 4 &&
                                    chainTime >
                                      BigInt(currentDispute.voteDeadline),
                                )}
                              </div>
                              {isParty && lifecycle === 4 && (
                                <>
                                  <h3 className="live-subheading">
                                    双方自行达成一致
                                  </h3>
                                  <div className="button-row">
                                    {action(
                                      "提议恢复关系",
                                      "proposeResolution",
                                      [s.currentDisputeId, 0],
                                    )}
                                    {action(
                                      "提议各自退款结束",
                                      "proposeResolution",
                                      [s.currentDisputeId, 1],
                                    )}
                                    {action(
                                      currentDispute.resolutionMode === "RESUME"
                                        ? "同意恢复关系"
                                        : "同意退款结束",
                                      "confirmResolution",
                                      [
                                        s.currentDisputeId,
                                        BigInt(currentDispute.resolutionId),
                                      ],
                                      BigInt(currentDispute.resolutionId) >
                                        0n &&
                                        !same(
                                          address!,
                                          currentDispute.resolutionProposer,
                                        ),
                                    )}
                                  </div>
                                </>
                              )}
                              {isParty &&
                                lifecycle === 4 &&
                                currentDispute.status === "APPEAL" && (
                                  <form
                                    onSubmit={upload}
                                    className="evidence-form"
                                  >
                                    <h3>自愿提交本案说明</h3>
                                    <label>
                                      文字说明（最多 4000 字）
                                      <textarea name="text" rows={4} />
                                    </label>
                                    <label>
                                      或选择图片（JPEG / PNG / WebP，最多 5
                                      MiB）
                                      <input
                                        type="file"
                                        name="file"
                                        accept="image/jpeg,image/png,image/webp"
                                      />
                                    </label>
                                    <p>
                                      接收人：
                                      {[
                                        model.participantA,
                                        model.participantB,
                                        ...model.supervisors,
                                      ]
                                        .map(short)
                                        .join("、")}
                                      。好友只在进入监督后可读；终止后保留 30
                                      天。
                                    </p>
                                    <label className="checkbox">
                                      <input
                                        type="checkbox"
                                        checked={consent}
                                        onChange={(e) =>
                                          setConsent(e.target.checked)
                                        }
                                      />
                                      我主动授权给本次双方和三位监督人
                                    </label>
                                    <Button
                                      type="submit"
                                      disabled={!canWrite || !consent}
                                    >
                                      保存私有材料并预览
                                    </Button>
                                  </form>
                                )}
                              <div className="evidence-list">
                                {caseData.evidence.map((ev: any) => (
                                  <div key={ev.id}>
                                    <span>
                                      {short(ev.owner)} ·{" "}
                                      {ev.registered
                                        ? "已登记摘要"
                                        : "私有草稿"}
                                    </span>
                                    <Button
                                      secondary
                                      disabled={busy}
                                      onClick={() =>
                                        void run(async () => {
                                          const body = await api<any>(
                                            `/situations/${selected}/disputes/${s.currentDisputeId}/evidence/${ev.id}`,
                                          );
                                          setEvidenceBodies((prev) => [
                                            ...prev.filter(
                                              (item) => item.id !== ev.id,
                                            ),
                                            { id: ev.id, ...body },
                                          ]);
                                        })
                                      }
                                    >
                                      查看授权材料
                                    </Button>
                                  </div>
                                ))}
                                {evidenceBodies.map((body, i) => (
                                  <article key={body.id ?? i}>
                                    {body.text?.startsWith("data:image/") ? (
                                      <img
                                        alt="本人上传的证据预览"
                                        src={body.text}
                                      />
                                    ) : body.text ? (
                                      <p>{body.text}</p>
                                    ) : body.contentPath ? (
                                      <img
                                        alt="本案已授权图片"
                                        src={body.contentPath}
                                      />
                                    ) : null}
                                    {body.unregistered &&
                                      action(
                                        "预览无误，登记证据摘要",
                                        "registerEvidence",
                                        [s.currentDisputeId, body.commitment],
                                        lifecycle === 4 &&
                                          currentDispute.status === "APPEAL",
                                      )}
                                  </article>
                                ))}
                              </div>
                            </>
                          )}
                          {!currentDispute && supervisorIndex >= 0 && (
                            <p>本案尚未进入监督阶段，无法查看私人说明。</p>
                          )}
                        </section>
                      )}
                      {[5, 6, 7].includes(lifecycle) && (
                        <section className="card">
                          <h2>
                            {lifecycle === 5
                              ? "关系已终止，部分资金待付"
                              : "关系已经结束"}
                          </h2>
                          <div className="payout-grid">
                            {[model.participantA, model.participantB].map(
                              (a: Address, i: number) => (
                                <div key={a}>
                                  <strong>{short(a)}</strong>
                                  <h2>
                                    {cash(s.entitlement[i])}{" "}
                                    <small>USDC 应得</small>
                                  </h2>
                                  <p>已实际支付 {cash(s.paid[i])} USDC</p>
                                  {lifecycle === 5 &&
                                    s.entitlement[i] > s.paid[i] &&
                                    action(
                                      "重试向原持有人付款",
                                      "retryPayout",
                                      [a],
                                    )}
                                </div>
                              ),
                            )}
                          </div>
                          <p>
                            恢复基金始终归原持有人，结算结果以合约余额与回执为准。
                          </p>
                        </section>
                      )}
                      <details className="chain-details">
                        <summary>钱包与链上详情</summary>
                        <p className="mono">
                          当前钱包：{address}
                          <br />
                          关系合约：{selected}
                          <br />
                          Factory：{settings?.factoryAddress}
                          <br />
                          USDC：{settings?.tokenAddress}
                          <br />
                          Chain ID：{settings?.chainId}
                        </p>
                      </details>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <footer className="live-footer">
            <ShieldCheck />{" "}
            {settings?.chainId === 31337
              ? "本地开发链与测试代币，不代表 Fuji 已验收。"
              : "当前为 Avalanche Fuji 测试网。请只使用测试资产。"}
          </footer>
        </main>
      </div>
    </div>
  );
}
