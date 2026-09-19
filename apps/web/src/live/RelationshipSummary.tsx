import type { LiveController } from "./useLiveController";
import { short, cash } from "./format";

export function RelationshipSummary({ c }: { c: LiveController }) {
  const { selected, model, s, lifecycle, chainTime } = c;
  return (
    <section className="relationship-card live-summary">
      <div className="card-top">
        <span className="relationship-tag">
          OUR SITUATION · {short(selected)}
        </span>
        <span className="pill">
          {
            [
              "待接受",
              "待入金",
              "进行中",
              "待双方结束",
              "争议中",
              "资金结算中",
              "已结束",
              "已取消",
            ][lifecycle]
          }
        </span>
      </div>
      <h2>
        {short(model.participantA)} <span>&</span> {short(model.participantB)}
      </h2>
      <p>
        {s.activatedAt
          ? `已经走过 ${Math.max(0, Math.floor((Number(s.terminatedAt || chainTime) - Number(s.activatedAt)) / 86400))} 天`
          : "关系尚未生效"}{" "}
        · 每人恢复基金 {cash(model.recoveryAmount)} + 保证金{" "}
        {cash(model.bondAmount)} USDC
      </p>
    </section>
  );
}
