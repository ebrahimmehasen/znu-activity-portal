"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addCheckpoint,
  confirmRecords,
  endTrip,
  lockRoster,
  markAbsent,
  markRemainingAbsent,
  removeSupervisorAttendance,
  reopenTrip,
  restoreAbsent,
  setCheckpointOpen,
  startTrip,
  syncAttendance,
  voidRecord,
} from "@/lib/attendance/service";
import { getRequestCtx, requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";

const idSchema = z.coerce.number().int().positive();
const opSchema = z.enum([
  "start",
  "end",
  "reopen",
  "lock",
  "present",
  "absent",
  "remaining_absent",
  "confirm",
  "confirm_all",
  "void",
  "restore",
  "open_cp",
  "close_cp",
  "staff_present",
  "staff_remove",
]);

function refresh(activityId: number) {
  revalidatePath(`/dashboard/trips/${activityId}`);
  revalidatePath(`/dashboard/trips/${activityId}/attendance`);
}

/** Every trip-run and attendance button posts here; the services re-check each ability. */
export async function attendanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const ctx = await getRequestCtx();
  const activityId = idSchema.parse(fd.get("activityId"));
  const op = opSchema.parse(fd.get("op"));
  const id = (k: string) => idSchema.parse(fd.get(k));

  // A manual mark from this page is an online "scan" without a code.
  const manual = async (record: Record<string, unknown>) => {
    const r = await syncAttendance(actor, activityId, [{ clientUuid: crypto.randomUUID(), method: "manual", recordedAt: Date.now(), ...record }]);
    if (!r.ok) return r;
    const [o] = r.outcomes;
    return o.result === "recorded" || o.result === "pending" ? { ok: true as const } : { ok: false as const, error: o.message };
  };

  let r: { ok: true; count?: number; present?: number; absent?: number } | { ok: false; error?: string };
  switch (op) {
    case "start":
      r = await startTrip(actor, activityId, ctx);
      break;
    case "end":
      r = await endTrip(actor, activityId, ctx);
      break;
    case "reopen":
      r = await reopenTrip(actor, activityId, fd.get("confirm") === "yes", ctx);
      break;
    case "lock":
      r = await lockRoster(actor, activityId, ctx);
      break;
    case "present":
      r = await manual({ kind: "student", checkpointId: id("checkpointId"), bookingId: id("bookingId") });
      break;
    case "absent":
      r = await markAbsent(actor, id("checkpointId"), id("bookingId"), ctx);
      break;
    case "remaining_absent":
      r = await markRemainingAbsent(actor, id("checkpointId"), ctx);
      break;
    case "confirm":
    case "confirm_all":
      r = await confirmRecords(actor, id("checkpointId"), op === "confirm" ? id("recordId") : null, ctx);
      break;
    case "void":
      r = await voidRecord(actor, id("recordId"), ctx);
      break;
    case "restore":
      r = await restoreAbsent(actor, id("bookingId"), ctx);
      break;
    case "open_cp":
    case "close_cp":
      r = await setCheckpointOpen(actor, id("checkpointId"), op === "open_cp", ctx);
      break;
    case "staff_present":
      r = await manual({ kind: "staff", userId: id("userId") });
      break;
    case "staff_remove":
      r = await removeSupervisorAttendance(actor, activityId, id("userId"), ctx);
      break;
  }

  if (!r.ok) return { ok: false, message: r.error };
  refresh(activityId);
  if (op === "lock" && "present" in r) return { ok: true, message: `اتأكد العدد: ${r.present} حاضر و${r.absent} غياب` };
  if ("count" in r && r.count !== undefined) return { ok: true, message: `تم (${r.count})` };
  return { ok: true };
}

export async function addCheckpointAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requireUser();
  const activityId = idSchema.parse(fd.get("activityId"));
  const r = await addCheckpoint(actor, activityId, { name: String(fd.get("name") ?? ""), time: String(fd.get("time") ?? "") }, await getRequestCtx());
  if (!r.ok) return { ok: false, message: "error" in r ? r.error : undefined, errors: "errors" in r ? r.errors : undefined };
  refresh(activityId);
  return { ok: true, message: "اتضاف التجمع. افتحه لما يبدأ" };
}
