# 남은 운영 과업 실행 기록

2026-11-15. 기준 커밋 `521e763`의 [앞선 후속 결과](remaining.md)에서 이어진 운영 과업을 실제 구현·검증했다. 약관·개인정보 본문은 사용자 보류를 유지한다. 운영 서비스·실제 Discord/Riot 발송·공인 인증서 발급은 실행하지 않았다.

| ID | 범위·완료 조건 | 진행 |
| --- | --- | --- |
| OP-01 | MSM1의 추첨·낙찰·유찰·현재/유찰 수동 배치·유찰 복귀를 직전 작업 단위로 되돌리고 이력·포인트 보존 | 완료. 6종 역연산·역기록·초기화 경계·동시성·권한과 실제 키보드 흐름 확인 |
| OP-02 | 새 취소부터 이전 모집/편성 상태를 기록하고 복구. 근거 없는 과거 취소 차단 | 완료. 모집·수동/경매 편성·대진 준비의 정확 복구와 이력·포인트·후보 보존 |
| OP-03 | 확인된 MSM1 단계의 중도 종료·현재 점수 우세/동점·원래 단계 재개, Game/MMR 보존 | 완료. 편성·대진 준비·진행, 진영 변경·동점·준결승/결승·실제 ROFL·오래된 요청 차단 |
| OP-04 | 공개 경매 자동 갱신, 숨김/중복/지연 응답/통신 실패/페이지 종료 처리 | 완료. 읽기 전용 5초 조회, pause/manual/resume·15초 timeout·503/backoff·hidden/offline/SPA 종료·관전자 POST0 |
| OP-05 | CI·VPS 실행·HTTPS 프록시·명시적 DB 백업/격리 복원 구성과 로컬 검증 | 저장소 구성·격리 검증 완료. 실제 VPS 적용·공인 인증서·운영 DB·원격 CI 실행은 별도 |
| OP-06 | 시즌 종료·다음 시즌·기본 조회 시즌 | 완료. 관리자 `/시즌`, 명시 확인·선택한 현재 시즌·원자 전환·멱등 receipt·과거 내전/MMR 보존. 과거 전적 선택 UI는 후속 |

경매는 MSM1 실제 UI의 직전 작업 1회 되돌리기를 기준으로 하며 연속 스택 되감기를 새 정책으로 만들지 않았다. 취소 복구는 기존 Game/MMR을 되살리는 작업으로 해석하지 않았다. 원장 없는 과거 행위와 취소 전 단계가 없는 과거 취소는 추정하지 않는다. 신규 migration `0005`~`0007`은 기존 행에 근거를 backfill하지 않고 이력과 FK를 보존한다.

## 구현과 선택한 Impeccable 기능

- **경매 — harden·clarify·polish:** [경매 서비스](../../apps/web/src/lib/server/scrims/auction.ts)와 [행위 원장](../../apps/web/src/lib/server/scrims/auction-actions.ts)을 연결했다. A 낙찰 뒤 B 추첨을 취소하면 B만 대기 맨 앞으로 돌아가며 A 영입·지출을 유지한다. 유찰 복귀·유찰 수동 배치는 유찰 상태로 돌아간다. 되돌리기가 잠겼어도 유효 영입이 남으면 초기화는 가능하다. [실제 pin·전체 검증·이미지7장](../../artifacts/ui-review/operations/auction.md)을 따른다.
- **취소/종료 — harden·clarify·adapt:** [취소/복구](../../apps/web/src/lib/server/scrims/service.ts)와 [운영 흐름](../../apps/web/src/lib/server/scrims/workflow.ts)은 현재 권한·revision·복원 근거를 검사한다. UI는 운영 메뉴 한 곳에서 복구를 제공하고 진행 중 취소 조작을 제거했다. 중도 종료는 실제 세트의 진영까지 반영한 우세·동점이며 Game/MMR을 추가하지 않는다. 결승이 없으면 우승팀을 만들지 않는다. [규칙·migration·실세션16장](../../artifacts/ui-review/operations/lifecycle.md)을 따른다.
- **관전자 갱신 — harden·clarify·polish:** [페이지](../../apps/web/src/routes/g/[guildId]/scrims/[scrimId]/auction/+page.svelte)가 [공개 snapshot](../../apps/web/src/routes/g/[guildId]/scrims/[scrimId]/auction/live/+server.ts)을 읽고, 기존 두 작업판은 같은 snippet의 조작을 서로 배타적으로 표시한다. 새 읽기 경로의 소비자는 이 화면이다. `private, no-store`, AbortController·15초 제한·한 요청·cleanup·pathname/늦은 응답 차단을 사용한다. 숨김/offline/일시정지는 반복 조회를 멈추고 스냅샷 실패는 마지막 화면과 단일 오류를 유지한다. 상위 내전 문맥 변경은 기존 load 재조회로 처리한다. 관리자는 자동 조회하지 않아 미저장 입력을 유지한다. 서버 입찰·서버 타이머·자동 낙찰은 없다.
- **규칙 기록 — document:** [DESIGN.md](../../apps/web/DESIGN.md)와 schema2 [sidecar](../../apps/web/.impeccable/design.json)에 자동 갱신의 조용한 피드백·중단·복구와 운영 메뉴의 명확한 결과를 병합했다. 기존 Slate·STDF·워드마크·본문 글꼴·토큰을 유지했다.

## 시즌 운영·출시 구성

MSM1 pin `d60df685e48c180b236342eae81b389ae87e38bf`의 [시즌 서비스](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/services/guilds/seasons.py)·[저장 함수](https://github.com/Longcat2957/MonkeyScrimManager/blob/d60df685e48c180b236342eae81b389ae87e38bf/apps/api-python/src/monkeybot_api/repositories/guilds/seasons.py)를 실제 읽었다. [bot-seasons.ts](../../apps/web/src/lib/server/discord/bot-seasons.ts)는 이전 시즌 종료와 새 시즌 생성을 한 트랜잭션에 처리한다. 기존 내전의 고정 시즌·점수·원장은 변경/복제하지 않는다. 새 모집은 새 활성 시즌을 사용하고, 진행 중인 이전 시즌 경기는 그 고정 시즌에 ROFL/MMR을 계속 반영한다.

소비자는 관리자 `/시즌` 명령이다. 옵션이 없으면 현재/과거를 조회하고, 새 이름·자동완성으로 선택한 현재 시즌·전환확인 true가 모두 있어야 쓰기를 보낸다. 내부 GET/POST는 기존 봇 전용 인증과 실제 관리자 검사를 사용한다. expected ID·interaction receipt로 오래된 요청/다른 payload/중복을 구분하고 실패는 종료·생성·receipt 전체를 롤백한다. 초기 설정과는 guild 잠금을, 새 모집과는 시즌 SHARE/UPDATE 잠금을 공유한다. [봇 검증](../../artifacts/operations/seasons-bot.md)·[시즌 근거](../../artifacts/ui-review/operations/seasons.json)를 따른다. 별도의 시즌 설정 UI는 만들지 않았다.

[배포 구성과 실행 문서](../deployment.md)·[격리 증거](../../artifacts/ui-review/operations/deployment.md)에는 CI, systemd, HTTPS nginx, 명시적 DB 백업·빈 DB 복원 도구가 있다. 직접 소유한 컨테이너에서 실제 migration·dump/restore·행/제약/sequence 일치·TLS/CSRF·내부 차단·업로드 한도·SIGTERM·callback 비밀 쿼리 로그 제외를 검증하고 자원을 정리했다. 원격 workflow 성공이나 실제 서비스 배포를 대신하는 결과는 아니다.

## 검증과 실제 화면 범위

직접 수정한 UI는 **요약·경매·결과 3종**이다. 전체20페이지와 앞선 개선 수를 다시 합산하지 않는다. [coverage.md](coverage.md)에 실제 URL·역할·뷰포트·이미지를 기록했다. 기본 전후24장, 실제 lifecycle16장, 경매7장의 **47개 PNG 전부**를 직접 읽었다. 실제 동적 상태의 테스트 UUID는 실행 후 정리됐고, 새 기능 상태에는 동일 동작의 과거 사진이 없다. 외부 자산 차단 fixture의 이미지와 실제 개발 서버의 글꼴 검증은 구분한다.

최종 [checks.json](../../artifacts/ui-review/operations/checks.json)은 check·build·테스트 원값과 현재 소스 지문을 기록한다. 웹430·봇80, hard DB263·HTTP116, 브라우저16개가 모두 통과했다. 같은 테스트를 담당별 부분 실행과 중복 합산하지 않는다. 추가 보조 검증으로 migration 업그레이드/CHECK·키보드·Escape·오류/timeout·중복 요청·pause/visibility/offline·SPA 이탈·실제 ROFL·Game/MMR 불변을 확인했다.

Svelte 공식 플러그인 도구는 세션에 노출되지 않아 설치된 공식 컴파일러·svelte-check와 [공식 lifecycle](https://svelte.dev/docs/svelte/lifecycle-hooks)·[navigation 문서](https://svelte.dev/docs/kit/$app-navigation)를 사용했다. 후자는 현재 프로젝트의 load 갱신 방식을 유지한 근거다. 최종 기술 [audit](../../artifacts/ui-review/operations/audit.md)은 이번 범위의 구현 검토이며 사이트 전체 WCAG 등급·성능 개선율을 의미하지 않는다. detector primary0·기존 advisory27, doctor findings0·규칙 레지스트리 확인 가능이다. GameHero의 기존 파일 한정 승리 진영 경계 예외는 유지했고 새 ignore는0이다. 훅의 같은 파일 6회 편집 뒤 힌트 중단은 세션 내 자동 동작이며 영속 억제를 추가하지 않았다.

## 남은 범위

- 약관·개인정보 본문은 사용자 보류다.
- 진행 중 전체 내전의 모든 Game/MMR을 안전하게 역분개해 취소하는 흐름, 과거 시즌을 전적에서 선택하는 UI는 후속이다. 기존 마지막 세트 취소를 단순 반복해 전체 취소로 바꾸지 않았다.
- 실제 VPS·공인 TLS·운영 DB migration/복원·백업 암호화/보존·원격 CI 결과·Discord/OAuth/Riot 실연동은 별도 적용·검증이다. 새 명령의 실제 등록도 실행하지 않았다.
- DB query/statement timeout·업로드 처리량 제한·비밀을 제외한 요청/업무 오류/처리 시간 관측은 운영 후속이다.
- 실제 Safari·물리 터치/보조기기·음성 청취·현장 CWV/INP는 이번에 검증하지 않았다. 상위 문맥 재조회 자체의 실패 주입은 이 동작별 검증에 포함하지 않았다.
