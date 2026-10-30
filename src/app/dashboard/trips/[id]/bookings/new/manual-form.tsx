"use client";

import { useRef, useState, useTransition } from "react";
import { StudentFields } from "@/components/student-fields";
import { Alert, Button } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { useT } from "@/i18n/client";

export function ManualBookingForm({
  action,
  faculties,
  feeAmount,
  paymentRequired,
  canOverrideSameDay,
}: {
  action: (fd: FormData) => Promise<FormState>;
  faculties: { id: number; name: string }[];
  feeAmount: number | null;
  paymentRequired: boolean;
  canOverrideSameDay: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const err = state.errors ?? {};

  return (
    <form
      method="post"
      ref={ref}
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const next = await action(fd);
          setState(next);
          // Clear for the next student only on success; errors keep what was typed.
          if (next.ok) ref.current?.reset();
        });
      }}
    >
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <StudentFields faculties={faculties} errors={state.ok ? {} : err} />

      {feeAmount !== null && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="paid" className="mt-1 accent-primary" />
          <span>
            {t("دفع الطالب الاشتراك ({amount} جنيه)", { amount: feeAmount })}
            {paymentRequired && <span className="block text-muted">{t("التأكيد في هذه الرحلة بعد الدفع.")}</span>}
            {err.paid && <span className="block text-danger">{err.paid}</span>}
          </span>
        </label>
      )}

      {canOverrideSameDay && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="allowSameDay" className="mt-1 accent-primary" />
          <span>
            {t("تجاوز منع الحجز في رحلتين في اليوم نفسه")}
            <span className="block text-muted">{t("يُسجَّل في سجل العمليات.")}</span>
            {err.allowSameDay && <span className="block text-danger">{err.allowSameDay}</span>}
          </span>
        </label>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? t("جارٍ الإضافة…") : t("إضافة بحجز مؤكد")}
      </Button>
    </form>
  );
}
