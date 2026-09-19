import type { LiveController } from "./useLiveController";

export function SupervisionInvite({ c }: { c: LiveController }) {
  const { model, s, lifecycle, action, supervisorIndex } = c;
  return (
    <section className="content-section">
      <h2>接受好友监督职责</h2>
      <p>
        你只能查看公开规则与本案必要信息。投票只能投一次，需两票同向形成结果。
      </p>
      {action(
        s.supervisorsAccepted[supervisorIndex]
          ? "你已接受监督"
          : "我接受本次监督职责",
        "acceptSupervision",
        [model.agreementHash],
        [0, 1].includes(lifecycle) && !s.supervisorsAccepted[supervisorIndex],
      )}
    </section>
  );
}
