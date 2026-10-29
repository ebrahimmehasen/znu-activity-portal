CREATE TABLE "activity_schedule_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"time" time,
	"title" varchar(200) NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buses" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_schedule_items" ADD CONSTRAINT "activity_schedule_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buses" ADD CONSTRAINT "buses_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_schedule_items_activity_idx" ON "activity_schedule_items" USING btree ("activity_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "buses_activity_name_unique" ON "buses" USING btree ("activity_id",lower("name"));