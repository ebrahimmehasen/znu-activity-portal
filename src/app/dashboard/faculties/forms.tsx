"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button, Input } from "@/components/ui";
import { createFacultyAction, renameFacultyAction } from "./actions";

export function CreateFacultyForm() {
  const [state, action, pending] = useActionState(createFacultyAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="space-y-1.5">
      <div className="flex gap-2">
        <Input name="name" required maxLength={150} placeholder="اسم الكلية" aria-label="اسم الكلية" />
        <Button type="submit" disabled={pending}>
          إضافة
        </Button>
      </div>
      {state.errors?.name && <p className="text-sm text-danger">{state.errors.name}</p>}
    </form>
  );
}

export function RenameFacultyForm({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState(renameFacultyAction, {});
  return (
    <form action={action} className="flex-1 space-y-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex gap-2">
        <Input name="name" defaultValue={name} required maxLength={150} aria-label="اسم الكلية" />
        <Button type="submit" variant="secondary" disabled={pending}>
          حفظ
        </Button>
      </div>
      {state.message && <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
    </form>
  );
}
