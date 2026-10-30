import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card } from "@/components/ui";
import type { Activity } from "@/db/schema";
import { bookingStats } from "@/lib/bookings/service";
import { toggleBookingAction } from "./actions";
import { CopyLink } from "./copy-link";

const AVAILABILITY = {
  open: { label: "الفورم مفتوح", tone: "success" },
  waitlist: { label: "العدد كامل — قائمة انتظار", tone: "warning" },
  full: { label: "العدد كامل — الفورم مقفول", tone: "danger" },
  closed: { label: "الفورم مقفول", tone: "neutral" },
} as const;

export async function BookingsCard({ trip, canToggle }: { trip: Activity; canToggle: boolean }) {
  const stats = await bookingStats(trip);
  const a = AVAILABILITY[stats.availability];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">الحجز</h2>
        <Badge tone={a.tone}>{a.label}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">مؤكد</dt>
          <dd className="text-lg font-bold text-success">{stats.confirmed}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">معلّق</dt>
          <dd className="text-lg font-bold text-warning">{stats.pending}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">ملغي</dt>
          <dd className="text-lg font-bold text-danger">{stats.cancelled}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">المتبقي</dt>
          <dd className="text-lg font-bold">{stats.remaining}</dd>
        </div>
      </dl>

      {trip.status === "upcoming" && <CopyLink path={`/book/${trip.publicToken}`} />}

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/trips/${trip.id}/bookings`} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
          إدارة الحجوزات
        </Link>
        {canToggle && trip.status === "upcoming" && (
          <ActionButton
            action={toggleBookingAction}
            fields={{ activityId: trip.id, open: trip.bookingOpen ? "0" : "1" }}
            variant="secondary"
            confirm={trip.bookingOpen ? "قفل الحجز؟ الطلبة مش هيقدروا يحجزوا من اللينك." : undefined}
          >
            {trip.bookingOpen ? "قفل الحجز" : "فتح الحجز"}
          </ActionButton>
        )}
      </div>
    </Card>
  );
}
