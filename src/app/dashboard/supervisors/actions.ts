"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupervisorPermission } from "@/db/schema";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import { fieldErrors, type FormState } from "@/lib/form-state";
import {
  createSupervisor,
  createSupervisorSchema,
  deleteSupervisor,
  resetSupervisorPassword,
  setSupervisorActive,
  setSupervisorPermissions,
} from "@/lib/supervisors/service";

const idSchema = z.coerce.number().int().positive();

async function guard() {
  return { actor: await requireAbility("manage_supervisors"), ctx: await getRequestCtx() };
}

const done = (message?: string): FormState => {
  revalidatePath("/dashboard/supervisors");
  return { ok: true, message };
};

export async function createSupervisorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const parsed = createSupervisorSchema.safeParse({
    name: fd.get("name"),
    username: fd.get("username"),
    password: fd.get("password"),
    permissions: fd.getAll("permissions"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const r = await createSupervisor(actor, parsed.data, ctx);
  if (!r.ok) return { ok: false, errors: { username: r.error } };
  return done(`أُضيف ${parsed.data.name}`);
}

export async function permissionsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const r = await setSupervisorPermissions(actor, idSchema.parse(fd.get("id")), fd.getAll("permissions") as SupervisorPermission[], ctx);
  if (!r.ok) return { ok: false, message: r.error };
  return done("حُفظت الصلاحيات");
}

export async function toggleSupervisorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const r = await setSupervisorActive(actor, idSchema.parse(fd.get("id")), fd.get("active") === "1", ctx);
  if (!r.ok) return { ok: false, message: r.error };
  return done();
}

export async function deleteSupervisorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const r = await deleteSupervisor(actor, idSchema.parse(fd.get("id")), ctx);
  if (!r.ok) return { ok: false, message: r.error };
  return done();
}

export async function resetSupervisorPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { actor, ctx } = await guard();
  const r = await resetSupervisorPassword(actor, idSchema.parse(fd.get("id")), String(fd.get("password") ?? ""), ctx);
  if (!r.ok) return { ok: false, message: r.error };
  return { ok: true, message: "تم تغيير كلمة المرور وتسجيل خروجه من كل أجهزته" };
}
