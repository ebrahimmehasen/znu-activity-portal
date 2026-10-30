"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { createAdminAction, resetPasswordAction } from "./actions";
import { useT } from "@/i18n/client";

export function CreateAdminForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createAdminAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-3">
      {state.message && (
        <div className="sm:col-span-3">
          <Alert tone="success">{state.message}</Alert>
        </div>
      )}
      <Field label={t("الاسم")} error={state.errors?.name}>
        <Input name="name" required maxLength={150} />
      </Field>
      <Field label={t("اسم المستخدم")} error={state.errors?.username}>
        <Input name="username" required maxLength={50} dir="ltr" autoComplete="off" />
      </Field>
      <Field label={t("كلمة المرور")} error={state.errors?.password}>
        <Input name="password" type="password" required minLength={8} dir="ltr" autoComplete="new-password" />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={pending}>
          {t("إضافة مسؤول")}
        </Button>
      </div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: number }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <Input name="password" type="password" required minLength={8} placeholder={t("كلمة مرور جديدة")} dir="ltr" autoComplete="new-password" />
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("حفظ")}
        </Button>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
