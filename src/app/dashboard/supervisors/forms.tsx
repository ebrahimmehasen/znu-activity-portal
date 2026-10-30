"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { SupervisorPermission } from "@/db/schema";
import { SUPERVISOR_PERMISSIONS, SUPERVISOR_PERMISSION_KEYS } from "@/lib/authz";
import { createSupervisorAction, permissionsAction, resetSupervisorPasswordAction } from "./actions";
import { useT } from "@/i18n/client";

function PermissionBoxes({ selected = [] }: { selected?: readonly SupervisorPermission[] }) {
  const t = useT();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SUPERVISOR_PERMISSION_KEYS.map((key) => (
        <label key={key} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="permissions" value={key} defaultChecked={selected.includes(key)} className="mt-1 accent-primary" />
          <span>
            {t(SUPERVISOR_PERMISSIONS[key].label)}
            {SUPERVISOR_PERMISSIONS[key].hint && <span className="block text-xs text-muted">{t(SUPERVISOR_PERMISSIONS[key].hint)}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export function CreateSupervisorForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createSupervisorAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-4">
      {state.message && <Alert tone="success">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("الاسم")} error={state.errors?.name}>
          <Input name="name" required maxLength={150} />
        </Field>
        <Field label={t("اسم المستخدم")} error={state.errors?.username}>
          <Input name="username" required maxLength={50} dir="ltr" autoComplete="off" />
        </Field>
        <Field label={t("كلمة المرور")} error={state.errors?.password}>
          <Input name="password" type="password" required minLength={8} dir="ltr" autoComplete="new-password" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("الصلاحيات")}</legend>
        <PermissionBoxes />
      </fieldset>
      <Button type="submit" disabled={pending}>
        {t("إضافة مشرف")}
      </Button>
    </form>
  );
}

export function PermissionsForm({ id, selected }: { id: number; selected: readonly SupervisorPermission[] }) {
  const t = useT();
  const [state, action, pending] = useActionState(permissionsAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <PermissionBoxes selected={selected} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("حفظ الصلاحيات")}
        </Button>
        {state.message && <span className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{t(state.message)}</span>}
      </div>
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: number }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetSupervisorPasswordAction, {});
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
