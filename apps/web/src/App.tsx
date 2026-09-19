import { useEffect, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { Theme, IconButton } from "@radix-ui/themes";
import { WarningCircle, X, CheckCircle } from "@phosphor-icons/react";
import { situationService as service } from "./data/service";
import { DAY, isParticipant, parseMoney } from "./data/types";
import type { DemoAction, Page, Scenario } from "./data/types";
import { getPage, go } from "./ui/presentation";
import { Button } from "./ui/primitives";
import { AppShell } from "./ui/AppShell";
import { DemoControls } from "./ui/DemoControls";
import { VoteDialog } from "./ui/VoteDialog";
import { HomePage } from "./pages/HomePage";
import { RelationshipPage } from "./pages/RelationshipPage";
import { CreatePage } from "./pages/CreatePage";
import { InvitePage } from "./pages/InvitePage";
import { DisputePage } from "./pages/DisputePage";
import { JuryPage } from "./pages/JuryPage";
import { EndedPage } from "./pages/EndedPage";
export default function App() {
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot);
  const connection = useSyncExternalStore(
    service.subscribe,
    service.getConnectionSnapshot,
  );
  const { situation: s, role, now } = state;
  const t = s.terms;
  const [page, setPage] = useState(getPage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [controls, setControls] = useState(false);
  const [consent, setConsent] = useState(false);
  const [voteChoice, setVoteChoice] = useState<boolean | null>(null);
  const [presentation, setPresentation] = useState(
    new URLSearchParams(location.search).get("present") === "1",
  );
  const participant = isParticipant(role);
  const idx = role === "a" ? 0 : 1;
  const roleName = participant ? s.names[idx] : s.friends[Number(role[1])];
  const days = s.activatedAt
    ? Math.max(0, Math.floor((now - s.activatedAt) / DAY))
    : 0;
  useEffect(() => {
    void service.initialize();
  }, []);
  useEffect(() => {
    const change = () => {
      setPage(getPage());
      setError("");
      setConsent(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setControls(false);
        setVoteChoice(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  async function act(action: DemoAction, next?: Page) {
    setBusy(true);
    setError("");
    try {
      const result = await service.dispatch(action);
      setToast(action.type === "role" ? "已切换演示身份" : "演示状态已更新");
      if (next) go(next);
      else if (
        result.situation.stage === "ended" &&
        !["role", "scenario", "advance"].includes(action.type)
      )
        go("ended");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试");
    } finally {
      setBusy(false);
    }
  }
  const actionButton = (
    label: string,
    action: DemoAction,
    enabled = true,
    secondary = false,
    next?: Page,
  ) => (
    <Button
      secondary={secondary}
      disabled={busy || !enabled}
      onClick={() => void act(action, next)}
    >
      {label}
    </Button>
  );
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? "").trim();
    try {
      await act(
        {
          type: "create",
          names: [value("nameA"), value("nameB")],
          friends: [value("friendA"), value("friendB"), value("friendC")],
          terms: {
            ghostDays: Number(value("ghostDays")),
            meetings: Number(value("meetings")),
            confirmationDays: Number(value("confirmationDays")),
            recovery: parseMoney(value("recovery")),
            bond: parseMoney(value("bond")),
          },
        },
        "invite",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeScene(scene: Scenario) {
    void act(
      { type: "scenario", scenario: scene },
      (
        {
          active: "relationship",
          invite: "invite",
          dispute: "jury",
          ended: "ended",
        } as const
      )[scene],
    );
    setControls(false);
  }
  async function connectBackend() {
    setBusy(true);
    setError("");
    try {
      await service.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : "钱包或后台连接失败");
    } finally {
      setBusy(false);
    }
  }
  if (service.mode === "api" && connection.phase !== "ready") {
    const canConnect = connection.phase === "needs-auth";
    return (
      <Theme
        className="demo-theme"
        appearance="light"
        accentColor="grass"
        grayColor="sand"
        radius="medium"
        scaling="100%"
        panelBackground="solid"
      >
        <main className="backend-gate">
          <section className="card backend-card" aria-live="polite">
            <WarningCircle size={28} />
            <p className="eyebrow">SITUATIONSHIT / BACKEND</p>
            <h1>连接真实后台</h1>
            <p>{connection.message}</p>
            {error && <p className="alert">{error}</p>}
            {canConnect && (
              <Button onClick={() => void connectBackend()} disabled={busy}>
                {busy ? "连接中…" : "连接钱包并登录"}
              </Button>
            )}
            <Button
              secondary
              disabled={busy}
              onClick={() => void service.initialize()}
            >
              重新检查后台
            </Button>
            <p className="tiny muted">
              登录使用 SIWE，会请求钱包签名；不会向后台发送私钥，也不会自动发起资金交易。
            </p>
          </section>
        </main>
      </Theme>
    );
  }
  const pageProps = {
    s,
    t,
    role,
    now,
    busy,
    participant,
    idx,
    roleName,
    days,
    consent,
    setConsent,
    setVoteChoice,
    actionButton,
    create,
    changeScene,
  };
  return (
    <Theme
      className="demo-theme"
      appearance="light"
      accentColor="grass"
      grayColor="sand"
      radius="medium"
      scaling="100%"
      panelBackground="solid"
    >
      <AppShell page={page} stage={s.stage} roleName={roleName}>
        {error && (
          <div className="alert" role="alert">
            <WarningCircle size={20} />
            {error}
            <IconButton
              variant="ghost"
              aria-label="关闭错误"
              onClick={() => setError("")}
            >
              <X />
            </IconButton>
          </div>
        )}
        {service.recoveryMessage && (
          <p className="alert">{service.recoveryMessage}</p>
        )}
        {page === "home" && <HomePage {...pageProps} />}
        {page === "relationship" && <RelationshipPage {...pageProps} />}
        {page === "create" && <CreatePage {...pageProps} />}
        {page === "invite" && <InvitePage {...pageProps} />}
        {page === "dispute" && <DisputePage {...pageProps} />}
        {page === "jury" && <JuryPage {...pageProps} />}
        {page === "ended" && <EndedPage {...pageProps} />}
      </AppShell>
      <DemoControls
        {...{
          presentation,
          setPresentation,
          controls,
          setControls,
          role,
          busy,
          s,
          act,
          changeScene,
          actionButton,
          now,
        }}
      />
      <VoteDialog
        choice={voteChoice}
        onClose={() => setVoteChoice(null)}
        onConfirm={(choice) => {
          setVoteChoice(null);
          void act({ type: "vote", breach: choice });
        }}
      />
      {(toast || busy) && (
        <div className="toast" role="status">
          {busy ? <span className="spinner" /> : <CheckCircle size={18} />}{" "}
          {busy ? "正在更新演示…" : toast}
        </div>
      )}
    </Theme>
  );
}
