CREATE TABLE "match_set_sides" (
	"match_id" uuid NOT NULL,
	"game_number" integer NOT NULL,
	"blue_team_slot" "match_team_slot" NOT NULL,
	CONSTRAINT "match_set_sides_match_id_game_number_pk" PRIMARY KEY("match_id","game_number"),
	CONSTRAINT "match_set_sides_game_number_allowed" CHECK ("match_set_sides"."game_number" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "match_set_sides" ADD CONSTRAINT "match_set_sides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;