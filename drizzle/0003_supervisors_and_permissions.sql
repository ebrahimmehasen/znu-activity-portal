CREATE TYPE "public"."supervisor_permission" AS ENUM('add_students', 'confirm_bookings', 'cancel_bookings', 'take_attendance', 'direct_attendance', 'manage_gatherings', 'send_announcements', 'view_trip_dashboard');--> statement-breakpoint
CREATE TABLE "activity_supervisors" (
	"activity_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"bus_id" integer,
	"assigned_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_supervisors_activity_id_user_id_pk" PRIMARY KEY("activity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" integer NOT NULL,
	"permission" "supervisor_permission" NOT NULL,
	"granted_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_supervisors" ADD CONSTRAINT "activity_supervisors_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_supervisors_user_idx" ON "activity_supervisors" USING btree ("user_id");