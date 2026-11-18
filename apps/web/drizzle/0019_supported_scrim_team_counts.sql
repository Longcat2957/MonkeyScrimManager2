-- 지원하지 않는 팀 수가 남아 있으면 기존 자료와 제약을 그대로 두고 중단한다.
ALTER TABLE "scrims"
    DROP CONSTRAINT "scrims_team_count_range",
    ADD CONSTRAINT "scrims_team_count_supported" CHECK ("team_count" in (2, 4));