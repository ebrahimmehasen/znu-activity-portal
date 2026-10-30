"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteAnnouncement, markStaffRead, sendAnnouncement } from "@/lib/announcements/service";
import { getRequestCtx, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";

const idSchema = z.coerce.number().int().positive();

function refresh(activityId?: number) {
  revalidatePath("/dashboard/announcements");
  if (activityId) revalidatePath(`/dashboard/trips/${activityId}`);
}

export async function sendAnnouncementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const activityId = idSchema.parse(fd.get("activityId"));
  const r = await sendAnnouncement(actor, activityId, { audience: fd.get("audience"), body: fd.get("body") }, await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  return { ok: true, message: "أُرسل الإعلان" };
}

export async function deleteAnnouncementAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const r = await deleteAnnouncement(actor, idSchema.parse(fd.get("id")), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  refresh(Number(fd.get("activityId")) || undefined);
  return { ok: true };
}

/** Called by the page once the announcements are on screen (the badge re-polls by itself). */
export async function markStaffReadAction(ids: number[]) {
  const actor = await requireUser();
  const parsed = z.array(idSchema).max(100).safeParse(ids);
  if (!parsed.success) return;
  await markStaffRead(actor, parsed.data);
}
