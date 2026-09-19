import type { DemoPageProps } from "../ui/types";
import { ArrowRight, CheckCircle, LockSimple } from "@phosphor-icons/react";
import { TextField } from "@radix-ui/themes";
import { Button } from "../ui/primitives";
export function CreatePage({
  busy,
  create,
}: Pick<DemoPageProps, "busy" | "create">) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LET’S MAKE IT CLEAR</span>
          <h1>把我们的约定，写下来。</h1>
          <p>不用很复杂。只是先说好，怎么对彼此认真。</p>
        </div>
        <span className="step-label">
          01 约定 <span>— 02 签署 — 03 存入</span>
        </span>
      </div>
      <form onSubmit={create} className="form-layout">
        <div className="content-section form-card">
          <h2>
            <span className="number">01</span>先认识一下你们
          </h2>
          <div className="form-grid">
            <label>
              你的昵称
              <TextField.Root
                name="nameA"
                maxLength={12}
                required
                placeholder="例如：小夏"
                defaultValue="小夏"
              />
            </label>
            <label>
              对方的昵称
              <TextField.Root
                name="nameB"
                maxLength={12}
                required
                placeholder="例如：一帆"
                defaultValue="一帆"
              />
            </label>
          </div>
          <h2>
            <span className="number">02</span>你们期待的相处方式
          </h2>
          <div className="form-grid three">
            <label>
              多久未回应算失联
              <div className="input-unit">
                <TextField.Root
                  name="ghostDays"
                  type="number"
                  min="1"
                  max="30"
                  required
                  defaultValue="7"
                />
                <span>天</span>
              </div>
            </label>
            <label>
              每月至少见面
              <div className="input-unit">
                <TextField.Root
                  name="meetings"
                  type="number"
                  min="0"
                  max="31"
                  required
                  defaultValue="2"
                />
                <span>次</span>
              </div>
            </label>
            <label>
              多久确认一次关系
              <div className="input-unit">
                <TextField.Root
                  name="confirmationDays"
                  type="number"
                  min="1"
                  max="90"
                  required
                  defaultValue="7"
                />
                <span>天</span>
              </div>
            </label>
          </div>
          <p className="field-hint">
            失联判断从正式确认发出后开始；见面和定期确认仅作共同记录与提醒。
          </p>
          <h2>
            <span className="number">03</span>给彼此的安全感
          </h2>
          <div className="form-grid">
            <label>
              恢复基金 · 每人
              <div className="input-unit">
                <TextField.Root
                  name="recovery"
                  inputMode="decimal"
                  required
                  defaultValue="50"
                />
                <span>USDC</span>
              </div>
              <small>始终属于本人，结束时返还。</small>
            </label>
            <label>
              承诺保证金 · 每人
              <div className="input-unit">
                <TextField.Root
                  name="bond"
                  inputMode="decimal"
                  required
                  defaultValue="20"
                />
                <span>USDC</span>
              </div>
              <small>正常结束返还，违约后转给另一方。</small>
            </label>
          </div>
          <h2>
            <span className="number">04</span>邀请三位信任的好友
          </h2>
          <div className="form-grid three">
            {["你的好友", "对方的好友", "共同好友"].map((label, i) => (
              <label key={label}>
                {label}
                <TextField.Root
                  name={["friendA", "friendB", "friendC"][i]}
                  maxLength={12}
                  required
                  defaultValue={["阿宁", "许乐", "乔乔"][i]}
                />
              </label>
            ))}
          </div>
          <p className="field-hint">
            这里填写演示昵称。真实接入后将绑定独立的钱包身份，并分别接受邀请。
          </p>
          <div className="form-submit">
            <span>
              <LockSimple />
              约定经双方签署后锁定
            </span>
            <Button type="submit" disabled={busy}>
              生成模拟邀请 <ArrowRight />
            </Button>
          </div>
        </div>
        <aside className="form-aside">
          <h2>
            关系的答案，
            <br />
            由你们一起写。
          </h2>
          <p>
            约定不是考卷。
            <br />
            它只是让彼此知道，
            <br />
            这段关系里，什么对你很重要。
          </p>
          <hr />
          <div>
            <CheckCircle /> 双方看到相同的完整协议
          </div>
          <div>
            <CheckCircle /> 三位好友接受后才能入金
          </div>
          <div>
            <CheckCircle /> 恢复基金不会成为违约罚金
          </div>
          <div className="note-box">
            当前为本机演示。创建邀请、签署和存入均为模拟操作，不会转移真实资金。
          </div>
        </aside>
      </form>
    </>
  );
}
