import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useConnection,
  useWalletClient,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import {
  SituationFactoryAbi as F,
  SituationAgreementAbi as A,
} from "../../../../packages/shared/src/index";
import { reconcileLocalSession } from "./session";
import { parseUnits, createPublicClient, http } from "viem";
import type { Address, Abi } from "viem";
import { hardhat, avalancheFuji } from "viem/chains";
import {
  FUJI,
  documentSchema,
  hashDocument,
  assertPublicAgreement,
  same,
} from "../../../../packages/shared/src/index";
import type { AgreementDocument } from "../../../../packages/shared/src/index";
import { localWalletEnabled, localAccounts } from "./localWallet";
import { localRpc } from "./WalletProviders";
import { api as requestApi } from "./api";
import { verifyEvidence } from "./verifyEvidence";
import { Button } from "../ui/primitives";
import type { Hex } from "viem";

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
  situation?: Address;
  target?: Address;
}

const randomHash = () =>
  ("0x" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("")) as Hex;

export function useLiveController() {
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
  const identity = `${address ?? ""}:${chainId ?? ""}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const assertIdentity = () => {
    if (identityRef.current !== identity)
      throw Error("钱包已切换，请重新登录后查看");
  };
  async function api<T = any>(
    path: string,
    body?: unknown,
    method?: string,
  ): Promise<T> {
    assertIdentity();
    const value = await requestApi<T>(path, body, method);
    assertIdentity();
    return value;
  }
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
  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(
      () => setClock(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const now = BigInt(clock);
  useEffect(() => {
    requestApi<PublicConfig>("/config")
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
      setBusy(false);
      setStatus("");
      setError("");
      setConsent(false);
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
      assertIdentity();
      setStatus("已核对最新结果");
    } catch (e) {
      if (identityRef.current !== identity) return;
      const err = e as any;
      setError(err.shortMessage ?? err.message ?? "操作未完成");
      if (err.status === 401) setSignedIn(false);
      setStatus("");
    } finally {
      if (identityRef.current === identity) setBusy(false);
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
    assertIdentity();
    if (document) assertPublicAgreement(document, next);
    setEvidenceBodies([]);
    setModel(next);
    setSelected(target);
    const party =
      address && (same(address, participantA) || same(address, participantB));
    if (party) {
      try {
        setRecords(await api("/situations/" + target));
      } catch (e) {
        if ((e as any).status !== 410) throw e;
        assertIdentity();
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
        assertIdentity();
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
    assertIdentity();
    if (!address || !same(address, p.account))
      throw Error("请使用提交交易的钱包查询");
    if (!client || !settings || p.chainId !== settings.chainId)
      throw Error("待确认交易属于其他网络");
    const receipt = await client.waitForTransactionReceipt({
      hash: p.hash,
      timeout: 60000,
    });
    assertIdentity();
    if (!same(receipt.from, p.account) || (p.target && (!receipt.to || !same(receipt.to, p.target))))
      throw Error("交易回执的钱包或目标与待确认记录不一致");
    if (receipt.status !== "success") {
      savePending(null);
      throw Error("链上交易已回滚，状态没有改变");
    }
    if (p.kind === "create" && p.draftId) {
      await api(`/agreements/${p.draftId}/link`, { txHash: p.hash });
      await loadAgreement(p.draftId);
    } else if (p.situation ?? selected)
      await readSituation(
        (p.situation ?? selected)!,
        p.situation && p.situation !== selected ? null : draft,
      );
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
      situation: selected,
      target,
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
  async function record(
    kind: "meetings" | "relationship-checks",
    meetingDate = new Date().toISOString().slice(0, 10),
  ) {
    if (!selected) throw Error("先选择关系");
    const path = `/situations/${selected}`;
    const month = meetingDate.slice(0, 7);
    const data = await api<any>(path + "/records?month=" + month);
    const pending =
      kind === "meetings"
        ? data.meetings.find(
            (r: any) => r.date === meetingDate && !r.confirmedAt,
          )
        : data.relationshipChecks.find((r: any) => !r.confirmedAt);
    if (pending) {
      if (same(pending.proposer, address!)) throw Error("等待另一方确认");
      await api(`${path}/${kind}/${pending.id}/confirm`, {});
    } else
      await api(
        `${path}/${kind}`,
        kind === "meetings" ? { date: meetingDate } : {},
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
  async function loadEvidence(ev: any) {
    if (!selected || !s || !settings || !client) throw Error("请先选择争议");
    const body = await api<any>(
      `/situations/${selected}/disputes/${s.currentDisputeId}/evidence/${ev.id}`,
    );
    const verified = await verifyEvidence(body, {
      chainId: settings.chainId,
      situation: selected,
      target,
      disputeId: s.currentDisputeId,
      owner: ev.owner,
      commitment: ev.commitment,
    });
    if (ev.registered) {
      const dispute = await client.readContract({
        address: selected,
        abi: A,
        functionName: "getDispute",
        args: [s.currentDisputeId],
      });
      const count =
        dispute.evidenceCounts[same(ev.owner, model.participantA) ? 0 : 1];
      let found = false;
      for (let i = 0; i < count; i++) {
        const onChain = await client.readContract({
          address: selected,
          abi: A,
          functionName: "getEvidence",
          args: [s.currentDisputeId, ev.owner, i],
        });
        if (same(onChain, ev.commitment)) found = true;
      }
      if (!found) throw Error("证据摘要尚未登记在当前案件");
    }
    assertIdentity();
    setEvidenceBodies((prev) => [
      ...prev.filter((item) => item.id !== ev.id),
      { id: ev.id, ...verified },
    ]);
  }
  const currentDispute = caseData?.dispute;
  const canWrite =
    signedIn &&
    isConnected &&
    settings?.chainId === chainId &&
    !busy &&
    !pending;
  const chainTime = model?.chainTime > now ? model.chainTime : now;
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

  return {
    view,
    setView,
    signedIn,
    error,
    setError,
    status,
    isConnected,
    address,
    busy,
    connectors,
    settings,
    run,
    connectAsync,
    chainId,
    switchChainAsync,
    wallet,
    login,
    disconnect,
    setSignedIn,
    devAccounts,
    pending,
    confirmed,
    create,
    canWrite,
    list,
    refresh,
    selected,
    openRow,
    model,
    s,
    lifecycle,
    draft,
    action,
    transaction,
    participantIndex,
    draftId,
    isParty,
    supervisorIndex,
    records,
    record,
    chainTime,
    currentDispute,
    caseData,
    loadEvidence,
    evidenceBodies,
    upload,
    consent,
    setConsent,
    setEvidenceBodies,
  };
}
export type LiveController = ReturnType<typeof useLiveController>;
