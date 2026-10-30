CREATE TABLE "student_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"student_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "qr_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "qr_secret" text;--> statement-breakpoint
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_sessions_student_idx" ON "student_sessions" USING btree ("student_id");