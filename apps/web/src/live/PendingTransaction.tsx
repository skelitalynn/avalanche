import type { LiveController } from "./useLiveController";
import { same } from "../../../../packages/shared/src/index";
import { Button } from "../ui/primitives";
import { Card } from "@radix-ui/themes";

export function PendingTransaction({ c }: { c: LiveController }) {
  const { signedIn, address, busy, run, pending, confirmed } = c;
  if (!pending) return null;
  return (
    <Card asChild>
      <section className="content-section pending-card">
        <h2>有一笔交易需要确认</h2>
        <p className="mono">{pending.hash}</p>
        <p>提交后遇到网络异常时，先查询结果。不会自动重新发送资金交易。</p>
        <Button
          disabled={
            busy || !signedIn || !address || !same(address, pending.account)
          }
          onClick={() => void run(() => confirmed(pending))}
        >
          查询交易结果
        </Button>
      </section>
    </Card>
  );
}
