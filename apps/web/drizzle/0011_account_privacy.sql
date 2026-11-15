ALTER TABLE "users" ADD COLUMN "public_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_profile" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_riot_ids" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "withdrawn_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_public_id_unique" UNIQUE("public_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_withdrawn_private" CHECK ("users"."withdrawn_at" is null or (not "users"."public_profile" and not "users"."public_riot_ids" and not "users"."is_service_admin"));