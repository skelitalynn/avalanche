import type { LiveController } from "./useLiveController";

export function DeveloperWallets({ c }: { c: LiveController }) {
  const { devAccounts } = c;
  return (
    <details className="content-section">
      <summary>本地测试钱包地址</summary>
      <p>
        创建时已预填 B
        和三位好友。完成一个角色的操作后，断开连接，再选择下一个本地钱包并签名登录。
      </p>
      {devAccounts.map((a, i) => (
        <p key={a} className="mono">
          {["参与者 A", "参与者 B", "A 的好友", "B 的好友", "共同好友"][i]}：{a}
        </p>
      ))}
    </details>
  );
}
