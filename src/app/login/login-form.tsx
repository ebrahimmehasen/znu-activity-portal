"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert>{state.message}</Alert>}
      <Field label="اسم المستخدم">
        <Input name="username" autoComplete="username" required maxLength={50} dir="ltr" />
      </Field>
      <Field label="الباسورد">
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "جاري الدخول…" : "دخول"}
      </Button>
    </form>
  );
}
