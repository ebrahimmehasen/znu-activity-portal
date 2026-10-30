import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { faculties } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { visibleTripsCondition } from "@/lib/supervisors/scope";
import { countTripsByStatus } from "@/lib/trips/service";

const STATUS_LABELS = { upcoming: "الرحلات القادمة", ongoing: "الرحلات الحالية", finished: "الرحلات المنتهية" } as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const [counts, facultyCount] = await Promise.all([countTripsByStatus(await visibleTripsCondition(user)), db.$count(faculties, eq(faculties.isActive, true))]);
  const linkTrips = can(user, "view_trips");

  return (
    <>
      <PageHeader title={`أهلًا ${user.name}`} description="نظرة سريعة على البوابة" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((s) => {
          const card = (
            <Card className="h-full">
              <div className="text-sm text-muted">{STATUS_LABELS[s]}</div>
              <div className="mt-1 text-2xl font-bold">{counts[s]}</div>
            </Card>
          );
          return linkTrips ? (
            <Link key={s} href={`/dashboard/trips?status=${s}`}>
              {card}
            </Link>
          ) : (
            <div key={s}>{card}</div>
          );
        })}
        <Card>
          <div className="text-sm text-muted">الكليات</div>
          <div className="mt-1 text-2xl font-bold">{facultyCount}</div>
        </Card>
      </div>
    </>
  );
}
