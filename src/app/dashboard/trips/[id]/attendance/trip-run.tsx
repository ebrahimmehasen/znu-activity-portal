import { ActionButton } from "@/components/action-button";
import type { Activity } from "@/db/schema";
import { canStartToday } from "@/lib/attendance/service";
import { attendanceAction } from "./actions";

/**
 * Start / end / reopen (plan §3): start on the trip day only, end only while ongoing,
 * and finished → ongoing only after an explicit confirmation.
 */
export function TripRunButtons({ trip, className }: { trip: Activity; className?: string }) {
  const fields = { activityId: trip.id };
  let button: React.ReactNode = null;
  if (canStartToday(trip)) {
    button = (
      <ActionButton action={attendanceAction} fields={{ ...fields, op: "start" }} confirm={`بدء رحلة "${trip.title}"؟ الحجز هيتقفل والتجمع الأول هيتفتح`}>
        بدء الرحلة
      </ActionButton>
    );
  } else if (trip.status === "ongoing") {
    button = (
      <ActionButton action={attendanceAction} fields={{ ...fields, op: "end" }} variant="danger" confirm={`إنهاء رحلة "${trip.title}"؟ كل التجمعات المفتوحة هتتقفل`}>
        إنهاء الرحلة
      </ActionButton>
    );
  } else if (trip.status === "finished") {
    button = (
      <ActionButton
        action={attendanceAction}
        fields={{ ...fields, op: "reopen", confirm: "yes" }}
        variant="secondary"
        confirm={`الرحلة انتهت. متأكد إنك عايز ترجّعها حالية؟ ده هيتسجل في سجل العمليات`}
      >
        إرجاع الرحلة حالية
      </ActionButton>
    );
  }
  return button ? <div className={className}>{button}</div> : null;
}
