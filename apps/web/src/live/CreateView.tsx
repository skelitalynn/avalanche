import type { LiveController } from "./useLiveController";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "../ui/primitives";
import { TextField } from "@radix-ui/themes";

export function CreateView({ c }: { c: LiveController }) {
  const { devAccounts, create, canWrite } = c;
  return (
    <form className="content-section live-create" onSubmit={create}>
      <h2>创建新的 Situation</h2>
      <p>你是 A。B 与三位好友需使用不同的钱包接受；创建成功后不能修改规则。</p>
      <div className="form-grid">
        <label>
          B 的钱包地址
          <TextField.Root
            required
            name="b"
            placeholder="0x…"
            defaultValue={devAccounts[1] ?? ""}
          />
        </label>
        {[0, 1, 2].map((i) => (
          <label key={i}>
            {["A 指定的好友", "B 指定的好友", "共同好友"][i]}
            <TextField.Root
              required
              name={"j" + i}
              placeholder="0x…"
              defaultValue={devAccounts[i + 2] ?? ""}
            />
          </label>
        ))}
      </div>
      <div className="form-grid three">
        <label>
          失联期限（天）
          <TextField.Root
            name="days"
            type="number"
            min="1"
            max="30"
            defaultValue="7"
            required
          />
        </label>
        <label>
          每月见面次数
          <TextField.Root
            name="meetings"
            type="number"
            min="0"
            max="31"
            defaultValue="1"
            required
          />
        </label>
        <label>
          关系确认间隔（天）
          <TextField.Root
            name="frequency"
            type="number"
            min="1"
            max="90"
            defaultValue="7"
            required
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          每人恢复基金（USDC）
          <TextField.Root
            name="recovery"
            defaultValue="0.1"
            required
            inputMode="decimal"
          />
        </label>
        <label>
          每人承诺保证金（USDC）
          <TextField.Root
            name="bond"
            defaultValue="0.1"
            required
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="form-submit">
        <span>恢复基金始终属于本人</span>
        <Button type="submit" disabled={!canWrite}>
          保存协议并用钱包创建 <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
