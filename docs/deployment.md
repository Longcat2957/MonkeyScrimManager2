# VPS 배포 준비와 격리 검증

웹은 SvelteKit adapter-node, 봇은 별도 Node.js 프로세스, DB는 PostgreSQL 17을 사용한다. 이 문서는 Linux VPS의 systemd·nginx 예제와 저장소 CI·백업 도구를 설명한다. 실제 서버 주소·사용자·SSH 설정·인증서·운영 비밀 값은 포함하지 않는다. 현재 실제 Discord 로그인·명령 등록·게시/DM 발송과 운영 배포는 검증하지 않았다. 약관·개인정보 본문은 기존 사용자 보류를 유지한다.

## 실행 전제

- `package.json`의 Node 엔진은 `^22.17.0 || >=24.0.0`, pnpm은 `10.20.0`이다. 새 CI와 격리 배포 검사는 실제 확인한 Node 24 계열을 사용한다.
- VPS 예제는 systemd와 nginx를 설치한 Linux, 같은 호스트의 웹·봇을 전제로 한다. DB는 별도 관리한 PostgreSQL 17이다. 기존 DB·컨테이너·볼륨을 초기화하는 설치 스크립트는 제공하지 않는다.
- 예시 설치 경로 `/srv/monkeybot/current`, 실행 사용자/그룹 `monkeybot`, Node 경로 `/usr/bin/node`, 도메인 `monkeybot.example`을 실제 환경에 맞춰 바꾼다. `.example`은 운영 주소가 아니다.
- 애플리케이션의 `node_modules`와 각 빌드 결과가 필요하다. 빌드 디렉터리만 복사해 Node 의존성이 모두 포함됐다고 가정하지 않는다.
- 실제 인증서 발급·갱신 방식, 방화벽·DNS, DB 접속 계정과 TLS, 백업 저장 위치·암호화·보존 기간·복구 목표는 운영 환경에서 정한다. 예제 검증에는 이 값들이 필요하지 않다.

## 저장소 CI

[ci.yml](../.github/workflows/ci.yml)은 push와 pull request에서 Ubuntu 24.04·Node 24·pnpm 10.20.0을 준비한다. Actions는 확인한 공식 릴리스 commit으로 고정하고 저장소 읽기 권한만 부여한다. 배포·명령 등록·봇 기동은 하지 않는다.

실행 순서는 의존성/Chromium 설치 → `pnpm check` → `pnpm check:tests` → `pnpm test` → `pnpm build:bot` → `pnpm test:hard` → `pnpm test:browser` → 아래 격리 배포 검사다. hard와 browser는 기존 실행기가 각자 새 웹 build를 만드는 계약을 유지한다. 세 번째 독립 웹 build는 추가하지 않는다.

CI의 PostgreSQL은 전용 사용자·DB와 로컬 포트만 사용하는 일회용 서비스다. trust 인증은 그 테스트 서비스에 한정한다. 운영 DB 접속 정보·Discord/Riot 자격 증명·배포 키를 workflow에 전달하지 않는다. hard/browser 실행기는 기존처럼 실제 키를 비우고 테스트마다 schema를 생성·정리한다. 원격 Actions 통과 여부는 해당 push의 실제 실행 결과로 확인한다.

## 웹·봇 프로세스

[웹 unit](../deploy/monkeybot-web.service.example)과 [봇 unit](../deploy/monkeybot-bot.service.example)은 예제다. 실행 사용자·설치 경로·Node 실행 파일을 바꾼 뒤 `/etc/systemd/system/monkeybot-web.service`, `monkeybot-bot.service`에 설치한다. 서비스 파일 자체에 비밀 값을 적지 않는다.

앱 설정은 [웹 환경 예제](../apps/web/.env.example)·[봇 환경 예제](../apps/bot/.env.example)를 기준으로 각각 `/etc/monkeybot/web.env`, `/etc/monkeybot/bot.env`에 준비한다. root와 실행 그룹만 읽을 수 있게 디렉터리/파일 권한을 제한하고 Git·지원 로그에 올리지 않는다. systemd의 `EnvironmentFile`은 셸 스크립트가 아니므로 `export`나 명령 치환을 넣지 않는다.

| 설정 | 운영 계약 |
| --- | --- |
| `HOST=127.0.0.1`, `PORT=3000` | 웹 포트를 외부에 공개하지 않고 같은 호스트의 nginx·봇만 접근 |
| `PROTOCOL_HEADER=x-forwarded-proto` | nginx가 덮어쓴 HTTPS 정보를 adapter-node가 읽음. 신뢰하지 않는 클라이언트가 앱 포트에 직접 접근하지 않게 함 |
| `BODY_SIZE_LIMIT=70M` | 64MiB ROFL과 multipart 여유. 앱의 파일 자체 64MiB 검사는 유지 |
| `SHUTDOWN_TIMEOUT=25`, unit `TimeoutStopSec=35` | 웹 SIGTERM 처리에 서비스 관리자보다 짧은 유예 부여 |
| `DISCORD_REDIRECT_URI` | 실제 HTTPS `/auth/discord/callback`; Discord 등록 주소와 동일해야 함 |
| `BOT_API_URL` | 같은 호스트의 `http://127.0.0.1:3000` |
| `WEB_ORIGIN` | 사용자에게 열리는 실제 HTTPS origin |
| `BOT_INTERNAL_TOKEN` | 웹·봇에 동일한 32자 이상 난수. 내부 API 요청에만 사용 |
| `BOT_STATUS_PORT`, `BOT_STATUS_URL` | 봇의 로컬 상태 포트와 웹의 `http://127.0.0.1:포트/status`를 일치시킴 |

설치된 adapter-node 6은 `PROTOCOL_HEADER`를 읽으며 고정 origin은 SvelteKit `config.paths.origin`에서 받는다. 과거 adapter의 `ORIGIN` 환경 변수를 복사해 HTTPS 구성이 끝났다고 가정하지 않는다. 현재 예제는 nginx 헤더 계약을 사용한다.

unit은 실패 시 재시작하고 SIGTERM으로 종료한다. 봇의 `After=monkeybot-web.service`는 기동 순서이며 HTTP 준비 완료 보장은 아니다. 봇의 기존 내부 API 오류·재시도 처리도 유지한다. `PrivateTmp`, 읽기 전용 시스템 영역, 제한된 실행 사용자를 사용하므로 설치 디렉터리는 실행 시 쓰기가 필요 없어야 한다. 릴리스 파일은 배포 작업자가 준비한다.

운영 적용 시에는 환경 파일·검토한 릴리스와 migration을 먼저 준비하고 `systemd-analyze verify`·`nginx -t`를 통과시킨다. 웹을 먼저 올려 공개 화면과 내부 접근 경계를 확인한 뒤 봇을 시작한다. **봇 시작은 실제 Discord 연결과 대기 중인 게시를 발생시킬 수 있으므로 현재 제외된 실연동 검증으로 자동 실행하지 않는다.** 장애 때는 `journalctl -u monkeybot-web`, `journalctl -u monkeybot-bot`와 기존 백오피스 상태를 확인하며 비밀 값이나 메시지 본문을 복사하지 않는다.

## HTTPS 프록시

[사이트 예제](../deploy/nginx.conf.example)는 nginx `http` 문맥의 sites-enabled에 포함한다. 예제의 도메인과 인증서 두 경로를 바꾸고, [내부 차단·프록시 조각](../deploy/nginx-internal.conf.example)을 `/etc/nginx/snippets/monkeybot-internal.conf`에 설치한다. HTTP는 지정 도메인의 HTTPS로 이동하며 `/internal`과 `/internal/…`은 외부에서 404다.

nginx의 업로드 제한은 `70m`, 연결/송신/응답 대기는 각각 5/60/60초다. `proxy_request_buffering off`와 HTTP/1.1로 업로드 본문을 프록시 임시 파일에 쓰지 않고 앱으로 전달한다. 프록시 시간 제한과 별도로 아래 앱 제한이 실제 SQL·본문 읽기·파싱을 중단한다. 헤더는 nginx가 덮어쓰고 adapter-node에는 `PROTOCOL_HEADER`를 함께 설정한다.

OAuth callback의 code/state가 접근 로그에 남지 않게 이 사이트의 access log를 끈다. callback 경로는 upstream 장애의 error log도 끄며, 다른 nginx error log는 접근 제한한 운영 로그로 취급한다. 앱은 아래 요청 요약을 stdout/journal로 남기며 새 상태 API는 추가하지 않는다.

인증서 발급·갱신과 실제 서버의 TLS·방화벽·도메인 점검은 운영 환경에서 수행한다. 검증 도구의 하루짜리 자체 서명 인증서를 운영 인증서로 사용하지 않는다.

## DB·ROFL 운영 제한과 요청 관측

[환경 예제](../apps/web/.env.example)의 제한은 운영 환경 파일에 설정하고 웹을 재시작한다. 잘못된 값·0·순서 역전은 무제한으로 대체하지 않고 거절한다. 실제 구현은 [DB 풀](../apps/web/src/lib/server/db/pool.ts), [ROFL 입장/본문](../apps/web/src/lib/server/rofl/processing.ts), [파싱 worker](../apps/web/src/lib/server/rofl/processing-worker.ts), [요청 관측](../apps/web/src/lib/server/operations/context.ts)을 따른다.

| 설정 | 기본값·의미 |
| --- | --- |
| `DB_LOCK_TIMEOUT_MS` | 5000. PostgreSQL이 실제 잠금 대기를 취소 |
| `DB_STATEMENT_TIMEOUT_MS` | 15000. PostgreSQL이 실제 SQL statement를 취소 |
| `DB_QUERY_TIMEOUT_MS` | 30000. PostgreSQL 17의 전체 transaction·idle-in-transaction 상한. Node의 연결 점유는 서버 종료/응답 유예 1초 뒤 실제 연결 종료로 해제 |
| `ROFL_MAX_CONCURRENT` | 2. 본문 읽기부터 외부 식별·DB 저장 종료까지 한 프로세스의 진행 요청 수. 허용 범위 1~8 |
| `ROFL_USER_CONCURRENT` | 미설정이면 min(2, 전역 한도). 지정하면 전역 한도 이하 |
| `ROFL_USER_REQUEST_LIMIT`, `ROFL_RATE_WINDOW_MS` | 사용자별 입장 시도 12회/60000ms. 입장한 잘못된 파일·실패·중복 시도도 포함하며 429 거절은 추가 횟수를 소모하지 않음 |
| `ROFL_BODY_TIMEOUT_MS` | 30000. 본문 수신 총 시간. 실제 reader 취소로 연결을 중단 |
| `ROFL_PARSE_TIMEOUT_MS` | 5000. worker 시작을 포함한 파싱 시간. 제한 시 worker terminate 완료 후 요청 슬롯 반환 |

DB 풀은 기존 최대 10개·연결 대기 10초를 유지한다. `pg.query_timeout`의 응답만 끝내는 동작은 사용하지 않는다. 서버 statement/transaction 제한이 SQL·열린 트랜잭션을 중단하고, 추가 연결 점유 상한은 실제 pg 연결을 닫는다. 읽기·쓰기 timeout과 새 연결을 얻지 못한 실패는 원시 SQL/연결 오류를 노출하지 않는 503이며, form action·내부 봇 제한 응답에는 `Retry-After`를 제공한다. 일반 SQL 오류를 연결 실패로 바꾸지는 않는다. 실패한 트랜잭션의 부분 변경은 롤백한다. 연결 응답을 잃은 경우에는 저장 여부를 추정하지 않고 현재 상태를 재확인한다. migration·백업 CLI는 이 앱 풀을 사용하지 않으므로 별도의 작업/복구 절차를 따른다.

ROFL은 큐·파일을 limiter에 저장하지 않고 입장 불가 시 바로 429와 초 단위 `Retry-After`를 반환한다. 사용자별 기간 자료는 짧게 유지하고 크기를 제한한다. 본문은 70MiB, 파일 자체는 기존 64MiB, 파서 메타데이터는 기존 2MiB 제한이다. 본문 취소는 adapter-node의 실제 요청 연결을 닫을 수 있어 408 대신 네트워크 중단으로 보일 수 있으며, 브라우저는 파일/블루 팀 선택을 보존해 다시 시도한다.

원본 바이트의 복사본만 worker로 이전하고 기존 parser·identity·적재 모델을 그대로 실행한다. worker의 JS heap은 64MiB이며 파일 ArrayBuffer 등 외부 메모리는 그 heap 제한과 별도다. 파일 크기와 진행 요청 수가 함께 메모리 사용을 제한한다. 정상 파싱과 파싱 중 취소 모두 thread 종료를 기다린다. 기존 채택본 복구/중복 경로는 필요한 원본 확인 뒤 불필요한 재파싱 없이 기존 데이터·MMR 의미를 유지한다. 제한은 **프로세스별**이다. 여러 Node worker·replica에서는 합산 동시성과 사용자별 횟수가 늘어나므로 인스턴스 수·메모리·트래픽에 맞춰 각 한도를 정해야 한다. 이 구현에 분산 limiter나 새로운 서비스 의존성은 없다.

요청마다 서버가 UUID를 만들고 `X-Request-ID`로 반환한다. JSON 로그에는 `event`, `requestId`, manifest의 `route` 템플릿, 허용된 `method`, `status`, 허용된 오류 `code`, `durationMs`만 기록한다. 요청 본문·쿠키·토큰·Riot ID·원본 파일·실행자 ID·실제 경로/URL query·원시 SQL/예외 객체는 기록하지 않는다. 부분 실패도 코드만 기록하고 SvelteKit의 기본 원시 오류 출력은 대체한다. 풀의 대기 요청은 connect 호출 당시 문맥에 연결해 다른 요청에 오류를 잘못 귀속하지 않는다.

`durationMs`는 서버가 응답 객체를 만들 때까지의 시간이며 브라우저의 전체 전송 시간이나 CWV가 아니다. stdout/journal의 실제 저장·접근 권한·회전·보존과 알림·대시보드는 운영 환경에서 정한다. 앱은 로그 수집 외부 서비스나 자동 경보를 추가하지 않는다. 실행 증거와 검사 범위는 [운영 안정성 검증](../artifacts/ui-review/next/operations.md)을 따른다.

## DB migration과 백업·복원

앱 기동은 migration을 실행하지 않는다. 새 환경에서는 검토한 Drizzle journal 순서로 적용한다. 운영 데이터를 만든 뒤에는 먼저 보호된 백업과 격리 복원 근거를 확보하고 쓰기 중지·전환 시간을 정한다. 환경 파일을 읽는 명령을 실행할 때는 `apps/web`을 작업 디렉터리로 사용한다.

```sh
node --env-file=/etc/monkeybot/web.env node_modules/drizzle-kit/bin.cjs migrate
```

[database_backup.mjs](../scripts/database_backup.mjs)는 PostgreSQL 17의 `pg_dump`, `pg_restore`, `psql`을 PATH에서 실행한다. 접속 URL은 전용 환경 변수에서만 읽고 일반 `DATABASE_URL`로 대체하지 않는다. URL·비밀번호를 하위 명령의 argv·도구 출력에 남기지 않는다. 접속 오류의 원시 문구에는 주소·자료가 포함될 수 있어 도구는 명령 종류와 실패 사실만 출력한다.

| 명령 | 동작 |
| --- | --- |
| `backup /보호된/새파일.dump` | `MSM2_BACKUP_DATABASE_URL`에서 읽음. custom 형식과 SHA256 파일을 0600으로 생성. 기존 파일을 덮어쓰지 않고 실패한 dump를 제거 |
| `restore /보호된/파일.dump --confirm-empty-database` | `MSM2_RESTORE_DATABASE_URL`에서 읽음. SHA256·archive·빈 대상 DB를 확인한 뒤 단일 트랜잭션으로 복원. 기존 객체 삭제 옵션은 사용하지 않음 |

예를 들어 URL을 화면·셸 이력에 출력하지 않고 현재 셸에 입력한 뒤 실행할 수 있다.

```sh
read -rsp '백업 전용 DB URL: ' MSM2_BACKUP_DATABASE_URL
export MSM2_BACKUP_DATABASE_URL
node scripts/database_backup.mjs backup /var/backups/monkeybot/새파일.dump
unset MSM2_BACKUP_DATABASE_URL
```

복원 때는 새로운 빈 DB를 별도로 만들고 연결을 제한해 다른 쓰기가 들어오지 않게 한다. `MSM2_RESTORE_DATABASE_URL`을 같은 방법으로 입력하고 `restore` 명령과 명시적 확인 인자를 사용한다. 실제 접속 주소·경로는 운영자가 정한다. 기존 운영 DB에 시험 복원하지 않는다.

URL에는 사용자·호스트·DB 이름을 명시한다. 지원하는 query 옵션은 `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `connect_timeout`이다. 그 외 옵션은 조용히 무시하지 않고 거절한다. 비밀번호 대신 별도 `PGPASSFILE`을 지정할 수도 있다. 파일 권한과 서버의 TLS 요구는 운영자가 설정한다.

dump는 단일 DB의 schema·자료·sequence를 보존한다. role·tablespace 같은 클러스터 전역 설정, ownership·ACL은 포함하지 않으므로 별도 계정·권한 준비가 필요하다. 새 대상에 접속한 계정이 복원 객체를 소유한다. 신뢰하는 서버의 백업만 복원한다. SHA256은 전송 오류 확인용이며 서명·암호화나 악성 SQL 검사를 대신하지 않는다.

백업에는 사용자 식별 정보·세션 해시·서비스 자료가 포함될 수 있다. 제한된 저장 위치와 암호화·외부 복사·보존 기간을 정하고, dump와 검증 파일을 Git·CI artifact에 올리지 않는다. 도구가 보관/삭제 일정이나 기존 백업 일괄 정리를 실행하지 않는다. 강제 종료로 남은 파일은 소유권과 완료 여부를 확인해 개별 처리한다.

복원 후에는 행·FK·sequence·migration 상태와 대표 업무 결과를 확인한 뒤 새 DB로 앱을 전환한다. 실패하면 기존 데이터/릴리스를 보존한 상태로 원인을 확인한다. 이미 적용한 migration을 수정하거나 앱 시작 시 초기화하지 않는다. 구버전 코드로 돌아갈 때도 변경된 schema와의 호환성을 먼저 검토한다.

## 격리된 로컬 배포 검사

Docker 데몬을 사용하는 Linux, Node 24 이상, OpenSSL, systemd-analyze와 미리 빌드한 웹·봇이 필요하다. Docker 컨텍스트는 이 Linux 파일 시스템을 읽을 수 있는 로컬 데몬이어야 한다. PostgreSQL CLI를 호스트에 설치하지 않아도 임시 PostgreSQL 컨테이너의 같은 버전 도구로 검사한다.

```sh
pnpm build
node scripts/verify_deployment.mjs --report /tmp/msm2-deployment-check.json
```

검사기는 임의 접미사의 `msm2-deploy-check-…` 이름과 전용 label을 가진 컨테이너 두 개만 만든다. DB 포트는 임의의 127.0.0.1 포트, 데이터는 해당 컨테이너의 tmpfs다. nginx는 호스트의 임의 로컬 포트와 읽기 전용 임시 설정만 사용한다. 기존 컨테이너·DB·volume은 선택하지 않고, 삭제 전에 자신의 label을 다시 확인한다. `prune`이나 기존 데이터 디렉터리 mount는 사용하지 않는다.

검사 범위는 다음과 같다.

1. 예제 unit의 사용자·경로를 임시 값으로 렌더링해 `systemd-analyze verify`로 검사한다. 서비스를 등록·기동하지 않는다.
2. 임시 PostgreSQL에 실제 `drizzle-kit migrate`를 적용한다. 별도 검증 schema에 Unicode·null·큰 정수·정밀 숫자·FK·identity 자료를 넣는다.
3. 실제 백업 도구로 dump·SHA256을 만들고 별도 빈 DB에 복원한다. 모든 테이블의 행 hash·제약·sequence를 대조하고 덮어쓰기·비어 있지 않은 대상·확인 누락·hash 오류·실패 파일 정리를 검사한다. 일반 `DATABASE_URL`을 사용하지 않는다.
4. 외부 fetch를 차단하고 운영 웹 build를 격리 DB와 빈 외부 자격 증명으로 실행한다. 실제 nginx·로컬 TLS를 통해 `/docs` 200, HTTP 이동, 내부 경로 404, HTTPS origin/CSRF, 위조 헤더 덮어쓰기, 크기 제한 413, 웹 SIGTERM 종료를 확인한다. `/docs`에 없는 form action의 POST는 origin 검사를 통과한 뒤 405여야 하며, 다른 origin은 403이어야 한다.
5. 직접 만든 프로세스·label이 일치하는 컨테이너·임시 인증서·dump를 정리한다. JSON에는 버전·단계·hash·정리 결과를 남기고 URL·쿠키·인증서 private key·DB 자료·원시 도구 오류를 넣지 않는다.

이 검사는 실제 공인 인증서·VPS·봇 Gateway·OAuth 제공자·Riot·실제 ROFL 원본·음성 청취·물리 장치를 사용하지 않는다. 현재 사용자 보류와 제외 범위는 유지한다.

## 근거

- [GitHub PostgreSQL 서비스](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [setup-node](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup)
- [nginx proxy_request_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [statement·transaction timeout](https://www.postgresql.org/docs/17/runtime-config-client.html)
- [pg Client 설정](https://node-postgres.com/apis/client), [Node 24 worker 종료](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate), [SvelteKit hooks](https://svelte.dev/docs/kit/hooks)
- 설치된 `@sveltejs/adapter-node/src/handler.js`, `src/index.js`, `index.js`와 기존 `apps/web/tests/api/support/http-child.mjs`의 실제 헤더·종료 계약
