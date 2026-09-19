import type { LiveController } from "./useLiveController";
import { same } from "../../../../packages/shared/src/index";

export function EndActionsView({ c }: { c: LiveController }) {
  const { address, s, lifecycle, action } = c;
  return (
    <section className="content-section">
      <h2>好好告别</h2>
      <div className="button-row">
        {lifecycle === 2 && action("提出结束关系", "requestEnd")}
        {lifecycle === 3 && (
          <>
            {action(
              "撤回结束请求",
              "withdrawEnd",
              [s.endRequestId],
              same(address!, s.endRequester),
            )}
            {action(
              "确认结束并各自退款",
              "confirmEnd",
              [s.endRequestId],
              !same(address!, s.endRequester),
            )}
          </>
        )}
      </div>
      <p className="field-hint">单方请求不会结算；需要另一方确认同一个请求。</p>
    </section>
  );
}
