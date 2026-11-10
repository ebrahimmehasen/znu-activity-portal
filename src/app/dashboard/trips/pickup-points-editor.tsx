"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { useT } from "@/i18n/client";

export type PickupPointValue = { id?: number; name: string; time: string };
type Row = PickupPointValue & { key: number };

/**
 * The trip's pickup points (first gathering): students choose one when booking.
 * Existing points keep their id, so students who picked them keep their choice.
 */
export function PickupPointsEditor({ initial, error }: { initial: PickupPointValue[]; error?: string }) {
  const t = useT();
  const [rows, setRows] = useState<Row[]>(() => initial.map((p, i) => ({ key: i, ...p })));
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      return next;
    });

  return (
    <Card className="space-y-3">
      <input type="hidden" name="pickupPoints" value={JSON.stringify(rows.map(({ id, name, time }) => ({ id, name, time })))} />
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t("أماكن التجمع")}</h2>
          <p className="text-xs text-muted">{t("يختار الطالب واحدًا منها عند الحجز. اتركها فارغة إذا كان التجمع في مكان واحد.")}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, name: "", time: "" }]);
            setNextKey((k) => k + 1);
          }}
        >
          + {t("مكان")}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{t(error)}</p>}
      {rows.length === 0 && <p className="text-sm text-muted">{t("لا توجد أماكن تجمع؛ لن يُطلب من الطالب اختيار مكان.")}</p>}
      {rows.map((row, i) => (
        <div key={row.key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_8rem_auto]">
          <Input
            value={row.name}
            onChange={(e) => update(row.key, { name: e.target.value })}
            placeholder={t("مثلًا: بوابة الجامعة الرئيسية")}
            required
            maxLength={150}
            aria-label={t("اسم مكان التجمع")}
          />
          <Input type="time" value={row.time} onChange={(e) => update(row.key, { time: e.target.value })} aria-label={t("موعد التجمع")} />
          <div className="flex gap-1">
            <Button type="button" variant="ghost" className="px-2 py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("لأعلى")}>
              ↑
            </Button>
            <Button type="button" variant="ghost" className="px-2 py-1" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={t("لأسفل")}>
              ↓
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="px-2 py-1 text-danger"
              onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              aria-label={t("حذف المكان")}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
