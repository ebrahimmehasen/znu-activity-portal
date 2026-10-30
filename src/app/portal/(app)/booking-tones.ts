import type { BookingStatus } from "@/db/schema";

export const BOOKING_TONES: Record<BookingStatus, "neutral" | "success" | "danger" | "warning"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
  waitlisted: "neutral",
};
