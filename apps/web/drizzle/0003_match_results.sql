CREATE TABLE "match_lineup_players" (
	"scrim_id" uuid NOT NULL,
	"lineup_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"position" "lol_position" NOT NULL,
	CONSTRAINT "match_lineup_players_lineup_id_participant_id_pk" PRIMARY KEY("lineup_id","participant_id"),
	CONSTRAINT "match_lineup_players_team_position_unique" UNIQUE("lineup_id","team_id","position")
);
--> statement-breakpoint
CREATE TABLE "match_lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"confirmed_at" timestamp (3) with time zone,
	"confirmed_by_user_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_lineups_match_unique" UNIQUE("match_id"),
	CONSTRAINT "match_lineups_scrim_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "match_lineups_match_id_unique" UNIQUE("match_id","id"),
	CONSTRAINT "match_lineups_confirmation_valid" CHECK ("match_lineups"."confirmed_at" is not null or "match_lineups"."confirmed_by_user_id" is null)
);
--> statement-breakpoint
CREATE TABLE "match_rofl_imports" (
	"rofl_metadata_id" uuid PRIMARY KEY NOT NULL,
	"result_fingerprint" text NOT NULL,
	"match_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"lineup_id" uuid NOT NULL,
	"submitted_revision" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_rofl_imports_result_fingerprint_unique" UNIQUE("result_fingerprint"),
	CONSTRAINT "match_rofl_imports_fingerprint_valid" CHECK ("match_rofl_imports"."result_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "match_rofl_imports_revision_nonnegative" CHECK ("match_rofl_imports"."submitted_revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" DROP CONSTRAINT "discord_publication_jobs_scrim_kind_unique";--> statement-breakpoint
ALTER TABLE "games" DROP CONSTRAINT "games_match_number_unique";--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" DROP CONSTRAINT "discord_publication_jobs_kind_valid";--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" DROP CONSTRAINT "discord_publication_jobs_lease_complete";--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" DROP CONSTRAINT "scrim_discord_messages_kind_valid";--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" DROP CONSTRAINT "scrim_discord_messages_scrim_id_kind_pk";--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" ADD COLUMN "subject_id" text DEFAULT 'scrim' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD COLUMN "subject_id" text DEFAULT 'scrim' NOT NULL;--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_scrim_id_kind_subject_id_pk" PRIMARY KEY("scrim_id","kind","subject_id");--> statement-breakpoint
ALTER TABLE "match_lineup_players" ADD CONSTRAINT "match_lineup_players_lineup_fk" FOREIGN KEY ("scrim_id","lineup_id") REFERENCES "public"."match_lineups"("scrim_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineup_players" ADD CONSTRAINT "match_lineup_players_participant_fk" FOREIGN KEY ("scrim_id","participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineup_players" ADD CONSTRAINT "match_lineup_players_team_fk" FOREIGN KEY ("scrim_id","team_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_match_fk" FOREIGN KEY ("scrim_id","match_id") REFERENCES "public"."matches"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD CONSTRAINT "match_rofl_imports_rofl_metadata_id_rofl_metadata_id_fk" FOREIGN KEY ("rofl_metadata_id") REFERENCES "public"."rofl_metadata"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD CONSTRAINT "match_rofl_imports_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD CONSTRAINT "match_rofl_imports_lineup_fk" FOREIGN KEY ("match_id","lineup_id") REFERENCES "public"."match_lineups"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_match_id_id_unique" UNIQUE("match_id","id");--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD CONSTRAINT "match_rofl_imports_game_fk" FOREIGN KEY ("match_id","game_id") REFERENCES "public"."games"("match_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD CONSTRAINT "match_rofl_imports_selected_rofl_fk" FOREIGN KEY ("game_id","rofl_metadata_id") REFERENCES "public"."games"("id","rofl_metadata_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_match_number_unique" ON "games" USING btree ("match_id","game_number") WHERE "games"."status" <> 'cancelled';--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" ADD CONSTRAINT "discord_publication_jobs_scrim_kind_unique" UNIQUE("scrim_id","kind","subject_id");--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" ADD CONSTRAINT "discord_publication_jobs_kind_valid" CHECK ("discord_publication_jobs"."kind" in ('recruitment', 'entry', 'lineup', 'result', 'confirmation_dm'));--> statement-breakpoint
ALTER TABLE "discord_publication_jobs" ADD CONSTRAINT "discord_publication_jobs_lease_complete" CHECK ("discord_publication_jobs"."status" <> 'processing' or ("discord_publication_jobs"."lease_token" is not null and "discord_publication_jobs"."lease_until" is not null and "discord_publication_jobs"."lease_revision" is not null and ("discord_publication_jobs"."lease_channel_id" is not null or "discord_publication_jobs"."kind" = 'confirmation_dm') and "discord_publication_jobs"."lease_operation" is not null and "discord_publication_jobs"."lease_operation" in ('upsert', 'delete')));--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_revision_nonnegative" CHECK ("matches"."revision" >= 0);--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_kind_valid" CHECK ("scrim_discord_messages"."kind" in ('recruitment', 'entry', 'lineup', 'result', 'confirmation_dm'));