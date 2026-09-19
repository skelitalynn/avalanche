import type { DemoPageProps } from "../ui/types";
import { ArrowRight, LockSimple, ShieldCheck } from "@phosphor-icons/react";
import { Button, Pill } from "../ui/primitives";
import { DAY } from "../data/types";
import { go, date, labels } from "../ui/presentation";
export function DisputePage({
  s,
  t,
  role,
  now,
  participant,
  actionButton,
}: Pick<
  DemoPageProps,
  "s" | "t" | "role" | "now" | "participant" | "actionButton"
>) {
  return (
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
          <section className="content-section start-check">
            <h2>想知道，对方还在吗？</h2>
            <p>
              发送正式确认后，对方有 <strong>{t.ghostDays} 天</strong>
              时间回应。
              <br />
              超过约定期限，你才可以发起失联申诉。
            </p>
            <div className="notice">
              <ShieldCheck /> 正式确认不是违约裁决；资金不会因此发生变化。
            </div>
            {actionButton(
              "发起正式确认",
              { type: "send-check" },
              participant && ["active", "ending"].includes(s.stage),
            )}
          </section>
          <section className="content-section">
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
          <section className="content-section">
            <div className="section-title">
              <h2>失联确认记录</h2>
              <span className="tiny muted">{s.id} / 01</span>
            </div>
            <div className="dispute-summary">
              <div>
                <h3>
                  {s.names[s.check.requester === "a" ? 0 : 1]} 发起了正式确认
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
          <section className="content-section soft-card">
            <LockSimple size={30} />
            <h2>只看必要的信息。</h2>
            <p>好友只会看到这次争议的确认时间、期限、回应状态与判断记录。</p>
            <hr />
            <p>聊天、照片、位置不会自动展示。额外证据应由本人主动授权。</p>
            <span className="tiny muted">本次演示未收集或上传私人证据。</span>
          </section>
        </div>
      )}
    </>
  );
}
