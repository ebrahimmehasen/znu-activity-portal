"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { addCheckpointAction } from "./actions";

export function AddCheckpointForm({ activityId }: { activityId: number }) {
  const [state, action, pending] = useActionState(addCheckpointAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="activityId" value={activityId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="اسم التجمع" error={state.errors?.name}>
          <Input name="name" required maxLength={150} placeholder="مثلًا: بعد الغدا" />
        </Field>
        <Field label="الميعاد" error={state.errors?.time}>
          <Input name="time" type="time" required />
        </Field>
        <Button type="submit" disabled={pending}>
          إضافة
        </Button>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
