"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { createTrip, deleteTrip, updateTrip, type TripInput } from "@/lib/trips/service";

const idSchema = z.coerce.number().int().positive();

function formToInput(fd: FormData): TripInput {
  const s = (k: string) => String(fd.get(k) ?? "");
  let schedule: unknown = [];
  try {
    schedule = JSON.parse(s("schedule") || "[]");
  } catch {}
  // Values are untrusted strings here; tripInputSchema validates and coerces every field.
  return {
    title: s("title"),
    description: s("description"),
    date: s("date"),
    startTime: s("startTime"),
    endTime: s("endTime"),
    location: s("location"),
    capacity: s("capacity"),
    whenFull: s("whenFull"),
    waitlistPromotion: s("waitlistPromotion"),
    feeEnabled: fd.get("feeEnabled") === "on",
    feeAmount: s("feeAmount"),
    paymentRequired: fd.get("paymentRequired") === "on",
    lateGraceMinutes: s("lateGraceMinutes"),
    busesEnabled: fd.get("busesEnabled") === "on",
    supervisorScope: s("supervisorScope"),
    schedule: Array.isArray(schedule) ? schedule : [],
  } as unknown as TripInput;
}

export async function saveTrip(formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_activities");
  const ctx = await getRequestCtx();
  const input = formToInput(formData);
  const rawId = formData.get("id");

  let id: number;
  if (rawId) {
    id = idSchema.parse(rawId);
    const r = await updateTrip(actor, id, input, ctx);
    if (!r.ok) return { ok: false, errors: r.errors, message: r.errors._ };
  } else {
    const r = await createTrip(actor, input, ctx);
    if (!r.ok) return { ok: false, errors: r.errors, message: r.errors._ };
    id = r.id;
  }
  revalidatePath("/dashboard/trips");
  redirect(`/dashboard/trips/${id}`);
}

export async function deleteTripAction(formData: FormData) {
  const actor = await requireAbility("manage_activities");
  const r = await deleteTrip(actor, idSchema.parse(formData.get("id")), await getRequestCtx());
  if (r.ok) {
    revalidatePath("/dashboard/trips");
    redirect("/dashboard/trips");
  }
}
