"use server";

import { getRequestCtx } from "@/lib/auth/session";
import { submitPublicBooking } from "@/lib/bookings/service";
import type { FormState } from "@/lib/form-state";
import { studentFormInput } from "@/lib/students/form";

const RECEIVED = "تم استلام طلبك وهو بانتظار التأكيد";

export async function submitBookingAction(token: string, formData: FormData): Promise<FormState> {
  // Honeypot: real students never see or fill this field.
  if (formData.get("website")) return { ok: true, message: RECEIVED };

  const r = await submitPublicBooking(String(token), studentFormInput(formData), await getRequestCtx());
  if (!r.ok) return { ok: false, message: r.error, errors: r.errors };
  return r.status === "waitlisted"
    ? { ok: true, message: `اكتمل العدد، فسُجِّلت في قائمة الانتظار برقم ${r.position}. سنتواصل معك إذا توفّر مكان.` }
    : { ok: true, message: RECEIVED };
}
