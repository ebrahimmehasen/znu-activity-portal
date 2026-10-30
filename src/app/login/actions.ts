"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession } from "@/lib/auth/service";
import { getRequestCtx, setSessionCookie } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";

const schema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ username: formData.get("username"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, message: "أدخل اسم المستخدم وكلمة المرور" };

  const ctx = await getRequestCtx();
  const result = await authenticate(parsed.data.username, parsed.data.password, ctx);

  if (!result.ok) {
    if (result.reason === "locked") {
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      return { ok: false, message: `محاولات خاطئة كثيرة. حاول مجددًا بعد ${minutes} دقيقة.` };
    }
    if (result.reason === "frozen") return { ok: false, message: "هذا الحساب مجمَّد. تواصل مع المسؤول." };
    return { ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  }

  const { token } = await createSession(result.user.id, ctx);
  await setSessionCookie(token);
  redirect("/dashboard");
}
