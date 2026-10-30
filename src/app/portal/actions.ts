"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { markStudentRead } from "@/lib/announcements/service";
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
  if (!parsed.success) return { ok: false, message: "أدخل رقم الهاتف والرقم القومي" };

  const ctx = await getRequestCtx();
  const r = await authenticateStudent(parsed.data.phone, parsed.data.nationalId, ctx);
  if (!r.ok) {
    if (r.reason === "locked") return { ok: false, message: `محاولات خاطئة كثيرة. حاول مجددًا بعد ${Math.ceil(r.retryAfterSeconds / 60)} دقيقة.` };
    if (r.reason === "not_confirmed") return { ok: false, message: "لا يوجد لك حجز مؤكد بعد. يمكنك الدخول بمجرد تأكيد حجزك." };
    return { ok: false, message: "هذه البيانات لا تطابق أي حجز. أدخل الهاتف والرقم القومي اللذين حجزت بهما." };
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

/** Called by the page once the announcements are on screen (the badge re-polls by itself). */
export async function markStudentReadAction(ids: number[]) {
  const student = await getCurrentStudent();
  const parsed = z.array(z.number().int().positive()).max(100).safeParse(ids);
  if (!student || !parsed.success) return;
  await markStudentRead(student.id, parsed.data);
}
