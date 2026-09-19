import type { DemoPageProps } from "../ui/types";
import {
  ArrowRight,
  CheckCircle,
  Heart,
  LockSimple,
  UsersThree,
} from "@phosphor-icons/react";
import { Card, Checkbox } from "@radix-ui/themes";
import { Button, Pill } from "../ui/primitives";
import { AgreementRules, FundSummary } from "../ui/AgreementDetails";
import { money } from "../data/types";
import { go, labels } from "../ui/presentation";
export function InvitePage({
  s,
  t,
  role,
  participant,
  idx,
  roleName,
  consent,
  setConsent,
  actionButton,
}: Pick<
  DemoPageProps,
  | "s"
  | "t"
  | "role"
  | "participant"
  | "idx"
  | "roleName"
  | "consent"
  | "setConsent"
  | "actionButton"
>) {
  return (
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
        <section className="content-section agreement">
          <div className="agreement-head">
            <Heart weight="fill" size={26} />
            <span>Situation Agreement</span>
            <small>{s.id} · 演示协议</small>
          </div>
          <h2>
            {s.names[0]} <span>&</span> {s.names[1]}
          </h2>
          <p className="muted">我们愿意，对这段关系认真一点。</p>
          <AgreementRules terms={t} />
          <FundSummary terms={t} />
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
          <Card className="signing-card" asChild>
            <section>
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
                    <Checkbox
                      checked={consent}
                      onCheckedChange={(checked) =>
                        setConsent(checked === true)
                      }
                    />
                    我已阅读，并同意这份约定
                  </label>
                  {actionButton(
                    role === "b" ? "接受并模拟签署" : "等待对方接受并签署",
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
                      : "模拟存入 " + money(t.recovery + t.bond) + " USDC",
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
          </Card>
        </aside>
      </div>
    </>
  );
}
