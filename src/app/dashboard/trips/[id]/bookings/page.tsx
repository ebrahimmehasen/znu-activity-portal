import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { BookingStatus } from "@/db/schema";
import { can } from "@/lib/authz";
import { BOOKING_STATUS_LABELS, bookingStats, listBookings, type BookingFilters } from "@/lib/bookings/service";
import { listBusLoad } from "@/lib/buses/service";
import { formatDate } from "@/lib/dates";
import { getI18n } from "@/i18n/server";
import { intlLocale } from "@/i18n/config";
import { listFaculties } from "@/lib/faculties/service";
import { YEAR_LABELS, maskNationalId } from "@/lib/students/validation";
import { bookingScope } from "@/lib/supervisors/scope";
import { requireVisibleTrip } from "@/lib/trips/access";
import { bookingAction } from "./actions";
import { BusSelect } from "./bus-select";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("الحجوزات") };
}

const STATUS_TONES: Record<BookingStatus, "neutral" | "success" | "danger" | "warning"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
  waitlisted: "neutral",
};

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[];

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BookingsPage({ params, searchParams }: PageProps<"/dashboard/trips/[id]/bookings">) {
  const { actor, trip } = await requireVisibleTrip((await params).id);
  const manager = can(actor, "manage_activities");
  const fullNid = can(actor, "see_national_id");

  const sp = await searchParams;
  const status = STATUSES.find((s) => s === one(sp.status));
  const busParam = one(sp.bus);
  const filters: BookingFilters = {
    status,
    q: one(sp.q)?.slice(0, 100),
    paid: one(sp.paid) === "paid" || one(sp.paid) === "unpaid" ? (one(sp.paid) as "paid" | "unpaid") : undefined,
    flagged: one(sp.flagged) === "1",
    busId: busParam === "none" ? "none" : busParam && Number(busParam) > 0 ? Number(busParam) : undefined,
    page: Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1),
    scope: await bookingScope(actor, trip),
    searchNationalId: fullNid,
  };
  const scoped = filters.scope?.kind === "bus";

  const [{ rows, hasNext }, stats, busLoad, faculties] = await Promise.all([
    listBookings(trip.id, filters),
    bookingStats(trip),
    trip.busesEnabled ? listBusLoad(trip.id) : Promise.resolve([]),
    listFaculties(),
  ]);
  const facultyName = new Map(faculties.map((f) => [f.id, f.name]));
  const { locale, t } = await getI18n();
  const editable = trip.status !== "finished";
  const base = `/dashboard/trips/${trip.id}/bookings`;
  const href = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      status,
      q: filters.q,
      paid: filters.paid,
      flagged: filters.flagged ? "1" : undefined,
      bus: busParam,
      ...patch,
    };
    const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    return qs.size ? `${base}?${qs}` : base;
  };
  const selectCls = "rounded-lg border border-border bg-surface px-3 py-2 text-sm";

  return (
    <>
      <PageHeader
        title={t("حجوزات {trip}", { trip: trip.title })}
        description={formatDate(trip.date, locale)}
        actions={
          <div className="flex gap-2">
            <Link href={`/dashboard/trips/${trip.id}`} className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold">
              {t("الرحلة")}
            </Link>
            {editable && can(actor, "add_students") && (
              <Link href={`${base}/new`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                + {t("إضافة طالب")}
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t("مؤكد")} value={stats.confirmed} tone="text-success" />
        <Stat label={t("معلّق")} value={stats.pending} tone="text-warning" />
        <Stat label={t("ملغى")} value={stats.cancelled} tone="text-danger" />
        <Stat label={t("المتبقي من السعة")} value={t("{n} من {total}", { n: stats.remaining, total: trip.capacity })} />
        {trip.whenFull === "waitlist" && <Stat label={t("قائمة الانتظار")} value={stats.waitlisted} />}
        {trip.feeEnabled && <Stat label={t("المحصَّل")} value={`${stats.collected.toLocaleString(intlLocale(locale))} ${t("ج")} (${stats.paid})`} />}
      </div>

      {scoped && (
        <p className="mb-3 text-sm text-muted">
          {filters.scope?.kind === "bus" && filters.scope.busId === null
            ? t("لم تُعيَّن على حافلة بعد، لذا يعرض لك الكشف الطلبات المعلّقة فقط إذا كانت لديك صلاحيتها.")
            : t("هذا الكشف لطلاب حافلتك فقط، والأعداد للرحلة كاملة.")}
        </p>
      )}

      {stats.flagged > 0 && manager && (
        <Link href={href({ flagged: "1", status: undefined, page: undefined })} className="mb-4 block rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          {t("يوجد {n} حجز عليه علامة «بيانات مختلفة» ويحتاج إلى اختيار البيانات الصحيحة", { n: stats.flagged })}
        </Link>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto" role="tablist">
        {[undefined, ...STATUSES.filter((s) => s !== "waitlisted" || trip.whenFull === "waitlist" || stats.waitlisted > 0)].map((s) => (
          <Link
            key={s ?? "all"}
            href={href({ status: s, page: undefined })}
            role="tab"
            aria-selected={s === status}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${
              s === status ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted"
            }`}
          >
            {s ? `${t(BOOKING_STATUS_LABELS[s])} (${stats[s]})` : t("الكل")}
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={filters.q}
          placeholder={fullNid ? t("ابحث بالاسم أو الرقم القومي أو الهاتف") : t("ابحث بالاسم أو الهاتف")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:max-w-xs"
        />
        {trip.feeEnabled && (
          <select name="paid" defaultValue={filters.paid ?? ""} className={selectCls} aria-label={t("الدفع")}>
            <option value="">{t("الدفع: الكل")}</option>
            <option value="paid">{t("دفع")}</option>
            <option value="unpaid">{t("لم يدفع")}</option>
          </select>
        )}
        {trip.busesEnabled && !scoped && (
          <select name="bus" defaultValue={busParam ?? ""} className={selectCls} aria-label={t("الحافلة")}>
            <option value="">{t("كل الحافلات")}</option>
            <option value="none">{t("بدون حافلة")}</option>
            {busLoad.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        {manager && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="flagged" value="1" defaultChecked={filters.flagged} className="accent-primary" />
            {t("بيانات مختلفة")}
          </label>
        )}
        <button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold">{t("بحث")}</button>
      </form>

      {rows.length === 0 ? (
        <Card className="py-10 text-center text-muted">{t("لا توجد حجوزات.")}</Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map(({ booking: b, student: s, facultyName: faculty, busName }) => {
            const fields = { id: b.id, activityId: trip.id };
            const sub = b.submittedData;
            return (
              <div key={b.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{s.name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {faculty} · {t(YEAR_LABELS[s.year])}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a href={`tel:${s.phone}`} className="ltr-nums text-primary" dir="ltr">
                        {s.phone}
                      </a>
                      <span className="ltr-nums text-muted" dir="ltr">
                        {fullNid ? s.nationalId : maskNationalId(s.nationalId)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={STATUS_TONES[b.status]}>
                      {t(BOOKING_STATUS_LABELS[b.status])}
                      {b.status === "waitlisted" && b.waitlistPosition ? ` #${b.waitlistPosition}` : ""}
                    </Badge>
                    {b.source === "manual" && <Badge>{t("يدوي")}</Badge>}
                    {trip.feeEnabled && b.status !== "cancelled" && <Badge tone={b.paidAt ? "success" : "neutral"}>{b.paidAt ? t("دفع") : t("لم يدفع")}</Badge>}
                    {busName && <Badge>{busName}</Badge>}
                  </div>
                </div>

                {sub && manager && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                    <div className="mb-1 font-semibold text-warning">{t("بيانات مختلفة في هذا الحجز:")}</div>
                    <ul className="space-y-0.5">
                      {sub.name !== s.name && (
                        <li>
                          {t("الاسم")}: {sub.name}
                        </li>
                      )}
                      {sub.phone !== s.phone && (
                        <li>
                          {t("الهاتف")}:{" "}
                          <a href={`tel:${sub.phone}`} className="ltr-nums text-primary" dir="ltr">
                            {sub.phone}
                          </a>
                        </li>
                      )}
                      {sub.facultyId !== s.facultyId && (
                        <li>
                          {t("الكلية")}: {facultyName.get(sub.facultyId)}
                        </li>
                      )}
                      {sub.year !== s.year && (
                        <li>
                          {t("الفرقة")}: {t(YEAR_LABELS[sub.year])}
                        </li>
                      )}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionButton action={bookingAction} fields={{ ...fields, op: "apply" }} variant="secondary" className="px-3 py-1.5">
                        {t("استخدام البيانات الجديدة")}
                      </ActionButton>
                      <ActionButton action={bookingAction} fields={{ ...fields, op: "keep" }} variant="ghost" className="px-3 py-1.5">
                        {t("الاحتفاظ بالقديمة")}
                      </ActionButton>
                    </div>
                  </div>
                )}

                {editable && b.status !== "cancelled" && (
                  <div className="flex flex-wrap items-start gap-2">
                    {b.status === "pending" && can(actor, "confirm_bookings") && (
                      <ActionButton action={bookingAction} fields={{ ...fields, op: "confirm" }} className="px-3 py-1.5">
                        {t("تأكيد")}
                      </ActionButton>
                    )}
                    {b.status === "waitlisted" && can(actor, "confirm_bookings") && (
                      <ActionButton action={bookingAction} fields={{ ...fields, op: "promote" }} variant="secondary" className="px-3 py-1.5">
                        {t("النقل إلى معلّق")}
                      </ActionButton>
                    )}
                    {trip.feeEnabled && manager && (
                      <ActionButton
                        action={bookingAction}
                        fields={{ ...fields, op: b.paidAt ? "unpay" : "pay" }}
                        variant="secondary"
                        className="px-3 py-1.5"
                        confirm={b.paidAt ? t("إلغاء تسجيل دفع {name}؟", { name: s.name }) : undefined}
                      >
                        {b.paidAt ? t("إلغاء الدفع") : t("تسجيل دفع {amount} ج", { amount: Number(trip.feeAmount) })}
                      </ActionButton>
                    )}
                    {manager && trip.busesEnabled && b.status === "confirmed" && busLoad.length > 0 && (
                      <BusSelect activityId={trip.id} bookingId={b.id} busId={b.busId} buses={busLoad} />
                    )}
                    {can(actor, "cancel_bookings") && (
                      <ActionButton
                        action={bookingAction}
                        fields={{ ...fields, op: "cancel" }}
                        variant="ghost"
                        className="px-3 py-1.5 text-danger"
                        confirm={t("إلغاء حجز {name}؟", { name: s.name })}
                      >
                        {t("إلغاء الحجز")}
                      </ActionButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <div className="mt-4 flex justify-between text-sm">
        {filters.page! > 1 ? <Link href={href({ page: String(filters.page! - 1) })} className="text-primary">{t("السابق")}</Link> : <span />}
        {hasNext && <Link href={href({ page: String(filters.page! + 1) })} className="text-primary">{t("التالي")}</Link>}
      </div>
    </>
  );
}
