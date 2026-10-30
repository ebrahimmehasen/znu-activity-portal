"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button } from "@/components/ui";
import { MAX_ANNOUNCEMENT_LENGTH } from "@/lib/announcements/labels";
import { sendAnnouncementAction } from "./actions";

export function SendAnnouncementForm({ activityId }: { activityId: number }) {
  const [state, action, pending] = useActionState(sendAnnouncementAction, {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="space-y-3">
      <input type="hidden" name="activityId" value={activityId} />
      <textarea
        name="body"
        required
        maxLength={MAX_ANNOUNCEMENT_LENGTH}
        rows={3}
        placeholder="اكتب الإعلان…"
        aria-label="نص الإعلان"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="sr-only">مين يشوف الإعلان</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="all" defaultChecked className="size-4 accent-primary" />
            كل الرحلة (مشرفين + طلبة)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="supervisors" className="size-4 accent-primary" />
            المشرفين بس
          </label>
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? "بيتبعت…" : "إرسال"}
        </Button>
      </div>
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
    </form>
  );
}
