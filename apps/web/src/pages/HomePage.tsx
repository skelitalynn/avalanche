import { PaperArtwork } from "../ui/PaperArtwork";
import type { DemoPageProps } from "../ui/types";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "@phosphor-icons/react";
import { Button } from "../ui/primitives";
import { go } from "../ui/presentation";
export function HomePage({ changeScene }: Pick<DemoPageProps, "changeScene">) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> A LITTLE MORE CERTAINTY
          </span>
          <h1>
            关系可以慢慢来。
            <br />
            认真，<span>可以先说好。</span>
          </h1>
          <p className="hero-description">
            给还没定义的关系，一点确定感。
            <br />
            把期待说清楚，让承诺有分量，
            <br />
            也为每一种结局，留一份温柔。
          </p>
          <div className="button-row">
            <Button onClick={() => go("create")}>
              开始一段关系 <ArrowUpRight size={20} />
            </Button>
            <Button secondary onClick={() => go("invite")}>
              我收到邀请了 <ArrowRight />
            </Button>
          </div>
          <div className="hero-foot">
            <ShieldCheck size={17} /> 两个人的约定 · 三位好友见证 ·
            你的基金始终属于你
          </div>
        </div>
        <PaperArtwork />
      </section>
      <section className="landing-bottom">
        <div>
          <span className="eyebrow">HOW WE CARE</span>
          <h2>认真相处，也好好保护自己。</h2>
        </div>
        <div className="benefit">
          <span>01</span>
          <strong>把期待说清楚</strong>
          <p>
            回应、见面、关系确认。
            <br />
            提前写下你们认同的相处方式。
          </p>
        </div>
        <div className="benefit">
          <span>02</span>
          <strong>给承诺一点分量</strong>
          <p>
            各自存入恢复基金与保证金，
            <br />
            用一致的行动回应共同的选择。
          </p>
        </div>
        <div className="benefit">
          <span>03</span>
          <strong>为结束留一份体面</strong>
          <p>
            正常结束，各自返还。
            <br />
            出现争议，请信任的好友判断。
          </p>
        </div>
      </section>
      <button
        className="text-button preview-link"
        onClick={() => changeScene("active")}
      >
        先看看，一段关系会是什么样子 <ArrowRight />
      </button>
    </>
  );
}
