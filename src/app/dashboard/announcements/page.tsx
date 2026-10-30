import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { ActionButton } from "@/components/action-button";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { MarkRead } from "@/components/announcements/mark-read";
import { Card, PageHeader } from "@/components/ui";
import { listStaffAnnouncements } from "@/lib/announcements/service";
import { requireAbility } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { deleteAnnouncementAction, markStaffReadAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الإعلانات") };
}

/** Announcements on every trip the user can see; sending happens on a trip's page. */
export default async function AnnouncementsPage() {
  const actor = await requireAbility("view_trips");
  const items = await listStaffAnnouncements(actor);
  const admin = can(actor, "manage_activities");
  const t = await getT();

  return (
    <>
      <PageHeader title={t("الإعلانات")} description={t("إعلانات الرحلات التي يمكنك رؤيتها. يكون الإرسال من صفحة الرحلة.")} />
      <MarkRead ids={items.filter((a) => !a.read).map((a) => a.id)} action={markStaffReadAction} />
      {items.length === 0 ? (
        <Card className="py-10 text-center text-muted">{t("لا توجد إعلانات.")}</Card>
      ) : (
        <AnnouncementList
          items={items}
          tripHref={(id) => `/dashboard/trips/${id}`}
          actions={(a) =>
            (admin || a.senderId === actor.id) && (
              <ActionButton
                action={deleteAnnouncementAction}
                fields={{ id: a.id, activityId: a.activityId }}
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
    </>
  );
}
