import { sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { ForbiddenError } from "@/lib/errors";
import { recordAudit, type RequestCtx } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/service";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  isValidSettingValue,
  type SettingKey,
  type SettingsMap,
  type SettingValue,
} from "@/lib/settings-definitions";

/** Missing or corrupted rows fall back to the default, so callers always get a valid value. */
export async function getSettings(): Promise<SettingsMap> {
  const rows = await db.select().from(settings);
  const result = { ...DEFAULT_SETTINGS } as Record<SettingKey, string>;
  for (const row of rows) {
    if (isValidSettingValue(row.key, row.value)) result[row.key as SettingKey] = row.value as string;
  }
  return result as SettingsMap;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await getSettings())[key];
}

export async function updateSettings(
  actor: SessionUser,
  input: Partial<Record<string, unknown>>,
  ctx: RequestCtx,
): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  if (actor.role !== "super_admin") throw new ForbiddenError();

  for (const key of SETTING_KEYS) {
    if (input[key] !== undefined && !isValidSettingValue(key, input[key])) return { ok: false, error: `قيمة غير صحيحة: ${key}` };
  }

  const current = await getSettings();
  const changes: Record<string, { from: string; to: string }> = {};
  for (const key of SETTING_KEYS) {
    const next = input[key] as string | undefined;
    if (next !== undefined && next !== current[key]) changes[key] = { from: current[key] as string, to: next };
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) return { ok: true, changed: 0 };

  await db
    .insert(settings)
    .values(keys.map((key) => ({ key, value: changes[key].to, updatedBy: actor.id })))
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedBy: actor.id, updatedAt: sql`now()` },
    });

  await recordAudit({ actor: { type: "user", id: actor.id }, action: "settings.updated", subjectType: "settings", meta: changes }, ctx);
  return { ok: true, changed: keys.length };
}
