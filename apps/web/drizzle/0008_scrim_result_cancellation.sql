CREATE TABLE "scrim_cancellations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"actor_user_id" text,
	"reason" text NOT NULL,
	"reversed_game_count" integer NOT NULL,
	"context" jsonb NOT NULL,
	"cancelled_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp (3) with time zone,
	CONSTRAINT "scrim_cancellations_scrim_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "scrim_cancellations_reason" CHECK (length(btrim("scrim_cancellations"."reason")) between 1 and 500),
	CONSTRAINT "scrim_cancellations_game_count" CHECK ("scrim_cancellations"."reversed_game_count" >= 0),
	CONSTRAINT "scrim_cancellations_context" CHECK (jsonb_typeof("scrim_cancellations"."context") = 'object'),
	CONSTRAINT "scrim_cancellations_time_order" CHECK ("scrim_cancellations"."restored_at" >= "scrim_cancellations"."cancelled_at")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cancellation_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "scrim_cancellations" ADD CONSTRAINT "scrim_cancellations_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_cancellations" ADD CONSTRAINT "scrim_cancellations_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scrim_cancellations_active_unique" ON "scrim_cancellations" USING btree ("scrim_id") WHERE "scrim_cancellations"."restored_at" is null;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_cancellation_batch_fk" FOREIGN KEY ("scrim_id","cancellation_batch_id") REFERENCES "public"."scrim_cancellations"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_cancellation_batch_state" CHECK ("matches"."cancellation_batch_id" is null or "matches"."status" = 'cancelled');