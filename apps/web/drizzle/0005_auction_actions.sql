CREATE TYPE "public"."auction_action_kind" AS ENUM('draw', 'pass', 'award', 'assign_current', 'assign_unsold', 'restore', 'revert');--> statement-breakpoint
CREATE TABLE "auction_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scrim_id" uuid NOT NULL,
	"auction_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"kind" "auction_action_kind" NOT NULL,
	"scrim_participant_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"acquisition_id" uuid,
	"reverses_id" uuid,
	"recorded_by_user_id" text,
	"recorded_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp (3) with time zone,
	CONSTRAINT "auction_actions_auction_id_unique" UNIQUE("auction_id","id"),
	CONSTRAINT "auction_actions_sequence_unique" UNIQUE("auction_id","sequence_number"),
	CONSTRAINT "auction_actions_reversal_unique" UNIQUE("reverses_id"),
	CONSTRAINT "auction_actions_sequence_positive" CHECK ("auction_actions"."sequence_number" > 0),
	CONSTRAINT "auction_actions_payload" CHECK (("auction_actions"."kind" = 'revert' and "auction_actions"."reverses_id" is not null and "auction_actions"."reverses_id" <> "auction_actions"."id" and "auction_actions"."acquisition_id" is null) or ("auction_actions"."kind" <> 'revert' and "auction_actions"."reverses_id" is null and (("auction_actions"."kind" in ('award', 'assign_current', 'assign_unsold') and "auction_actions"."acquisition_id" is not null) or ("auction_actions"."kind" in ('draw', 'pass', 'restore') and "auction_actions"."acquisition_id" is null)))),
	CONSTRAINT "auction_actions_invalidation_time" CHECK ("auction_actions"."invalidated_at" >= "auction_actions"."recorded_at")
);
--> statement-breakpoint
ALTER TABLE "auction_actions" ADD CONSTRAINT "auction_actions_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_actions" ADD CONSTRAINT "auction_actions_auction_fk" FOREIGN KEY ("scrim_id","auction_id") REFERENCES "public"."auctions"("scrim_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_actions" ADD CONSTRAINT "auction_actions_lot_fk" FOREIGN KEY ("auction_id","scrim_participant_id","lot_id") REFERENCES "public"."auction_lots"("auction_id","scrim_participant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_actions" ADD CONSTRAINT "auction_actions_acquisition_fk" FOREIGN KEY ("auction_id","acquisition_id") REFERENCES "public"."auction_acquisitions"("auction_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_actions" ADD CONSTRAINT "auction_actions_reversal_fk" FOREIGN KEY ("auction_id","reverses_id") REFERENCES "public"."auction_actions"("auction_id","id") ON DELETE restrict ON UPDATE no action;