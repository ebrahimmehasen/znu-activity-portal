"use client";

import { useState, useTransition } from "react";
import { StudentFields } from "@/components/student-fields";
import { Alert, Button } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { useT } from "@/i18n/client";

export function BookingForm({
  action,
  faculties,
  waitlist,
}: {
  action: (fd: FormData) => Promise<FormState>;
  faculties: { id: number; name: string }[];
  waitlist: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  if (state.ok) {
    return (
      <div role="status" className="space-y-2 py-6 text-center">
        <div className="text-4xl text-success">✓</div>
        <p className="text-lg font-semibold text-success">{state.message}</p>
        <p className="text-sm text-muted">{t("لا يمكنك إلغاء الحجز بنفسك. للإلغاء تواصل مع المسؤول عن الرحلة.")}</p>
      </div>
    );
  }

  return (
    <form
      method="post"
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Submitting manually keeps the typed values when validation fails.
        startTransition(async () => setState(await action(fd)));
      }}
    >
      {waitlist && <Alert>{t("اكتمل العدد. إذا حجزت الآن فستدخل قائمة الانتظار.")}</Alert>}
      {state.message && <Alert>{state.message}</Alert>}
      <StudentFields faculties={faculties} errors={state.errors} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("جارٍ الإرسال…") : waitlist ? t("سجِّلني في قائمة الانتظار") : t("احجز")}
      </Button>
    </form>
  );
}
