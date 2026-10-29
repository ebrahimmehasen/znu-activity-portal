import { and, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { AUDIT_ACTION_LABELS } from "@/lib/audit";
import { requireAbility } from "@/lib/auth/session";

export const metadata: Metadata = { title: "سجل العمليات" };

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Cairo" });

export default async function AuditPage({ searchParams }: PageProps<"/dashboard/audit">) {
  await requireAbility("view_audit");
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(String(sp.page ?? "1"), 10) || 1);
  const action = typeof sp.action === "string" && sp.action in AUDIT_ACTION_LABELS ? sp.action : undefined;

  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, and(eq(auditLogs.actorType, "user"), eq(users.id, auditLogs.actorId)))
    .where(action ? eq(auditLogs.action, action) : sql`true`)
    .orderBy(desc(auditLogs.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;

  const href = (p: number) => `/dashboard/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader title="سجل العمليات" description="كل الأفعال المهمة في السيستم، بالأحدث أولًا." />

      <form className="mb-4 flex flex-wrap gap-2">
        <select name="action" defaultValue={action ?? ""} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <option value="">كل العمليات</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold">فلترة</button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-background text-muted">
            <tr className="text-start">
              <th className="px-4 py-3 text-start font-medium">الوقت</th>
              <th className="px-4 py-3 text-start font-medium">المنفّذ</th>
              <th className="px-4 py-3 text-start font-medium">العملية</th>
              <th className="px-4 py-3 text-start font-medium">التفاصيل</th>
              <th className="px-4 py-3 text-start font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE_SIZE).map(({ log, actorName }) => (
              <tr key={log.id} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-4 py-3">{dateFmt.format(log.createdAt)}</td>
                <td className="px-4 py-3">{actorName ?? (log.actorType === "system" ? "السيستم" : "—")}</td>
                <td className="px-4 py-3">{AUDIT_ACTION_LABELS[log.action] ?? log.action}</td>
                <td className="px-4 py-3">
                  {log.meta ? (
                    <code dir="ltr" className="block max-w-xs break-all text-xs text-muted">
                      {JSON.stringify(log.meta)}
                    </code>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="ltr-nums px-4 py-3 text-muted">{log.ip ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  مفيش عمليات
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex justify-between text-sm">
        {page > 1 ? <Link href={href(page - 1)} className="text-primary">→ الأحدث</Link> : <span />}
        {hasNext && <Link href={href(page + 1)} className="text-primary">الأقدم ←</Link>}
      </div>
    </>
  );
}
