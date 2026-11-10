"use client";

import { useActionState } from "react";
import { useT } from "@/i18n/client";
import { setPickupAction } from "./actions";

/** Admins move a booking to another pickup point; saves on change. */
export function PickupSelect({
  activityId,
  bookingId,
  pickupPointId,
  points,
}: {
  activityId: number;
  bookingId: number;
  pickupPointId: number | null;
  points: { id: number; name: string }[];
}) {
  const t = useT();
  const [state, action, pending] = useActionState(setPickupAction, {});
  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="id" value={bookingId} />
      {/* Keyed so the saved point shows: React resets uncontrolled fields after an action. */}
      <select
        key={pickupPointId ?? "none"}
        name="pickupPointId"
        aria-label={t("مكان التجمع")}
        defaultValue={pickupPointId ?? ""}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
      >
        <option value="">{t("بدون مكان تجمع")}</option>
        {points.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {state.ok === false && state.message && <span className="text-xs text-danger">{t(state.message)}</span>}
    </form>
  );
}
