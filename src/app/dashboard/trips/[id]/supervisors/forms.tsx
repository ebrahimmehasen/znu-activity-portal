"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { tripSupervisorAction } from "./actions";
import { useT } from "@/i18n/client";

const selectCls = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

export function AddSupervisorForm({ activityId, options }: { activityId: number; options: { id: number; name: string }[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(tripSupervisorAction, {});
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="op" value="add" />
      <div className="flex gap-2">
        <select name="userId" aria-label={t("المشرف")} defaultValue="" className={`${selectCls} min-w-0 flex-1`}>
          <option value="" disabled>
            {t("اختر مشرفًا")}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("إضافة")}
        </Button>
      </div>
      {state.ok === false && <p className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}

export function SupervisorBusSelect({
  activityId,
  userId,
  busId,
  buses,
}: {
  activityId: number;
  userId: number;
  busId: number | null;
  buses: { id: number; name: string }[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState(tripSupervisorAction, {});
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value="bus" />
      {/* Keyed so the saved bus shows: React resets uncontrolled fields after an action. */}
      <select
        key={busId ?? "none"}
        name="busId"
        aria-label={t("حافلة المشرف")}
        defaultValue={busId ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
      >
        <option value="">{t("بدون حافلة")}</option>
        {buses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {state.ok === false && <span className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}
