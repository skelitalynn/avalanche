import { Select } from "@radix-ui/themes";
import type { DemoControlsProps } from "./types";
import type { Role, Scenario } from "../data/types";
import { Button } from "./primitives";
import { date } from "./presentation";
import { ArrowUpRight, SlidersHorizontal, X } from "@phosphor-icons/react";
export function DemoControls({
  presentation,
  setPresentation,
  controls,
  setControls,
  role,
  busy,
  s,
  act,
  changeScene,
  actionButton,
  now,
}: DemoControlsProps) {
  return (
    <>
      {!presentation && (
        <button
          className="demo-toggle"
          onClick={() => setControls(!controls)}
          aria-expanded={controls}
        >
          <SlidersHorizontal size={18} /> 演示控制
        </button>
      )}
      {presentation && (
        <button
          className="exit-presentation"
          aria-label="退出截图模式"
          onClick={() => {
            setPresentation(false);
            history.replaceState(
              null,
              "",
              `${location.pathname}${location.hash}`,
            );
          }}
        >
          退出截图模式
        </button>
      )}
      {controls && (
        <aside className="demo-panel" aria-label="演示控制面板">
          <div className="section-title">
            <h2>演示控制台</h2>
            <button
              className="icon-button"
              onClick={() => setControls(false)}
              aria-label="关闭演示控制"
            >
              <X />
            </button>
          </div>
          <p className="tiny muted">所有切换仅影响本浏览器的模拟数据。</p>
          <div className="control-field">
            <label htmlFor="demo-role">当前演示身份</label>
            <Select.Root
              value={role}
              disabled={busy}
              onValueChange={(value) =>
                void act({ type: "role", role: value as Role })
              }
            >
              <Select.Trigger id="demo-role" aria-label="当前演示身份" />
              <Select.Content position="popper">
                <Select.Item value="a">A · {s.names[0]}</Select.Item>
                <Select.Item value="b">B · {s.names[1]}</Select.Item>
                {s.friends.map((name, i) => (
                  <Select.Item key={i} value={`j${i}`}>
                    好友 {i + 1} · {name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
          <h3>
            一键预设场景 <small>将覆盖当前演示</small>
          </h3>
          <div className="scene-grid">
            {(["active", "invite", "dispute", "ended"] as Scenario[]).map(
              (scene, i) => (
                <Button
                  key={scene}
                  secondary
                  disabled={busy}
                  onClick={() => changeScene(scene)}
                >
                  {["进行中", "待签署", "争议投票", "结算结果"][i]}
                </Button>
              ),
            )}
          </div>
          {["invited", "funding"].includes(s.stage) && (
            <div className="control-row">
              {actionButton(
                "模拟三位好友接受",
                { type: "accept-supervisors" },
                !s.supervisors.every(Boolean),
                true,
              )}
            </div>
          )}
          <h3>
            模拟时间 <small>{date(now)}</small>
          </h3>
          <div className="scene-grid">
            {actionButton(
              "推进 7 天",
              { type: "advance", hours: 168 },
              true,
              true,
            )}
            {actionButton(
              "推进 49 小时",
              { type: "advance", hours: 49 },
              true,
              true,
            )}
          </div>
          <p className="tiny muted">
            推进 7 天后再推进 1 小时即可超过回应期限。
          </p>
          {actionButton(
            "推进 1 小时",
            { type: "advance", hours: 1 },
            true,
            true,
          )}
          <div className="demo-panel-bottom">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void act({ type: "reset" }, "relationship");
                setControls(false);
              }}
            >
              重置演示
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPresentation(true);
                setControls(false);
                history.replaceState(
                  null,
                  "",
                  `${location.pathname}?present=1${location.hash}`,
                );
              }}
            >
              截图模式 <ArrowUpRight />
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
