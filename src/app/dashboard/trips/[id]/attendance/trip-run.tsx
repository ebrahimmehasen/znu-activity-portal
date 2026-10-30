import { ActionButton } from "@/components/action-button";
import type { Activity } from "@/db/schema";
import { canStartToday } from "@/lib/attendance/service";
import { attendanceAction } from "./actions";
import { getT } from "@/i18n/server";

/**
 * Start / end / reopen (plan §3): start on the trip day only, end only while ongoing,
 * and finished → ongoing only after an explicit confirmation.
 */
export async function TripRunButtons({ trip, className }: { trip: Activity; className?: string }) {
  const t = await getT();
  const fields = { activityId: trip.id };
  let button: React.ReactNode = null;
  if (canStartToday(trip)) {
    button = (
      <ActionButton action={attendanceAction} fields={{ ...fields, op: "start" }} confirm={t("بدء رحلة «{trip}»؟ سيُغلق الحجز ويُفتح التجمع الأول.", { trip: trip.title })}>
        {t("بدء الرحلة")}
      </ActionButton>
    );
  } else if (trip.status === "ongoing") {
    button = (
      <ActionButton action={attendanceAction} fields={{ ...fields, op: "end" }} variant="danger" confirm={t("إنهاء رحلة «{trip}»؟ ستُغلق كل التجمعات المفتوحة.", { trip: trip.title })}>
        {t("إنهاء الرحلة")}
      </ActionButton>
    );
  } else if (trip.status === "finished") {
    button = (
      <ActionButton
        action={attendanceAction}
        fields={{ ...fields, op: "reopen", confirm: "yes" }}
        variant="secondary"
        confirm={t("انتهت الرحلة. هل أنت متأكد من إعادتها إلى «جارية»؟ سيُسجَّل ذلك في سجل العمليات.")}
      >
        {t("إعادة الرحلة إلى جارية")}
      </ActionButton>
    );
  }
  return button ? <div className={className}>{button}</div> : null;
}
