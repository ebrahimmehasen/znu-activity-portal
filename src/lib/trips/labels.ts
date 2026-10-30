import type { ActivityStatus } from "@/db/schema";

export const STATUS_LABELS: Record<ActivityStatus, string> = {
  upcoming: "قادمة",
  ongoing: "جارية",
  finished: "منتهية",
};

export const STATUS_LIST_LABELS: Record<ActivityStatus, string> = {
  upcoming: "القادمة",
  ongoing: "الجارية",
  finished: "المنتهية",
};

export const STATUS_TONES = { upcoming: "neutral", ongoing: "success", finished: "warning" } as const;

export function isStatus(v: unknown): v is ActivityStatus {
  return v === "upcoming" || v === "ongoing" || v === "finished";
}
