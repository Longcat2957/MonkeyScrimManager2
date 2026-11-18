# 테스트 실행 안내

웹과 봇 테스트는 Node의 `node:test`를 사용한다. 기본 단위 테스트, PostgreSQL·HTTP 통합 테스트, 브라우저 테스트는 별도 범위다. 어느 하나의 성공도 다른 범위나 실제 외부 연동의 성공을 뜻하지 않는다.

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
pnpm --filter @msm2/web test:lite --test-name-pattern=MMR
pnpm test:hard:db --test-name-pattern=세션
```

## lite

봇 자체의 명령·개인 입력창·메시지·전송 adapter 테스트는 `apps/bot/tests/`에서 같은 node:test로 실행한다. `pnpm test:bot`으로 별도 실행할 수 있다.

웹의 [lite 테스트](../apps/web/tests/api/lite/)는 입력 검증·권한 계산·모집과 MMR 규칙·외부 API 응답 계약을 검사한다.

외부 API 계약은 메모리의 `Response`를 주입한다. 실제 Riot·Discord 연결 성공을 뜻하지 않는다.
실제 시간을 짧게 기다리는 대신 명시적인 시계·타이머·Promise gate를 사용한다.
Drizzle 조회 체인을 흉내 내는 가짜 DB는 사용하지 않는다. SQL 조건과 저장 검증은 hard에 둔다.

## 브라우저

브라우저 회귀도 `node:test`를 사용하며 Playwright로 Chromium을 조작한다.
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

[브라우저 시나리오](../apps/web/tests/browser/)는 계정 연결·경매·시즌·ROFL·공개 설정 등을 운영 번들과 격리 DB에서 검증한다. 실행기는 해당 디렉터리의 `*.test.ts`를 자동 수집한다.

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

[DB 시나리오](../apps/web/tests/api/hard/db/)에서는 동시 신청·낙찰과 같은 경합, 권한 회수, 결과 저장과 MMR 역분개의 원자성, 기존 자료를 보존하는 migration을 실제 PostgreSQL로 검사한다.

서비스가 요구하는 Discord·Riot 응답은 고정된 의존성으로 제공한다. 실제 권한 계산·DB 조회·업무 함수는 실행 대상이다.

## hard HTTP

`support/http.ts`는 전용 schema를 준비하고 `http-child.mjs`를 자식 프로세스로 실행한다.
자식은 최신 운영 빌드의 `build/handler.js`를 로컬 임의 포트에 연결한다. 개발 목 경로로 운영 요청을 대체하지 않는다.
adapter-node의 `PROTOCOL_HEADER`로 HTTPS 프록시 뒤 HTTP 연결을 재현하여 운영 Secure 쿠키 계약을 유지한다.
실제 TLS 인증서나 브라우저의 쿠키 정책을 검증하는 E2E 테스트는 아니다.

테스트는 Node `fetch`로 실제 URL·form action을 호출한다. 정상 세션 행과 쿠키를 사용하며 관리자 우회 헤더를 추가하지 않는다.
외부 요청은 자식 프로세스 안의 등록된 응답만 허용한다. 예상하지 않은 외부 요청은 차단하고 테스트 정리 시 실패로 보고한다.
응답 관찰 전에 IPC checkpoint를 지나 요청 기록의 순서를 보장한다.

[HTTP 시나리오](../apps/web/tests/api/hard/http/)에서는 공개 조회·세션과 권한·입력 오류·다른 길드 자원 접근 차단·ROFL 업로드·봇 요청을 실제 라우트로 검사한다.

SvelteKit 3의 action 결과는 일반 JSON endpoint와 구분한다. `success`/`failure`는 본문의 `status`, `error`는 `error.status`를 확인한다.
반환값 없는 성공은 HTTP 200과 결과 status 204를 사용한다. 업무 저장은 응답과 DB 행을 함께 확인한다.

## 검증 경계

- HTTP의 모든 action에 대한 비로그인 검사를 정상 업무 전체의 HTTP 완주로 설명하지 않는다. 주요 업무 HTTP 시나리오와 세부 DB 시나리오를 함께 사용한다.
- ROFL 성공은 HTTP 응답뿐 아니라 Game·실출전·MMR 원장·승자 진출·게시 작업의 실제 DB 상태로 검증한다. 외부 Riot 식별 응답은 고정 자료이며 실제 Riot 서버 호출 검증은 별도다.
- 브라우저 테스트는 합성 ROFL과 고정된 외부 응답을 사용한다. 실제 League 파일의 운영 업로드, Discord OAuth 로그인·권한 회수·명령 실행·게시와 DM 수신은 허가된 계정과 서버에서 별도로 확인한다. 실제 메일 앱 열기와 발송도 자동 검증에 포함하지 않는다.
- 물리 기기·Safari·스크린리더 음성·실사용 성능은 로컬 Chromium 결과로 확인할 수 없다. [배포 절차](deployment.md)의 CI 범위, 격리 백업/복원 검사, 실제 릴리스의 공인 TLS·운영 복구 점검도 서로 구분한다.
