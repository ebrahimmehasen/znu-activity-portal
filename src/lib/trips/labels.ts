import type { ActivityStatus } from "@/db/schema";

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  upcoming: "قادمة",
  ongoing: "حالية",
  finished: "انتهت",
};

export const STATUS_LIST_LABELS: Record<ActivityStatus, string> = {
  upcoming: "القادمة",
  ongoing: "الحالية",
  finished: "المنتهية",
};

export const STATUS_TONES = { upcoming: "neutral", ongoing: "success", finished: "warning" } as const;

export function isStatus(v: unknown): v is ActivityStatus {
  return v === "upcoming" || v === "ongoing" || v === "finished";
}
