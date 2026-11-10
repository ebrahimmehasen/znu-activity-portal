CREATE TABLE "pickup_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"time" time,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "pickup_point_id" integer;--> statement-breakpoint
ALTER TABLE "pickup_points" ADD CONSTRAINT "pickup_points_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pickup_points_activity_idx" ON "pickup_points" USING btree ("activity_id","sort_order");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE set null ON UPDATE no action;