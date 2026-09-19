import type { Terms } from "../data/types";
import { money } from "../data/types";
import { LockSimple } from "@phosphor-icons/react";
export function AgreementRules({ terms: t }: { terms: Terms }) {
  return (
    <div className="rules">
      <div>
        <div>
          <strong>{t.ghostDays} 天内，给彼此一个回应</strong>
          <p>正式确认后超过期限，可发起失联申诉</p>
        </div>
        <span className="rule-number">01</span>
      </div>
      <div>
        <div>
          <strong>每月至少 {t.meetings} 次，好好见面</strong>
          <p>见面由双方确认，记录属于你们的时刻</p>
        </div>
        <span className="rule-number">02</span>
      </div>
      <div>
        <div>
          <strong>每 {t.confirmationDays} 天，确认一次心意</strong>
          <p>停下来聊聊，我们是不是还在同一页</p>
        </div>
        <span className="rule-number">03</span>
      </div>
    </div>
  );
}
export function FundSummary({ terms: t }: { terms: Terms }) {
  return (
    <div className="fund-grid">
      <div className="fund">
        <span>
          恢复基金 <LockSimple size={14} />
        </span>
        <h3>
          {money(t.recovery)} <small>USDC / 人</small>
        </h3>
        <p>无论如何结束，始终属于你自己。</p>
      </div>
      <div className="fund">
        <span>承诺保证金</span>
        <h3>
          {money(t.bond)} <small>USDC / 人</small>
        </h3>
        <p>正常结束返还；违约后交给另一方。</p>
      </div>
    </div>
  );
}
