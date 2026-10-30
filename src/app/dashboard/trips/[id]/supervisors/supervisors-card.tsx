import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Alert, Badge, Card } from "@/components/ui";
import type { Activity } from "@/db/schema";
import { listBuses } from "@/lib/buses/service";
import { listTripSupervisors } from "@/lib/supervisors/assignments";
import { listActiveSupervisors } from "@/lib/supervisors/service";
import { tripSupervisorAction } from "./actions";
import { AddSupervisorForm, SupervisorBusSelect } from "./forms";

export async function TripSupervisorsCard({ trip }: { trip: Activity }) {
  const [assigned, all, buses] = await Promise.all([
    listTripSupervisors(trip.id),
    listActiveSupervisors(),
    trip.busesEnabled ? listBuses(trip.id) : Promise.resolve([]),
  ]);
  const editable = trip.status !== "finished";
  const taken = new Set(assigned.map((a) => a.userId));
  const options = all.filter((s) => !taken.has(s.id));
  const busScoped = trip.busesEnabled && trip.supervisorScope === "bus";
  const withoutBus = busScoped ? assigned.filter((a) => a.busId === null).length : 0;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">المشرفين</h2>
        <span className="text-sm text-muted">{assigned.length} مشرف</span>
      </div>

      {withoutBus > 0 && <Alert>نطاق المشرف «أتوبيسه بس»، وفيه {withoutBus} مشرف لسه من غير أتوبيس فمش هيشوف طلبة مؤكدين.</Alert>}

      {assigned.length === 0 ? (
        <p className="text-sm text-muted">مفيش مشرفين على الرحلة.</p>
      ) : (
        <ul className="divide-y divide-border">
          {assigned.map((a) => (
            <li key={a.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.name}</span>
                {!a.isActive && <Badge tone="danger">مجمّد</Badge>}
                {!editable && a.busName && <Badge>{a.busName}</Badge>}
              </div>
              {editable && (
                <div className="flex flex-wrap items-start gap-2">
                  {trip.busesEnabled && buses.length > 0 && (
                    <SupervisorBusSelect activityId={trip.id} userId={a.userId} busId={a.busId} buses={buses} />
                  )}
                  <ActionButton
                    action={tripSupervisorAction}
                    fields={{ activityId: trip.id, userId: a.userId, op: "remove" }}
                    variant="ghost"
                    className="px-3 py-1.5 text-danger"
                    confirm={`شيل ${a.name} من الرحلة؟`}
                  >
                    شيل
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable &&
        (options.length > 0 ? (
          <AddSupervisorForm activityId={trip.id} options={options} />
        ) : (
          <p className="text-sm text-muted">
            {all.length === 0 ? "مفيش مشرفين في السيستم. " : "كل المشرفين مضافين. "}
            <Link href="/dashboard/supervisors" className="text-primary">
              صفحة المشرفين
            </Link>
          </p>
        ))}
    </Card>
  );
}
