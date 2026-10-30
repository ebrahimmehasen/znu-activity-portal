"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { purgeStudent, purgeTrip } from "@/lib/purge/service";

const idSchema = z.coerce.number().int().positive();
const typed = (fd: FormData) => String(fd.get("confirm") ?? "");

export async function purgeTripAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_activities");
  const r = await purgeTrip(actor, idSchema.parse(fd.get("id")), typed(fd), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath("/dashboard/trips");
  redirect("/dashboard/trips?status=finished");
}

export async function purgeStudentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_activities");
  const r = await purgeStudent(actor, idSchema.parse(fd.get("id")), typed(fd), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath("/dashboard/students");
  return { ok: true, message: "بيانات الطالب اتمسحت" };
}
