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

nginx의 업로드 제한은 `70m`, 연결/송신/응답 대기는 각각 5/60/60초다. `proxy_request_buffering off`와 HTTP/1.1로 업로드 본문을 프록시 임시 파일에 쓰지 않고 앱으로 전달한다. 이 시간 제한은 앱에서 실행 중인 SQL을 취소하는 기능이 아니다. 헤더는 nginx가 덮어쓰고 adapter-node에는 `PROTOCOL_HEADER`를 함께 설정한다.

OAuth callback의 code/state가 접근 로그에 남지 않게 이 사이트의 access log를 끈다. callback 경로는 upstream 장애의 error log도 끄며, 다른 nginx error log는 접근 제한한 운영 로그로 취급한다. 토큰을 수집하지 않는 요청 ID·업무 오류·처리 시간 관측과 DB query/statement timeout, 처리량 제한은 [기존 운영 기준](backend-plan.md#102-배포와-완료-조건)의 별도 후속 작업이다. 이번 예제에 앱 관측 기능이나 새 상태 API를 추가하지 않았다.

인증서 발급·갱신과 실제 서버의 TLS·방화벽·도메인 점검은 운영 환경에서 수행한다. 검증 도구의 하루짜리 자체 서명 인증서를 운영 인증서로 사용하지 않는다.

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
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)
- 설치된 `@sveltejs/adapter-node/src/handler.js`, `src/index.js`, `index.js`와 기존 `apps/web/tests/api/support/http-child.mjs`의 실제 헤더·종료 계약
