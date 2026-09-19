import type { DemoPageProps } from "../ui/types";
import {
  ArrowRight,
  Check,
  LockSimple,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import { Button, Pill, Avatar, Empty } from "../ui/primitives";
import { go, date, labels } from "../ui/presentation";
export function JuryPage({
  s,
  t,
  role,
  now,
  busy,
  participant,
  roleName,
  setVoteChoice,
}: Pick<
  DemoPageProps,
  | "s"
  | "t"
  | "role"
  | "now"
  | "busy"
  | "participant"
  | "roleName"
  | "setVoteChoice"
>) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TRUSTED BY BOTH OF YOU</span>
          <h1>你的一票，认真一点。</h1>
          <p>请根据本次约定与必要事实判断，不需要为谁站队。</p>
        </div>
        <Pill>{s.stage === "voting" ? "等待好友判断" : labels[s.stage]}</Pill>
      </div>
      {!["voting", "ended"].includes(s.stage) || !s.check ? (
        <Empty title="暂时没有需要好友判断的争议">
          好友仅在争议进入监督阶段后参与。日常的私人记录不会展示在这里。
        </Empty>
      ) : (
        <div className="jury-layout">
          <section className="content-section">
            <div className="section-title">
              <h2>本次需要判断的事</h2>
              <Pill>失联争议</Pill>
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
                  {s.check.repliedAt ? "截止后已回应" : "截止前未收到回应"}
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
            <section className="content-section">
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
                        {["A 指定的好友", "B 指定的好友", "共同指定的好友"][i]}
                      </small>
                    </div>
                    <span className={s.votes[i] === true ? "vote-result" : ""}>
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
  );
}
