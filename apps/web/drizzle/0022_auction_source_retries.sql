ALTER TABLE "riot_accounts" ADD COLUMN "platform_checked_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD COLUMN "rank_due_at" timestamp (3) with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD COLUMN "match_due_at" timestamp (3) with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD COLUMN "rank_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD COLUMN "match_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "riot_auction_jobs" ADD COLUMN "match_ids" text[];--> statement-breakpoint
-- 기존 공통 재시도 횟수는 어느 자료의 실패인지 알 수 없다. 선점·대기 시각은 유지한다.
UPDATE "riot_auction_jobs" SET "attempts" = 0;--> statement-breakpoint
-- 계정 연결, 탈퇴, 워커 어느 경로에서 지역이 바뀌어도 같은 커밋에서 이전 지역 자료를 폐기한다.
CREATE FUNCTION invalidate_riot_auction_platform() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM riot_auction_cache WHERE account_id = NEW.id;
    DELETE FROM riot_auction_peaks WHERE account_id = NEW.id;
    DELETE FROM riot_auction_matches WHERE account_id = NEW.id;
    UPDATE riot_auction_jobs
       SET token = NULL, available_at = now(), attempts = 0,
           rank_due_at = now(), match_due_at = now(), rank_attempts = 0, match_attempts = 0, match_ids = NULL
     WHERE account_id = NEW.id;
    RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER riot_auction_platform_changed AFTER UPDATE OF platform ON riot_accounts
FOR EACH ROW WHEN (OLD.platform IS DISTINCT FROM NEW.platform) EXECUTE FUNCTION invalidate_riot_auction_platform();