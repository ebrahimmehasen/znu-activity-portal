import { and, asc, eq, max, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { faculties } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";

export const facultyNameSchema = z.string().trim().min(2, "أدخل اسم الكلية").max(150);

type Result = { ok: true } | { ok: false; error: string };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_faculties")) throw new ForbiddenError();
}

async function nameTaken(name: string, exceptId?: number) {
  const [row] = await db
    .select({ id: faculties.id })
    .from(faculties)
    .where(and(sql`lower(${faculties.name}) = lower(${name})`, exceptId ? ne(faculties.id, exceptId) : undefined));
  return Boolean(row);
}

export function listFaculties({ activeOnly = false } = {}) {
  return db
    .select()
    .from(faculties)
    .where(activeOnly ? eq(faculties.isActive, true) : undefined)
    .orderBy(asc(faculties.sortOrder), asc(faculties.id));
}

export async function createFaculty(actor: SessionUser, rawName: string, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const parsed = facultyNameSchema.safeParse(rawName);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (await nameTaken(parsed.data)) return { ok: false, error: "هذه الكلية موجودة بالفعل" };

  const [{ last }] = await db.select({ last: max(faculties.sortOrder) }).from(faculties);
  const [created] = await db
    .insert(faculties)
    .values({ name: parsed.data, sortOrder: (last ?? 0) + 1 })
    .returning({ id: faculties.id });
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "faculty.created", subjectType: "faculty", subjectId: created.id, meta: { name: parsed.data } },
    ctx,
  );
  return { ok: true };
}

/** Faculties are never hard-deleted: students and bookings reference them. Deactivating hides them from forms. */
export async function updateFaculty(
  actor: SessionUser,
  id: number,
  patch: { name?: string; isActive?: boolean },
  ctx: RequestCtx,
): Promise<Result> {
  assertCanManage(actor);
  const [current] = await db.select().from(faculties).where(eq(faculties.id, id));
  if (!current) return { ok: false, error: "الكلية غير موجودة" };

  const values: { name?: string; isActive?: boolean } = {};
  if (patch.name !== undefined) {
    const parsed = facultyNameSchema.safeParse(patch.name);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    if (await nameTaken(parsed.data, id)) return { ok: false, error: "هذه الكلية موجودة بالفعل" };
    if (parsed.data !== current.name) values.name = parsed.data;
  }
  if (patch.isActive !== undefined && patch.isActive !== current.isActive) values.isActive = patch.isActive;
  if (Object.keys(values).length === 0) return { ok: true };

  await db.update(faculties).set(values).where(eq(faculties.id, id));
  await recordAudit(
    {
      actor: { type: "user", id: actor.id },
      action: "faculty.updated",
      subjectType: "faculty",
      subjectId: id,
      meta: { before: { name: current.name, isActive: current.isActive }, after: values },
    },
    ctx,
  );
  return { ok: true };
}
