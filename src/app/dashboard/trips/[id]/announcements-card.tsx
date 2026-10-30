import { ActionButton } from "@/components/action-button";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { MarkRead } from "@/components/announcements/mark-read";
import { Card } from "@/components/ui";
import type { Activity } from "@/db/schema";
import { listStaffAnnouncements } from "@/lib/announcements/service";
import type { SessionUser } from "@/lib/auth/service";
import { can } from "@/lib/authz";
import { deleteAnnouncementAction, markStaffReadAction } from "../../announcements/actions";
import { SendAnnouncementForm } from "../../announcements/send-form";
import { getT } from "@/i18n/server";

export async function AnnouncementsCard({ actor, trip }: { actor: SessionUser; trip: Activity }) {
  const t = await getT();
  const items = await listStaffAnnouncements(actor, trip.id);
  const sender = can(actor, "send_announcements");
  const admin = can(actor, "manage_activities");
  if (!sender && items.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">{t("الإعلانات")}</h2>
      {sender && (
        <div className="mb-4">
          <SendAnnouncementForm activityId={trip.id} />
        </div>
      )}
      <MarkRead ids={items.filter((a) => !a.read).map((a) => a.id)} action={markStaffReadAction} />
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t("لا توجد إعلانات على هذه الرحلة بعد.")}</p>
      ) : (
        <AnnouncementList
          items={items}
          actions={(a) =>
            (admin || (sender && a.senderId === actor.id)) && (
              <ActionButton
                action={deleteAnnouncementAction}
                fields={{ id: a.id, activityId: trip.id }}
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                confirm={t("حذف الإعلان؟")}
              >
                {t("حذف")}
              </ActionButton>
            )
          }
        />
      )}
    </Card>
  );
}
