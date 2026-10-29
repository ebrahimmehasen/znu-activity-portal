import { count, eq } from "drizzle-orm";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { activities, faculties } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

const STATUS_LABELS = { upcoming: "الرحلات القادمة", ongoing: "الرحلات الحالية", finished: "الرحلات المنتهية" } as const;

export default async function DashboardPage() {
  const user = await requireUser();

  const byStatus = await db.select({ status: activities.status, n: count() }).from(activities).groupBy(activities.status);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.n]));
  const facultyCount = await db.$count(faculties, eq(faculties.isActive, true));

  return (
    <>
      <PageHeader title={`أهلًا ${user.name}`} description="نظرة سريعة على البوابة" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => (
          <Card key={s}>
            <div className="text-sm text-muted">{STATUS_LABELS[s]}</div>
            <div className="mt-1 text-2xl font-bold">{counts[s] ?? 0}</div>
          </Card>
        ))}
        <Card>
          <div className="text-sm text-muted">الكليات</div>
          <div className="mt-1 text-2xl font-bold">{facultyCount}</div>
        </Card>
      </div>
    </>
  );
}
