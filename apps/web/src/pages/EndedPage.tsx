import type { DemoPageProps } from "../ui/types";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Heart,
  LockSimple,
} from "@phosphor-icons/react";
import { Button, Pill, Avatar, Empty } from "../ui/primitives";
import { money } from "../data/types";
import { go } from "../ui/presentation";
export function EndedPage({
  s,
  t,
  days,
}: Pick<DemoPageProps, "s" | "t" | "days">) {
  return (
    <>
      {s.stage !== "ended" ? (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">WHEN A CHAPTER ENDS</span>
              <h1>好好告别，也是一种认真。</h1>
            </div>
          </div>
          <Empty title="这段关系，还在继续">
            双方确认结束，或争议得到裁决后，结算结果会展示在这里。
          </Empty>
        </>
      ) : (
        <div className="ending-page">
          <div className="ending-intro">
            <span className="ending-icon">
              <Heart size={35} weight="light" />
            </span>
            <span className="eyebrow">EVERY ENDING IS A NEW BEGINNING</span>
            <h1>
              谢谢这段路，
              <br />
              接下来，好好照顾自己。
            </h1>
            <p>
              {s.names[0]}与{s.names[1]}，一起走过了 <strong>{days} 天</strong>
              。<br />
              关系已结束，属于你的那份安心还在。
            </p>
            <Pill>
              {s.outcome?.startsWith("breach")
                ? "好友已裁决 · 模拟结算完成"
                : s.outcome === "mutual"
                  ? "双方同意 · 模拟结算完成"
                  : "按约定返还 · 模拟结算完成"}
            </Pill>
          </div>
          <section className="content-section settlement">
            <div className="section-title">
              <h2>这一程的结算</h2>
              <span className="tiny muted">模拟金额 · USDC</span>
            </div>
            <div className="payout-grid">
              {s.names.map((name, i) => (
                <div key={i}>
                  <div className="payout-person">
                    <Avatar name={name} second={i === 1} small />
                    <strong>{name}</strong>
                    <span>获得返还</span>
                  </div>
                  <h2>
                    {money(s.payouts[i])} <small>USDC</small>
                  </h2>
                  <dl>
                    <div>
                      <dt>
                        <ArrowDownLeft />
                        自己的恢复基金
                      </dt>
                      <dd>{money(t.recovery)}</dd>
                    </div>
                    <div>
                      <dt>自己的承诺保证金</dt>
                      <dd>
                        {s.payouts[i] === t.recovery ? "0" : money(t.bond)}
                      </dd>
                    </div>
                    {s.payouts[i] > t.recovery + t.bond && (
                      <div className="rose-text">
                        <dt>对方的承诺保证金</dt>
                        <dd>+{money(t.bond)}</dd>
                      </div>
                    )}
                    {s.payouts[i] === t.recovery && (
                      <div className="muted">
                        <dt>保证金已按裁决转给对方</dt>
                        <dd>−{money(t.bond)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
            <div className="settlement-note">
              <LockSimple />
              无论结果如何，双方的恢复基金都完整返还本人。
            </div>
          </section>
          <p className="tiny muted">
            这是一份模拟结算记录，未产生真实资金转移或链上交易。
          </p>
          <Button secondary onClick={() => go("create")}>
            准备好了，再开始 <ArrowUpRight />
          </Button>
        </div>
      )}
    </>
  );
}
