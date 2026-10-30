import { and, desc, eq, exists, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activities, announcementReads, announcements, bookings, users } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { MAX_ANNOUNCEMENT_LENGTH } from "./labels";
import { canViewTrip, visibleTripsCondition } from "@/lib/supervisors/scope";
import { getTrip } from "@/lib/trips/service";

/**
 * Trip announcements (plan §5.8): admins, and supervisors allowed to, post to a trip for
 * its staff only or for everyone on it (staff + students with a confirmed booking).
 * Staff see the announcements of every trip they can see; students only "all" ones on
 * their confirmed trips. Unread counts come from `announcement_reads`, polled by the UI.
 */

type Fail = { ok: false; error: string };
type Result<T = object> = ({ ok: true } & T) | Fail;

const LIST_LIMIT = 100;

export const announcementInputSchema = z.object({
  audience: z.enum(["supervisors", "all"], { message: "اختار مين يشوف الإعلان" }),
  body: z
    .string()
    .trim()
    .min(1, "اكتب نص الإعلان")
    .max(MAX_ANNOUNCEMENT_LENGTH, `الإعلان أطول من ${MAX_ANNOUNCEMENT_LENGTH} حرف`),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

type Reader = { type: "user" | "student"; id: number };

const readBy = (r: Reader) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(announcementReads)
      .where(
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.readerType, r.type),
          eq(announcementReads.readerId, r.id),
        ),
      ),
  );

const fields = (r: Reader) => ({
  id: announcements.id,
  activityId: announcements.activityId,
  tripTitle: activities.title,
  audience: announcements.audience,
  body: announcements.body,
  createdAt: announcements.createdAt,
  senderId: announcements.senderId,
  senderName: users.name,
  read: readBy(r).mapWith(Boolean),
});

// ─── Staff ───────────────────────────────────────────────────────────────────

export async function sendAnnouncement(actor: SessionUser, activityId: number, input: unknown, ctx: RequestCtx): Promise<Result<{ id: number }>> {
  if (!can(actor, "send_announcements")) throw new ForbiddenError();
  const trip = await getTrip(activityId);
  if (!trip || !(await canViewTrip(actor, activityId))) throw new ForbiddenError();
  const parsed = announcementInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(announcements)
      .values({ activityId, senderId: actor.id, ...parsed.data })
      .returning({ id: announcements.id });
    // The sender has read their own announcement.
    await tx.insert(announcementReads).values({ announcementId: row.id, readerType: "user", readerId: actor.id });
    return row.id;
  });
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "announcement.sent", subjectType: "activity", subjectId: activityId, meta: { announcementId: id, audience: parsed.data.audience } },
    ctx,
  );
  return { ok: true, id };
}

/** Admins delete any announcement; a supervisor only their own. */
export async function deleteAnnouncement(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  const [row] = await db.select().from(announcements).where(eq(announcements.id, id));
  if (!row) return { ok: false, error: "الإعلان مش موجود" };
  const mayDelete = can(actor, "manage_activities") || (row.senderId === actor.id && can(actor, "send_announcements"));
  if (!mayDelete || !(await canViewTrip(actor, row.activityId))) throw new ForbiddenError();
  await db.delete(announcements).where(eq(announcements.id, id));
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "announcement.deleted", subjectType: "activity", subjectId: row.activityId, meta: { announcementId: id, body: row.body } },
    ctx,
  );
  return { ok: true };
}

async function staffCondition(actor: SessionUser, activityId?: number): Promise<SQL | undefined> {
  return and(await visibleTripsCondition(actor), activityId ? eq(announcements.activityId, activityId) : undefined);
}

/** Newest first, on the trips the actor can see (or one of them). */
export async function listStaffAnnouncements(actor: SessionUser, activityId?: number) {
  const reader: Reader = { type: "user", id: actor.id };
  return db
    .select(fields(reader))
    .from(announcements)
    .innerJoin(activities, eq(activities.id, announcements.activityId))
    .leftJoin(users, eq(users.id, announcements.senderId))
    .where(await staffCondition(actor, activityId))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(LIST_LIMIT);
}

export async function staffUnreadCount(actor: SessionUser) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(announcements)
    .innerJoin(activities, eq(activities.id, announcements.activityId))
    .where(and(await staffCondition(actor), or(isNull(announcements.senderId), ne(announcements.senderId, actor.id)), sql`not ${readBy({ type: "user", id: actor.id })}`));
  return row.n;
}

/** Marks the given announcements read, ignoring any the actor can't see. */
export async function markStaffRead(actor: SessionUser, ids: number[]) {
  if (ids.length === 0) return;
  const visible = await db
    .select({ id: announcements.id })
    .from(announcements)
    .innerJoin(activities, eq(activities.id, announcements.activityId))
    .where(and(inArray(announcements.id, ids.slice(0, LIST_LIMIT)), await staffCondition(actor)));
  await markRead({ type: "user", id: actor.id }, visible.map((v) => v.id));
}

// ─── Students ────────────────────────────────────────────────────────────────

/** "all" announcements on trips where the student's booking is confirmed. */
const studentCondition = (studentId: number, activityId?: number) =>
  and(
    eq(announcements.audience, "all"),
    activityId ? eq(announcements.activityId, activityId) : undefined,
    exists(
      db
        .select({ one: sql`1` })
        .from(bookings)
        .where(and(eq(bookings.activityId, announcements.activityId), eq(bookings.studentId, studentId), eq(bookings.status, "confirmed"))),
    ),
  );

export async function listStudentAnnouncements(studentId: number, activityId?: number) {
  return db
    .select(fields({ type: "student", id: studentId }))
    .from(announcements)
    .innerJoin(activities, eq(activities.id, announcements.activityId))
    .leftJoin(users, eq(users.id, announcements.senderId))
    .where(studentCondition(studentId, activityId))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(LIST_LIMIT);
}

export async function studentUnreadCount(studentId: number) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(announcements)
    .where(and(studentCondition(studentId), sql`not ${readBy({ type: "student", id: studentId })}`));
  return row.n;
}

export async function markStudentRead(studentId: number, ids: number[]) {
  if (ids.length === 0) return;
  const visible = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(and(inArray(announcements.id, ids.slice(0, LIST_LIMIT)), studentCondition(studentId)));
  await markRead({ type: "student", id: studentId }, visible.map((v) => v.id));
}

async function markRead(reader: Reader, ids: number[]) {
  if (ids.length === 0) return;
  await db
    .insert(announcementReads)
    .values(ids.map((announcementId) => ({ announcementId, readerType: reader.type, readerId: reader.id })))
    .onConflictDoNothing();
}
