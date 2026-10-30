"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import { createBus, deleteBus, updateBus } from "@/lib/buses/service";
import type { FormState } from "@/lib/form-state";

const idSchema = z.coerce.number().int().positive();

function busInput(fd: FormData) {
  return { name: String(fd.get("name") ?? ""), capacity: String(fd.get("capacity") ?? "") };
}

export async function createBusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_activities");
  const activityId = idSchema.parse(formData.get("activityId"));
  const r = await createBus(actor, activityId, busInput(formData), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/dashboard/trips/${activityId}`);
  return { ok: true };
}

export async function updateBusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_activities");
  const r = await updateBus(actor, idSchema.parse(formData.get("id")), busInput(formData), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/dashboard/trips/${idSchema.parse(formData.get("activityId"))}`);
  return { ok: true, message: "تم الحفظ" };
}

export async function deleteBusAction(formData: FormData) {
  const actor = await requireAbility("manage_activities");
  await deleteBus(actor, idSchema.parse(formData.get("id")), await getRequestCtx());
  revalidatePath(`/dashboard/trips/${idSchema.parse(formData.get("activityId"))}`);
}
