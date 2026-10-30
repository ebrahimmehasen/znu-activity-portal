import type { Metadata } from "next";
import { AnnouncementList } from "@/components/announcements/announcement-list";
import { MarkRead } from "@/components/announcements/mark-read";
import { Card, PageHeader } from "@/components/ui";
import { listStudentAnnouncements } from "@/lib/announcements/service";
import { requireStudent } from "@/lib/students/session";
import { markStudentReadAction } from "../../actions";

export const metadata: Metadata = { title: "الإعلانات" };

export default async function StudentAnnouncementsPage() {
  const student = await requireStudent();
  const items = await listStudentAnnouncements(student.id);
  return (
    <>
      <PageHeader title="الإعلانات" description="إعلانات المسؤولين عن رحلاتك" />
      <MarkRead ids={items.filter((a) => !a.read).map((a) => a.id)} action={markStudentReadAction} />
      {items.length === 0 ? (
        <Card className="py-10 text-center text-muted">مفيش إعلانات.</Card>
      ) : (
        <AnnouncementList items={items} tripHref={(id) => `/portal/trips/${id}`} showAudience={false} />
      )}
    </>
  );
}
