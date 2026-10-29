"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Input } from "@/components/ui";
import { createBusAction, updateBusAction } from "./actions";

export function CreateBusForm({ activityId, defaultName }: { activityId: number; defaultName: string }) {
  const [state, action, pending] = useActionState(createBusAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-1.5">
      <input type="hidden" name="activityId" value={activityId} />
      <div className="flex gap-2">
        <Input name="name" defaultValue={defaultName} required maxLength={100} aria-label="اسم الأتوبيس" />
        <Input name="capacity" type="number" inputMode="numeric" min={1} max={200} defaultValue={50} required className="w-24" aria-label="السعة" />
        <Button type="submit" disabled={pending}>
          إضافة
        </Button>
      </div>
      {state.message && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}

export function EditBusForm({ activityId, id, name, capacity }: { activityId: number; id: number; name: string; capacity: number }) {
  const [state, action, pending] = useActionState(updateBusAction, {});
  return (
    <form action={action} className="flex-1 space-y-1">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <Input name="name" defaultValue={name} required maxLength={100} aria-label="اسم الأتوبيس" />
        <Input name="capacity" type="number" inputMode="numeric" min={1} max={200} defaultValue={capacity} required className="w-24" aria-label="السعة" />
        <Button type="submit" variant="secondary" disabled={pending}>
          حفظ
        </Button>
      </div>
      {state.message && <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
