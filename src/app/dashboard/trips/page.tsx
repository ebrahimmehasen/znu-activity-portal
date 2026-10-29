import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { formatDate, formatTime } from "@/lib/dates";
import { STATUS_LIST_LABELS, isStatus } from "@/lib/trips/labels";
import { countTripsByStatus, listTrips } from "@/lib/trips/service";

export const metadata: Metadata = { title: "الرحلات" };

export default async function TripsPage({ searchParams }: PageProps<"/dashboard/trips">) {
  await requireAbility("manage_activities");
  const sp = await searchParams;
  const status = isStatus(sp.status) ? sp.status : "upcoming";
  const [trips, counts] = await Promise.all([listTrips(status), countTripsByStatus()]);

  return (
    <>
      <PageHeader
        title="الرحلات"
        actions={
          <Link href="/dashboard/trips/new" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            + رحلة جديدة
          </Link>
        }
      />

      <div className="mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {(Object.keys(STATUS_LIST_LABELS) as (keyof typeof STATUS_LIST_LABELS)[]).map((s) => (
          <Link
            key={s}
            href={`/dashboard/trips?status=${s}`}
            role="tab"
            aria-selected={s === status}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              s === status ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted"
            }`}
          >
            {STATUS_LIST_LABELS[s]} ({counts[s]})
          </Link>
        ))}
      </div>

      {trips.length === 0 ? (
        <Card className="py-10 text-center text-muted">مفيش رحلات {STATUS_LIST_LABELS[status]}.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {trips.map((t) => (
            <Link key={t.id} href={`/dashboard/trips/${t.id}`} className="block">
              <Card className="h-full transition hover:border-primary/40">
                <div className="font-semibold">{t.title}</div>
                <div className="mt-1 text-sm text-muted">
                  {formatDate(t.date)}
                  {t.startTime && ` · ${formatTime(t.startTime)}`}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.location && <Badge>{t.location}</Badge>}
                  <Badge>السعة {t.capacity}</Badge>
                  {t.busesEnabled && <Badge>{t.busCount} أتوبيس</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
