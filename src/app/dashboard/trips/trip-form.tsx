"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { saveTrip } from "./actions";

export type TripFormValues = {
  id?: number;
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: string;
  whenFull: "close" | "waitlist";
  waitlistPromotion: "auto" | "manual";
  feeEnabled: boolean;
  feeAmount: string;
  paymentRequired: boolean;
  lateGraceMinutes: string;
  busesEnabled: boolean;
  supervisorScope: "bus" | "all";
  schedule: { time: string; title: string; notes: string }[];
  dateLocked?: boolean;
};

type Row = { key: number; time: string; title: string; notes: string };

const selectCls = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base";

function Choice({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 accent-primary" />
      <span>{children}</span>
    </label>
  );
}

export function TripForm({ initial }: { initial: TripFormValues }) {
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [feeEnabled, setFeeEnabled] = useState(initial.feeEnabled);
  const [busesEnabled, setBusesEnabled] = useState(initial.busesEnabled);
  const [whenFull, setWhenFull] = useState(initial.whenFull);
  const [waitlistPromotion, setWaitlistPromotion] = useState(initial.waitlistPromotion);
  const [supervisorScope, setSupervisorScope] = useState(initial.supervisorScope);
  const [rows, setRows] = useState<Row[]>(() => initial.schedule.map((s, i) => ({ key: i, ...s })));
  const [nextKey, setNextKey] = useState(initial.schedule.length);

  const err = state.errors ?? {};
  const updateRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const moveRow = (index: number, dir: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const [item] = next.splice(index, 1);
      next.splice(index + dir, 0, item);
      return next;
    });

  // Submitted manually (not via `action`) so React doesn't reset the fields when validation fails.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveTrip(fd);
      if (result) {
        setState(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  return (
    <form method="post" onSubmit={onSubmit} className="max-w-3xl space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="schedule" value={JSON.stringify(rows.map(({ time, title, notes }) => ({ time, title, notes })))} />
      {state.ok === false && <Alert>{state.message ?? "راجع البيانات اللي عليها علامة"}</Alert>}

      <Card className="space-y-4">
        <h2 className="font-semibold">بيانات الرحلة</h2>
        <Field label="العنوان" error={err.title}>
          <Input name="title" defaultValue={initial.title} required maxLength={200} />
        </Field>
        <Field label="الوصف" error={err.description}>
          <textarea name="description" defaultValue={initial.description} rows={3} maxLength={5000} className={selectCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="التاريخ" error={err.date}>
            <Input name="date" type="date" defaultValue={initial.date} required readOnly={initial.dateLocked} />
          </Field>
          <Field label="ميعاد التحرك" error={err.startTime}>
            <Input name="startTime" type="time" defaultValue={initial.startTime} />
          </Field>
          <Field label="ميعاد الرجوع" error={err.endTime}>
            <Input name="endTime" type="time" defaultValue={initial.endTime} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="المكان" error={err.location}>
            <Input name="location" defaultValue={initial.location} maxLength={255} />
          </Field>
          <Field label="العدد الأقصى" error={err.capacity}>
            <Input name="capacity" type="number" inputMode="numeric" min={1} max={10000} defaultValue={initial.capacity} required />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">برنامج الرحلة</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, time: "", title: "", notes: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            + بند
          </Button>
        </div>
        {err.schedule && <p className="text-sm text-danger">{err.schedule}</p>}
        {rows.length === 0 && <p className="text-sm text-muted">مفيش بنود لسه.</p>}
        {rows.map((row, i) => (
          <div key={row.key} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[8rem_1fr_auto]">
            <Input type="time" value={row.time} onChange={(e) => updateRow(row.key, { time: e.target.value })} aria-label="الميعاد" />
            <div className="space-y-2">
              <Input value={row.title} onChange={(e) => updateRow(row.key, { title: e.target.value })} placeholder="البند" required maxLength={200} aria-label="البند" />
              <Input value={row.notes} onChange={(e) => updateRow(row.key, { notes: e.target.value })} placeholder="ملاحظات (اختياري)" maxLength={1000} aria-label="ملاحظات" />
            </div>
            <div className="flex gap-1 sm:flex-col">
              <Button type="button" variant="ghost" className="px-2 py-1" disabled={i === 0} onClick={() => moveRow(i, -1)} aria-label="لفوق">
                ↑
              </Button>
              <Button type="button" variant="ghost" className="px-2 py-1" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)} aria-label="لتحت">
                ↓
              </Button>
              <Button type="button" variant="ghost" className="px-2 py-1 text-danger" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} aria-label="حذف البند">
                ✕
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-5">
        <h2 className="font-semibold">إعدادات الرحلة</h2>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">لما العدد يكمل</legend>
          <Choice name="whenFull" value="close" checked={whenFull === "close"} onChange={() => setWhenFull("close")}>
            قفل الفورم تلقائي
          </Choice>
          <Choice name="whenFull" value="waitlist" checked={whenFull === "waitlist"} onChange={() => setWhenFull("waitlist")}>
            فتح قائمة انتظار
          </Choice>
        </fieldset>

        {whenFull === "waitlist" ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">لما حد يتلغي حجزه</legend>
            <Choice name="waitlistPromotion" value="auto" checked={waitlistPromotion === "auto"} onChange={() => setWaitlistPromotion("auto")}>
              ترقية أول واحد في الانتظار تلقائي (معلّق)
            </Choice>
            <Choice name="waitlistPromotion" value="manual" checked={waitlistPromotion === "manual"} onChange={() => setWaitlistPromotion("manual")}>
              الأدمن يرقّي يدوي
            </Choice>
          </fieldset>
        ) : (
          <input type="hidden" name="waitlistPromotion" value={waitlistPromotion} />
        )}

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="feeEnabled" checked={feeEnabled} onChange={(e) => setFeeEnabled(e.target.checked)} className="accent-primary" />
            اشتراك الرحلة
          </label>
          {feeEnabled && (
            <div className="grid gap-3 ps-6 sm:grid-cols-2">
              <Field label="المبلغ (جنيه)" error={err.feeAmount}>
                <Input name="feeAmount" type="number" inputMode="decimal" min={1} step="0.01" defaultValue={initial.feeAmount} required />
              </Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm">
                <input type="checkbox" name="paymentRequired" defaultChecked={initial.paymentRequired} className="accent-primary" />
                الحجز ميتأكدش غير بعد تسجيل الدفع
              </label>
            </div>
          )}
        </div>

        <Field label="فترة سماح المتأخرين (دقايق، 0 = مفيش سماح)" error={err.lateGraceMinutes}>
          <Input name="lateGraceMinutes" type="number" inputMode="numeric" min={0} max={240} defaultValue={initial.lateGraceMinutes} required className="max-w-40" />
        </Field>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="busesEnabled" checked={busesEnabled} onChange={(e) => setBusesEnabled(e.target.checked)} className="accent-primary" />
            الأتوبيسات
          </label>
          {busesEnabled ? (
            <fieldset className="space-y-2 ps-6">
              <legend className="mb-2 text-sm font-medium">المشرف يشوف</legend>
              <Choice name="supervisorScope" value="bus" checked={supervisorScope === "bus"} onChange={() => setSupervisorScope("bus")}>
                أتوبيسه بس
              </Choice>
              <Choice name="supervisorScope" value="all" checked={supervisorScope === "all"} onChange={() => setSupervisorScope("all")}>
                الرحلة كلها
              </Choice>
            </fieldset>
          ) : (
            <input type="hidden" name="supervisorScope" value={supervisorScope} />
          )}
        </div>
      </Card>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "جاري الحفظ…" : initial.id ? "حفظ التعديلات" : "إضافة الرحلة"}
      </Button>
    </form>
  );
}
