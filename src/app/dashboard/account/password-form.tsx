"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { changePassword } from "./actions";
import { useT } from "@/i18n/client";

export function PasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label={t("كلمة المرور الحالية")} error={state.errors?.current}>
        <Input name="current" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Field label={t("كلمة المرور الجديدة")} error={state.errors?.next}>
        <Input name="next" type="password" autoComplete="new-password" required minLength={8} dir="ltr" />
      </Field>
      <Field label={t("تأكيد كلمة المرور الجديدة")} error={state.errors?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("حفظ")}
      </Button>
    </form>
  );
}
