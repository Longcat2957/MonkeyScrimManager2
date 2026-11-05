CREATE TABLE "discord_interaction_receipts" (
	"interaction_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_interaction_receipts_hash_valid" CHECK (length("discord_interaction_receipts"."request_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "discord_publication_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"nonce" text NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp (3) with time zone,
	"lease_revision" integer,
	"lease_channel_id" text,
	"lease_message_id" text,
	"lease_operation" text,
	"error_code" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_publication_jobs_scrim_kind_unique" UNIQUE("scrim_id","kind"),
	CONSTRAINT "discord_publication_jobs_kind_valid" CHECK ("discord_publication_jobs"."kind" in ('recruitment', 'entry')),
	CONSTRAINT "discord_publication_jobs_status_valid" CHECK ("discord_publication_jobs"."status" in ('pending', 'processing', 'sent', 'blocked', 'uncertain')),
	CONSTRAINT "discord_publication_jobs_counts_valid" CHECK ("discord_publication_jobs"."revision" > 0 and "discord_publication_jobs"."attempts" >= 0),
	CONSTRAINT "discord_publication_jobs_lease_complete" CHECK ("discord_publication_jobs"."status" <> 'processing' or ("discord_publication_jobs"."lease_token" is not null and "discord_publication_jobs"."lease_until" is not null and "discord_publication_jobs"."lease_revision" is not null and "discord_publication_jobs"."lease_channel_id" is not null and "discord_publication_jobs"."lease_operation" in ('upsert', 'delete')))
);
--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" DROP CONSTRAINT "scrim_discord_messages_pkey";--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD COLUMN "kind" text DEFAULT 'recruitment' NOT NULL;--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD COLUMN "published_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_scrim_id_kind_pk" PRIMARY KEY("scrim_id","kind");--> statement-breakpoint
ALTER TABLE "discord_interaction_receipts" ADD CONSTRAINT "discord_interaction_receipts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" ADD CONSTRAINT "discord_publication_jobs_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_publication_jobs_pending_idx" ON "discord_publication_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_kind_valid" CHECK ("scrim_discord_messages"."kind" in ('recruitment', 'entry'));--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_revision_nonnegative" CHECK ("scrim_discord_messages"."published_revision" >= 0);