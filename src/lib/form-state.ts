import type { z } from "zod";

/** Shape returned by every form Server Action and consumed by `useActionState`. */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string | undefined>;
};

export function fieldErrors(error: z.ZodError): FormState {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}
