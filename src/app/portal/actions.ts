"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getRequestCtx } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { authenticateStudent, createStudentSession, deleteStudentSession } from "@/lib/students/auth";
import { clearStudentCookie, getCurrentStudent, getStudentToken, setStudentCookie } from "@/lib/students/session";

const schema = z.object({
  phone: z.string().trim().min(1).max(30),
  nationalId: z.string().trim().min(1).max(30),
});

export async function studentLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = schema.safeParse({ phone: fd.get("phone"), nationalId: fd.get("nationalId") });
  if (!parsed.success) return { ok: false, message: "اكتب رقم الهاتف والرقم القومي" };

  const ctx = await getRequestCtx();
  const r = await authenticateStudent(parsed.data.phone, parsed.data.nationalId, ctx);
  if (!r.ok) {
    if (r.reason === "locked") return { ok: false, message: `محاولات كتير غلط. حاول تاني بعد ${Math.ceil(r.retryAfterSeconds / 60)} دقيقة.` };
    if (r.reason === "not_confirmed") return { ok: false, message: "لسه مفيش حجز متأكد ليك. هتقدر تدخل أول ما حجزك يتأكد." };
    return { ok: false, message: "البيانات دي مش مطابقة لأي حجز. اكتب نفس الهاتف والرقم القومي اللي حجزت بيهم." };
  }

  await setStudentCookie(await createStudentSession(r.student.id, ctx));
  redirect("/portal");
}

export async function studentLogout() {
  const token = await getStudentToken();
  const student = await getCurrentStudent();
  if (token) await deleteStudentSession(token);
  if (student) await recordAudit({ actor: { type: "student", id: student.id }, action: "student.logout" }, await getRequestCtx());
  await clearStudentCookie();
  redirect("/portal/login");
}
