import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activitySupervisors, userPermissions, users, type SupervisorPermission } from "@/db/schema";
import { usernameSchema } from "@/lib/admins/service";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import { deleteUserSessions, findActiveUserByUsername, type SessionUser } from "@/lib/auth/service";
import { SUPERVISOR_PERMISSION_KEYS, can } from "@/lib/authz";
import { ForbiddenError } from "@/lib/errors";
import { hashPassword, passwordSchema } from "@/lib/password";

const permissionsSchema = z.array(z.enum(SUPERVISOR_PERMISSION_KEYS as [SupervisorPermission, ...SupervisorPermission[]])).transform((p) => [...new Set(p)]);

export const createSupervisorSchema = z.object({
  name: z.string().trim().min(2, "اكتب الاسم").max(150),
  username: usernameSchema,
  password: passwordSchema,
  permissions: permissionsSchema.default([]),
});

type Result = { ok: true } | { ok: false; error: string };

function assertCanManage(actor: SessionUser) {
  if (!can(actor, "manage_supervisors")) throw new ForbiddenError();
}

const audit = (actor: SessionUser, action: string, id: number, meta: Record<string, unknown>, ctx: RequestCtx) =>
  recordAudit({ actor: { type: "user", id: actor.id }, action, subjectType: "user", subjectId: id, meta }, ctx);

export async function listSupervisors() {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      isActive: users.isActive,
      createdAt: users.createdAt,
      permissions: sql<SupervisorPermission[]>`coalesce((select array_agg(${userPermissions.permission}::text) from ${userPermissions} where ${userPermissions.userId} = ${users.id}), '{}')`,
      trips: sql<number>`(select count(*) from ${activitySupervisors} where ${activitySupervisors.userId} = ${users.id})`.mapWith(Number),
    })
    .from(users)
    .where(and(eq(users.role, "supervisor"), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
  return rows;
}

export async function listActiveSupervisors() {
  return db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(and(eq(users.role, "supervisor"), eq(users.isActive, true), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

export async function createSupervisor(
  actor: SessionUser,
  input: z.input<typeof createSupervisorSchema>,
  ctx: RequestCtx,
): Promise<Result & { id?: number }> {
  assertCanManage(actor);
  const data = createSupervisorSchema.parse(input);
  if (await findActiveUserByUsername(data.username)) return { ok: false, error: "اليوزر ده مستخدم قبل كده" };

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        name: data.name,
        username: data.username,
        passwordHash: await hashPassword(data.password),
        role: "supervisor",
        createdBy: actor.id,
      })
      .returning({ id: users.id });
    if (data.permissions.length) {
      await tx.insert(userPermissions).values(data.permissions.map((permission) => ({ userId: created.id, permission, grantedBy: actor.id })));
    }
    return created.id;
  });

  await audit(actor, "supervisor.created", id, { username: data.username, name: data.name, permissions: data.permissions }, ctx);
  return { ok: true, id };
}

async function findSupervisor(id: number) {
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, "supervisor"), isNull(users.deletedAt)));
  return target ?? null;
}

export async function setSupervisorActive(actor: SessionUser, id: number, active: boolean, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const target = await findSupervisor(id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.update(users).set({ isActive: active }).where(eq(users.id, id));
  // Freezing ends every open session at once (plan §5.4).
  if (!active) await deleteUserSessions(id);
  await audit(actor, active ? "supervisor.unfrozen" : "supervisor.frozen", id, { username: target.username }, ctx);
  return { ok: true };
}

export async function deleteSupervisor(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const target = await findSupervisor(id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.transaction(async (tx) => {
    await tx.update(users).set({ deletedAt: new Date(), isActive: false, qrSecret: null }).where(eq(users.id, id));
    await tx.delete(activitySupervisors).where(eq(activitySupervisors.userId, id));
  });
  await deleteUserSessions(id);
  await audit(actor, "supervisor.deleted", id, { username: target.username }, ctx);
  return { ok: true };
}

export async function resetSupervisorPassword(actor: SessionUser, id: number, password: string, ctx: RequestCtx): Promise<Result> {
  assertCanManage(actor);
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const target = await findSupervisor(id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.update(users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(users.id, id));
  await deleteUserSessions(id);
  await audit(actor, "supervisor.password_reset", id, { username: target.username }, ctx);
  return { ok: true };
}

/** Replaces the whole permission set; the next request of the supervisor already sees it. */
export async function setSupervisorPermissions(
  actor: SessionUser,
  id: number,
  permissions: SupervisorPermission[],
  ctx: RequestCtx,
): Promise<Result> {
  assertCanManage(actor);
  const parsed = permissionsSchema.safeParse(permissions);
  if (!parsed.success) return { ok: false, error: "صلاحية مش معروفة" };
  const target = await findSupervisor(id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  const before = await db.transaction(async (tx) => {
    const old = await tx.select({ p: userPermissions.permission }).from(userPermissions).where(eq(userPermissions.userId, id));
    await tx.delete(userPermissions).where(eq(userPermissions.userId, id));
    if (parsed.data.length) {
      await tx.insert(userPermissions).values(parsed.data.map((permission) => ({ userId: id, permission, grantedBy: actor.id })));
    }
    return old.map((r) => r.p);
  });

  const added = parsed.data.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !parsed.data.includes(p));
  if (added.length || removed.length) {
    await audit(actor, "supervisor.permissions_changed", id, { username: target.username, added, removed }, ctx);
  }
  return { ok: true };
}

export async function countSupervisors() {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "supervisor"), isNull(users.deletedAt)));
  return row.n;
}
