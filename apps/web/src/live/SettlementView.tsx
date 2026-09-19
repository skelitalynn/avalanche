import type { LiveController } from "./useLiveController";
import type { Address } from "viem";
import { short, cash } from "./format";

export function SettlementView({ c }: { c: LiveController }) {
  const { model, s, lifecycle, action } = c;
  return (
    <section className="content-section">
      <h2>{lifecycle === 5 ? "关系已终止，部分资金待付" : "关系已经结束"}</h2>
      <div className="payout-grid">
        {[model.participantA, model.participantB].map(
          (a: Address, i: number) => (
            <div key={a}>
              <strong>{short(a)}</strong>
              <h2>
                {cash(s.entitlement[i])} <small>USDC 应得</small>
              </h2>
              <p>已实际支付 {cash(s.paid[i])} USDC</p>
              {lifecycle === 5 &&
                s.entitlement[i] > s.paid[i] &&
                action("重试向原持有人付款", "retryPayout", [a])}
            </div>
          ),
        )}
      </div>
      <p>恢复基金始终归原持有人，结算结果以合约余额与回执为准。</p>
    </section>
  );
}
