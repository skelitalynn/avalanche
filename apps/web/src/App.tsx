import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Heart,
  House,
  LockSimple,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkle,
  UsersThree,
  Wallet,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { situationService as service } from "./data/service";
import { DAY, isParticipant, money, parseMoney } from "./data/types";
import type { DemoAction, Page, Role, Scenario } from "./data/types";
const pages: Page[] = [
  "home",
  "create",
  "invite",
  "relationship",
  "dispute",
  "jury",
  "ended",
];
const getPage = (): Page => {
  const p = location.hash.replace("#/", "") as Page;
  return pages.includes(p) ? p : "home";
};
const go = (page: Page) => {
  location.hash = `/${page}`;
};
const date = (n?: number) =>
  n
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
        hour12: false,
      }).format(n)
    : "尚未开始";
const day = (n: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(n);
const labels = {
  invited: "待接受",
  funding: "待存入资金",
  active: "进行中",
  ending: "待双方结束",
  appeal: "说明窗口",
  voting: "好友监督中",
  ended: "已结束",
};
function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`button ${secondary ? "secondary" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Pill({
  children,
  green = false,
}: {
  children: ReactNode;
  green?: boolean;
}) {
  return (
    <span className={`pill ${green ? "green" : ""}`}>
      <span className="dot" />
      {children}
    </span>
  );
}
function Avatar({
  name,
  second = false,
  small = false,
}: {
  name: string;
  second?: boolean;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${second ? "mint" : ""} ${small ? "small" : ""}`}>
      {name.slice(-1)}
    </span>
  );
}
function Empty({
  title,
  children,
  target = "relationship",
}: {
  title: string;
  children: ReactNode;
  target?: Page;
}) {
  return (
    <section className="card empty">
      <ShieldCheck size={44} weight="light" />
      <h2>{title}</h2>
      <p>{children}</p>
      <Button onClick={() => go(target)}>
        查看关系 <ArrowRight />
      </Button>
    </section>
  );
}
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
  const modalRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    if (voteChoice === null) return;
    const previous = document.activeElement as HTMLElement | null;
    const buttons =
      modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !buttons?.length) return;
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [voteChoice]);
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
      <div className="backend-gate">
        <section className="card backend-card" aria-live="polite">
          <span className="brand-icon">
            <Heart weight="fill" size={28} />
          </span>
          <p className="eyebrow">SITUATIONSHIT / BACKEND</p>
          <h1>连接真实后台</h1>
          <p>{connection.message}</p>
          {error && <p className="alert">{error}</p>}
          {canConnect && (
            <Button onClick={() => void connectBackend()} disabled={busy}>
              {busy ? "连接中…" : "连接钱包并登录"} <ArrowRight />
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
      </div>
    );
  }
  const rules = (
    <div className="rules">
      <div>
        <span className="icon-box">
          <Clock />
        </span>
        <div>
          <strong>{t.ghostDays} 天内，给彼此一个回应</strong>
          <p>正式确认后超过期限，可发起失联申诉</p>
        </div>
        <span className="rule-number">01</span>
      </div>
      <div>
        <span className="icon-box">
          <CalendarBlank />
        </span>
        <div>
          <strong>每月至少 {t.meetings} 次，好好见面</strong>
          <p>见面由双方确认，记录属于你们的时刻</p>
        </div>
        <span className="rule-number">02</span>
      </div>
      <div>
        <span className="icon-box">
          <Heart />
        </span>
        <div>
          <strong>每 {t.confirmationDays} 天，确认一次心意</strong>
          <p>停下来聊聊，我们是不是还在同一页</p>
        </div>
        <span className="rule-number">03</span>
      </div>
    </div>
  );
  const funds = (
    <div className="fund-grid">
      <div className="fund">
        <span>
          <span className="icon-box">
            <Wallet />
          </span>
          恢复基金 <LockSimple size={14} />
        </span>
        <h3>
          {money(t.recovery)} <small>USDC / 人</small>
        </h3>
        <p>无论如何结束，始终属于你自己。</p>
      </div>
      <div className="fund">
        <span>
          <span className="icon-box rose">
            <ShieldCheck />
          </span>
          承诺保证金
        </span>
        <h3>
          {money(t.bond)} <small>USDC / 人</small>
        </h3>
        <p>正常结束返还；违约后交给另一方。</p>
      </div>
    </div>
  );
  const nav = [
    { p: "relationship" as Page, label: "我们的关系", icon: Heart },
    { p: "invite" as Page, label: "共同的约定", icon: Copy },
    { p: "dispute" as Page, label: "确认与申诉", icon: ShieldCheck },
    { p: "jury" as Page, label: "好友监督", icon: UsersThree },
    { p: "ended" as Page, label: "关系结算", icon: Wallet },
  ];
  const journey = [
    "填写约定",
    "资金与好友",
    "双方签署",
    "存入资金",
    "关系已建立",
  ];
  const journeyStep =
    page === "create"
      ? 0
      : page === "invite"
        ? s.stage === "invited"
          ? 2
          : s.stage === "funding"
            ? 3
            : 4
        : 4;
  return (
    <div className={`app ${page === "home" ? "landing-app" : ""}`}>
      <a className="skip-link" href="#content">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <a href="#/home" className="brand">
          <span className="brand-icon">
            <Heart weight="fill" size={24} />
          </span>
          <span>
            Situation<span className="brand-em">SHIT</span>
            <small>认真一点，也轻松一点。</small>
          </span>
        </a>
        <div className="side-label">OUR LITTLE SPACE</div>
        <nav aria-label="主要导航">
          {nav.map(({ p, label, icon: Icon }) => (
            <a key={p} href={`#/${p}`} className={page === p ? "selected" : ""}>
              <Icon size={21} weight={page === p ? "fill" : "regular"} />
              {label}
              {p === "relationship" && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <a className="new-link" href="#/create">
          <Plus size={18} /> 开始一段关系
        </a>
        <div className="side-bottom">
          <div className="privacy-note">
            <ShieldCheck size={22} />
            <strong>你的私事，还是私事。</strong>
            <p>
              只有必要的信息，
              <br />
              才会在争议时交给好友。
            </p>
          </div>
          <div className="powered">
            <span className="avalanche-mark">▲</span> Built on Avalanche{" "}
            <span>↗</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <a className="mobile-brand" href="#/home">
            Situation<span>SHIT</span> <b>↗</b>
          </a>
          <div className="breadcrumb">
            OUR SITUATION <span>/</span>{" "}
            <b>
              {page === "home"
                ? "好好相处，从约定开始"
                : page === "create"
                  ? "新的开始"
                  : nav.find((n) => n.p === page)?.label}
            </b>
          </div>
          <div className="top-actions">
            <span className="demo-badge">
              <span />
              {service.mode === "api" ? "后台已连接" : "演示模式 · 模拟数据"}
            </span>
            <span className="account">
              <Avatar name={roleName} small />
              {service.mode === "api" && connection.account
                ? `${connection.account.slice(0, 6)}…${connection.account.slice(-4)}`
                : roleName}
            </span>
          </div>
        </header>
        {page !== "home" && (
          <nav className="journey" aria-label="建立关系进度">
            <ol>
              {journey.map((label, index) => (
                <li
                  key={label}
                  className={
                    index === journeyStep
                      ? "current"
                      : index < journeyStep
                        ? "complete"
                        : ""
                  }
                  aria-current={index === journeyStep ? "step" : undefined}
                >
                  <span>{index < journeyStep ? "✓" : index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <main id="content" tabIndex={-1}>
          {error && (
            <div className="alert" role="alert">
              <WarningCircle size={20} />
              {error}
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X />
              </button>
            </div>
          )}
          {service.recoveryMessage && (
            <p className="alert">{service.recoveryMessage}</p>
          )}
          {page === "home" && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    <span /> A LITTLE MORE CERTAINTY
                  </span>
                  <h1>
                    关系可以慢慢来。
                    <br />
                    认真，<span>可以先说好。</span>
                  </h1>
                  <p className="hero-description">
                    给还没定义的关系，一点确定感。
                    <br />
                    把期待说清楚，让承诺有分量，
                    <br />
                    也为每一种结局，留一份温柔。
                  </p>
                  <div className="button-row">
                    <Button onClick={() => go("create")}>
                      开始一段关系 <ArrowUpRight size={20} />
                    </Button>
                    <Button secondary onClick={() => go("invite")}>
                      我收到邀请了 <ArrowRight />
                    </Button>
                  </div>
                  <div className="hero-foot">
                    <ShieldCheck size={17} /> 两个人的约定 · 三位好友见证 ·
                    你的基金始终属于你
                  </div>
                </div>
                <div
                  className="hero-image hero-art"
                  role="img"
                  aria-label="两个相互靠近的抽象人物"
                >
                  <span className="orb orb-one" />
                  <span className="orb orb-two" />
                  <Heart className="art-heart" size={46} />
                  <span className="photo-label">FOR THE TWO OF US.</span>
                  <div className="photo-caption">你怎么想？我们聊聊。</div>
                </div>
              </section>
              <section className="landing-bottom">
                <div>
                  <span className="eyebrow">HOW WE CARE</span>
                  <h2>认真相处，也好好保护自己。</h2>
                </div>
                <div className="benefit">
                  <span>01</span>
                  <strong>把期待说清楚</strong>
                  <p>
                    回应、见面、关系确认。
                    <br />
                    提前写下你们认同的相处方式。
                  </p>
                </div>
                <div className="benefit">
                  <span>02</span>
                  <strong>给承诺一点分量</strong>
                  <p>
                    各自存入恢复基金与保证金，
                    <br />
                    用一致的行动回应共同的选择。
                  </p>
                </div>
                <div className="benefit">
                  <span>03</span>
                  <strong>为结束留一份体面</strong>
                  <p>
                    正常结束，各自返还。
                    <br />
                    出现争议，请信任的好友判断。
                  </p>
                </div>
              </section>
              <button
                className="text-button preview-link"
                onClick={() => changeScene("active")}
              >
                先看看，一段关系会是什么样子 <ArrowRight />
              </button>
            </>
          )}
          {page === "relationship" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A PROMISE, EVERY DAY</span>
                  <h1>
                    我们的关系<span className="heading-dot">.</span>
                  </h1>
                  <p>不用急着定义，但每一份认真都值得被看见。</p>
                </div>
                <span className="date-label">
                  <CalendarBlank />
                  {day(now)}，今天也好好相处
                </span>
              </div>
              <div className="dashboard-grid">
                <div className="main-column">
                  <section className="relationship-card">
                    <div className="card-top">
                      <span className="relationship-tag">
                        OUR SITUATION / {s.id}
                      </span>
                      <Pill green={s.stage === "active"}>
                        {labels[s.stage]}
                      </Pill>
                    </div>
                    <div className="couple">
                      <Avatar name={s.names[0]} />
                      <span className="heart-connector">
                        <Heart weight="fill" />
                      </span>
                      <Avatar name={s.names[1]} second />
                      <div>
                        <h2>
                          {s.names[0]} <span>&</span> {s.names[1]}
                        </h2>
                        <p>没有标准答案，只有我们自己的约定。</p>
                      </div>
                    </div>
                    <div className="relationship-footer">
                      <div>
                        <span>一起走过</span>
                        <strong>
                          {days}
                          <small> 天</small>
                        </strong>
                      </div>
                      <div className="relationship-quote">
                        “ 不用猜，我们可以好好说。 ”
                      </div>
                      <Heart className="large-heart" size={126} weight="thin" />
                    </div>
                  </section>
                  <section className="card">
                    <div className="section-title">
                      <h2>我们的约定</h2>
                      <button
                        className="text-button"
                        onClick={() => go("invite")}
                      >
                        查看完整协议 <ArrowUpRight />
                      </button>
                    </div>
                    {rules}
                    <div className="commitment-actions">
                      <div>
                        <span>
                          {s.meetingCount} / {t.meetings} 次见面
                        </span>
                        <div className="progress">
                          <i
                            style={{
                              width: `${Math.min(100, t.meetings ? (s.meetingCount / t.meetings) * 100 : 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      {s.meetingPending
                        ? actionButton(
                            s.meetingRequester === role
                              ? "等待对方确认见面"
                              : "确认这次见面",
                            { type: "confirm-meeting" },
                            participant && role !== s.meetingRequester,
                            true,
                          )
                        : actionButton(
                            "记一次见面",
                            { type: "meeting" },
                            participant && s.stage === "active",
                            true,
                          )}
                    </div>
                  </section>
                  <section>
                    <div className="section-title">
                      <h2>为彼此，也为自己</h2>
                      <span className="muted tiny">每人的共同约定</span>
                    </div>
                    {funds}
                  </section>
                </div>
                <div className="aside-column">
                  <section className="card checkin-card">
                    <span className="icon-box rose">
                      <Heart weight="fill" />
                    </span>
                    <span className="eyebrow">NEXT CHECK-IN</span>
                    <h2>
                      再确认一次，
                      <br />
                      我们还在同一页。
                    </h2>
                    <p>
                      下次关系确认{" "}
                      <strong>
                        {day(s.confirmedAt + t.confirmationDays * DAY)}
                      </strong>
                    </p>
                    {actionButton(
                      s.confirmationRequester
                        ? s.confirmationRequester === role
                          ? "等待对方确认心意"
                          : "我也选择继续"
                        : "我想继续，确认心意",
                      { type: "relationship-check" },
                      participant &&
                        s.stage === "active" &&
                        s.confirmationRequester !== role,
                    )}
                    <span className="tiny muted">
                      只有双方确认，才会更新这次记录
                    </span>
                  </section>
                  <section className="card">
                    <div className="section-title">
                      <h2>我们信任的人</h2>
                      <UsersThree size={20} />
                    </div>
                    <div className="friends">
                      {s.friends.map((f, i) => (
                        <div key={i}>
                          <Avatar name={f} second={i === 1} small />
                          <strong>{f}</strong>
                          <span>
                            {["我的好友", "TA 的好友", "共同好友"][i]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="privacy-inline">
                      <LockSimple />
                      平时看不到你们的私人记录
                    </p>
                  </section>
                  <section className="card activity-card">
                    <h2>关系里的小事</h2>
                    <div className="timeline">
                      {s.activities.slice(0, 3).map((a, i) => (
                        <div key={`${a.at}-${i}`}>
                          <span className="timeline-dot" />
                          <span className="tiny muted">{day(a.at)}</span>
                          <strong>{a.title}</strong>
                          <p>{a.detail}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
              <div className="bottom-actions">
                <span>
                  <LockSimple />
                  认真地继续，也可以体面地结束。
                </span>
                <div>
                  {["invited", "funding"].includes(s.stage) ? (
                    <Button onClick={() => go("invite")}>继续完成约定</Button>
                  ) : s.stage === "ended" ? (
                    <Button onClick={() => go("ended")}>查看结算结果</Button>
                  ) : (
                    <>
                      {s.stage === "ending"
                        ? actionButton(
                            s.endRequester === role
                              ? "等待对方确认结束"
                              : "确认结束关系",
                            { type: "confirm-end" },
                            participant && s.endRequester !== role,
                            true,
                          )
                        : actionButton(
                            "提出结束关系",
                            { type: "request-end" },
                            participant && s.stage === "active",
                            true,
                          )}
                      <Button secondary onClick={() => go("dispute")}>
                        正式确认 / 申诉 <ArrowRight />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {page === "create" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">LET’S MAKE IT CLEAR</span>
                  <h1>把我们的约定，写下来。</h1>
                  <p>不用很复杂。只是先说好，怎么对彼此认真。</p>
                </div>
                <span className="step-label">
                  01 约定 <span>— 02 签署 — 03 存入</span>
                </span>
              </div>
              <form onSubmit={create} className="form-layout">
                <div className="card form-card">
                  <h2>
                    <span className="number">01</span>先认识一下你们
                  </h2>
                  <div className="form-grid">
                    <label>
                      你的昵称
                      <input
                        name="nameA"
                        maxLength={12}
                        required
                        placeholder="例如：小夏"
                        defaultValue="小夏"
                      />
                    </label>
                    <label>
                      对方的昵称
                      <input
                        name="nameB"
                        maxLength={12}
                        required
                        placeholder="例如：一帆"
                        defaultValue="一帆"
                      />
                    </label>
                  </div>
                  <h2>
                    <span className="number">02</span>你们期待的相处方式
                  </h2>
                  <div className="form-grid three">
                    <label>
                      多久未回应算失联
                      <div className="input-unit">
                        <input
                          name="ghostDays"
                          type="number"
                          min="1"
                          max="30"
                          required
                          defaultValue="7"
                        />
                        <span>天</span>
                      </div>
                    </label>
                    <label>
                      每月至少见面
                      <div className="input-unit">
                        <input
                          name="meetings"
                          type="number"
                          min="0"
                          max="31"
                          required
                          defaultValue="2"
                        />
                        <span>次</span>
                      </div>
                    </label>
                    <label>
                      多久确认一次关系
                      <div className="input-unit">
                        <input
                          name="confirmationDays"
                          type="number"
                          min="1"
                          max="90"
                          required
                          defaultValue="7"
                        />
                        <span>天</span>
                      </div>
                    </label>
                  </div>
                  <p className="field-hint">
                    失联判断从正式确认发出后开始；见面和定期确认仅作共同记录与提醒。
                  </p>
                  <h2>
                    <span className="number">03</span>给彼此的安全感
                  </h2>
                  <div className="form-grid">
                    <label>
                      恢复基金 · 每人
                      <div className="input-unit">
                        <input
                          name="recovery"
                          inputMode="decimal"
                          required
                          defaultValue="50"
                        />
                        <span>USDC</span>
                      </div>
                      <small>始终属于本人，结束时返还。</small>
                    </label>
                    <label>
                      承诺保证金 · 每人
                      <div className="input-unit">
                        <input
                          name="bond"
                          inputMode="decimal"
                          required
                          defaultValue="20"
                        />
                        <span>USDC</span>
                      </div>
                      <small>正常结束返还，违约后转给另一方。</small>
                    </label>
                  </div>
                  <h2>
                    <span className="number">04</span>邀请三位信任的好友
                  </h2>
                  <div className="form-grid three">
                    {["你的好友", "对方的好友", "共同好友"].map((label, i) => (
                      <label key={label}>
                        {label}
                        <input
                          name={["friendA", "friendB", "friendC"][i]}
                          maxLength={12}
                          required
                          defaultValue={["阿宁", "许乐", "乔乔"][i]}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="field-hint">
                    这里填写演示昵称。真实接入后将绑定独立的钱包身份，并分别接受邀请。
                  </p>
                  <div className="form-submit">
                    <span>
                      <LockSimple />
                      约定经双方签署后锁定
                    </span>
                    <Button type="submit" disabled={busy}>
                      生成模拟邀请 <ArrowRight />
                    </Button>
                  </div>
                </div>
                <aside className="form-aside">
                  <span className="icon-box rose">
                    <Sparkle size={26} />
                  </span>
                  <h2>
                    关系的答案，
                    <br />
                    由你们一起写。
                  </h2>
                  <p>
                    约定不是考卷。
                    <br />
                    它只是让彼此知道，
                    <br />
                    这段关系里，什么对你很重要。
                  </p>
                  <hr />
                  <div>
                    <CheckCircle /> 双方看到相同的完整协议
                  </div>
                  <div>
                    <CheckCircle /> 三位好友接受后才能入金
                  </div>
                  <div>
                    <CheckCircle /> 恢复基金不会成为违约罚金
                  </div>
                  <div className="note-box">
                    当前为本机演示。创建邀请、签署和存入均为模拟操作，不会转移真实资金。
                  </div>
                </aside>
              </form>
            </>
          )}
          {page === "invite" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">OUR SITUATION AGREEMENT</span>
                  <h1>一份只属于你们的约定。</h1>
                  <p>看清楚，再一起说好。签署后，规则将保持不变。</p>
                </div>
                <Pill>{labels[s.stage]}</Pill>
              </div>
              <div className="agreement-layout">
                <section className="card agreement">
                  <div className="agreement-head">
                    <Heart weight="fill" size={26} />
                    <span>Situation Agreement</span>
                    <small>{s.id} · 演示协议</small>
                  </div>
                  <h2>
                    {s.names[0]} <span>&</span> {s.names[1]}
                  </h2>
                  <p className="muted">我们愿意，对这段关系认真一点。</p>
                  {rules}
                  {funds}
                  <div className="agreement-guardians">
                    <UsersThree />
                    <div>
                      <strong>由 {s.friends.join("、")} 一起见证</strong>
                      <p>
                        仅争议时查看必要信息。三人中两票构成违约才转移保证金；两票否决或超时则各自返还。
                      </p>
                    </div>
                  </div>
                  <div className="signatures">
                    {s.names.map((name, i) => (
                      <div key={i}>
                        <span>PARTNER {i ? "B" : "A"}</span>
                        <strong>{name}</strong>
                        <small>
                          {i === 0 || s.stage !== "invited" ? (
                            <>
                              <CheckCircle weight="fill" /> 已模拟签署
                            </>
                          ) : (
                            "等待查看并签署"
                          )}
                        </small>
                      </div>
                    ))}
                  </div>
                </section>
                <aside>
                  <section className="card signing-card">
                    <span className="icon-box rose">
                      <Copy />
                    </span>
                    <h2>
                      {s.stage === "invited"
                        ? "准备好，一起开始？"
                        : s.stage === "funding"
                          ? "最后一步，存入安心。"
                          : "我们已经说好了。"}
                    </h2>
                    <p>
                      当前身份：{roleName}
                      <br />
                      每人存入 {money(t.recovery + t.bond)} USDC
                    </p>
                    {s.stage === "invited" ? (
                      <>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                          />
                          我已阅读，并同意这份约定
                        </label>
                        {actionButton(
                          role === "b"
                            ? "接受并模拟签署"
                            : "等待对方接受并签署",
                          { type: "accept" },
                          role === "b" && consent,
                        )}
                        <p className="tiny muted">
                          请在演示控制中切换为 {s.names[1]}，体验受邀方签署。
                        </p>
                      </>
                    ) : s.stage === "funding" ? (
                      <>
                        <div className="deposit-list">
                          {s.names.map((name, i) => (
                            <div key={i}>
                              <span>{name}</span>
                              <strong>
                                {s.funded[i] ? "已模拟存入" : "等待存入"}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <p className="field-hint">
                          {s.supervisors.every(Boolean)
                            ? "三位好友已接受监督邀请"
                            : "需三位好友接受。可在演示控制中模拟接受。"}
                        </p>
                        {actionButton(
                          s.funded[idx]
                            ? "你已完成模拟存入"
                            : "模拟存入 " +
                                money(t.recovery + t.bond) +
                                " USDC",
                          { type: "deposit" },
                          participant &&
                            s.supervisors.every(Boolean) &&
                            !s.funded[idx],
                        )}
                      </>
                    ) : (
                      <Button onClick={() => go("relationship")}>
                        回到我们的关系 <ArrowRight />
                      </Button>
                    )}
                    <div className="note-box">
                      <LockSimple />
                      好友不会看到日常聊天、照片与位置。此演示邀请仅保存在当前浏览器。
                    </div>
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === "dispute" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SPACE FOR A RESPONSE</span>
                  <h1>先给回应，留一点时间。</h1>
                  <p>从一次正式确认开始，让每一步都有清楚的依据。</p>
                </div>
                <Pill>{s.check ? labels[s.stage] : "尚未发起"}</Pill>
              </div>
              {!s.check ? (
                <div className="dispute-layout">
                  <section className="card start-check">
                    <span className="icon-box rose big">
                      <Clock size={34} />
                    </span>
                    <h2>想知道，对方还在吗？</h2>
                    <p>
                      发送正式确认后，对方有 <strong>{t.ghostDays} 天</strong>
                      时间回应。
                      <br />
                      超过约定期限，你才可以发起失联申诉。
                    </p>
                    <div className="notice">
                      <ShieldCheck />{" "}
                      正式确认不是违约裁决；资金不会因此发生变化。
                    </div>
                    {actionButton(
                      "发起正式确认",
                      { type: "send-check" },
                      participant && ["active", "ending"].includes(s.stage),
                    )}
                  </section>
                  <section className="card">
                    <h2>先沟通，再判断</h2>
                    <ol className="process-list">
                      <li>
                        <strong>正式确认</strong>
                        <p>明确发送时间与回应期限</p>
                      </li>
                      <li>
                        <strong>48 小时说明窗口</strong>
                        <p>逾期申诉后，给彼此解释的机会</p>
                      </li>
                      <li>
                        <strong>72 小时好友判断</strong>
                        <p>两票认定才会转移违约方保证金</p>
                      </li>
                    </ol>
                  </section>
                </div>
              ) : (
                <div className="dispute-layout">
                  <section className="card">
                    <div className="section-title">
                      <h2>失联确认记录</h2>
                      <span className="tiny muted">{s.id} / 01</span>
                    </div>
                    <div className="dispute-summary">
                      <span className="icon-box rose">
                        <Clock />
                      </span>
                      <div>
                        <h3>
                          {s.names[s.check.requester === "a" ? 0 : 1]}{" "}
                          发起了正式确认
                        </h3>
                        <p>约定：{t.ghostDays} 天未回应，可发起失联申诉</p>
                      </div>
                    </div>
                    <dl className="facts">
                      <div>
                        <dt>正式确认发出</dt>
                        <dd>{date(s.check.sentAt)}</dd>
                      </div>
                      <div>
                        <dt>约定回应期限</dt>
                        <dd>{date(s.check.deadline)}</dd>
                      </div>
                      <div>
                        <dt>当前回应状态</dt>
                        <dd>
                          {s.check.repliedAt
                            ? "已回应（逾期）"
                            : now > s.check.deadline
                              ? "已超出期限 · 尚未回应"
                              : "等待对方回应"}
                        </dd>
                      </div>
                      {s.appealDeadline && (
                        <div>
                          <dt>说明窗口截止</dt>
                          <dd>{date(s.appealDeadline)}</dd>
                        </div>
                      )}
                      {s.voteDeadline && (
                        <div>
                          <dt>好友投票截止</dt>
                          <dd>{date(s.voteDeadline)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="button-row">
                      {!s.check.repliedAt &&
                        actionButton(
                          "回应正式确认",
                          { type: "respond" },
                          participant &&
                            role !== s.check.requester &&
                            s.stage !== "ended",
                          true,
                        )}
                      {["active", "ending"].includes(s.stage) &&
                        actionButton(
                          "发起失联申诉",
                          { type: "claim" },
                          role === s.check.requester &&
                            now > s.check.deadline &&
                            now <= s.check.deadline + 7 * DAY,
                        )}
                      {s.stage === "appeal" &&
                        actionButton(
                          "提交好友监督",
                          { type: "escalate" },
                          participant &&
                            now > (s.appealDeadline ?? Infinity) &&
                            now <= (s.voteDeadline ?? 0),
                        )}
                      {s.stage === "voting" && (
                        <Button onClick={() => go("jury")}>
                          查看好友监督 <ArrowRight />
                        </Button>
                      )}
                      {["appeal", "voting"].includes(s.stage) &&
                        now > (s.voteDeadline ?? Infinity) &&
                        actionButton("按超时规则结束", { type: "timeout" })}
                    </div>
                    <p className="field-hint">
                      {s.stage === "appeal"
                        ? "说明窗口开放 48 小时，逾期回应将作为判断信息。"
                        : "演示控制可以推进时间；正式流程不能跳过约定的等待期限。"}
                    </p>
                  </section>
                  <section className="card soft-card">
                    <LockSimple size={30} />
                    <h2>只看必要的信息。</h2>
                    <p>
                      好友只会看到这次争议的确认时间、期限、回应状态与判断记录。
                    </p>
                    <hr />
                    <p>
                      聊天、照片、位置不会自动展示。额外证据应由本人主动授权。
                    </p>
                    <span className="tiny muted">
                      本次演示未收集或上传私人证据。
                    </span>
                  </section>
                </div>
              )}
            </>
          )}
          {page === "jury" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">TRUSTED BY BOTH OF YOU</span>
                  <h1>你的一票，认真一点。</h1>
                  <p>请根据本次约定与必要事实判断，不需要为谁站队。</p>
                </div>
                <Pill>
                  {s.stage === "voting" ? "等待好友判断" : labels[s.stage]}
                </Pill>
              </div>
              {!["voting", "ended"].includes(s.stage) || !s.check ? (
                <Empty title="暂时没有需要好友判断的争议">
                  好友仅在争议进入监督阶段后参与。日常的私人记录不会展示在这里。
                </Empty>
              ) : (
                <div className="jury-layout">
                  <section className="card">
                    <div className="section-title">
                      <h2>本次需要判断的事</h2>
                      <span className="pill neutral">失联争议</span>
                    </div>
                    <h3 className="jury-question">
                      是否违反了「{t.ghostDays} 天内回应正式确认」的约定？
                    </h3>
                    <dl className="facts">
                      <div>
                        <dt>正式确认发起时间</dt>
                        <dd>{date(s.check.sentAt)}</dd>
                      </div>
                      <div>
                        <dt>约定回应截止时间</dt>
                        <dd>{date(s.check.deadline)}</dd>
                      </div>
                      <div>
                        <dt>回应记录</dt>
                        <dd>
                          {s.check.repliedAt
                            ? "截止后已回应"
                            : "截止前未收到回应"}
                        </dd>
                      </div>
                      <div>
                        <dt>说明窗口</dt>
                        <dd>已结束 · {date(s.appealDeadline)}</dd>
                      </div>
                      <div>
                        <dt>投票截止</dt>
                        <dd>{date(s.voteDeadline)}</dd>
                      </div>
                    </dl>
                    <div className="notice">
                      <LockSimple />
                      这里只展示本次争议所需的信息。没有聊天记录、照片或位置。
                    </div>
                    <div className="vote-area">
                      <h3>你的判断</h3>
                      <p>
                        {participant
                          ? "请在演示控制中切换为指定好友。"
                          : `${roleName}，请确认事实后投票。每人只能投一次。`}
                      </p>
                      <div className="button-row">
                        <Button
                          disabled={
                            busy ||
                            participant ||
                            s.stage !== "voting" ||
                            s.votes[Number(role[1])] !== null ||
                            now > (s.voteDeadline ?? 0)
                          }
                          onClick={() => setVoteChoice(true)}
                        >
                          构成违约 <Check size={18} />
                        </Button>
                        <Button
                          secondary
                          disabled={
                            busy ||
                            participant ||
                            s.stage !== "voting" ||
                            s.votes[Number(role[1])] !== null ||
                            now > (s.voteDeadline ?? 0)
                          }
                          onClick={() => setVoteChoice(false)}
                        >
                          不构成违约
                        </Button>
                      </div>
                    </div>
                  </section>
                  <aside>
                    <section className="card">
                      <div className="section-title">
                        <h2>三人好友监督团</h2>
                        <UsersThree size={23} />
                      </div>
                      <div className="quorum">
                        <strong>
                          {s.votes.filter((v) => v === true).length}
                          <span> / 2</span>
                        </strong>
                        <p>票认定违约，即可通过</p>
                      </div>
                      <div className="voters">
                        {s.friends.map((name, i) => (
                          <div key={i}>
                            <Avatar name={name} second={i === 1} small />
                            <div>
                              <strong>{name}</strong>
                              <small>
                                {
                                  [
                                    "A 指定的好友",
                                    "B 指定的好友",
                                    "共同指定的好友",
                                  ][i]
                                }
                              </small>
                            </div>
                            <span
                              className={
                                s.votes[i] === true ? "vote-result" : ""
                              }
                            >
                              {s.votes[i] === null
                                ? "待投票"
                                : s.votes[i]
                                  ? "构成违约"
                                  : "不构成违约"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="field-hint">
                        两票否决或投票超时，关系结束，双方资金各自返还。
                      </p>
                    </section>
                    <div className="note-box">
                      <ShieldCheck />
                      恢复基金始终返还本人。只有违约方的承诺保证金会转给另一方。
                    </div>
                    {s.stage === "ended" && (
                      <Button onClick={() => go("ended")}>
                        查看模拟结算 <ArrowRight />
                      </Button>
                    )}
                  </aside>
                </div>
              )}
            </>
          )}
          {page === "ended" && (
            <>
              {s.stage !== "ended" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">WHEN A CHAPTER ENDS</span>
                      <h1>好好告别，也是一种认真。</h1>
                    </div>
                  </div>
                  <Empty title="这段关系，还在继续">
                    双方确认结束，或争议得到裁决后，结算结果会展示在这里。
                  </Empty>
                </>
              ) : (
                <div className="ending-page">
                  <div className="ending-intro">
                    <span className="ending-icon">
                      <Heart size={35} weight="light" />
                    </span>
                    <span className="eyebrow">
                      EVERY ENDING IS A NEW BEGINNING
                    </span>
                    <h1>
                      谢谢这段路，
                      <br />
                      接下来，好好照顾自己。
                    </h1>
                    <p>
                      {s.names[0]}与{s.names[1]}，一起走过了{" "}
                      <strong>{days} 天</strong>。<br />
                      关系已结束，属于你的那份安心还在。
                    </p>
                    <Pill>
                      {s.outcome?.startsWith("breach")
                        ? "好友已裁决 · 模拟结算完成"
                        : s.outcome === "mutual"
                          ? "双方同意 · 模拟结算完成"
                          : "按约定返还 · 模拟结算完成"}
                    </Pill>
                  </div>
                  <section className="card settlement">
                    <div className="section-title">
                      <h2>这一程的结算</h2>
                      <span className="tiny muted">模拟金额 · USDC</span>
                    </div>
                    <div className="payout-grid">
                      {s.names.map((name, i) => (
                        <div key={i}>
                          <div className="payout-person">
                            <Avatar name={name} second={i === 1} small />
                            <strong>{name}</strong>
                            <span>获得返还</span>
                          </div>
                          <h2>
                            {money(s.payouts[i])} <small>USDC</small>
                          </h2>
                          <dl>
                            <div>
                              <dt>
                                <ArrowDownLeft />
                                自己的恢复基金
                              </dt>
                              <dd>{money(t.recovery)}</dd>
                            </div>
                            <div>
                              <dt>自己的承诺保证金</dt>
                              <dd>
                                {s.payouts[i] === t.recovery
                                  ? "0"
                                  : money(t.bond)}
                              </dd>
                            </div>
                            {s.payouts[i] > t.recovery + t.bond && (
                              <div className="rose-text">
                                <dt>对方的承诺保证金</dt>
                                <dd>+{money(t.bond)}</dd>
                              </div>
                            )}
                            {s.payouts[i] === t.recovery && (
                              <div className="muted">
                                <dt>保证金已按裁决转给对方</dt>
                                <dd>−{money(t.bond)}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      ))}
                    </div>
                    <div className="settlement-note">
                      <LockSimple />
                      无论结果如何，双方的恢复基金都完整返还本人。
                    </div>
                  </section>
                  <p className="tiny muted">
                    这是一份模拟结算记录，未产生真实资金转移或链上交易。
                  </p>
                  <Button secondary onClick={() => go("create")}>
                    准备好了，再开始 <ArrowUpRight />
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
        <footer className="footer">
          <span>
            SituationSHIT <span>· 让认真有迹可循</span>
          </span>
          <span>Made for two. Backed by Avalanche.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="移动导航">
        <a href="#/home" className={page === "home" ? "selected" : ""}>
          <House />
          首页
        </a>
        {nav
          .filter((n) => ["relationship", "dispute", "jury"].includes(n.p))
          .map(({ p, label, icon: Icon }) => (
            <a href={`#/${p}`} key={p} className={page === p ? "selected" : ""}>
              <Icon />
              {label}
            </a>
          ))}
      </nav>
      {service.mode === "mock" && !presentation && (
        <button
          className="demo-toggle"
          onClick={() => setControls(!controls)}
          aria-expanded={controls}
        >
          <SlidersHorizontal size={18} /> 演示控制
        </button>
      )}
      {presentation && (
        <button
          className="exit-presentation"
          aria-label="退出截图模式"
          onClick={() => {
            setPresentation(false);
            history.replaceState(
              null,
              "",
              `${location.pathname}${location.hash}`,
            );
          }}
        >
          退出截图模式
        </button>
      )}
      {service.mode === "mock" && controls && (
        <aside className="demo-panel" aria-label="演示控制面板">
          <div className="section-title">
            <h2>演示控制台</h2>
            <button
              className="icon-button"
              onClick={() => setControls(false)}
              aria-label="关闭演示控制"
            >
              <X />
            </button>
          </div>
          <p className="tiny muted">所有切换仅影响本浏览器的模拟数据。</p>
          <label>
            当前演示身份
            <select
              value={role}
              disabled={busy}
              onChange={(e) =>
                void act({ type: "role", role: e.target.value as Role })
              }
            >
              <option value="a">A · {s.names[0]}</option>
              <option value="b">B · {s.names[1]}</option>
              {s.friends.map((name, i) => (
                <option key={i} value={`j${i}`}>
                  好友 {i + 1} · {name}
                </option>
              ))}
            </select>
          </label>
          <h3>
            一键预设场景 <small>将覆盖当前演示</small>
          </h3>
          <div className="scene-grid">
            {(["active", "invite", "dispute", "ended"] as Scenario[]).map(
              (scene, i) => (
                <Button
                  key={scene}
                  secondary
                  disabled={busy}
                  onClick={() => changeScene(scene)}
                >
                  {["进行中", "待签署", "争议投票", "结算结果"][i]}
                </Button>
              ),
            )}
          </div>
          {["invited", "funding"].includes(s.stage) && (
            <div className="control-row">
              {actionButton(
                "模拟三位好友接受",
                { type: "accept-supervisors" },
                !s.supervisors.every(Boolean),
                true,
              )}
            </div>
          )}
          <h3>
            模拟时间 <small>{date(now)}</small>
          </h3>
          <div className="scene-grid">
            {actionButton(
              "推进 7 天",
              { type: "advance", hours: 168 },
              true,
              true,
            )}
            {actionButton(
              "推进 49 小时",
              { type: "advance", hours: 49 },
              true,
              true,
            )}
          </div>
          <p className="tiny muted">
            推进 7 天后再推进 1 小时即可超过回应期限。
          </p>
          {actionButton(
            "推进 1 小时",
            { type: "advance", hours: 1 },
            true,
            true,
          )}
          <div className="demo-panel-bottom">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void act({ type: "reset" }, "relationship");
                setControls(false);
              }}
            >
              重置演示
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPresentation(true);
                setControls(false);
                history.replaceState(
                  null,
                  "",
                  `${location.pathname}?present=1${location.hash}`,
                );
              }}
            >
              截图模式 <ArrowUpRight />
            </button>
          </div>
        </aside>
      )}
      {voteChoice !== null && (
        <div className="modal-backdrop">
          <section
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vote-title"
            className="modal"
          >
            <ShieldCheck size={34} />
            <h2 id="vote-title">确认你的判断</h2>
            <p>
              你选择了「{voteChoice ? "构成违约" : "不构成违约"}」。
              <br />
              投票后不能修改；本次操作为模拟投票。
            </p>
            <div className="button-row">
              <Button secondary onClick={() => setVoteChoice(null)}>
                再想一下
              </Button>
              <Button
                onClick={() => {
                  const choice = voteChoice;
                  setVoteChoice(null);
                  void act({ type: "vote", breach: choice });
                }}
              >
                确认投票
              </Button>
            </div>
          </section>
        </div>
      )}
      {(toast || busy) && (
        <div className="toast" role="status">
          {busy ? <span className="spinner" /> : <CheckCircle size={18} />}{" "}
          {busy ? "正在更新演示…" : toast}
        </div>
      )}
    </div>
  );
}
