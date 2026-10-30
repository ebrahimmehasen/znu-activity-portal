"use client";

import { useActionState, type ComponentProps } from "react";
import type { FormState } from "@/lib/form-state";
import { Button } from "./ui";

/**
 * A one-button form for a row action. Hidden `fields` are posted with it, an
 * optional `confirm` prompt guards it, and the action's error shows beside it.
 */
export function ActionButton({
  action,
  fields,
  confirm,
  children,
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, "formAction"> & {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields: Record<string, string | number>;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
        {...buttonProps}
      >
        {children}
      </Button>
      {state.ok === false && state.message && <span className="max-w-56 text-xs text-danger">{state.message}</span>}
    </form>
  );
}
