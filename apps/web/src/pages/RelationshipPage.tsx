import type { DemoPageProps } from "../ui/types";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  Heart,
  LockSimple,
  UsersThree,
} from "@phosphor-icons/react";
import { Card } from "@radix-ui/themes";
import { Button, Pill, Avatar } from "../ui/primitives";
import { AgreementRules, FundSummary } from "../ui/AgreementDetails";
import { DAY } from "../data/types";
import { go, day, labels } from "../ui/presentation";
export function RelationshipPage({
  s,
  t,
  role,
  now,
  participant,
  days,
  actionButton,
}: Pick<
  DemoPageProps,
  "s" | "t" | "role" | "now" | "participant" | "days" | "actionButton"
>) {
  return (
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
      <div className="relationship-layout">
        <div className="main-column">
          <section className="relationship-card">
            <div className="card-top">
              <span className="relationship-tag">OUR SITUATION / {s.id}</span>
              <Pill green={s.stage === "active"}>{labels[s.stage]}</Pill>
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
            </div>
          </section>
          <section className="content-section">
            <div className="section-title">
              <h2>我们的约定</h2>
              <button className="text-button" onClick={() => go("invite")}>
                查看完整协议 <ArrowUpRight />
              </button>
            </div>
            <AgreementRules terms={t} />
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
            <FundSummary terms={t} />
          </section>
        </div>
        <div className="aside-column">
          <Card className="checkin-card" asChild>
            <section>
              <span className="eyebrow">NEXT CHECK-IN</span>
              <h2>
                再确认一次，
                <br />
                我们还在同一页。
              </h2>
              <p>
                下次关系确认{" "}
                <strong>{day(s.confirmedAt + t.confirmationDays * DAY)}</strong>
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
              <span className="tiny muted">只有双方确认，才会更新这次记录</span>
            </section>
          </Card>
          <section className="content-section">
            <div className="section-title">
              <h2>我们信任的人</h2>
              <UsersThree size={20} />
            </div>
            <div className="friends">
              {s.friends.map((f, i) => (
                <div key={i}>
                  <Avatar name={f} second={i === 1} small />
                  <strong>{f}</strong>
                  <span>{["我的好友", "TA 的好友", "共同好友"][i]}</span>
                </div>
              ))}
            </div>
            <p className="privacy-inline">
              <LockSimple />
              平时看不到你们的私人记录
            </p>
          </section>
          <section className="content-section activity-card">
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
  );
}
