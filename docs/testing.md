# API 테스트

현재 API 테스트는 기존 Node `node:test`와 `node:assert/strict`를 사용한다. 별도 테스트 프레임워크나 테스트용 운영 endpoint는 추가하지 않는다.
2026-11-03 재작성 이후 기능 추가와 결함 수정 때마다 기본/lite 및 격리 PostgreSQL·SvelteKit HTTP hard 테스트를 실행한다.
실행 환경과 회귀 테스트 결과는 아래 실행 기록에 정리한다.

## 구분과 실행 명령

| 명령 | 대상 | 실행 환경 |
| --- | --- | --- |
| `pnpm test:lite` | 웹 `tests/api/lite` + 봇 `tests` | 단순 규칙·입력·오류·고정 응답 계약. DB와 실제 네트워크 없음 |
| `pnpm test:hard:db` | `tests/api/hard/db` | 실제 서버 함수와 격리 PostgreSQL |
| `pnpm test:hard:http` | `tests/api/hard/http` | 웹 빌드 후 SvelteKit 자식 프로세스와 격리 PostgreSQL |
| `pnpm test:hard` | DB·HTTP hard 전체 | 웹 빌드는 실행 시작 시 한 번 수행 |
| `pnpm test:browser` | `tests/browser` | 웹 빌드 후 격리 PostgreSQL·SvelteKit 앱·Chromium으로 실제 사용자 조작 검증 |
| `pnpm test` | 웹 API lite + 기존 최상위 `tests/*.test.ts` + 봇 테스트 | 프론트 목·표현·ROFL 파서 회귀도 보존 |
| `pnpm test:db` | DB hard | 기존 명령의 호환 별칭 |
| `pnpm check:tests` | 웹·봇 테스트 TypeScript | 타입만 검사. 테스트 함수·DB·앱을 실행하지 않음 |

실행 스크립트는 `apps/web/tests/run.mjs`다. 파일 경로·실행 순서를 셸 glob에 맡기지 않고 범위별로 정렬해 전달한다.
테스트 프로세스 병렬 수는 2, 브라우저 범위는 1로 제한하고, DB 경합은 해당 시나리오 안에서 여러 실제 연결로 만든다.
Node의 이름 필터는 다음처럼 전달한다.

```sh
pnpm test:lite --test-name-pattern=MMR
pnpm test:hard:db --test-name-pattern=세션
```

## lite

봇 자체의 명령·개인 입력창·메시지·전송 adapter 테스트는 `apps/bot/tests/`에서 같은 node:test로 실행한다. `pnpm test:bot`으로 별도 실행할 수 있다.

`tests/api/lite/`는 다음 책임을 나눠 검증한다.

| 파일 | 계약 |
| --- | --- |
| `bot-auth.test.ts` | 내부 API 전용 토큰·미설정·잘못된 인증 헤더 |
| `auth.test.ts` | OAuth 설정·복귀 주소·state·PKCE·서명·만료, 세션 해시·표시 사용자 |
| `errors.test.ts` | 인증·서비스 운영 권한, 업무 오류의 상태/필드 변환, Retry-After, 예상하지 못한 오류 전파 |
| `permissions.test.ts` | 웹에서 사용하는 Discord 권한 비트·timeout·역할/채널 overwrite 계산 |
| `accounts.test.ts` | Riot ID·PUUID·플랫폼 정규화, 실행자별 조회 제한·시간 경계 |
| `recruitment.test.ts` | 날짜·정원·신청·선발·대기 승급·revision·단계별 설정 |
| `auction.test.ts` | 정수 포인트, 0점 낙찰, 양수 시작 예산, 팀장 중복·설정 입력 |
| `mmr.test.ts` | 초기 1500·K32·동포지션 상대, 양쪽 반영 전 값, 소수·입력 불변성 |
| `rofl-identity.test.ts` | 파일의 명시된 팀·포지션 추출, 누락·중복·잘못된 값과 배열 순서 독립성 |
| `riot-contract.test.ts` | 호스트/경로/헤더 검증, 오류·제한·timeout·동시 요청 제한 |
| `riot-client-contract.test.ts` | ACCOUNT·LoL 클라이언트 응답 검증. 환경 모듈과 fetch는 해당 테스트 프로세스에서만 대체 |
| `ddragon-contract.test.ts` | 카탈로그 검증, 캐시·중복 요청·제한·오류 복구 |
| `discord-contract.test.ts` | 웹 REST 클라이언트의 응답 파싱·페이지·오류 변환. 봇 프로세스 검증과 구분 |

외부 API 계약은 메모리의 `Response`를 주입한다. 실제 Riot·Discord 연결 성공을 뜻하지 않는다.
실제 시간을 짧게 기다리는 대신 명시적인 시계·타이머·Promise gate를 사용한다.
Drizzle 조회 체인을 흉내 내는 가짜 DB는 사용하지 않는다. SQL 조건과 저장 검증은 hard에 둔다.

## 브라우저

브라우저 회귀도 `node:test`를 사용하며 Playwright 1.64.1은 Chromium 조작에만 쓴다.
`pnpm test`·`test:lite`·`test:hard`의 기존 범위에는 포함하지 않고 `pnpm test:browser`로 실행한다.
처음에는 Chromium을 설치하고 아래 hard DB와 같은 `.env.test`의 `TEST_DATABASE_URL`을 준비한다.

```sh
pnpm --filter @msm2/web exec playwright install chromium
pnpm test:browser
pnpm test:browser --test-name-pattern=계정
```

DB 설정·접속 또는 Chromium 실행 파일이 없으면 실패하며 건너뛰지 않는다. 실행 스크립트는 실제 키와
앱 DB 주소를 비운 뒤 매번 웹을 새로 빌드한다. `tests/browser/support/browser.ts`는 기존 HTTP fixture의
격리 앱과 세션을 사용하며, 테스트용 localhost 요청에만 TLS 프록시 헤더를 전달한다.
브라우저의 외부 이미지·폰트 요청은 차단하고 서버의 Riot·Discord 응답은 HTTP fixture로 고정한다.
테스트가 끝나면 Chromium과 격리 앱·schema를 정리한다. `pnpm check:tests`에 브라우저 코드도 포함한다.

| 파일 | 검증 |
| --- | --- |
| `accounts.test.ts` | 360/1440px 계정 조회 중 입력 잠금·중복 제출 방지. 조회 중 원문 입력 상태를 강제로 바꿔도 확인 화면의 canonical Riot ID만 POST·실제 DB에 연결되는지 검증 |
| `ranking.test.ts` | 360/1440px 순위 중복 후 첫 쪽 재조회·스크롤 복귀·다음 쪽 정상 조회, 재조회 실패 후 기존 목록 유지·수동 재시도, 서버 이동·화면 종료 시 요청 취소. 순위 응답만 바꾸고 실제 운영 번들·라우터·컴포넌트를 사용 |

## hard DB

`apps/web/.env.test.example`을 참고하여 `apps/web/.env.test` 또는 프로세스 환경에 `TEST_DATABASE_URL`을 설정한다.
`.env.test`는 Git에서 제외한다. 별도로 준비한 테스트 DB 주소를 사용하며 일반 앱의 `.env`·`DATABASE_URL`로 자동 대체하지 않는다.
설정 누락·URL 오류·접속 실패는 실패이며 skip으로 처리하지 않는다.

`support/database.ts`는 다음 생명주기를 공유한다.

1. 시나리오마다 `msm2_api_test_<난수>` schema를 생성한다.
2. 실제 Drizzle journal의 SQL을 순서대로 적용한다. `public` 한정 참조는 생성한 schema로만 옮긴다.
3. 모든 업무 연결의 `search_path`를 해당 schema로 고정한다. 연결·statement·lock timeout을 지정한다.
4. 실제 서비스가 자신의 트랜잭션을 커밋하게 한다. 바깥 테스트 트랜잭션이나 `Transaction as Database`로 커밋을 대체하지 않는다.
5. 준비 실패·테스트 실패·정상 종료 모두 정리 hook을 통해 연결을 닫고 자신이 만든 schema만 삭제한다. HTTP fixture는 앱을 먼저 종료한다.

공통 fixture는 최소 데이터 생성과 생명주기만 담당한다. 정상 fixture는 시즌·원장·현재 MMR revision이 일치한다.
조회 방어용 손상 자료는 해당 테스트가 정상 상태를 만든 뒤 명시적으로 변경한다.

| 파일 | 핵심 검증 |
| --- | --- |
| `bot.test.ts` | interaction 멱등성·동시 신청·롤백·게시 점유·불명 복구·초기 시즌·동기화, 게시 완료/복구와 신청의 잠금 경합, 다른 종류의 글·구형 불명 글 복구 거절과 저장된 구형 메시지 재시도 |
| `schema.test.ts` | 실제 초기 SQL, 복합 FK, 활성 행 유일성, CHECK·이력 보존 |
| `sessions.test.ts` | 실제 세션 저장·교체·검증·만료·삭제, 관리자 권한 보존, 중간 실패 롤백 |
| `guild-access.test.ts` | 공개 조회, 만료 소속의 사전 갱신·권한 회수·탈퇴·외부 장애, 읽기 전용 계약, 신선도·활성 서버·운영 역할 |
| `guild-settings.test.ts` | 역할·채널 동기화, 설정 변경, 서버 경계, 실패 시 기존 값 보존 |
| `accounts.test.ts` | 서버별 연결·대표·해제, 탈취 방지, 활성 신청, 과거 귀속, 동시 연결 |
| `recruitment.test.ts` | 생성 멱등성, 신청/철회/재신청·승급, 정원·revision·일괄 변경, 계정 해제와 신청 경합 |
| `manual-formation.test.ts` | 이동·교환·회수·초기화·확정, 다른 내전 경계, 동일 revision 경쟁 |
| `auction.test.ts` | 후보·lot·팀장·잔액·정원, 0점/수동 구분, 되돌리기·이력·동시 낙찰 |
| `bracket-workflow.test.ts` | 2/3/4팀 대진·BO·확정·시작·복귀·중도 종료와 기록 보존 |
| `mmr.test.ts` | 멱등 반영, 고정 시즌·운영 슬롯, 안전한 역분개, 후속 변경 차단, 동시 반영·전체 롤백 |
| `records.test.ts` | 현재 시즌·유효 기록, 과거 사용자 귀속, 실제 0과 null, 조회의 무부수효과, 여러 경기의 출전자·순서·통계 구분과 개인 조회의 서버 비교 자료 보존 |
| `ranking.test.ts` | 현재 멤버·실적, 채택본·실출전·원장 일치, 페이지·본인 순위·대표 챔피언 |
| `match-read.test.ts` | 공개 경기 목록·상세, 검색·서버 경계·당시 출전·피어리스·처리 상태 |
| `match-fearless.test.ts` | 양 팀 공통 피어리스, 진영 변경·과거 세트 선택·취소 제외·설정 해제와 정상 ROFL/MMR 반영 |
| `match-results.test.ts` | 경기 단위 라인업·ROFL 실사용 계정 식별·중복·동시 등록·롤백·MMR·승자 포지션 전파·마지막 결과 취소 |
| `match-result-restoration.test.ts` | 취소한 동일 파일의 새 Game 복구·진영 정정·계정 귀속 보존·동시 재요청·반복 복구·롤백·진출 |
| `rofl-restoration-migration.test.ts` | 취소 데이터가 있는 0003 구조에 실제 0004 SQL 적용, 역분개 시각·근거 보존과 복구 |
| `rofl-account-concurrency.test.ts` | ROFL 등록과 다른 서버의 동일 Riot 계정 연결을 실제 서비스·연결·잠금 장벽으로 병행하고 교착 방지·서버별 소유권 보존 검증 |
| `publications.test.ts` | 확정 라인업·결과 게시 자료, 참가 안내 DM 대상·중복·상태·복구 |
| `publication-search.test.ts` | 제한 전 전체 이력 검색, 특수문자·권한·서버 경계, 세트·취소 결과·삭제 라인업·수신자 구분 |

서비스가 요구하는 Discord·Riot 응답은 고정된 의존성으로 제공한다. 실제 권한 계산·DB 조회·업무 함수는 실행 대상이다.

## hard HTTP

`support/http.ts`는 전용 schema를 준비하고 `http-child.mjs`를 자식 프로세스로 실행한다.
자식은 최신 운영 빌드의 `build/handler.js`를 로컬 임의 포트에 연결한다. 개발 목 경로로 운영 요청을 대체하지 않는다.
adapter-node의 `PROTOCOL_HEADER`로 HTTPS 프록시 뒤 HTTP 연결을 재현하여 운영 Secure 쿠키 계약을 유지한다.
실제 TLS 인증서나 브라우저의 쿠키 정책을 검증하는 E2E 테스트는 아니다.

테스트는 Node `fetch`로 실제 URL·form action을 호출한다. 정상 세션 행과 쿠키를 사용하며 관리자 우회 헤더를 추가하지 않는다.
외부 요청은 자식 프로세스 안의 등록된 응답만 허용한다. 예상하지 않은 외부 요청은 차단하고 테스트 정리 시 실패로 보고한다.
응답 관찰 전에 IPC checkpoint를 지나 요청 기록의 순서를 보장한다.

| 파일 | HTTP 계약 |
| --- | --- |
| `bot.test.ts` | 실제 내부 라우트 인증·JSON 검증·권한·생성·신청·웹 변경의 게시 예약 |
| `bot-env.test.ts` | 실제 Vite 서버가 프로세스 변수 없이 임시 `.env`의 내부 봇 토큰을 읽는지 확인. 인증 뒤 입력 검증에서 끝내며 DB·Discord를 호출하지 않음 |
| `publication-search.test.ts` | 기존 내부 GET의 검색어 검증, 오래된 항목 검색·대상 표시·인증·권한·서버 경계 |
| `guild-view-refresh.test.ts` | 61초 만료·layout 재사용 요청의 권한 갱신, 회수·탈퇴·503·비로그인 공개 열람 |
| `auth.test.ts` | 개인 페이지 인증, 세션 만료, OAuth 시작·고정 프로필 콜백, 쿠키 속성, POST/출처 검사와 로그아웃 |
| `public-reads.test.ts` | 실제 DB 제목·사용자 표시, 공개 조회, 다른 서버·개발 샘플 404, 순위 JSON·입력 오류, 관리 페이지 권한 |
| `actions.test.ts` | 기존 39개 action의 비로그인 차단, 모집 생성·신청·철회·revision, 계정·설정, 수동 편성→대진→시작, 경매 낙찰·되돌리기 |
| `external-api.test.ts` | Riot·LoL endpoint의 JSON·오류·Retry-After·no-store, Data Dragon 공개 캐시 |
| `match-results.test.ts` | 실제 multipart ROFL 등록·세션/출전자 권한·오류·stale 요청·결과 취소·참가 안내 DM 예약 |
| `match-result-restoration.test.ts` | 실제 multipart 동일 파일 복구·문맥/권한 거부·동시/반복 요청, Riot 재조회 없이 이력 보존 |

SvelteKit 3의 action 결과는 일반 JSON endpoint와 구분한다. `success`/`failure`는 본문의 `status`, `error`는 `error.status`를 확인한다.
반환값 없는 성공은 HTTP 200과 결과 status 204를 사용한다. 업무 저장은 응답과 DB 행을 함께 확인한다.

## 검증 경계

- HTTP의 모든 action에 대한 비로그인 검사를 정상 업무 전체의 HTTP 완주로 설명하지 않는다. 주요 업무 HTTP 시나리오와 세부 DB 시나리오를 함께 사용한다.
- ROFL 성공은 HTTP 응답뿐 아니라 Game·실출전·MMR 원장·승자 진출·게시 작업의 실제 DB 상태로 검증한다. 외부 Riot 식별 응답은 고정 자료이며 실제 Riot 서버 호출 검증은 별도다.
- Discord Gateway·interaction·실제 메시지 게시, 실제 Riot/Discord 자격 증명, 브라우저 UI·드래그 조작은 이 API 테스트의 실행 범위가 아니다.
- 별도 브라우저 명령은 계정 연결과 순위 갱신 회귀를 검증한다. 전체 UI·드래그 조작의 자동 검증 완료를 뜻하지 않는다.
- 기존 프론트 목·표현 테스트와 ROFL 파서 테스트를 새 API 저장 기능의 검증 수로 계산하지 않는다.

## 실행 기록

아래 날짜별 수치는 당시 명령 범위의 결과다. 2026-11-05부터 기본/lite 명령에 봇 테스트가 포함된다.

2026-11-03, Node 22.20.0·PostgreSQL 17.11에서 실행했다. 앱 DB와 분리한 `msm2_test` DB·전용 계정을 사용했다.

| 명령 | 결과 |
| --- | --- |
| `pnpm test:lite` | 324개 통과 |
| `pnpm test:hard:db` | 129개 통과 |
| `pnpm test:hard` | 웹 빌드 성공, DB 129개 + HTTP 70개 = 199개 통과 |
| `pnpm test` | lite 324개 + 기존 회귀 72개 = 396개 통과 |
| `pnpm check:tests` | API 테스트 타입 검사 통과 |
| `pnpm check` | 브랜딩·웹·봇 검사 통과, 오류·경고 0개 |

테스트 수는 Node test runner가 보고한 값이며 하위 테스트를 포함한다. 최종 실행의 실패·취소·건너뜀은 모두 0개다.
위 명령은 대상이 겹치므로 결과를 합산하지 않는다.

첫 실행에서는 SvelteKit 3 오류 응답의 status 위치와 Riot ID 입력 fixture에 대한 테스트의 잘못된 가정을 수정했다.
업무 코드는 변경하지 않았으며 수정 후 기본 테스트와 전체 hard를 다시 통과했다.
종료 후 테스트 schema·연결·HTTP 앱 프로세스가 남지 않았고, 기존 앱 DB의 35개 public 테이블은 데이터 없이 유지됨을 확인했다.

2026-11-05, 같은 Node·PostgreSQL 환경에서 봇 구현 후 전체 검증을 실행했다.

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 웹 409개 + 봇 47개 = 456개 통과 |
| `pnpm test:hard` | 웹 빌드 성공, 실제 PostgreSQL·HTTP 테스트 243개 통과 |
| `pnpm check:tests` | 웹·봇 테스트 타입 검사 통과 |
| `pnpm check` | 포맷·브랜딩·웹·봇 검사 통과, 오류·경고 0개 |
| `pnpm build:bot` | 봇 운영 빌드 성공 |

최종 실행의 실패·취소·건너뜀은 모두 0개다. 게시 완료 응답·운영자 복구와 참가 신청의 경합은
실제 PostgreSQL 연결과 잠금 대기 확인으로 검사했다. 이전 잠금 순서를 메모리에서 복원한 대조 실행에서는
두 시나리오 모두 `40P01` 교착이 발생했으며, 내전 → 게시 작업 순서로 통일한 구현에서는 통과했다.

테스트 schema·연결·HTTP 앱 프로세스가 남지 않았고 테스트 DB의 public 테이블은 0개였다.
일반 앱 DB에는 봇용 마이그레이션까지 적용되어 public 테이블 37개·외래키 78개·업무 행 0개를 확인했다.
실제 Discord 로그인·명령 등록·메시지 발송은 실행하지 않았다.


2026-11-05, 경기 라인업·ROFL 결과·Discord 결과 게시/참가 안내 구현 후 다시 검증했다.

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 웹 414개 + 봇 57개 = 471개 통과 |
| `pnpm test:hard` | 웹 빌드 성공, 실제 PostgreSQL·HTTP 284개 통과 |
| `pnpm check:tests` | 웹·봇 테스트 타입 검사 통과 |
| `pnpm check` | 포맷·브랜딩·웹·봇 검사 통과, 오류·경고 0개 |
| `pnpm build:bot` | 봇 운영 빌드 성공 |
| `pnpm db:migrate` | `0003_match_results.sql`까지 적용 성공 |

실패·취소·건너뜀은 모두 0개다. 새 테스트는 경기 전체 라인업 재사용, 미등록 부계정의 팀·포지션 기반 귀속,
소유자 충돌 거부, 같은 파일·동일 결과 중복, 결과/MMR/진출의 원자성, 취소 이력과 승자 포지션 전파를 포함한다.
ROFL 등록과 다른 서버 계정 연결의 경합은 실제 서비스·PostgreSQL 연결·행 잠금 장벽으로 재현했다.
현재 `KEY SHARE`는 양쪽 커밋을 완료하며, 테스트 사본에서 업로드의 구 `NO KEY UPDATE` 쿼리를 복원한 음성 대조는 `40P01`로 실패했다.

별도 Chromium 확인에서는 실제 테스트용 SvelteKit 앱·격리 DB를 사용해 360/768/1024/1440px 배치,
드래그와 키보드 교환, 경기 라인업 확정, 업로드 오류/성공·실제 저장, 모바일 다크 모드와 참가 안내 확인창을 점검했다.
팝업을 연 채 화면 폭을 바꿔도 업로드 입력이 중복되지 않는다. 이 확인은 API 테스트 개수에 포함하지 않으며,
외부 글꼴·챔피언 이미지 요청은 차단한 상태로 대체 표시를 확인했다.

일반 앱 DB는 public 테이블 40개·외래키 88개·업무 행 0개·마이그레이션 기록 4개다.
종료 후 테스트 schema·연결·HTTP 앱 프로세스와 테스트 DB public 테이블은 모두 0개였다.
실제 Discord 로그인·명령 등록·메시지 발송은 실행하지 않았다.


2026-11-05, 문서 정합성을 먼저 수정한 뒤 검토에서 재현한 결함을 순서대로 수정하고 전체 검증을 완료했다.

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 웹 414개 + 봇 63개 = 477개 통과. API lite 포함 |
| `pnpm test:hard` | 최신 웹 빌드 성공, 실제 PostgreSQL·HTTP 312개 통과 |
| `pnpm check:tests` | 웹·봇 테스트 타입 검사 통과 |
| `pnpm check` | 포맷·브랜딩·웹·봇 검사 통과, 오류·경고 0개 |
| `pnpm build:bot` | 봇 운영 빌드 성공 |
| `pnpm db:migrate` | 개발 DB에 `0004_rofl_result_restoration.sql`까지 적용 성공 |

실패·취소·건너뜀은 모두 0개다. 추가 회귀는 동일 파일 취소/복구·과거 귀속 보존·MMR/대진 원자성,
기존 취소 데이터의 migration, 만료된 관리자 권한의 내부 이동 갱신, 전체 실패 게시 이력 검색과 대상 구분을 포함한다.
수정 전 대조 실행에서는 동일 파일 복구가 409, 만료 후 내부 이동에서 운영 메뉴 소실,
오래된 게시물 검색이 최근 25개 반환으로 실패하는 것을 확인했고 수정 후 통과했다.

별도 Chromium 검증은 API 테스트 개수에 합산하지 않는다.

- 실제 앱·격리 DB에서 61초 만료 후 내전 목록·요약·편성·대진·경기를 내부 이동해 관리자 기능 유지 확인.
- 공통 확인창은 360/1440px 일반·중첩 상태에서 취소 초기 포커스, 양방향 Tab, 배경 차단, Escape 한 단계 종료, 메뉴 트리거 복귀, 트리거 소멸 시 main 복귀, 경로 이동 취소, 확인 POST 1회 및 JS 오류 0개 확인.
- 경기 화면은 360/768/1024/1440px, 드래그·키보드 교환, 라인업 확정, ROFL 오류/성공과 실제 저장, 모바일 다크 상태 확인.
- 수동 편성은 2/3/4팀을 네 화면 폭에서 렌더링해 허위 진영 표시와 문서 가로 넘침이 없음을 확인. 드래그·키보드 교환·미배정 영역 배치 해제와 재배치의 실제 저장, 읽기 전용 빈 영역 숨김도 확인.
- 저장소 문서 30개의 로컬 링크 138개가 모두 존재함을 확인.

개발 DB는 public 테이블 40개·외래키 88개·업무 행 0개·migration 기록 5개다.
최종 정리 후 앱/테스트 DB에 테스트 schema와 잔여 연결이 없으며, 테스트 DB public 테이블과 HTTP 자식 프로세스도 0개다.
외부 Riot·Discord 응답은 고정하고 브라우저의 외부 자산 요청은 차단했다. 실제 Discord 로그인·명령 등록·메시지/DM 발송은 실행하지 않았다.


2026-11-05, 전체 코드 검토에서 재현한 6건을 계정 연결 → 게시 복구 → 순위 갱신 → 개발 환경 인증 → 피어리스 → 전적 성능 순서로 수정하고 최종 검증했다.

| 명령 | 결과 |
| --- | --- |
| `pnpm test` | 웹 415개 + 봇 65개 = 480개 통과. API lite 포함 |
| `pnpm test:hard` | 최신 웹 빌드 성공, 실제 PostgreSQL·HTTP 322개 통과 |
| `pnpm test:browser` | 최신 웹 빌드 성공, Chromium 계정·순위 회귀 7개 통과 |
| `pnpm check:tests` | 웹·봇·브라우저 테스트 타입 검사 통과 |
| `pnpm check` | 포맷·브랜딩·웹·봇 검사 통과, Svelte 오류·경고 0개 |
| `pnpm build:bot` | 봇 운영 빌드 성공 |

실패·취소·건너뜀은 모두 0개다. 계정 조회 중 입력 상태를 강제로 바꿔도 확인한 계정만 저장되며,
순위 중복은 첫 쪽 재조회로 복구한다. 재조회 실패 후 재시도, 서버 이동과 화면 종료 시 이전 요청 취소도 검증했다.
개발 환경 인증 회귀는 실제 Vite 서버에 별도 `.env`만 제공하여 올바른 토큰과 잘못된 토큰을 구분한다.
게시 복구는 다른 종류의 글과 식별자가 없는 구형 불명 글을 거절하고, 이미 저장된 구형 메시지의 일반 재시도는 유지한다.

피어리스는 실제 ROFL 등록과 MMR 반영을 포함한 DB 회귀에 더해 360/768/1024/1440px 화면에서 확인했다.
빈 기록·첫 세트·상대 팀 챔피언 재사용·과거 세트 선택·설정 해제 상태, 모바일 최초 진입과 세트 탭 이동이 정상이다.
양 팀의 사용 챔피언은 공통 목록에 한 번씩 표시되며 안정화된 화면에서 가로 넘침과 JavaScript 오류가 없었다.

전적 성능은 변경 전후 운영 코드의 조회 이후 가공 부분을 그대로 추출해 같은 합성 자료로 비교했다.
경기당 10명, DB와 같은 참가자 순번 정렬을 사용하고 새 Map 분류 비용도 포함했다. 각 규모를 3회 측정하여
전체 반환값이 9회 모두 일치함을 확인했다. 아래는 **DB 조회·네트워크·HTTP를 제외한 동기 CPU 처리 시간 중앙값**이다.
일반 회귀 테스트는 시간 임계값 대신 통계 결과와 비교 자료의 보존을 검사한다.

| 시즌 경기 수 | 수정 전 | 수정 후 |
| ---: | ---: | ---: |
| 1,000 | 455ms | 14ms |
| 2,500 | 2,695ms | 34ms |
| 5,000 | 12,308ms | 42ms |

최종 정리 후 테스트 schema·잔여 연결·public 테이블·HTTP 자식 프로세스·임시 Vite 환경 디렉터리는 모두 0개였다.
외부 Riot·Discord 응답은 고정했으며 브라우저 외부 자산은 차단했다. 실제 Discord 로그인·명령 등록·메시지/DM 발송은 실행하지 않았다.
