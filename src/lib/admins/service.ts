import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import { ForbiddenError } from "@/lib/errors";
import { deleteUserSessions, findActiveUserByUsername, type SessionUser } from "@/lib/auth/service";
import { hashPassword, passwordSchema } from "@/lib/password";

export { ForbiddenError };

/** Defense in depth: every mutation re-checks the actor, not just the page that calls it. */
function assertSuperAdmin(actor: SessionUser) {
  if (actor.role !== "super_admin") throw new ForbiddenError();
}

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9._-]{3,50}$/, "اليوزر من 3 لـ 50 حرف إنجليزي أو أرقام أو . _ -");

export const createAdminSchema = z.object({
  name: z.string().trim().min(2, "اكتب الاسم").max(150),
  username: usernameSchema,
  password: passwordSchema,
});

type Result = { ok: true } | { ok: false; error: string };

export async function listAdmins() {
  return db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(inArray(users.role, ["super_admin", "admin"]), isNull(users.deletedAt)))
    .orderBy(sql`${users.role} = 'super_admin' desc`, asc(users.createdAt));
}

export async function createAdmin(actor: SessionUser, input: z.infer<typeof createAdminSchema>, ctx: RequestCtx): Promise<Result> {
  assertSuperAdmin(actor);
  const data = createAdminSchema.parse(input);
  if (await findActiveUserByUsername(data.username)) return { ok: false, error: "اليوزر ده مستخدم قبل كده" };

  const [created] = await db
    .insert(users)
    .values({
      name: data.name,
      username: data.username,
      passwordHash: await hashPassword(data.password),
      role: "admin",
      createdBy: actor.id,
    })
    .returning({ id: users.id });

  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "admin.created", subjectType: "user", subjectId: created.id, meta: { username: data.username, name: data.name } },
    ctx,
  );
  return { ok: true };
}

/** Super admins can only manage regular admins — never themselves or another super admin. */
async function findManageableAdmin(actor: SessionUser, id: number) {
  if (id === actor.id) return null;
  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, "admin"), isNull(users.deletedAt)));
  return target ?? null;
}

export async function setAdminActive(actor: SessionUser, id: number, active: boolean, ctx: RequestCtx): Promise<Result> {
  assertSuperAdmin(actor);
  const target = await findManageableAdmin(actor, id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.update(users).set({ isActive: active }).where(eq(users.id, id));
  if (!active) await deleteUserSessions(id);
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: active ? "admin.unfrozen" : "admin.frozen", subjectType: "user", subjectId: id, meta: { username: target.username } },
    ctx,
  );
  return { ok: true };
}

export async function deleteAdmin(actor: SessionUser, id: number, ctx: RequestCtx): Promise<Result> {
  assertSuperAdmin(actor);
  const target = await findManageableAdmin(actor, id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.update(users).set({ deletedAt: new Date(), isActive: false }).where(eq(users.id, id));
  await deleteUserSessions(id);
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "admin.deleted", subjectType: "user", subjectId: id, meta: { username: target.username } },
    ctx,
  );
  return { ok: true };
}

export async function resetAdminPassword(actor: SessionUser, id: number, password: string, ctx: RequestCtx): Promise<Result> {
  assertSuperAdmin(actor);
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const target = await findManageableAdmin(actor, id);
  if (!target) return { ok: false, error: "الحساب مش موجود" };

  await db.update(users).set({ passwordHash: await hashPassword(parsed.data) }).where(eq(users.id, id));
  await deleteUserSessions(id);
  await recordAudit(
    { actor: { type: "user", id: actor.id }, action: "admin.password_reset", subjectType: "user", subjectId: id, meta: { username: target.username } },
    ctx,
  );
  return { ok: true };
}
