ALTER TABLE "user_champion_preferences" ADD COLUMN "ordinal" integer;--> statement-breakpoint
-- 순서가 없던 기존 설정은 생성 시각·챔피언 식별자로 정렬하며 항목을 삭제하지 않는다.
WITH ranked AS (
    SELECT "user_id", "position", "champion_id",
        row_number() OVER (PARTITION BY "user_id", "position" ORDER BY "created_at", "champion_id")::integer AS "ordinal"
    FROM "user_champion_preferences"
)
UPDATE "user_champion_preferences" AS preference
SET "ordinal" = ranked."ordinal"
FROM ranked
WHERE preference."user_id" = ranked."user_id"
    AND preference."position" = ranked."position"
    AND preference."champion_id" = ranked."champion_id";--> statement-breakpoint
ALTER TABLE "user_champion_preferences" ALTER COLUMN "ordinal" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "user_champion_preferences" ALTER COLUMN "ordinal" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_champion_preferences" ADD CONSTRAINT "user_champion_preferences_order_unique" UNIQUE("user_id","position","ordinal");--> statement-breakpoint
ALTER TABLE "user_champion_preferences" ADD CONSTRAINT "user_champion_preferences_ordinal_positive" CHECK ("user_champion_preferences"."ordinal" > 0);
