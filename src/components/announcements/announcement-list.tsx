import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import type { AnnouncementAudience } from "@/db/schema";
import { getI18n } from "@/i18n/server";
import { AUDIENCE_LABELS } from "@/lib/announcements/labels";
import { formatStamp } from "@/lib/dates";

export type AnnouncementItem = {
  id: number;
  activityId: number;
  tripTitle: string;
  audience: AnnouncementAudience;
  body: string;
  createdAt: Date;
  senderId: number | null;
  senderName: string | null;
  read: boolean;
};

/**
 * Newest first. "جديد" marks the ones unread when the page rendered; the page marks them
 * read right after, so they show as new this one time.
 */
export async function AnnouncementList({
  items,
  tripHref,
  showAudience = true,
  actions,
}: {
  items: AnnouncementItem[];
  /** Show which trip each one is for, linking there. */
  tripHref?: (activityId: number) => string;
  showAudience?: boolean;
  actions?: (item: AnnouncementItem) => ReactNode;
}) {
  const { locale, t } = await getI18n();
  return (
    <ul className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className={`rounded-xl border p-3 ${a.read ? "border-border bg-surface" : "border-primary/40 bg-primary/5"}`}>
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {!a.read && <Badge tone="danger">{t("جديد")}</Badge>}
            {tripHref && (
              <Link href={tripHref(a.activityId)} className="font-semibold text-primary">
                {a.tripTitle}
              </Link>
            )}
            {showAudience && <Badge>{t(AUDIENCE_LABELS[a.audience])}</Badge>}
            <span>{a.senderName ?? t("الإدارة")}</span>
            <time dateTime={a.createdAt.toISOString()}>{formatStamp(a.createdAt, locale)}</time>
          </div>
          <p className="whitespace-pre-line break-words leading-7">{a.body}</p>
          {actions && <div className="mt-2 flex justify-end">{actions(a)}</div>}
        </li>
      ))}
    </ul>
  );
}
