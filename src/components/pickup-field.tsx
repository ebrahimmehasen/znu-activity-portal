"use client";

import { Field } from "@/components/ui";
import { useLocale, useT } from "@/i18n/client";
import { formatTime } from "@/lib/dates";

export type PickupOption = { id: number; name: string; time: string | null };

/** The pickup point choice on booking forms; hidden when the trip has none. */
export function PickupField({ points, error, defaultValue }: { points: PickupOption[]; error?: string; defaultValue?: number | null }) {
  const t = useT();
  const locale = useLocale();
  if (!points.length) return null;
  return (
    <Field label={t("مكان التجمع")} error={error}>
      <select
        name="pickupPointId"
        required
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
      >
        <option value="" disabled>
          {t("اختر مكان التجمع")}
        </option>
        {points.map((p) => (
          <option key={p.id} value={p.id}>
            {p.time ? `${p.name} — ${formatTime(p.time, locale)}` : p.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
