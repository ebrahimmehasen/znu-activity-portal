"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { addCheckpointAction } from "./actions";
import { useT } from "@/i18n/client";

export function AddCheckpointForm({ activityId }: { activityId: number }) {
  const t = useT();
  const [state, action, pending] = useActionState(addCheckpointAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="activityId" value={activityId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label={t("اسم التجمع")} error={state.errors?.name}>
          <Input name="name" required maxLength={150} placeholder={t("مثلًا: بعد الغداء")} />
        </Field>
        <Field label={t("الموعد")} error={state.errors?.time}>
          <Input name="time" type="time" required />
        </Field>
        <Button type="submit" disabled={pending}>
          {t("إضافة")}
        </Button>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
