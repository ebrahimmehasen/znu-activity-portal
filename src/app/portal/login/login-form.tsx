"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { studentLogin } from "../actions";
import { useT } from "@/i18n/client";

export function StudentLoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(studentLogin, {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert>{state.message}</Alert>}
      <Field label={t("رقم الهاتف")}>
        <Input name="phone" inputMode="numeric" autoComplete="tel" required maxLength={20} dir="ltr" placeholder="01xxxxxxxxx" />
      </Field>
      <Field label={t("الرقم القومي")}>
        <Input name="nationalId" inputMode="numeric" autoComplete="off" required maxLength={20} dir="ltr" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t("جارٍ الدخول…") : t("دخول")}
      </Button>
    </form>
  );
}
