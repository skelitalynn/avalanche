import type { ReactNode } from "react";
/** Visual artwork and composition follow the user-supplied avalanche-demo.html. */
export function ReferenceArt() {
  return (
    <div
      className="reference-art"
      role="img"
      aria-label="两个相互靠近的抽象人物"
    >
      <div className="reference-orb" />
      <div className="reference-orb two" />
      <span className="reference-heart">♡</span>
      <div className="reference-sticker">你怎么想？我们聊聊。</div>
    </div>
  );
}
export function ReferenceHero({ children }: { children: ReactNode }) {
  return (
    <section className="reference-hero">
      <div>
        <div className="eyebrow">SITUATIONSHIT / 从一次沟通开始</div>
        <h1>
          还没确定关系，
          <br />
          也可以<span>聊聊期待。</span>
        </h1>
        <p className="reference-lead">
          多久回消息、多久见一次面，你们可以一起商量。写下约定，再邀请对方确认和签署。
        </p>
        <div className="button-row">{children}</div>
        <p className="reference-note">
          填写约定、确认资金和好友，再由双方签署。
        </p>
      </div>
      <ReferenceArt />
    </section>
  );
}
