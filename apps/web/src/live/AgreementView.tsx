import type { LiveController } from "./useLiveController";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { erc20Abi } from "viem";
import { hashDocument, same } from "../../../../packages/shared/src/index";
import { Button } from "../ui/primitives";

export function AgreementView({ c }: { c: LiveController }) {
  const {
    address,
    settings,
    run,
    canWrite,
    selected,
    model,
    s,
    lifecycle,
    draft,
    action,
    transaction,
    participantIndex,
    draftId,
    chainTime,
  } = c;
  return (
    <section className="content-section">
      <h2>共同确认的约定</h2>
      {draft ? (
        <>
          <div className="live-metrics">
            <div>
              <strong>{draft.ghostWindowSeconds / 86400} 天</strong>
              <span>正式确认回应期限</span>
            </div>
            <div>
              <strong>{draft.meetingTarget} 次 / 月</strong>
              <span>约定见面次数</span>
            </div>
            <div>
              <strong>{draft.confirmationEveryDays} 天</strong>
              <span>关系确认频率</span>
            </div>
          </div>
          <p>
            双方核对的协议摘要：
            <span className="mono">{hashDocument(draft)}</span>
          </p>
        </>
      ) : (
        <p>完整协议需要指定参与者登录后读取。</p>
      )}
      <p>
        监督接受：
        {s.supervisorsAccepted.filter(Boolean).length} / 3；双方入金：
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
                  transaction(settings!.tokenAddress, erc20Abi, "approve", [
                    selected!,
                    model.recoveryAmount + model.bondAmount,
                  ]),
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
        {[0, 1].includes(lifecycle) && action("取消未生效约定", "cancel")}
        {[0, 1].includes(lifecycle) &&
          action(
            "处理过期邀请 / 入金",
            "expire",
            [],
            chainTime >
              (lifecycle === 0 ? s.invitationDeadline : s.fundingDeadline),
          )}
      </div>
      {draftId && (
        <div className="note-box live-invite">
          邀请 B 在自己的浏览器打开：
          <a href={`/?mode=live&agreement=${draftId}#/invite`}>
            {location.origin}/?mode=live&agreement=
            {draftId}
            #/invite <ArrowSquareOut />
          </a>
          <span>好友用指定钱包登录此站点，即可看到自己的监督邀请。</span>
        </div>
      )}
    </section>
  );
}
