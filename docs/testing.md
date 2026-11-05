# API 테스트

현재 API 테스트는 기존 Node `node:test`와 `node:assert/strict`를 사용한다. 별도 테스트 프레임워크나 테스트용 운영 endpoint는 추가하지 않는다.
2026-11-03 재작성분을 실제 실행했다. lite 324개, 격리 PostgreSQL과 빌드한 SvelteKit 앱을 사용하는 hard 199개가 모두 통과했다.
실행 환경과 회귀 테스트 결과는 아래 실행 기록에 정리한다.

## 구분과 실행 명령

| 명령 | 대상 | 실행 환경 |
| --- | --- | --- |
| `pnpm test:lite` | 웹 `tests/api/lite` + 봇 `tests` | 단순 규칙·입력·오류·고정 응답 계약. DB와 실제 네트워크 없음 |
| `pnpm test:hard:db` | `tests/api/hard/db` | 실제 서버 함수와 격리 PostgreSQL |
| `pnpm test:hard:http` | `tests/api/hard/http` | 웹 빌드 후 SvelteKit 자식 프로세스와 격리 PostgreSQL |
| `pnpm test:hard` | DB·HTTP hard 전체 | 웹 빌드는 실행 시작 시 한 번 수행 |
| `pnpm test` | 웹 API lite + 기존 최상위 `tests/*.test.ts` + 봇 테스트 | 프론트 목·표현·ROFL 파서 회귀도 보존 |
| `pnpm test:db` | DB hard | 기존 명령의 호환 별칭 |
| `pnpm check:tests` | 웹·봇 테스트 TypeScript | 타입만 검사. 테스트 함수·DB·앱을 실행하지 않음 |

실행 스크립트는 `apps/web/tests/run.mjs`다. 파일 경로·실행 순서를 셸 glob에 맡기지 않고 범위별로 정렬해 전달한다.
테스트 프로세스 병렬 수는 2로 제한하고, DB 경합은 해당 시나리오 안에서 여러 실제 연결로 만든다.
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
| `riot-contract.test.ts` | 호스트/경로/헤더 검증, 오류·제한·timeout·동시 요청 제한 |
| `riot-client-contract.test.ts` | ACCOUNT·LoL 클라이언트 응답 검증. 환경 모듈과 fetch는 해당 테스트 프로세스에서만 대체 |
| `ddragon-contract.test.ts` | 카탈로그 검증, 캐시·중복 요청·제한·오류 복구 |
| `discord-contract.test.ts` | 웹 REST 클라이언트의 응답 파싱·페이지·오류 변환. 봇 프로세스 검증과 구분 |

외부 API 계약은 메모리의 `Response`를 주입한다. 실제 Riot·Discord 연결 성공을 뜻하지 않는다.
실제 시간을 짧게 기다리는 대신 명시적인 시계·타이머·Promise gate를 사용한다.
Drizzle 조회 체인을 흉내 내는 가짜 DB는 사용하지 않는다. SQL 조건과 저장 검증은 hard에 둔다.

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
| `bot.test.ts` | interaction 멱등성·동시 신청·롤백·게시 점유·불명 복구·초기 시즌·동기화, 게시 완료/복구와 신청의 잠금 경합 |
| `schema.test.ts` | 실제 초기 SQL, 복합 FK, 활성 행 유일성, CHECK·이력 보존 |
| `sessions.test.ts` | 실제 세션 저장·교체·검증·만료·삭제, 관리자 권한 보존, 중간 실패 롤백 |
| `guild-access.test.ts` | 공개 조회, 실제 DB 권한 갱신/회수, 탈퇴, 신선도·활성 서버·운영 역할 |
| `guild-settings.test.ts` | 역할·채널 동기화, 설정 변경, 서버 경계, 실패 시 기존 값 보존 |
| `accounts.test.ts` | 서버별 연결·대표·해제, 탈취 방지, 활성 신청, 과거 귀속, 동시 연결 |
| `recruitment.test.ts` | 생성 멱등성, 신청/철회/재신청·승급, 정원·revision·일괄 변경, 계정 해제와 신청 경합 |
| `manual-formation.test.ts` | 이동·교환·회수·초기화·확정, 다른 내전 경계, 동일 revision 경쟁 |
| `auction.test.ts` | 후보·lot·팀장·잔액·정원, 0점/수동 구분, 되돌리기·이력·동시 낙찰 |
| `bracket-workflow.test.ts` | 2/3/4팀 대진·BO·확정·시작·복귀·중도 종료와 기록 보존 |
| `mmr.test.ts` | 멱등 반영, 고정 시즌·운영 슬롯, 안전한 역분개, 후속 변경 차단, 동시 반영·전체 롤백 |
| `records.test.ts` | 현재 시즌·유효 기록, 과거 사용자 귀속, 실제 0과 null, 조회의 무부수효과 |
| `ranking.test.ts` | 현재 멤버·실적, 채택본·실출전·원장 일치, 페이지·본인 순위·대표 챔피언 |
| `match-read.test.ts` | 공개 경기 목록·상세, 검색·서버 경계·당시 출전·피어리스·처리 상태 |

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
| `auth.test.ts` | 개인 페이지 인증, 세션 만료, OAuth 시작·고정 프로필 콜백, 쿠키 속성, POST/출처 검사와 로그아웃 |
| `public-reads.test.ts` | 실제 DB 제목·사용자 표시, 공개 조회, 다른 서버·개발 샘플 404, 순위 JSON·입력 오류, 관리 페이지 권한 |
| `actions.test.ts` | 기존 39개 action의 비로그인 차단, 모집 생성·신청·철회·revision, 계정·설정, 수동 편성→대진→시작, 경매 낙찰·되돌리기 |
| `external-api.test.ts` | Riot·LoL endpoint의 JSON·오류·Retry-After·no-store, Data Dragon 공개 캐시 |

SvelteKit 3의 action 결과는 일반 JSON endpoint와 구분한다. `success`/`failure`는 본문의 `status`, `error`는 `error.status`를 확인한다.
반환값 없는 성공은 HTTP 200과 결과 status 204를 사용한다. 업무 저장은 응답과 DB 행을 함께 확인한다.

## 검증 경계

- HTTP의 모든 action에 대한 비로그인 검사를 정상 업무 전체의 HTTP 완주로 설명하지 않는다. 주요 업무 HTTP 시나리오와 세부 DB 시나리오를 함께 사용한다.
- 현재 ROFL 운영 action의 503·결과 미생성은 검증 대상으로 두되, 아직 없는 영구 등록·라인업 확정·자동 결과 전파를 구현된 성공으로 만들지 않는다.
- Discord Gateway·interaction·실제 메시지 게시, 실제 Riot/Discord 자격 증명, 브라우저 UI·드래그 조작은 이 API 테스트의 실행 범위가 아니다.
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
