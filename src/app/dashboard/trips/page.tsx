import type { Metadata } from "next";
import { getI18n, getT } from "@/i18n/server";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireAbility } from "@/lib/auth/session";
import { can } from "@/lib/authz";
import { visibleTripsCondition } from "@/lib/supervisors/scope";
import { formatDate, formatTime } from "@/lib/dates";
import { STATUS_LIST_LABELS, isStatus } from "@/lib/trips/labels";
import { countTripsByStatus, listTrips } from "@/lib/trips/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الرحلات") };
}

export default async function TripsPage({ searchParams }: PageProps<"/dashboard/trips">) {
  const actor = await requireAbility("view_trips");
  const sp = await searchParams;
  const status = isStatus(sp.status) ? sp.status : "upcoming";
  const visible = await visibleTripsCondition(actor);
  const { locale, t: tr } = await getI18n();
  const [trips, counts] = await Promise.all([listTrips(status, visible), countTripsByStatus(visible)]);

  return (
    <>
      <PageHeader
        title={tr("الرحلات")}
        description={visible ? tr("الرحلات المضاف إليها.") : undefined}
        actions={
          can(actor, "manage_activities") && (
          <Link href="/dashboard/trips/new" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            + {tr("رحلة جديدة")}
          </Link>
          )
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
            {tr(STATUS_LIST_LABELS[s])} ({counts[s]})
          </Link>
        ))}
      </div>

      {trips.length === 0 ? (
        <Card className="py-10 text-center text-muted">{tr("لا توجد رحلات {status}.", { status: tr(STATUS_LIST_LABELS[status]) })}</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {trips.map((t) => (
            <Link key={t.id} href={`/dashboard/trips/${t.id}`} className="block">
              <Card className="h-full transition hover:border-primary/40">
                <div className="font-semibold">{t.title}</div>
                <div className="mt-1 text-sm text-muted">
                  {formatDate(t.date, locale)}
                  {t.startTime && ` · ${formatTime(t.startTime, locale)}`}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.location && <Badge>{t.location}</Badge>}
                  <Badge>{tr("السعة {n}", { n: t.capacity })}</Badge>
                  {t.busesEnabled && <Badge>{tr("{n} حافلة", { n: t.busCount })}</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
