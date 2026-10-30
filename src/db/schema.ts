import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Staff users (super admin / admin / supervisor) ──────────────────────────

export const userRole = pgEnum("user_role", ["super_admin", "admin", "supervisor"]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    username: varchar("username", { length: 50 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    // Supervisors' attendance QR (AES-GCM encrypted TOTP secret), created on first use.
    qrSecret: text("qr_secret"),
    createdBy: integer("created_by"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // A soft-deleted account frees its username for reuse.
    uniqueIndex("users_username_unique")
      .on(sql`lower(${t.username})`)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// Grantable to supervisors one by one; admins hold all of them by role (src/lib/authz.ts).
export const supervisorPermission = pgEnum("supervisor_permission", [
  "add_students",
  "confirm_bookings",
  "cancel_bookings",
  "take_attendance",
  "direct_attendance",
  "manage_gatherings",
  "send_announcements",
  "view_trip_dashboard",
]);

export const userPermissions = pgTable(
  "user_permissions",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    permission: supervisorPermission("permission").notNull(),
    grantedBy: integer("granted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permission] })],
);

// ─── Reference data ──────────────────────────────────────────────────────────

export const faculties = pgTable("faculties", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

// ─── Activities (v1 ships trips only; `type` keeps room for other kinds) ─────

export const activityType = pgEnum("activity_type", ["trip"]);
export const activityStatus = pgEnum("activity_status", ["upcoming", "ongoing", "finished"]);
export const whenFullPolicy = pgEnum("when_full_policy", ["close", "waitlist"]);
export const waitlistPromotion = pgEnum("waitlist_promotion", ["auto", "manual"]);
export const supervisorScope = pgEnum("supervisor_scope", ["bus", "all"]);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    type: activityType("type").notNull().default("trip"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    location: varchar("location", { length: 255 }),
    capacity: integer("capacity").notNull(),
    status: activityStatus("status").notNull().default("upcoming"),
    bookingOpen: boolean("booking_open").notNull().default(false),
    publicToken: varchar("public_token", { length: 64 }).notNull().unique(),

    // Per-activity optional settings (plan §8.5)
    whenFull: whenFullPolicy("when_full").notNull().default("close"),
    waitlistPromotion: waitlistPromotion("waitlist_promotion").notNull().default("auto"),
    feeEnabled: boolean("fee_enabled").notNull().default(false),
    feeAmount: numeric("fee_amount", { precision: 10, scale: 2 }),
    paymentRequired: boolean("payment_required").notNull().default(false),
    lateGraceMinutes: integer("late_grace_minutes").notNull().default(10),
    busesEnabled: boolean("buses_enabled").notNull().default(false),
    supervisorScope: supervisorScope("supervisor_scope").notNull().default("bus"),

    createdBy: integer("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("activities_status_date_idx").on(t.status, t.date)],
);

export const activityScheduleItems = pgTable(
  "activity_schedule_items",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    time: time("time"),
    title: varchar("title", { length: 200 }).notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("activity_schedule_items_activity_idx").on(t.activityId, t.sortOrder)],
);

export const buses = pgTable(
  "buses",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    capacity: integer("capacity").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("buses_activity_name_unique").on(t.activityId, sql`lower(${t.name})`)],
);

export const activitySupervisors = pgTable(
  "activity_supervisors",
  {
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    busId: integer("bus_id").references(() => buses.id, { onDelete: "set null" }),
    assignedBy: integer("assigned_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.userId] }), index("activity_supervisors_user_idx").on(t.userId)],
);

// ─── Students & bookings ─────────────────────────────────────────────────────

export const students = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 11 }).notNull(),
    nationalId: varchar("national_id", { length: 14 }).notNull().unique(),
    facultyId: integer("faculty_id")
      .notNull()
      .references(() => faculties.id),
    year: smallint("year").notNull(),
    ...timestamps,
  },
  (t) => [index("students_phone_idx").on(t.phone), check("students_year_check", sql`${t.year} between 1 and 5`)],
);

export const studentSessions = pgTable(
  "student_sessions",
  {
    // SHA-256 of the cookie token, like staff sessions.
    id: varchar("id", { length: 64 }).primaryKey(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("student_sessions_student_idx").on(t.studentId)],
);

export const bookingStatus = pgEnum("booking_status", ["pending", "confirmed", "cancelled", "waitlisted"]);
export const bookingSource = pgEnum("booking_source", ["form", "manual"]);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id),
    status: bookingStatus("status").notNull(),
    source: bookingSource("source").notNull(),
    waitlistPosition: integer("waitlist_position"),
    // Form data that differed from the stored student, kept until an admin picks a version.
    submittedData: jsonb("submitted_data").$type<{ name: string; phone: string; facultyId: number; year: number }>(),
    busId: integer("bus_id").references(() => buses.id, { onDelete: "set null" }),
    paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentRecordedBy: integer("payment_recorded_by").references(() => users.id),
    handledBy: integer("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    // Attendance QR (AES-GCM encrypted TOTP secret) for confirmed bookings; cleared on cancel.
    qrSecret: text("qr_secret"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("bookings_activity_student_unique").on(t.activityId, t.studentId),
    index("bookings_activity_status_idx").on(t.activityId, t.status),
    index("bookings_student_idx").on(t.studentId),
  ],
);

// ─── System-wide settings (key/value) ────────────────────────────────────────

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Audit log ───────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorType: varchar("actor_type", { length: 20 }).notNull(), // user | student | system
    actorId: integer("actor_id"),
    action: varchar("action", { length: 100 }).notNull(),
    subjectType: varchar("subject_type", { length: 50 }),
    subjectId: varchar("subject_id", { length: 50 }),
    meta: jsonb("meta"),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_subject_idx").on(t.subjectType, t.subjectId),
    index("audit_logs_actor_idx").on(t.actorType, t.actorId),
  ],
);

// ─── Rate limiting (DB-backed so it works across serverless instances) ───────

export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 200 }).primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type SupervisorPermission = (typeof supervisorPermission.enumValues)[number];
export type Faculty = typeof faculties.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type ActivityStatus = (typeof activityStatus.enumValues)[number];
export type ScheduleItem = typeof activityScheduleItems.$inferSelect;
export type Bus = typeof buses.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = (typeof bookingStatus.enumValues)[number];
export type AuditLog = typeof auditLogs.$inferSelect;
