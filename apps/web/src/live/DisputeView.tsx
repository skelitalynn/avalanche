import type { LiveController } from "./useLiveController";
import { same } from "../../../../packages/shared/src/index";
import { Button } from "../ui/primitives";
import { short, date } from "./format";
import { TextArea, Checkbox } from "@radix-ui/themes";

export function DisputeView({ c }: { c: LiveController }) {
  const {
    view,
    address,
    busy,
    run,
    canWrite,
    model,
    s,
    lifecycle,
    action,
    isParty,
    supervisorIndex,
    chainTime,
    currentDispute,
    caseData,
    evidenceBodies,
    upload,
    consent,
    setConsent,
    loadEvidence,
  } = c;
  return (
    <section className="content-section">
      <h2>{view === "jury" ? "好友监督判断" : "正式确认与失联申诉"}</h2>
      {isParty &&
        !model.check &&
        action("发起正式确认", "sendCheck", [], [2, 3].includes(lifecycle))}
      {model.check && (
        <>
          <dl className="facts">
            <div>
              <dt>发起人 / 接收人</dt>
              <dd>
                {short(model.check.requester)} / {short(model.check.respondent)}
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
                违约 {currentDispute.yesCount} / 否决 {currentDispute.noCount}
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
                  chainTime > BigInt(currentDispute.appealDeadline) &&
                  chainTime <= BigInt(currentDispute.voteDeadline),
              )}
            {supervisorIndex >= 0 && (
              <>
                {action(
                  "构成违约",
                  "vote",
                  [s.currentDisputeId, true],
                  lifecycle === 4 &&
                    currentDispute.status === "VOTING" &&
                    !currentDispute.votes[supervisorIndex] &&
                    chainTime <= BigInt(currentDispute.voteDeadline),
                )}
                {action(
                  "不构成违约",
                  "vote",
                  [s.currentDisputeId, false],
                  lifecycle === 4 &&
                    currentDispute.status === "VOTING" &&
                    !currentDispute.votes[supervisorIndex] &&
                    chainTime <= BigInt(currentDispute.voteDeadline),
                )}
              </>
            )}
            {action(
              "投票超时，各自返还",
              "finalizeTimeout",
              [s.currentDisputeId],
              lifecycle === 4 &&
                chainTime > BigInt(currentDispute.voteDeadline),
            )}
          </div>
          {isParty && lifecycle === 4 && (
            <>
              <h3 className="live-subheading">双方自行达成一致</h3>
              <div className="button-row">
                {action("提议恢复关系", "proposeResolution", [
                  s.currentDisputeId,
                  0,
                ])}
                {action("提议各自退款结束", "proposeResolution", [
                  s.currentDisputeId,
                  1,
                ])}
                {action(
                  currentDispute.resolutionMode === "RESUME"
                    ? "同意恢复关系"
                    : "同意退款结束",
                  "confirmResolution",
                  [s.currentDisputeId, BigInt(currentDispute.resolutionId)],
                  BigInt(currentDispute.resolutionId) > 0n &&
                    !same(address!, currentDispute.resolutionProposer),
                )}
              </div>
            </>
          )}
          {isParty && lifecycle === 4 && currentDispute.status === "APPEAL" && (
            <form onSubmit={upload} className="evidence-form">
              <h3>自愿提交本案说明</h3>
              <label>
                文字说明（最多 4000 字）
                <TextArea name="text" rows={4} />
              </label>
              <label>
                或选择图片（JPEG / PNG / WebP，最多 5 MiB）
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                />
              </label>
              <p>
                接收人：
                {[model.participantA, model.participantB, ...model.supervisors]
                  .map(short)
                  .join("、")}
                。好友只在进入监督后可读；终止后保留 30 天。
              </p>
              <label className="checkbox">
                <Checkbox
                  checked={consent}
                  onCheckedChange={(value) => setConsent(value === true)}
                />
                我主动授权给本次双方和三位监督人
              </label>
              <Button type="submit" disabled={!canWrite || !consent}>
                保存私有材料并预览
              </Button>
            </form>
          )}
          <div className="evidence-list">
            {caseData.evidence.map((ev: any) => (
              <div key={ev.id}>
                <span>
                  {short(ev.owner)} ·{" "}
                  {ev.registered ? "已登记摘要" : "私有草稿"}
                </span>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => void run(() => loadEvidence(ev))}
                >
                  查看授权材料
                </Button>
              </div>
            ))}
            {evidenceBodies.map((body, i) => (
              <article key={body.id ?? i}>
                {body.text?.startsWith("data:image/") ? (
                  <img alt="本人上传的证据预览" src={body.text} />
                ) : body.text ? (
                  <p>{body.text}</p>
                ) : body.contentPath ? (
                  <img alt="本案已授权图片" src={body.contentPath} />
                ) : null}
                {body.unregistered &&
                  action(
                    "预览无误，登记证据摘要",
                    "registerEvidence",
                    [s.currentDisputeId, body.commitment],
                    lifecycle === 4 && currentDispute.status === "APPEAL",
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
  );
}
