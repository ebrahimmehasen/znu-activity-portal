"use client";

import { useActionState } from "react";
import { assignBusAction } from "./actions";

export function BusSelect({
  activityId,
  bookingId,
  busId,
  buses,
}: {
  activityId: number;
  bookingId: number;
  busId: number | null;
  buses: { id: number; name: string; used: number; capacity: number }[];
}) {
  const [state, action, pending] = useActionState(assignBusAction, {});
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="id" value={bookingId} />
      <select
        name="busId"
        aria-label="الأتوبيس"
        defaultValue={busId ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
      >
        <option value="">من غير أتوبيس</option>
        {buses.map((b) => (
          <option key={b.id} value={b.id} disabled={b.id !== busId && b.used >= b.capacity}>
            {b.name} ({b.used}/{b.capacity})
          </option>
        ))}
      </select>
      {state.ok === false && <span className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}
