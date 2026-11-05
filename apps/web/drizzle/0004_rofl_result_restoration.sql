ALTER TABLE "games" DROP CONSTRAINT "games_rofl_metadata_id_unique";--> statement-breakpoint
ALTER TABLE "match_rofl_imports" DROP CONSTRAINT "match_rofl_imports_result_fingerprint_unique";--> statement-breakpoint
ALTER TABLE "match_rofl_imports" DROP CONSTRAINT "match_rofl_imports_pkey";--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD PRIMARY KEY ("game_id");--> statement-breakpoint
ALTER TABLE "match_rofl_imports" ADD COLUMN "cancelled_at" timestamp (3) with time zone;--> statement-breakpoint
-- 기존 취소 이력도 활성 지문 고유키에서 제외한다. 원래의 역분개 시각을 우선 보존한다.
UPDATE "match_rofl_imports" AS imports
SET "cancelled_at" = COALESCE(
    (SELECT max(applications."reversed_at") FROM "game_mmr_applications" AS applications WHERE applications."game_id" = imports."game_id"),
    games."updated_at"
)
FROM "games" AS games
WHERE games."id" = imports."game_id" AND games."status" = 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "games_active_rofl_metadata_unique" ON "games" USING btree ("rofl_metadata_id") WHERE "games"."status" <> 'cancelled';--> statement-breakpoint
CREATE UNIQUE INDEX "match_rofl_imports_active_fingerprint_unique" ON "match_rofl_imports" USING btree ("result_fingerprint") WHERE "match_rofl_imports"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "match_rofl_imports_metadata_idx" ON "match_rofl_imports" USING btree ("rofl_metadata_id");--> statement-breakpoint
CREATE INDEX "match_rofl_imports_fingerprint_idx" ON "match_rofl_imports" USING btree ("result_fingerprint");