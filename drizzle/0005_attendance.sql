CREATE TYPE "public"."attendance_method" AS ENUM('qr', 'manual');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'late', 'absent');--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"checkpoint_id" integer NOT NULL,
	"booking_id" integer NOT NULL,
	"status" "attendance_status" NOT NULL,
	"method" "attendance_method" NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" integer,
	"client_uuid" varchar(36) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"confirmed_by" integer,
	"confirmed_at" timestamp with time zone,
	"rejected_reason" varchar(20),
	"voided_by" integer,
	"voided_at" timestamp with time zone,
	CONSTRAINT "attendances_client_uuid_unique" UNIQUE("client_uuid")
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sort_order" integer NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervisor_attendances" (
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"method" "attendance_method" NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"recorded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supervisor_attendances_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "roster_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "roster_locked_by" integer;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_attendances" ADD CONSTRAINT "supervisor_attendances_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_attendances" ADD CONSTRAINT "supervisor_attendances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_attendances" ADD CONSTRAINT "supervisor_attendances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_checkpoint_booking_active" ON "attendances" USING btree ("checkpoint_id","booking_id") WHERE "attendances"."rejected_reason" is null and "attendances"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "attendances_booking_idx" ON "attendances" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_activity_order_unique" ON "checkpoints" USING btree ("activity_id","sort_order");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_roster_locked_by_users_id_fk" FOREIGN KEY ("roster_locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;