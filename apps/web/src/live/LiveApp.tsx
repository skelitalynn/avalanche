import { WalletProviders } from "./WalletProviders";
import { useLiveController } from "./useLiveController";
import { LiveWelcome } from "./LiveWelcome";
import "./live.css";
import { ShieldCheck, ArrowRight, WarningCircle } from "@phosphor-icons/react";
import { localWalletEnabled } from "./localWallet";
import { projectId } from "./WalletProviders";
import { Badge, Theme } from "@radix-ui/themes";

import { WalletPanel } from "./WalletPanel";
import { DeveloperWallets } from "./DeveloperWallets";
import { PendingTransaction } from "./PendingTransaction";
import { CreateView } from "./CreateView";
import { RelationshipList } from "./RelationshipList";
import { RelationshipSummary } from "./RelationshipSummary";
import { AgreementView } from "./AgreementView";
import { SupervisionInvite } from "./SupervisionInvite";
import { RecordsView } from "./RecordsView";
import { EndActionsView } from "./EndActionsView";
import { DisputeView } from "./DisputeView";
import { SettlementView } from "./SettlementView";
import { ChainDetails } from "./ChainDetails";
export default function LiveApp() {
  return (
    <WalletProviders>
      <LiveView />
    </WalletProviders>
  );
}
function LiveView() {
  const c = useLiveController();
  const {
    view,
    setView,
    signedIn,
    error,
    setError,
    status,
    settings,
    devAccounts,
    pending,
    model,
    lifecycle,
    isParty,
    supervisorIndex,
  } = c;
  return (
    <Theme
      className="live-app"
      appearance="light"
      accentColor="grass"
      grayColor="sand"
      radius="medium"
      panelBackground="solid"
    >
      <header className="live-header">
        <a className="reference-brand" href="/">
          Situation<span>SHIT</span> ↗
        </a>
        <Badge color="lime">
          {settings?.chainId === 31337
            ? "本地 EVM · 测试代币"
            : settings
              ? "Fuji · 测试网"
              : "正在读取网络"}
        </Badge>
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
            <LiveWelcome>
              <a className="button" href="#wallet-login">
                开始一段关系 <ArrowRight />
              </a>
            </LiveWelcome>
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
          <WalletPanel c={c} />
          {!projectId && (
            <p className="field-hint">
              手机 WalletConnect 尚未配置；桌面可使用 Core 扩展。
              {localWalletEnabled && settings?.chainId === 31337
                ? "本机体验也可选择本地开发钱包；仅操作测试代币。"
                : "支持 MetaMask 或 Core 浏览器扩展。"}
            </p>
          )}
          {devAccounts.length === 5 && <DeveloperWallets c={c} />}
          {pending && <PendingTransaction c={c} />}
          {signedIn && (
            <>
              {view === "create" ? (
                <CreateView c={c} />
              ) : (
                <>
                  <RelationshipList c={c} />
                  {model && (
                    <>
                      <RelationshipSummary c={c} />
                      {(view === "agreement" || view === "overview") &&
                        isParty && <AgreementView c={c} />}
                      {supervisorIndex >= 0 && <SupervisionInvite c={c} />}
                      {view === "overview" && isParty && <RecordsView c={c} />}
                      {["overview", "ended"].includes(view) && isParty && (
                        <EndActionsView c={c} />
                      )}
                      {["dispute", "jury"].includes(view) && (
                        <DisputeView c={c} />
                      )}
                      {[5, 6, 7].includes(lifecycle) && (
                        <SettlementView c={c} />
                      )}
                      <ChainDetails c={c} />
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
    </Theme>
  );
}
