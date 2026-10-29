"use server";

import { z } from "zod";
import { changeOwnPassword } from "@/lib/auth/service";
import { getRequestCtx, getSessionToken, requireUser } from "@/lib/auth/session";
import { fieldErrors, type FormState } from "@/lib/form-state";
import { passwordSchema } from "@/lib/password";

const schema = z
  .object({
    current: z.string().min(1, "اكتب الباسورد الحالي"),
    next: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { path: ["confirm"], message: "الباسوردين مش متطابقين" });

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);

  const token = (await getSessionToken())!;
  const result = await changeOwnPassword(user.id, parsed.data.current, parsed.data.next, token, await getRequestCtx());
  if (!result.ok) return { ok: false, errors: { current: "الباسورد الحالي غلط" } };
  return { ok: true, message: "اتغيّر الباسورد، وكل الأجهزة التانية اتعملها خروج." };
}
