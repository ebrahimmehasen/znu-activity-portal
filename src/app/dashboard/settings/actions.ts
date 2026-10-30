"use server";

import { revalidatePath } from "next/cache";
import { getRequestCtx, requireAbility } from "@/lib/auth/session";
import type { FormState } from "@/lib/form-state";
import { SETTING_KEYS } from "@/lib/settings-definitions";
import { updateSettings } from "@/lib/settings/service";

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAbility("manage_settings");
  const input = Object.fromEntries(SETTING_KEYS.map((k) => [k, formData.get(k) ?? undefined]));
  const r = await updateSettings(actor, input, await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: r.changed ? "حُفظت الإعدادات" : "لا توجد تغييرات" };
}
