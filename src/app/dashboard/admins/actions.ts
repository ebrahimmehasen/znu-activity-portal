"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdmin, createAdminSchema, deleteAdmin, resetAdminPassword, setAdminActive } from "@/lib/admins/service";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import { fieldErrors, type FormState } from "@/lib/form-state";

const idSchema = z.coerce.number().int().positive();

async function guard() {
  return { actor: await requireAbility("manage_admins"), ctx: await getRequestCtx() };
}

export async function createAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const parsed = createAdminSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrors(parsed.error);
  const r = await createAdmin(actor, parsed.data, ctx);
  if (!r.ok) return { ok: false, errors: { username: r.error } };
  revalidatePath("/dashboard/admins");
  return { ok: true, message: `اتضاف ${parsed.data.name}` };
}

export async function toggleAdminAction(formData: FormData) {
  const { actor, ctx } = await guard();
  const id = idSchema.parse(formData.get("id"));
  await setAdminActive(actor, id, formData.get("active") === "1", ctx);
  revalidatePath("/dashboard/admins");
}

export async function deleteAdminAction(formData: FormData) {
  const { actor, ctx } = await guard();
  await deleteAdmin(actor, idSchema.parse(formData.get("id")), ctx);
  revalidatePath("/dashboard/admins");
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const id = idSchema.parse(formData.get("id"));
  const r = await resetAdminPassword(actor, id, String(formData.get("password") ?? ""), ctx);
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, message: "اتغيّر الباسورد واتعمل خروج من كل أجهزته" };
}
