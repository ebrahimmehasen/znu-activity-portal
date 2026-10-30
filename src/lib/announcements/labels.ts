import type { AnnouncementAudience } from "@/db/schema";

/** Shared with client forms, so nothing here touches the database. */
export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  supervisors: "المشرفين بس",
  all: "كل الرحلة",
};

export const MAX_ANNOUNCEMENT_LENGTH = 1000;
