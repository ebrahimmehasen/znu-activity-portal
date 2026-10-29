CREATE TYPE "public"."activity_status" AS ENUM('upcoming', 'ongoing', 'finished');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('trip');--> statement-breakpoint
CREATE TYPE "public"."supervisor_scope" AS ENUM('bus', 'all');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'supervisor');--> statement-breakpoint
CREATE TYPE "public"."waitlist_promotion" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."when_full_policy" AS ENUM('close', 'waitlist');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "activity_type" DEFAULT 'trip' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"location" varchar(255),
	"capacity" integer NOT NULL,
	"status" "activity_status" DEFAULT 'upcoming' NOT NULL,
	"booking_open" boolean DEFAULT false NOT NULL,
	"public_token" varchar(64) NOT NULL,
	"when_full" "when_full_policy" DEFAULT 'close' NOT NULL,
	"waitlist_promotion" "waitlist_promotion" DEFAULT 'auto' NOT NULL,
	"fee_enabled" boolean DEFAULT false NOT NULL,
	"fee_amount" numeric(10, 2),
	"payment_required" boolean DEFAULT false NOT NULL,
	"late_grace_minutes" integer DEFAULT 10 NOT NULL,
	"buses_enabled" boolean DEFAULT false NOT NULL,
	"supervisor_scope" "supervisor_scope" DEFAULT 'bus' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" varchar(20) NOT NULL,
	"actor_id" integer,
	"action" varchar(100) NOT NULL,
	"subject_type" varchar(50),
	"subject_id" varchar(50),
	"meta" jsonb,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faculties" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "faculties_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_status_date_idx" ON "activities" USING btree ("status","date");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_subject_idx" ON "audit_logs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree (lower("username")) WHERE "users"."deleted_at" is null;