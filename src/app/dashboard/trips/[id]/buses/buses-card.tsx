import { ConfirmButton } from "@/components/confirm-button";
import { Alert, Card } from "@/components/ui";
import type { Activity } from "@/db/schema";
import { ActionButton } from "@/components/action-button";
import { bookingStats } from "@/lib/bookings/service";
import { listBusLoad } from "@/lib/buses/service";
import { autoAssignAction } from "../bookings/actions";
import { deleteBusAction } from "./actions";
import { CreateBusForm, EditBusForm } from "./bus-forms";

export async function BusesCard({ trip }: { trip: Activity }) {
  const [rows, stats] = await Promise.all([listBusLoad(trip.id), bookingStats(trip)]);
  const totalSeats = rows.reduce((sum, b) => sum + b.capacity, 0);
  const editable = trip.status !== "finished";

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">الأتوبيسات</h2>
        <span className="text-sm text-muted">
          {rows.length} أتوبيس · {totalSeats} كرسي
        </span>
      </div>

      {rows.length > 0 && totalSeats < trip.capacity && (
        <Alert>كراسي الأتوبيسات ({totalSeats}) أقل من العدد الأقصى للرحلة ({trip.capacity}).</Alert>
      )}

      {rows.map((b) =>
        editable ? (
          <div key={b.id} className="flex items-start gap-2">
            <span className="mt-2.5 w-14 shrink-0 text-sm text-muted ltr-nums">
              {b.used}/{b.capacity}
            </span>
            <EditBusForm activityId={trip.id} id={b.id} name={b.name} capacity={b.capacity} />
            <form action={deleteBusAction}>
              <input type="hidden" name="activityId" value={trip.id} />
              <input type="hidden" name="id" value={b.id} />
              <ConfirmButton variant="ghost" className="px-2 text-danger" message={`حذف ${b.name}؟`}>
                حذف
              </ConfirmButton>
            </form>
          </div>
        ) : (
          <div key={b.id} className="flex justify-between border-b border-border py-2 text-sm last:border-0">
            <span>{b.name}</span>
            <span className="text-muted">
              {b.used} / {b.capacity} كرسي
            </span>
          </div>
        ),
      )}

      {editable && <CreateBusForm key={rows.length} activityId={trip.id} defaultName={`أتوبيس ${rows.length + 1}`} />}
      {editable && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-sm text-muted">{stats.unassigned} طالب مؤكد من غير أتوبيس</span>
          {stats.unassigned > 0 && (
            <ActionButton action={autoAssignAction} fields={{ activityId: trip.id }} variant="secondary" className="px-3 py-1.5">
              توزيع تلقائي
            </ActionButton>
          )}
        </div>
      )}
      <p className="text-xs text-muted">التوزيع اليدوي من صفحة الحجوزات، وتسكين المشرفين من كارت المشرفين.</p>
    </Card>
  );
}
