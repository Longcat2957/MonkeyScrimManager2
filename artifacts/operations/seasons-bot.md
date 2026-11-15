# 시즌 운영 명령의 봇 접점

2026-11-15. root가 소유한 시즌 서비스·내부 GET/POST·공유 DTO에 봇 접점을 연결했다. 실제 Discord 명령 등록·로그인·Gateway·메시지/DM 전송은 실행하지 않았다.

## 구현

- [API client](../../apps/bot/src/api/client.ts): `seasons(guildId, actorId, autocomplete)`와 `rotateSeason(guildId, input)`. 기존 내부 Bearer 인증·오류 모양을 사용한다. 자동완성은 Discord 초기 응답 제한보다 짧은 2초로 제한하고 일반 조회/전환은 기존 10초 제한이다.
- [명령 정의](../../apps/bot/src/commands/definitions.ts): `/시즌`의 선택 옵션 `이름`(1~100자), `현재시즌`(자동완성), `전환확인`(boolean). 기본 관리자 권한으로 숨기지 않고 실제 웹 API가 서버 운영자 역할을 포함한 실효 권한을 확인한다.
- [명령 처리](../../apps/bot/src/commands/scrims.ts): 옵션 없으면 관리자 조회 API를 읽어 현재·종료 시즌 이름과 한국 시각 날짜를 비공개로 표시한다. ID는 본문에 표시하지 않는다. 기록이 없으면 기존 `/초기설정`을 안내한다. 긴 종료 목록은 전체를 UTF-8 첨부로 제공하고 조용히 자르지 않는다.
- 이름은 trim 후 1~100자를 검사한다. 현재 시즌은 자동완성의 UUID를 선택하고 `전환확인=true`일 때만 POST한다. 실행자·원래 interaction ID·선택한 expectedCurrentSeasonId를 그대로 보낸다. 새 조회 값으로 선택을 바꾸거나 실패 요청을 자동 재전송하지 않는다.
- 자동완성은 서버가 반환한 현재 시즌 한 개만 이름으로 제시한다. UUID는 choice value에만 두며 종료 시즌을 전환 대상으로 제시하지 않는다. 권한/연결 오류는 빈 목록이고 실제 실행도 서버 권한을 재검사한다.
- 전환 성공은 실제 반환한 새 시즌 이름과 기존 내전·전적의 시즌을 바꾸지 않는다는 결과를 알린다. 409와 권한 회수 오류는 기존 router의 비공개 오류 안내를 사용한다. 봇에 DB 쓰기나 MMR 복제를 구현하지 않았다.

## 검증

[신규 시즌 테스트](../../apps/bot/tests/seasons.test.ts) 15개를 포함한 전체 봇 단위 테스트 **80/80**, 실패·취소·skip 0이다. 명령 builder, 인증된 GET/POST와 시간 제한, 조회·빈 자료·긴 이력, 부분 옵션·확인 false, 입력 trim·선택 ID·interaction 보존, 권한/409의 무재전송, 현재 시즌만 자동완성, 잘못된 문맥·예상하지 못한 오류를 확인했다. 기존 [명령 등록 계약 테스트](../../apps/bot/tests/config.test.ts)의 목록도 새 명령에 맞췄다.

`pnpm --filter @msm2/bot check:tests`와 `pnpm --filter @msm2/bot build`, scoped Prettier·diff 검사도 통과했다. 테스트는 실제 fetch를 차단한 기존 network guard와 고정 API 응답·interaction fixture를 사용한다. 실제 Discord 제공자나 새 웹 서비스의 DB/HTTP 통합 검증으로 합산하지 않는다. backend DB·HTTP 검증은 root의 별도 결과를 따른다.

[seasons-bot.json](seasons-bot.json)에 명령·집계·원시 로그 SHA256·변경 파일/공유 DTO SHA256과 제외 범위를 기록했다. 웹 source·업무 schema·공유 DTO는 이 작업자가 수정하지 않았다. 실제 명령 등록은 제외 지시가 해제된 뒤 운영자가 별도로 수행하며 현재 약관/개인정보 본문 보류와 실기기 미검증도 유지한다.
