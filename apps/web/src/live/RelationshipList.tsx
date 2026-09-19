import type { LiveController } from "./useLiveController";
import { ArrowRight } from "@phosphor-icons/react";
import { lifecycles, same } from "../../../../packages/shared/src/index";
import { Button } from "../ui/primitives";
import { short } from "./format";

export function RelationshipList({ c }: { c: LiveController }) {
  const { busy, run, list, refresh, selected, openRow } = c;
  return (
    <section className="content-section">
      <div className="section-title">
        <h2>我的关系与监督邀请</h2>
        <Button secondary disabled={busy} onClick={() => void run(refresh)}>
          刷新链上状态
        </Button>
      </div>
      {list.length ? (
        <div className="live-list">
          {list.map((row) => (
            <button
              key={row.address}
              className={
                selected && same(selected, row.address) ? "selected" : ""
              }
              disabled={busy}
              onClick={() => void run(() => openRow(row))}
            >
              <span>
                {row.role === "SUPERVISOR"
                  ? "好友监督"
                  : row.role === "A"
                    ? "我创建的约定"
                    : "我收到的约定"}
              </span>
              <strong>{short(row.address)}</strong>
              <small>
                {
                  [
                    "待接受",
                    "待入金",
                    "进行中",
                    "待结束",
                    "争议中",
                    "结算中",
                    "已结束",
                    "已取消",
                  ][lifecycles.indexOf(row.state)]
                }
              </small>
              <ArrowRight />
            </button>
          ))}
        </div>
      ) : (
        <p>还没有关系。你可以创建约定，或使用指定 B 钱包打开邀请链接。</p>
      )}
    </section>
  );
}
