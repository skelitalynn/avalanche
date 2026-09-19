import { useState } from "react";
import { TextField } from "@radix-ui/themes";
import type { LiveController } from "./useLiveController";
import { Button } from "../ui/primitives";
import { date } from "./format";

export function RecordsView({ c }: { c: LiveController }) {
  const { run, canWrite, lifecycle, records, record } = c;
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  return (
    <section className="content-section">
      <h2>关系里的小事</h2>
      <p>
        本月已确认见面 {records?.meetingCount ?? 0} 次 · 下次确认{" "}
        {records ? date(records.nextConfirmationAt) : "—"}
      </p>
      <label>
        见面日期（UTC）
        <TextField.Root
          type="date"
          value={meetingDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setMeetingDate(e.target.value)}
        />
      </label>
      <div className="button-row">
        <Button
          disabled={!canWrite || lifecycle !== 2}
          onClick={() => void run(() => record("meetings", meetingDate))}
        >
          登记 / 确认这天见面
        </Button>
        <Button
          secondary
          disabled={!canWrite || lifecycle !== 2}
          onClick={() => void run(() => record("relationship-checks"))}
        >
          发起 / 完成关系确认
        </Button>
      </div>
      <p className="field-hint">
        一方发起，另一方确认；未完成的记录不计数，不影响资金。
      </p>
    </section>
  );
}
