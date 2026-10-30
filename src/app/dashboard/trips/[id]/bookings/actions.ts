"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestCtx, requireUser } from "@/lib/auth/session";
import {
  addManualBooking,
  cancelBooking,
  confirmBooking,
  promoteBooking,
  resolveSubmittedData,
  setBookingOpen,
  setPayment,
} from "@/lib/bookings/service";
import { assignBus, autoAssignBuses } from "@/lib/buses/service";
import type { FormState } from "@/lib/form-state";
import { studentFormInput } from "@/lib/students/form";

const idSchema = z.coerce.number().int().positive();
const opSchema = z.enum(["confirm", "cancel", "promote", "pay", "unpay", "apply", "keep"]);

function refresh(activityId: number) {
  revalidatePath(`/dashboard/trips/${activityId}`);
  revalidatePath(`/dashboard/trips/${activityId}/bookings`);
}

/** Row actions on one booking; every service call re-checks the actor's abilities. */
export async function bookingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const ctx = await getRequestCtx();
  const id = idSchema.parse(fd.get("id"));
  const activityId = idSchema.parse(fd.get("activityId"));
  const op = opSchema.parse(fd.get("op"));

  const r =
    op === "confirm"
      ? await confirmBooking(actor, id, ctx)
      : op === "cancel"
        ? await cancelBooking(actor, id, ctx)
        : op === "promote"
          ? await promoteBooking(actor, id, ctx)
          : op === "pay" || op === "unpay"
            ? await setPayment(actor, id, op === "pay", ctx)
            : await resolveSubmittedData(actor, id, op, ctx);

  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  return { ok: true };
}

export async function assignBusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const activityId = idSchema.parse(fd.get("activityId"));
  const raw = fd.get("busId");
  const busId = raw ? idSchema.parse(raw) : null;
  const r = await assignBus(actor, idSchema.parse(fd.get("id")), busId, await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  return { ok: true };
}

export async function autoAssignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const activityId = idSchema.parse(fd.get("activityId"));
  const r = await autoAssignBuses(actor, activityId, await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  return { ok: true, message: r.left ? `اتوزع ${r.assigned}، وفاضل ${r.left} من غير مكان` : `اتوزع ${r.assigned}` };
}

export async function toggleBookingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const activityId = idSchema.parse(fd.get("activityId"));
  const r = await setBookingOpen(actor, activityId, fd.get("open") === "1", await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  return { ok: true };
}

export async function addManualAction(activityId: number, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const r = await addManualBooking(
    actor,
    idSchema.parse(activityId),
    { ...studentFormInput(fd), allowSameDay: fd.get("allowSameDay") === "on", paid: fd.get("paid") === "on" },
    await getRequestCtx(),
  );
  if (!r.ok) return { ok: false, message: r.error, errors: r.errors };
  refresh(activityId);
  return { ok: true, message: `اتضاف ${String(fd.get("name") ?? "").trim()} كحجز مؤكد` };
}
