"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import { createFaculty, updateFaculty } from "@/lib/faculties/service";
import type { FormState } from "@/lib/form-state";

const idSchema = z.coerce.number().int().positive();

export async function createFacultyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_faculties");
  const r = await createFaculty(actor, String(formData.get("name") ?? ""), await getRequestCtx());
  if (!r.ok) return { ok: false, errors: { name: r.error } };
  revalidatePath("/dashboard/faculties");
  return { ok: true };
}

export async function renameFacultyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_faculties");
  const id = idSchema.parse(formData.get("id"));
  const r = await updateFaculty(actor, id, { name: String(formData.get("name") ?? "") }, await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath("/dashboard/faculties");
  return { ok: true, message: "تم الحفظ" };
}

export async function toggleFacultyAction(formData: FormData) {
  const actor = await requireAbility("manage_faculties");
  const id = idSchema.parse(formData.get("id"));
  await updateFaculty(actor, id, { isActive: formData.get("active") === "1" }, await getRequestCtx());
  revalidatePath("/dashboard/faculties");
}
