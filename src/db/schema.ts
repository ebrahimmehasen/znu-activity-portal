import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
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
export type Faculty = typeof faculties.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
