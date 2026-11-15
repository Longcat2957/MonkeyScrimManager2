CREATE TABLE "service_admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"target_user_id" text,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_admin_events_kind_valid" CHECK ("service_admin_events"."kind" in ('granted', 'revoked')),
	CONSTRAINT "service_admin_events_source_valid" CHECK ("service_admin_events"."source" in ('web', 'bootstrap')),
	CONSTRAINT "service_admin_events_bootstrap_grant" CHECK ("service_admin_events"."source" <> 'bootstrap' or ("service_admin_events"."kind" = 'granted' and "service_admin_events"."actor_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "service_admin_events" ADD CONSTRAINT "service_admin_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_admin_events" ADD CONSTRAINT "service_admin_events_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_admin_events_recent_idx" ON "service_admin_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "service_admin_events_actor_idx" ON "service_admin_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "service_admin_events_target_idx" ON "service_admin_events" USING btree ("target_user_id");