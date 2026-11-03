CREATE TYPE "public"."auction_acquisition_method" AS ENUM('auction', 'manual');--> statement-breakpoint
CREATE TYPE "public"."auction_lot_status" AS ENUM('open', 'sold', 'unsold', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."auction_status" AS ENUM('setup', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."game_side" AS ENUM('blue', 'red');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('pending', 'in_progress', 'awaiting_result', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lol_position" AS ENUM('top', 'jungle', 'mid', 'bot', 'support');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'in_progress', 'completed', 'ended_early', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."match_team_slot" AS ENUM('a', 'b');--> statement-breakpoint
CREATE TYPE "public"."mmr_ledger_entry_kind" AS ENUM('game_result', 'game_reversal', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."replay_result_status" AS ENUM('consistent', 'incomplete', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."scrim_formation_method" AS ENUM('manual', 'auction');--> statement-breakpoint
CREATE TYPE "public"."scrim_registration_status" AS ENUM('selected', 'standby', 'withdrawn', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."scrim_status" AS ENUM('recruit', 'preparing', 'ready', 'in_progress', 'completed', 'ended_early', 'cancelled');--> statement-breakpoint
CREATE TABLE "auction_acquisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"auction_id" uuid NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"buyer_participant_id" uuid,
	"method" "auction_acquisition_method" NOT NULL,
	"price" integer,
	"lot_id" uuid,
	"recorded_by_user_id" text,
	"acquired_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp (3) with time zone,
	"voided_by_user_id" text,
	"void_reason" text,
	"supersedes_id" uuid,
	CONSTRAINT "auction_acquisitions_auction_id_unique" UNIQUE("auction_id","id"),
	CONSTRAINT "auction_acquisitions_supersedes_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "auction_acquisitions_method_values" CHECK (("auction_acquisitions"."method" = 'auction' and "auction_acquisitions"."price" is not null and "auction_acquisitions"."price" >= 0 and "auction_acquisitions"."lot_id" is not null and "auction_acquisitions"."buyer_participant_id" is not null) or ("auction_acquisitions"."method" = 'manual' and "auction_acquisitions"."price" is null and "auction_acquisitions"."buyer_participant_id" is null)),
	CONSTRAINT "auction_acquisitions_buyer_not_target" CHECK ("auction_acquisitions"."buyer_participant_id" is null or "auction_acquisitions"."buyer_participant_id" <> "auction_acquisitions"."scrim_participant_id"),
	CONSTRAINT "auction_acquisitions_not_self_correction" CHECK ("auction_acquisitions"."supersedes_id" is null or "auction_acquisitions"."supersedes_id" <> "auction_acquisitions"."id"),
	CONSTRAINT "auction_acquisitions_void_details" CHECK (("auction_acquisitions"."voided_at" is null and "auction_acquisitions"."voided_by_user_id" is null and "auction_acquisitions"."void_reason" is null) or ("auction_acquisitions"."voided_at" is not null and "auction_acquisitions"."void_reason" is not null and length(btrim("auction_acquisitions"."void_reason")) > 0)),
	CONSTRAINT "auction_acquisitions_void_time" CHECK ("auction_acquisitions"."voided_at" >= "auction_acquisitions"."acquired_at")
);
--> statement-breakpoint
CREATE TABLE "auction_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"auction_id" uuid NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"position" "lol_position",
	"status" "auction_lot_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"voided_at" timestamp (3) with time zone,
	"voided_by_user_id" text,
	"void_reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_lots_sequence_unique" UNIQUE("auction_id","sequence_number"),
	CONSTRAINT "auction_lots_auction_participant_id_unique" UNIQUE("auction_id","scrim_participant_id","id"),
	CONSTRAINT "auction_lots_sequence_positive" CHECK ("auction_lots"."sequence_number" > 0),
	CONSTRAINT "auction_lots_closed_at_matches_status" CHECK (("auction_lots"."status" = 'open' and "auction_lots"."closed_at" is null) or ("auction_lots"."status" <> 'open' and "auction_lots"."closed_at" is not null)),
	CONSTRAINT "auction_lots_time_order" CHECK ("auction_lots"."closed_at" >= "auction_lots"."opened_at"),
	CONSTRAINT "auction_lots_void_details" CHECK (("auction_lots"."voided_at" is null and "auction_lots"."voided_by_user_id" is null and "auction_lots"."void_reason" is null) or ("auction_lots"."voided_at" is not null and "auction_lots"."status" <> 'open' and "auction_lots"."void_reason" is not null and length(btrim("auction_lots"."void_reason")) > 0)),
	CONSTRAINT "auction_lots_void_time" CHECK ("auction_lots"."voided_at" >= "auction_lots"."closed_at")
);
--> statement-breakpoint
CREATE TABLE "auction_queue_entries" (
	"scrim_id" uuid NOT NULL,
	"auction_id" uuid NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_queue_entries_auction_id_scrim_participant_id_pk" PRIMARY KEY("auction_id","scrim_participant_id"),
	CONSTRAINT "auction_queue_entries_ordinal_unique" UNIQUE("auction_id","ordinal"),
	CONSTRAINT "auction_queue_entries_ordinal_positive" CHECK ("auction_queue_entries"."ordinal" > 0)
);
--> statement-breakpoint
CREATE TABLE "auction_teams" (
	"scrim_id" uuid NOT NULL,
	"auction_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"captain_participant_id" uuid,
	"initial_points" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auction_teams_auction_id_team_id_pk" PRIMARY KEY("auction_id","team_id"),
	CONSTRAINT "auction_teams_scrim_auction_team_unique" UNIQUE("scrim_id","auction_id","team_id"),
	CONSTRAINT "auction_teams_captain_unique" UNIQUE("auction_id","captain_participant_id"),
	CONSTRAINT "auction_teams_initial_points_positive" CHECK ("auction_teams"."initial_points" > 0)
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"status" "auction_status" DEFAULT 'setup' NOT NULL,
	"started_at" timestamp (3) with time zone,
	"ended_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auctions_scrim_id_unique" UNIQUE("scrim_id"),
	CONSTRAINT "auctions_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "auctions_time_order" CHECK ("auctions"."ended_at" >= "auctions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "game_mmr_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"rofl_metadata_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"applied_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"applied_by_user_id" text,
	"reversed_at" timestamp (3) with time zone,
	"reversed_by_user_id" text,
	"reversal_reason" text,
	CONSTRAINT "game_mmr_applications_game_revision_unique" UNIQUE("game_id","revision"),
	CONSTRAINT "game_mmr_applications_season_scrim_id_unique" UNIQUE("season_id","scrim_id","id"),
	CONSTRAINT "game_mmr_applications_revision_positive" CHECK ("game_mmr_applications"."revision" > 0),
	CONSTRAINT "game_mmr_applications_time_order" CHECK ("game_mmr_applications"."reversed_at" >= "game_mmr_applications"."applied_at"),
	CONSTRAINT "game_mmr_applications_reversal_details" CHECK (
		("game_mmr_applications"."reversed_at" is null and "game_mmr_applications"."reversed_by_user_id" is null and "game_mmr_applications"."reversal_reason" is null)
		or ("game_mmr_applications"."reversed_at" is not null and nullif(btrim("game_mmr_applications"."reversal_reason"), '') is not null)
	)
);
--> statement-breakpoint
CREATE TABLE "game_participants" (
	"scrim_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"riot_account_id" uuid,
	"display_name" text NOT NULL,
	"riot_game_name" text,
	"riot_tag_line" text,
	"side" "game_side" NOT NULL,
	"position" "lol_position",
	"champion_id" integer,
	"rofl_metadata_id" uuid NOT NULL,
	"rofl_participant_index" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_participants_game_id_scrim_participant_id_pk" PRIMARY KEY("game_id","scrim_participant_id"),
	CONSTRAINT "game_participants_account_unique" UNIQUE("game_id","riot_account_id"),
	CONSTRAINT "game_participants_side_position_unique" UNIQUE("game_id","side","position"),
	CONSTRAINT "game_participants_rofl_index_unique" UNIQUE("game_id","rofl_participant_index"),
	CONSTRAINT "game_participants_champion_id_positive" CHECK ("game_participants"."champion_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"blue_team_slot" "match_team_slot" NOT NULL,
	"status" "game_status" DEFAULT 'pending' NOT NULL,
	"winner_side" "game_side",
	"started_at" timestamp (3) with time zone,
	"ended_at" timestamp (3) with time zone,
	"rofl_metadata_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_rofl_metadata_id_unique" UNIQUE("rofl_metadata_id"),
	CONSTRAINT "games_match_number_unique" UNIQUE("match_id","game_number"),
	CONSTRAINT "games_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "games_id_rofl_metadata_unique" UNIQUE("id","rofl_metadata_id"),
	CONSTRAINT "games_number_positive" CHECK ("games"."game_number" > 0),
	CONSTRAINT "games_completed_requires_rofl" CHECK ("games"."status" <> 'completed' or "games"."rofl_metadata_id" is not null),
	CONSTRAINT "games_winner_requires_completion" CHECK (("games"."status" = 'completed' and "games"."winner_side" is not null) or ("games"."status" <> 'completed' and "games"."winner_side" is null)),
	CONSTRAINT "games_time_order" CHECK ("games"."ended_at" >= "games"."started_at")
);
--> statement-breakpoint
CREATE TABLE "guild_discord_channels" (
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"category_name" text,
	"position" integer NOT NULL,
	"bot_can_post" boolean NOT NULL,
	"synced_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_discord_channels_guild_id_channel_id_pk" PRIMARY KEY("guild_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "guild_discord_roles" (
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"synced_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_discord_roles_guild_id_role_id_pk" PRIMARY KEY("guild_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "guild_discord_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"operator_role_id" text,
	"recruitment_channel_id" text,
	"entry_channel_id" text,
	"result_channel_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"manage_guild" boolean DEFAULT false NOT NULL,
	"role_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"synced_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_riot_accounts" (
	"guild_id" text NOT NULL,
	"riot_account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"linked_by_user_id" text,
	"linked_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_riot_accounts_guild_id_riot_account_id_pk" PRIMARY KEY("guild_id","riot_account_id")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"team_a_id" uuid NOT NULL,
	"team_b_id" uuid NOT NULL,
	"label" text,
	"best_of" integer NOT NULL,
	"is_hard_fearless" boolean NOT NULL,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"winner_team_id" uuid,
	"started_at" timestamp (3) with time zone,
	"ended_at" timestamp (3) with time zone,
	"end_reason" text,
	"status_before_scrim_end" "match_status",
	"ended_at_before_scrim_end" timestamp (3) with time zone,
	"end_reason_before_scrim_end" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "matches_distinct_teams" CHECK ("matches"."team_a_id" <> "matches"."team_b_id"),
	CONSTRAINT "matches_best_of_allowed" CHECK ("matches"."best_of" in (1, 3, 5)),
	CONSTRAINT "matches_winner_is_competing_team" CHECK ("matches"."winner_team_id" is null or "matches"."winner_team_id" in ("matches"."team_a_id", "matches"."team_b_id")),
	CONSTRAINT "matches_winner_requires_completion" CHECK (("matches"."status" = 'completed' and "matches"."winner_team_id" is not null) or ("matches"."status" <> 'completed' and "matches"."winner_team_id" is null)),
	CONSTRAINT "matches_time_order" CHECK ("matches"."ended_at" >= "matches"."started_at"),
	CONSTRAINT "matches_scrim_end_restore_state" CHECK (("matches"."status_before_scrim_end" is null and "matches"."ended_at_before_scrim_end" is null and "matches"."end_reason_before_scrim_end" is null) or ("matches"."status_before_scrim_end" is not null and (("matches"."status_before_scrim_end" = 'pending' and "matches"."status" = 'cancelled') or ("matches"."status_before_scrim_end" = 'in_progress' and "matches"."status" = 'ended_early'))))
);
--> statement-breakpoint
CREATE TABLE "mmr_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"rating_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" "mmr_ledger_entry_kind" NOT NULL,
	"application_id" uuid,
	"scrim_id" uuid,
	"scrim_participant_id" uuid,
	"before_mmr" double precision NOT NULL,
	"after_mmr" double precision NOT NULL,
	"reverses_entry_id" uuid,
	"reason" text,
	"recorded_by_user_id" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mmr_ledger_entries_rating_revision_unique" UNIQUE("rating_id","revision"),
	CONSTRAINT "mmr_ledger_entries_app_rating_kind_unique" UNIQUE("application_id","rating_id","kind"),
	CONSTRAINT "mmr_ledger_entries_app_participant_kind_unique" UNIQUE("application_id","scrim_participant_id","kind"),
	CONSTRAINT "mmr_ledger_entries_reversal_source_unique" UNIQUE("rating_id","application_id","scrim_participant_id","id"),
	CONSTRAINT "mmr_ledger_entries_reverses_entry_unique" UNIQUE("reverses_entry_id"),
	CONSTRAINT "mmr_ledger_entries_revision_positive" CHECK ("mmr_ledger_entries"."revision" > 0),
	CONSTRAINT "mmr_ledger_entries_values_finite" CHECK (
		"mmr_ledger_entries"."before_mmr" > '-Infinity'::double precision and "mmr_ledger_entries"."before_mmr" < 'Infinity'::double precision
		and "mmr_ledger_entries"."after_mmr" > '-Infinity'::double precision and "mmr_ledger_entries"."after_mmr" < 'Infinity'::double precision
	),
	CONSTRAINT "mmr_ledger_entries_no_self_reversal" CHECK ("mmr_ledger_entries"."reverses_entry_id" <> "mmr_ledger_entries"."id"),
	CONSTRAINT "mmr_ledger_entries_kind_details" CHECK (
		("mmr_ledger_entries"."kind" = 'adjustment' and "mmr_ledger_entries"."application_id" is null and "mmr_ledger_entries"."scrim_id" is null
			and "mmr_ledger_entries"."scrim_participant_id" is null and "mmr_ledger_entries"."reverses_entry_id" is null
			and nullif(btrim("mmr_ledger_entries"."reason"), '') is not null)
		or ("mmr_ledger_entries"."kind" = 'game_result' and "mmr_ledger_entries"."application_id" is not null and "mmr_ledger_entries"."scrim_id" is not null
			and "mmr_ledger_entries"."scrim_participant_id" is not null and "mmr_ledger_entries"."reverses_entry_id" is null)
		or ("mmr_ledger_entries"."kind" = 'game_reversal' and "mmr_ledger_entries"."application_id" is not null and "mmr_ledger_entries"."scrim_id" is not null
			and "mmr_ledger_entries"."scrim_participant_id" is not null and "mmr_ledger_entries"."reverses_entry_id" is not null
			and nullif(btrim("mmr_ledger_entries"."reason"), '') is not null)
	)
);
--> statement-breakpoint
CREATE TABLE "mmr_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp (3) with time zone,
	CONSTRAINT "mmr_seasons_guild_id_id_unique" UNIQUE("guild_id","id"),
	CONSTRAINT "mmr_seasons_time_order" CHECK ("mmr_seasons"."ended_at" >= "mmr_seasons"."started_at")
);
--> statement-breakpoint
CREATE TABLE "riot_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puuid" text NOT NULL,
	"game_name" text,
	"tag_line" text,
	"platform" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riot_accounts_puuid_unique" UNIQUE("puuid")
);
--> statement-breakpoint
CREATE TABLE "rofl_game_data_v1" (
	"rofl_metadata_id" uuid PRIMARY KEY NOT NULL,
	"projection_version" integer DEFAULT 1 NOT NULL,
	"game_length_ms" bigint NOT NULL,
	"result_status" "replay_result_status" NOT NULL,
	"winner_replay_team_id" bigint,
	"teams" jsonb NOT NULL,
	CONSTRAINT "rofl_game_data_v1_projection" CHECK ("rofl_game_data_v1"."projection_version" = 1),
	CONSTRAINT "rofl_game_data_v1_length_safe" CHECK ("rofl_game_data_v1"."game_length_ms" between 0 and 9007199254740991),
	CONSTRAINT "rofl_game_data_v1_winner_safe" CHECK ("rofl_game_data_v1"."winner_replay_team_id" between 0 and 9007199254740991),
	CONSTRAINT "rofl_game_data_v1_winner_consistency" CHECK (("rofl_game_data_v1"."result_status" = 'consistent' and "rofl_game_data_v1"."winner_replay_team_id" is not null) or ("rofl_game_data_v1"."result_status" <> 'consistent' and "rofl_game_data_v1"."winner_replay_team_id" is null))
);
--> statement-breakpoint
CREATE TABLE "rofl_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_sha256" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"format_version" integer NOT NULL,
	"game_version" text NOT NULL,
	"projection_version" integer NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rofl_metadata_file_projection_unique" UNIQUE("file_sha256","projection_version"),
	CONSTRAINT "rofl_metadata_id_projection_unique" UNIQUE("id","projection_version"),
	CONSTRAINT "rofl_metadata_sha256_format" CHECK ("rofl_metadata"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rofl_metadata_size_safe_positive" CHECK ("rofl_metadata"."file_size_bytes" between 1 and 9007199254740991),
	CONSTRAINT "rofl_metadata_format_positive" CHECK ("rofl_metadata"."format_version" > 0),
	CONSTRAINT "rofl_metadata_projection_positive" CHECK ("rofl_metadata"."projection_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "rofl_participant_data_v1" (
	"rofl_metadata_id" uuid NOT NULL,
	"participant_index" integer NOT NULL,
	"game_name" text,
	"tag_line" text,
	"replay_puuid" text,
	"champion" text,
	"replay_team_id" bigint,
	"win" boolean,
	"stats" jsonb NOT NULL,
	"loadout" jsonb NOT NULL,
	CONSTRAINT "rofl_participant_data_v1_rofl_metadata_id_participant_index_pk" PRIMARY KEY("rofl_metadata_id","participant_index"),
	CONSTRAINT "rofl_participant_data_v1_team_safe" CHECK ("rofl_participant_data_v1"."replay_team_id" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "rofl_participants" (
	"rofl_metadata_id" uuid NOT NULL,
	"participant_index" integer NOT NULL,
	CONSTRAINT "rofl_participants_rofl_metadata_id_participant_index_pk" PRIMARY KEY("rofl_metadata_id","participant_index"),
	CONSTRAINT "rofl_participants_index_nonnegative" CHECK ("rofl_participants"."participant_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scrim_bracket_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"match_number" integer NOT NULL,
	"match_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_bracket_nodes_match_id_unique" UNIQUE("match_id"),
	CONSTRAINT "scrim_bracket_nodes_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "scrim_bracket_nodes_number_unique" UNIQUE("round_id","match_number"),
	CONSTRAINT "scrim_bracket_nodes_number_positive" CHECK ("scrim_bracket_nodes"."match_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "scrim_bracket_slots" (
	"scrim_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"slot" "match_team_slot" NOT NULL,
	"team_id" uuid,
	"source_node_id" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_bracket_slots_node_id_slot_pk" PRIMARY KEY("node_id","slot"),
	CONSTRAINT "scrim_bracket_slots_team_unique" UNIQUE("scrim_id","team_id"),
	CONSTRAINT "scrim_bracket_slots_source_unique" UNIQUE("source_node_id"),
	CONSTRAINT "scrim_bracket_slots_source_exclusive" CHECK ("scrim_bracket_slots"."team_id" is null or "scrim_bracket_slots"."source_node_id" is null),
	CONSTRAINT "scrim_bracket_slots_not_self" CHECK ("scrim_bracket_slots"."source_node_id" <> "scrim_bracket_slots"."node_id")
);
--> statement-breakpoint
CREATE TABLE "scrim_discord_messages" (
	"scrim_id" uuid PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_discord_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "scrim_participant_preferences" (
	"scrim_participant_id" uuid NOT NULL,
	"position" "lol_position" NOT NULL,
	"priority" integer NOT NULL,
	CONSTRAINT "scrim_participant_preferences_scrim_participant_id_position_pk" PRIMARY KEY("scrim_participant_id","position"),
	CONSTRAINT "scrim_participant_preferences_priority_unique" UNIQUE("scrim_participant_id","priority"),
	CONSTRAINT "scrim_participant_preferences_priority_range" CHECK ("scrim_participant_preferences"."priority" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "scrim_participant_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"status" "scrim_registration_status" NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"joined_by_user_id" text,
	"withdrawn_at" timestamp (3) with time zone,
	"withdrawn_by_user_id" text,
	"withdrawal_reason" text,
	CONSTRAINT "scrim_participant_registrations_time_order" CHECK ("scrim_participant_registrations"."withdrawn_at" >= "scrim_participant_registrations"."joined_at"),
	CONSTRAINT "scrim_participant_registrations_status_closure" CHECK (("scrim_participant_registrations"."status" in ('withdrawn', 'excluded')) = ("scrim_participant_registrations"."withdrawn_at" is not null)),
	CONSTRAINT "scrim_participant_registrations_withdrawal_details" CHECK ("scrim_participant_registrations"."withdrawn_at" is not null or ("scrim_participant_registrations"."withdrawn_by_user_id" is null and "scrim_participant_registrations"."withdrawal_reason" is null))
);
--> statement-breakpoint
CREATE TABLE "scrim_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"user_id" text,
	"riot_account_id" uuid,
	"display_name" text NOT NULL,
	"team_id" uuid,
	"position" "lol_position",
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_participants_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "scrim_participants_user_unique" UNIQUE("scrim_id","user_id"),
	CONSTRAINT "scrim_participants_account_unique" UNIQUE("scrim_id","riot_account_id"),
	CONSTRAINT "scrim_participants_team_position_unique" UNIQUE("scrim_id","team_id","position"),
	CONSTRAINT "scrim_participants_position_requires_team" CHECK ("scrim_participants"."position" is null or "scrim_participants"."team_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "scrim_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"label" text NOT NULL,
	"best_of" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_rounds_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "scrim_rounds_number_unique" UNIQUE("scrim_id","round_number"),
	CONSTRAINT "scrim_rounds_number_positive" CHECK ("scrim_rounds"."round_number" > 0),
	CONSTRAINT "scrim_rounds_best_of_allowed" CHECK ("scrim_rounds"."best_of" in (1, 3, 5))
);
--> statement-breakpoint
CREATE TABLE "scrim_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ordinal" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrim_teams_scrim_id_id_unique" UNIQUE("scrim_id","id"),
	CONSTRAINT "scrim_teams_ordinal_range" CHECK ("scrim_teams"."ordinal" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "scrims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"mmr_season_id" uuid,
	"created_by_user_id" text,
	"creation_request_id" uuid,
	"revision" integer DEFAULT 0 NOT NULL,
	"bracket_confirmed_at" timestamp (3) with time zone,
	"bracket_confirmed_by_user_id" text,
	"title" text NOT NULL,
	"status" "scrim_status" DEFAULT 'recruit' NOT NULL,
	"formation_method" "scrim_formation_method",
	"is_hard_fearless" boolean DEFAULT false NOT NULL,
	"team_count" integer DEFAULT 2 NOT NULL,
	"reserve_capacity" integer DEFAULT 0 NOT NULL,
	"expected_start_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrims_id_mmr_season_unique" UNIQUE("id","mmr_season_id"),
	CONSTRAINT "scrims_creation_request_unique" UNIQUE("created_by_user_id","creation_request_id"),
	CONSTRAINT "scrims_team_count_range" CHECK ("scrims"."team_count" between 2 and 4),
	CONSTRAINT "scrims_reserve_capacity_range" CHECK ("scrims"."reserve_capacity" between 0 and 10),
	CONSTRAINT "scrims_revision_nonnegative" CHECK ("scrims"."revision" >= 0),
	CONSTRAINT "scrims_title_length" CHECK (length(btrim("scrims"."title")) between 1 and 50),
	CONSTRAINT "scrims_bracket_confirmer_requires_time" CHECK ("scrims"."bracket_confirmed_by_user_id" is null or "scrims"."bracket_confirmed_at" is not null),
	CONSTRAINT "scrims_formation_method_required" CHECK ("scrims"."status" in ('recruit', 'preparing', 'cancelled') or "scrims"."formation_method" is not null)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_format" CHECK ("sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_expiry_order" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "user_champion_preferences" (
	"user_id" text NOT NULL,
	"position" "lol_position" NOT NULL,
	"champion_id" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_champion_preferences_user_id_position_champion_id_pk" PRIMARY KEY("user_id","position","champion_id"),
	CONSTRAINT "user_champion_preferences_champion_id_positive" CHECK ("user_champion_preferences"."champion_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_position_mmr" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"user_id" text,
	"position" "lol_position" NOT NULL,
	"mmr" double precision DEFAULT 1500 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_position_mmr_season_user_position_unique" UNIQUE("season_id","user_id","position"),
	CONSTRAINT "user_position_mmr_season_id_id_unique" UNIQUE("season_id","id"),
	CONSTRAINT "user_position_mmr_finite" CHECK ("user_position_mmr"."mmr" > '-Infinity'::double precision and "user_position_mmr"."mmr" < 'Infinity'::double precision),
	CONSTRAINT "user_position_mmr_revision_nonnegative" CHECK ("user_position_mmr"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"global_name" text,
	"avatar_hash" text,
	"is_service_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_auction_fk" FOREIGN KEY ("scrim_id","auction_id") REFERENCES "public"."auctions"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_team_fk" FOREIGN KEY ("scrim_id","auction_id","team_id") REFERENCES "public"."auction_teams"("scrim_id","auction_id","team_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_participant_fk" FOREIGN KEY ("scrim_id","scrim_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_buyer_fk" FOREIGN KEY ("scrim_id","buyer_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_lot_fk" FOREIGN KEY ("auction_id","scrim_participant_id","lot_id") REFERENCES "public"."auction_lots"("auction_id","scrim_participant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_acquisitions" ADD CONSTRAINT "auction_acquisitions_supersedes_fk" FOREIGN KEY ("auction_id","supersedes_id") REFERENCES "public"."auction_acquisitions"("auction_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_auction_fk" FOREIGN KEY ("scrim_id","auction_id") REFERENCES "public"."auctions"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_lots" ADD CONSTRAINT "auction_lots_participant_fk" FOREIGN KEY ("scrim_id","scrim_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_queue_entries" ADD CONSTRAINT "auction_queue_entries_auction_fk" FOREIGN KEY ("scrim_id","auction_id") REFERENCES "public"."auctions"("scrim_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_queue_entries" ADD CONSTRAINT "auction_queue_entries_participant_fk" FOREIGN KEY ("scrim_id","scrim_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_teams" ADD CONSTRAINT "auction_teams_auction_fk" FOREIGN KEY ("scrim_id","auction_id") REFERENCES "public"."auctions"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_teams" ADD CONSTRAINT "auction_teams_team_fk" FOREIGN KEY ("scrim_id","team_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_teams" ADD CONSTRAINT "auction_teams_captain_fk" FOREIGN KEY ("scrim_id","captain_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mmr_applications" ADD CONSTRAINT "game_mmr_applications_rofl_metadata_id_rofl_metadata_id_fk" FOREIGN KEY ("rofl_metadata_id") REFERENCES "public"."rofl_metadata"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mmr_applications" ADD CONSTRAINT "game_mmr_applications_applied_by_user_id_users_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mmr_applications" ADD CONSTRAINT "game_mmr_applications_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mmr_applications" ADD CONSTRAINT "game_mmr_applications_game_fk" FOREIGN KEY ("scrim_id","game_id") REFERENCES "public"."games"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_mmr_applications" ADD CONSTRAINT "game_mmr_applications_scrim_season_fk" FOREIGN KEY ("scrim_id","season_id") REFERENCES "public"."scrims"("id","mmr_season_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_riot_account_id_riot_accounts_id_fk" FOREIGN KEY ("riot_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_game_fk" FOREIGN KEY ("scrim_id","game_id") REFERENCES "public"."games"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_participant_fk" FOREIGN KEY ("scrim_id","scrim_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_selected_rofl_fk" FOREIGN KEY ("game_id","rofl_metadata_id") REFERENCES "public"."games"("id","rofl_metadata_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_participants" ADD CONSTRAINT "game_participants_rofl_participant_fk" FOREIGN KEY ("rofl_metadata_id","rofl_participant_index") REFERENCES "public"."rofl_participants"("rofl_metadata_id","participant_index") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_rofl_metadata_id_rofl_metadata_id_fk" FOREIGN KEY ("rofl_metadata_id") REFERENCES "public"."rofl_metadata"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_match_fk" FOREIGN KEY ("scrim_id","match_id") REFERENCES "public"."matches"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_discord_channels" ADD CONSTRAINT "guild_discord_channels_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_discord_roles" ADD CONSTRAINT "guild_discord_roles_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_discord_settings" ADD CONSTRAINT "guild_discord_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_riot_accounts" ADD CONSTRAINT "guild_riot_accounts_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_riot_accounts" ADD CONSTRAINT "guild_riot_accounts_riot_account_id_riot_accounts_id_fk" FOREIGN KEY ("riot_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_riot_accounts" ADD CONSTRAINT "guild_riot_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_riot_accounts" ADD CONSTRAINT "guild_riot_accounts_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_a_fk" FOREIGN KEY ("scrim_id","team_a_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team_b_fk" FOREIGN KEY ("scrim_id","team_b_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_ledger_entries" ADD CONSTRAINT "mmr_ledger_entries_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_ledger_entries" ADD CONSTRAINT "mmr_ledger_entries_rating_fk" FOREIGN KEY ("season_id","rating_id") REFERENCES "public"."user_position_mmr"("season_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_ledger_entries" ADD CONSTRAINT "mmr_ledger_entries_application_fk" FOREIGN KEY ("season_id","scrim_id","application_id") REFERENCES "public"."game_mmr_applications"("season_id","scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_ledger_entries" ADD CONSTRAINT "mmr_ledger_entries_participant_fk" FOREIGN KEY ("scrim_id","scrim_participant_id") REFERENCES "public"."scrim_participants"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_ledger_entries" ADD CONSTRAINT "mmr_ledger_entries_reversal_fk" FOREIGN KEY ("rating_id","application_id","scrim_participant_id","reverses_entry_id") REFERENCES "public"."mmr_ledger_entries"("rating_id","application_id","scrim_participant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mmr_seasons" ADD CONSTRAINT "mmr_seasons_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rofl_game_data_v1" ADD CONSTRAINT "rofl_game_data_v1_metadata_fk" FOREIGN KEY ("rofl_metadata_id","projection_version") REFERENCES "public"."rofl_metadata"("id","projection_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rofl_metadata" ADD CONSTRAINT "rofl_metadata_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rofl_participant_data_v1" ADD CONSTRAINT "rofl_participant_data_v1_rofl_metadata_id_rofl_game_data_v1_rofl_metadata_id_fk" FOREIGN KEY ("rofl_metadata_id") REFERENCES "public"."rofl_game_data_v1"("rofl_metadata_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rofl_participant_data_v1" ADD CONSTRAINT "rofl_participant_data_v1_participant_fk" FOREIGN KEY ("rofl_metadata_id","participant_index") REFERENCES "public"."rofl_participants"("rofl_metadata_id","participant_index") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rofl_participants" ADD CONSTRAINT "rofl_participants_rofl_metadata_id_rofl_metadata_id_fk" FOREIGN KEY ("rofl_metadata_id") REFERENCES "public"."rofl_metadata"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_bracket_nodes" ADD CONSTRAINT "scrim_bracket_nodes_round_fk" FOREIGN KEY ("scrim_id","round_id") REFERENCES "public"."scrim_rounds"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_bracket_nodes" ADD CONSTRAINT "scrim_bracket_nodes_match_fk" FOREIGN KEY ("scrim_id","match_id") REFERENCES "public"."matches"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_bracket_slots" ADD CONSTRAINT "scrim_bracket_slots_node_fk" FOREIGN KEY ("scrim_id","node_id") REFERENCES "public"."scrim_bracket_nodes"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_bracket_slots" ADD CONSTRAINT "scrim_bracket_slots_team_fk" FOREIGN KEY ("scrim_id","team_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_bracket_slots" ADD CONSTRAINT "scrim_bracket_slots_source_fk" FOREIGN KEY ("scrim_id","source_node_id") REFERENCES "public"."scrim_bracket_nodes"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_discord_messages" ADD CONSTRAINT "scrim_discord_messages_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participant_preferences" ADD CONSTRAINT "scrim_participant_preferences_scrim_participant_id_scrim_participants_id_fk" FOREIGN KEY ("scrim_participant_id") REFERENCES "public"."scrim_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participant_registrations" ADD CONSTRAINT "scrim_participant_registrations_scrim_participant_id_scrim_participants_id_fk" FOREIGN KEY ("scrim_participant_id") REFERENCES "public"."scrim_participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participant_registrations" ADD CONSTRAINT "scrim_participant_registrations_joined_by_user_id_users_id_fk" FOREIGN KEY ("joined_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participant_registrations" ADD CONSTRAINT "scrim_participant_registrations_withdrawn_by_user_id_users_id_fk" FOREIGN KEY ("withdrawn_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participants" ADD CONSTRAINT "scrim_participants_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participants" ADD CONSTRAINT "scrim_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participants" ADD CONSTRAINT "scrim_participants_riot_account_id_riot_accounts_id_fk" FOREIGN KEY ("riot_account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_participants" ADD CONSTRAINT "scrim_participants_team_fk" FOREIGN KEY ("scrim_id","team_id") REFERENCES "public"."scrim_teams"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_rounds" ADD CONSTRAINT "scrim_rounds_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrim_teams" ADD CONSTRAINT "scrim_teams_scrim_id_scrims_id_fk" FOREIGN KEY ("scrim_id") REFERENCES "public"."scrims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrims" ADD CONSTRAINT "scrims_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrims" ADD CONSTRAINT "scrims_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrims" ADD CONSTRAINT "scrims_bracket_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("bracket_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrims" ADD CONSTRAINT "scrims_mmr_season_fk" FOREIGN KEY ("guild_id","mmr_season_id") REFERENCES "public"."mmr_seasons"("guild_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_champion_preferences" ADD CONSTRAINT "user_champion_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_position_mmr" ADD CONSTRAINT "user_position_mmr_season_id_mmr_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."mmr_seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_position_mmr" ADD CONSTRAINT "user_position_mmr_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_acquisitions_active_participant_unique" ON "auction_acquisitions" USING btree ("auction_id","scrim_participant_id") WHERE "auction_acquisitions"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "auction_acquisitions_team_idx" ON "auction_acquisitions" USING btree ("auction_id","team_id");--> statement-breakpoint
CREATE INDEX "auction_acquisitions_participant_idx" ON "auction_acquisitions" USING btree ("scrim_participant_id");--> statement-breakpoint
CREATE INDEX "auction_acquisitions_buyer_idx" ON "auction_acquisitions" USING btree ("buyer_participant_id");--> statement-breakpoint
CREATE INDEX "auction_acquisitions_recorder_idx" ON "auction_acquisitions" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "auction_acquisitions_voider_idx" ON "auction_acquisitions" USING btree ("voided_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auction_lots_open_auction_unique" ON "auction_lots" USING btree ("auction_id") WHERE "auction_lots"."status" = 'open';--> statement-breakpoint
CREATE INDEX "auction_lots_participant_id_idx" ON "auction_lots" USING btree ("scrim_participant_id");--> statement-breakpoint
CREATE INDEX "auction_teams_team_id_idx" ON "auction_teams" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "auction_teams_captain_participant_id_idx" ON "auction_teams" USING btree ("captain_participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_mmr_applications_active_game_unique" ON "game_mmr_applications" USING btree ("game_id") WHERE "game_mmr_applications"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "game_mmr_applications_rofl_metadata_idx" ON "game_mmr_applications" USING btree ("rofl_metadata_id");--> statement-breakpoint
CREATE INDEX "game_mmr_applications_applied_by_idx" ON "game_mmr_applications" USING btree ("applied_by_user_id");--> statement-breakpoint
CREATE INDEX "game_mmr_applications_reversed_by_idx" ON "game_mmr_applications" USING btree ("reversed_by_user_id");--> statement-breakpoint
CREATE INDEX "game_participants_participant_id_idx" ON "game_participants" USING btree ("scrim_participant_id");--> statement-breakpoint
CREATE INDEX "game_participants_riot_account_id_idx" ON "game_participants" USING btree ("riot_account_id");--> statement-breakpoint
CREATE INDEX "game_participants_rofl_participant_idx" ON "game_participants" USING btree ("rofl_metadata_id","rofl_participant_index");--> statement-breakpoint
CREATE INDEX "guild_members_user_id_idx" ON "guild_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guild_riot_accounts_user_idx" ON "guild_riot_accounts" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "guild_riot_accounts_linker_idx" ON "guild_riot_accounts" USING btree ("linked_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_riot_accounts_primary_unique" ON "guild_riot_accounts" USING btree ("guild_id","user_id") WHERE "guild_riot_accounts"."is_primary";--> statement-breakpoint
CREATE INDEX "matches_team_a_id_idx" ON "matches" USING btree ("team_a_id");--> statement-breakpoint
CREATE INDEX "matches_team_b_id_idx" ON "matches" USING btree ("team_b_id");--> statement-breakpoint
CREATE INDEX "mmr_ledger_entries_participant_idx" ON "mmr_ledger_entries" USING btree ("scrim_participant_id");--> statement-breakpoint
CREATE INDEX "mmr_ledger_entries_recorded_by_idx" ON "mmr_ledger_entries" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mmr_seasons_active_guild_unique" ON "mmr_seasons" USING btree ("guild_id") WHERE "mmr_seasons"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "rofl_metadata_uploaded_by_user_id_idx" ON "rofl_metadata" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "scrim_bracket_slots_team_id_idx" ON "scrim_bracket_slots" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scrim_participant_registrations_active_unique" ON "scrim_participant_registrations" USING btree ("scrim_participant_id") WHERE "scrim_participant_registrations"."withdrawn_at" is null;--> statement-breakpoint
CREATE INDEX "scrim_participant_registrations_history_idx" ON "scrim_participant_registrations" USING btree ("scrim_participant_id","joined_at");--> statement-breakpoint
CREATE INDEX "scrim_participant_registrations_joined_by_idx" ON "scrim_participant_registrations" USING btree ("joined_by_user_id");--> statement-breakpoint
CREATE INDEX "scrim_participant_registrations_withdrawn_by_idx" ON "scrim_participant_registrations" USING btree ("withdrawn_by_user_id");--> statement-breakpoint
CREATE INDEX "scrim_participants_user_id_idx" ON "scrim_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scrim_participants_riot_account_id_idx" ON "scrim_participants" USING btree ("riot_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scrim_teams_active_ordinal_unique" ON "scrim_teams" USING btree ("scrim_id","ordinal") WHERE "scrim_teams"."is_active";--> statement-breakpoint
CREATE INDEX "scrims_guild_id_idx" ON "scrims" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "scrims_mmr_season_id_idx" ON "scrims" USING btree ("mmr_season_id");--> statement-breakpoint
CREATE INDEX "scrims_created_by_user_id_idx" ON "scrims" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_position_mmr_user_id_idx" ON "user_position_mmr" USING btree ("user_id");