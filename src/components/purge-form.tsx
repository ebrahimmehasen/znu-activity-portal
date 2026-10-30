"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form-state";
import { Alert, Button, Input } from "./ui";

/**
 * Double confirmation for wiping data: type the given text, then confirm the dialog.
 * The server checks the typed text again.
 */
export function PurgeForm({
  action,
  id,
  expected,
  prompt,
  confirmMessage,
  label = "مسح نهائي",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  id: number;
  expected: string;
  prompt: string;
  confirmMessage: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        {prompt}
        <Input name="confirm" required autoComplete="off" className="mt-1" placeholder={expected} />
      </label>
      <Button
        type="submit"
        variant="danger"
        disabled={pending}
        onClick={(e) => {
          const typed = (e.currentTarget.form?.elements.namedItem("confirm") as HTMLInputElement | null)?.value.trim();
          if (typed !== expected.trim()) {
            e.preventDefault();
            window.alert("النص اللي كتبته مش مطابق");
          } else if (!window.confirm(confirmMessage)) e.preventDefault();
        }}
      >
        {pending ? "جاري المسح…" : label}
      </Button>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
