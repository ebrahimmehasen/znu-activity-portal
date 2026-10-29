import { and, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/** Seconds until `key` unlocks, or 0 when it is under `limit`. */
export async function lockedFor(key: string, limit: number): Promise<number> {
  const [row] = await db
    .select({ resetAt: rateLimits.resetAt })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), gte(rateLimits.count, limit), gt(rateLimits.resetAt, sql`now()`)));
  return row ? Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) : 0;
}

/**
 * Counts one failure for `key` inside a sliding `windowSeconds` window.
 * Reaching `limit` locks the key for `lockSeconds` from that moment.
 */
export async function registerFailure(key: string, limit: number, windowSeconds: number, lockSeconds: number) {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: sql`now() + make_interval(secs => ${windowSeconds})` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then excluded.reset_at else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count });

  if (row.count >= limit) {
    await db
      .update(rateLimits)
      .set({ resetAt: sql`now() + make_interval(secs => ${lockSeconds})` })
      .where(eq(rateLimits.key, key));
    return { count: row.count, locked: true };
  }
  return { count: row.count, locked: false };
}

export async function clearFailures(key: string) {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
