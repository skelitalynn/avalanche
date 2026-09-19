import type { ReactNode } from "react";
import { PaperArtwork } from "../ui/PaperArtwork";
export function LiveWelcome({ children }: { children: ReactNode }) {
  return (
    <section className="hero live-welcome">
      <div className="hero-copy">
        <span className="eyebrow">SITUATIONSHIT / 从一次沟通开始</span>
        <h1>
          还没确定关系，
          <br />
          也可以<span>聊聊期待。</span>
        </h1>
        <p className="hero-description">
          多久回消息、多久见一次面，你们可以一起商量。
          <br />
          写下约定，再邀请对方确认和签署。
        </p>
        <div className="button-row">{children}</div>
        <p className="hero-foot">填写约定、确认资金和好友，再由双方签署。</p>
      </div>
      <PaperArtwork />
    </section>
  );
}
