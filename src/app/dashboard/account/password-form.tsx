"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { changePassword } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="الباسورد الحالي" error={state.errors?.current}>
        <Input name="current" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Field label="الباسورد الجديد" error={state.errors?.next}>
        <Input name="next" type="password" autoComplete="new-password" required minLength={8} dir="ltr" />
      </Field>
      <Field label="تأكيد الباسورد الجديد" error={state.errors?.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required dir="ltr" />
      </Field>
      <Button type="submit" disabled={pending}>
        حفظ
      </Button>
    </form>
  );
}
