CREATE TABLE "riot_auction_cache" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"rank_season" text,
	"current_rank" jsonb,
	"rank_fetched_at" timestamp (3) with time zone,
	"match_count" integer,
	"champions" jsonb,
	"matches_fetched_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "riot_auction_job_participants" (
	"account_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	CONSTRAINT "riot_auction_job_participants_account_id_participant_id_pk" PRIMARY KEY("account_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "riot_auction_jobs" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"available_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"token" uuid,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riot_auction_matches" (
	"account_id" uuid NOT NULL,
	"match_id" text NOT NULL,
	"champion_id" integer NOT NULL,
	CONSTRAINT "riot_auction_matches_account_id_match_id_pk" PRIMARY KEY("account_id","match_id")
);
--> statement-breakpoint
CREATE TABLE "riot_auction_peaks" (
	"account_id" uuid NOT NULL,
	"season" text NOT NULL,
	"peak" jsonb NOT NULL,
	CONSTRAINT "riot_auction_peaks_account_id_season_pk" PRIMARY KEY("account_id","season")
);
--> statement-breakpoint
ALTER TABLE "riot_auction_cache" ADD CONSTRAINT "riot_auction_cache_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_auction_job_participants" ADD CONSTRAINT "riot_auction_job_participants_account_id_riot_auction_jobs_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_auction_jobs"("account_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_auction_job_participants" ADD CONSTRAINT "riot_auction_job_participants_participant_id_scrim_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."scrim_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD CONSTRAINT "riot_auction_jobs_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_auction_matches" ADD CONSTRAINT "riot_auction_matches_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "riot_auction_peaks" ADD CONSTRAINT "riot_auction_peaks_account_id_riot_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."riot_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "riot_auction_jobs_available_idx" ON "riot_auction_jobs" USING btree ("available_at");