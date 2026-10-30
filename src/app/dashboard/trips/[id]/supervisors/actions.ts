"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestCtx, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { assignSupervisor, setSupervisorBus, unassignSupervisor } from "@/lib/supervisors/assignments";

const idSchema = z.coerce.number().int().positive();

/** The services re-check `manage_activities`; these only parse and refresh. */
export async function tripSupervisorAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const ctx = await getRequestCtx();
  const activityId = idSchema.parse(fd.get("activityId"));
  const raw = fd.get("userId");
  if (!raw) return { ok: false, message: "اختار مشرف" };
  const userId = idSchema.parse(raw);
  const op = z.enum(["add", "remove", "bus"]).parse(fd.get("op"));

  const r =
    op === "add"
      ? await assignSupervisor(actor, activityId, userId, ctx)
      : op === "remove"
        ? await unassignSupervisor(actor, activityId, userId, ctx)
        : await setSupervisorBus(actor, activityId, userId, fd.get("busId") ? idSchema.parse(fd.get("busId")) : null, ctx);
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath(`/dashboard/trips/${activityId}`);
  return { ok: true };
}
