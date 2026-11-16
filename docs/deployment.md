# VPS 배포 준비와 격리 검증

웹은 SvelteKit adapter-node, 봇은 별도 Node.js 프로세스, DB는 PostgreSQL 17 이상을 사용한다. 신규 VPS 운영은 아래 Docker Compose 구성을 기준으로 준비한다. 기존 systemd·nginx 단독 실행 예제와 CI·백업 도구는 별도 검증 경로로 유지한다. 실제 인증서·운영 비밀 값은 저장소에 포함하지 않는다. 실제 Discord 로그인·명령 등록·게시/DM 발송과 앱 운영 배포는 아직 검증하지 않았다. 약관·개인정보 본문은 기존 사용자 보류를 유지한다.

최신 기능과 migration의 전체 CI·브라우저·격리 배포 결과는 [릴리스 통합 검증](release-validation.md)을 따른다. 과거 격리 실행이나 부분 테스트 통과를 새 커밋의 전체 성공으로 대체하지 않는다.

## Docker Compose 운영: 인프라 통합

2026-11-16 기준 기존 nginx·PostgreSQL을 `monkeybot` Compose 프로젝트로 이관하고 MSM2 전용 빈 DB와 서비스별 운영 환경을 준비했다. 웹 주소는 `https://monkeybot.lol`, `bot.monkeybot.lol`은 예약이다. dev CI가 공통 앱 이미지를 만들며, main CD 연결과 앱의 최초 공개는 다음 단계다.

| 위치 | 역할 |
| --- | --- |
| [compose.yml](../deploy/compose.yml) | 기본 인프라: nginx·PostgreSQL, 상태 확인, 로그 회전, 네트워크, 기존 외부 볼륨 |
| [compose.app.yml](../deploy/compose.app.yml) | 같은 프로젝트에 웹·봇·일회성 migration을 합치는 앱 구성. 이미지 설정이 없으면 실패 |
| [Compose 환경 예제](../deploy/.env.example) | 경로·볼륨·포트와 후속 릴리스 이미지 설정. 서비스 비밀 값과 분리 |
| [nginx/](../deploy/nginx/) | 공통 프록시 설정, 현재 중단 안내, 후속 앱 연결 설정 |
| [provision.sql](../deploy/postgres/provision.sql) | MSM2 전용 DB·비특권 계정·미래 migration 객체의 런타임 권한 준비 |

서버의 활성 배포 경로는 `/opt/monkeybot`이다. `deploy/`의 위 파일 구조를 그대로 배치하며 `/opt/monkeybot/.env`는 Compose 환경 예제를 기준으로 작성한다. 기본 `COMPOSE_FILE=compose.yml`은 인프라 두 서비스만 선택한다.

```sh
cd /opt/monkeybot
docker compose config --quiet
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 nginx postgres
```

서비스 환경과 인증서는 서버의 `/etc/monkeybot`에 보관한다. 디렉터리는 0700, 환경 파일·인증서 키는 0600이다. `postgres.env`는 기존 PostgreSQL 프로세스의 실제 설정을 유지하며, 웹과 migration은 서로 다른 DB 계정으로 연결한다. 서비스별 값은 아래 2단계의 환경 파일을 따른다. 인증서와 nginx 설정은 읽기 전용 bind mount이며 Rocky Linux의 SELinux를 고려해 전용 경로에 `Z` 라벨을 적용한다.

### DB와 기존 데이터 보존

현재 운영 인프라는 PostgreSQL 18.4의 기존 이미지 digest와 `/var/lib/postgresql` 마운트를 그대로 사용한다. `monkeybot-postgres-data`는 `external: true`다. 볼륨이 없으면 자동으로 새 빈 클러스터를 만드는 대신 실패한다. 기존 `monkeybot_main`·`monkeybot_dev`는 각각 SQLx 기반 65개 테이블을 가진 별도 서비스 DB이므로 MSM2 Drizzle migration을 적용하지 않는다.

MSM2 전용 DB는 `msm2_main`이다. `msm2_migrator`는 이 DB의 소유자로서 DDL을 실행하고, `msm2_runtime`은 업무용 테이블의 SELECT·INSERT·UPDATE·DELETE와 sequence 사용 권한만 받는다. 두 계정 모두 superuser·역할 생성·DB 생성 권한이 없다. `provision.sql`은 기존 비밀번호를 변경하지 않으며 서버 환경의 `MSM2_RUNTIME_PASSWORD`·`MSM2_MIGRATOR_PASSWORD`를 읽는다. bootstrap 계정으로 `postgres` DB에 연결해 실행한다. 새 DB의 업무 테이블은 실제 앱 릴리스의 migration 단계에서 생성한다.

DB의 기존 loopback 포트 `127.0.0.1:10010`과 `deploy_data`·`monkeybot_tunnel` 네트워크는 유지한다. 앱용 `data` 네트워크는 Compose가 만드는 내부 네트워크이며 nginx·웹·봇은 `edge` 네트워크로 통신한다. nginx의 80·443은 기존처럼 IPv4·IPv6에 공개하고 앱 구성의 웹·봇·migration에는 호스트 공개 포트가 없다.

최초 이관 전에는 `/var/backups/monkeybot/infra-<UTC시각>/`에 기존 컨테이너 설정·nginx·인증서, DB별 custom dump와 globals SQL, SHA256 목록을 보관한다. dump의 archive 목록을 검사하고 기존 DB의 테이블별 행 수·행 해시·sequence 상태·DB 소유자와 기존 역할의 권한·비밀번호 해시를 이관 전후에 비교한다. 해당 자료에는 비밀 값과 사용자 자료가 포함되므로 서버에서만 제한된 권한으로 보관한다.

활성 컨테이너는 `monkeybot-nginx-1`·`monkeybot-postgres-1`이다. 이전 컨테이너의 설정·로그는 아래 정리 보관본에 남기고 중지된 컨테이너는 제거했다. 복구 때는 보관한 설정으로 컨테이너를 다시 만들며, 같은 PostgreSQL 볼륨을 사용하는 두 컨테이너를 동시에 시작하지 않는다.

2026-11-16 이관에서는 기존 DB 130개 테이블의 행 수·데이터 해시와 sequence 상태, DB 소유자 및 기존 계정의 권한·비밀번호 해시가 모두 일치했다. MSM2 전용 DB는 업무 테이블 0개이며 실행·migration 계정의 실제 TCP 접속과 스키마 생성 권한 구분을 확인했다. 격리 Compose에서도 계정 준비 재실행, migration 계정의 DDL, 런타임의 DML·DDL 거부, Compose 재생성 후 기존 볼륨의 자료 보존을 검증했다. 서버의 `/opt/monkeybot/.infra-backup-path`가 이번 이관의 백업·검증 보고서 경로를 가리킨다.

### 후속 앱 구성의 연결점

이미지와 `web.env`·`bot.env`·`migration.env`가 준비된 릴리스에서는 `.env`의 `COMPOSE_FILE`을 `compose.yml:compose.app.yml`로 전환한다. 명령은 같은 `docker compose`를 사용한다. 앱 구성은 `postgres` 정상 → `migrate` 성공 → `web` 정상 → `bot` 정상 순서다. nginx는 이때 중단 안내 대신 `application.conf`를 읽고 웹을 연결한다.

기본 nginx의 `/healthz` 200은 nginx 생존 확인이며 앱·DB 준비 상태를 의미하지 않는다. 앱 구성의 현재 웹 검사는 `/docs`의 HTTP 응답이고, DB 준비 상태 검사와 봇 상태 서버의 컨테이너 간 바인딩은 CD 단계에서 보완한다. 운영 봇 기동과 슬래시 명령 등록은 이번 단계에 포함하지 않는다.

## 운영 환경과 이미지 분리

서버의 서비스 환경은 아래 파일로 나눈다. Compose의 `.env`에는 경로·이미지 참조 등 배포 설정만 저장하며, 애플리케이션의 비밀 값은 넣지 않는다.

| 서버 파일 | 내용 | 저장소 예제 |
| --- | --- | --- |
| `/etc/monkeybot/postgres.env` | 기존 PostgreSQL bootstrap·데이터 경로 | 최초 인프라 이관에서 실제 컨테이너 설정 보존 |
| `/etc/monkeybot/web.env` | 런타임 DB URL, Discord OAuth·봇 조회 토큰, Riot 키, 공유 내부 키 | [웹 환경](../deploy/env/web.env.example) |
| `/etc/monkeybot/bot.env` | Discord 봇 토큰·앱 ID·선택 길드, 공유 내부 키 | [봇 환경](../deploy/env/bot.env.example) |
| `/etc/monkeybot/migration.env` | migration 소유자의 DB URL만 | [migration 환경](../deploy/env/migration.env.example) |

앱 구성의 `env_file`은 `format: raw`다. `KEY=value`의 값을 셸 식으로 확장하지 않으며 따옴표도 값의 일부로 전달하므로 감싸는 따옴표를 추가하지 않는다. Docker Compose 2.30 이상이 필요하며 VPS의 5.1.1에서 구성을 확인한다. 봇에는 DB URL·Riot 키·OAuth client secret을 전달하지 않는다. 컨테이너의 내부 주소·실행 옵션은 Compose의 `environment`가 제공한다. 봇 설정 검증은 내부 API의 `http://web:3000`을 허용하되 공개 `WEB_ORIGIN`의 HTTPS 조건은 유지한다. [Compose env_file 문서](https://docs.docker.com/reference/compose-file/services/#env_file)

`.dockerignore`는 루트·하위 디렉터리의 `.env*`와 `*.env*`, 인증서·키, DB 백업, 로컬 로그·ROFL, 설치된 의존성·빌드 산출물 등을 빌드 컨텍스트에서 제외한다. `.env.old`도 포함된다. `.gitignore`도 `web.env` 같은 역할별 실환경 파일과 보관본을 제외하고 예제만 허용한다. 운영 환경 파일을 CI artifact·빌드 인자로 전달하지 않는다. [Docker 빌드 컨텍스트 문서](https://docs.docker.com/build/concepts/context/#dockerignore-files)

### GitHub 배포 접속

`Longcat2957/MonkeyScrimManager2`의 `production` Environment는 `main` 브랜치만 허용한다. 수동 승인·대기 시간은 추가하지 않는다. 서비스 운영 키는 VPS에만 두고 Actions에는 다음 배포 접속 값만 등록한다.

| 구분 | 이름 | 내용 |
| --- | --- | --- |
| Environment Secret | `VPS_SSH_PRIVATE_KEY` | 배포 전용 Ed25519 키 |
| Environment Variable | `VPS_HOST`, `VPS_USER`, `VPS_PORT` | VPS 주소·root·22 |
| Environment Variable | `VPS_DEPLOY_PATH` | `/opt/monkeybot` |
| Environment Variable | `VPS_SSH_KNOWN_HOSTS` | 기존 신뢰 SSH 연결에서 확인한 서버 공개 host key |

서버 `authorized_keys`에는 `restrict` 옵션을 붙인 배포 공개 키를 추가한다. 기존 로그인 키는 유지하고 새 키와 고정 host key로 실제 SSH 접속을 검증한다. 개인 키는 GitHub Secret 등록 후 로컬 임시 파일을 정리한다. 후속 CD job은 `environment: production`으로 이 값에 접근하며, dev CI에는 배포 접속 정보를 전달하지 않는다. [GitHub Environment 문서](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

### 2026-11-16 환경 준비 결과

이관 당시 Monkeybot 설정 `/root/monkeybot-infra/main/`을 기준으로 Discord 앱 `1525847677542207548`의 OAuth·봇 설정을 같은 앱으로 맞췄다. 원본 경로는 아래 정리 보관본으로 옮겼으며 활성 환경은 `/etc/monkeybot`이다. 별도로 보관한 `.env.old`는 과거 앱 설정이다. 기존 런타임 DB URL·migration·PostgreSQL 설정을 보존하고 MSM2 전용 내부 키를 새로 만들어 웹·봇에 동일하게 저장했다. 새 운영 callback은 `https://monkeybot.lol/auth/discord/callback`이며 사용자가 Discord 개발자 포털의 Redirects 등록 완료를 확인했다.

Discord 봇 토큰의 읽기 전용 애플리케이션 조회는 HTTP 200과 앱 ID 일치를 확인했다. KR 플랫폼 상태 조회의 HTTP 403은 당시 요청의 진단 기록으로 보존한다. 이후 사용자가 Riot 키의 유효성을 확인했으므로 키 교체를 요구하거나 CI 진행을 막지 않는다. 키 유효성 확인과 해당 요청 경로의 접근 결과는 구분하며 같은 요청을 반복하지 않는다. 이 단계는 Gateway 로그인·OAuth 로그인 완료·명령 등록·게시/DM 발송을 검증하지 않는다. [Riot 응답 코드 문서](https://developer.riotgames.com/docs/portal#response-codes)

환경 파일·SSH 설정의 변경 전 보관본과 비밀 값을 제외한 검증 보고서는 `/var/backups/monkeybot/environment-<UTC시각>/`에 저장한다. `/opt/monkeybot/.env-backup-path`로 이번 경로를 확인한다. 현재 기본 Compose의 nginx·PostgreSQL만 계속 실행한다.

### 구 프로젝트 정리 결과

사용자 요청에 따라 구 프로젝트 7개 디렉터리(`/root/deploy`, `monkeybot-main`, `monkeybot-dev`, `monkeybot-releases`, `monkeybot-infra`, `cleanup-backup-20261116T065411Z`, `monkeybot-backups`)의 전체 내용과 구 로그를 `/var/backups/monkeybot/legacy-cleanup-20261116T085522Z`에 보관했다. 원본 1,745개 파일의 내용·해시를 확인하고 구 디렉터리, 중지 컨테이너 2개, 미사용 네트워크 3개와 별도로 보관한 `deploy_valkey-data` 볼륨을 제거했다.

보관본은 약 253 MiB이며 디렉터리 0700·파일 0600이다. `cleanup-report.json`, `final-checksums.json`, `legacy-files-manifest.json`에 정리·복구 근거가 있다. 활성 nginx·PostgreSQL의 컨테이너·이미지·볼륨·네트워크와 `/opt/monkeybot`, `/etc/monkeybot`, 이전 DB 백업은 유지했다. 4개 DB와 모든 역할, 기존 130개 테이블의 행 수·데이터 해시가 전후 일치했고 공개 포트·DB loopback 포트·도메인 응답도 동일하다. 보관본을 포함한 순확보 용량은 약 215 MiB다.

## 실행 전제

- `package.json`의 Node 엔진은 `^22.17.0 || >=24.0.0`, pnpm은 `10.20.0`이다. 새 CI와 격리 배포 검사는 실제 확인한 Node 24 계열을 사용한다.
- 아래 단독 실행 예제는 systemd와 nginx를 설치한 Linux, 같은 호스트의 웹·봇을 전제로 한다. DB는 별도 관리한 PostgreSQL 17 이상이다. 신규 Compose 운영의 경로·네트워크는 위 절차를 따른다.
- 예시 설치 경로 `/srv/monkeybot/current`, 실행 사용자/그룹 `monkeybot`, Node 경로 `/usr/bin/node`, 도메인 `monkeybot.example`을 실제 환경에 맞춰 바꾼다. `.example`은 운영 주소가 아니다.
- 애플리케이션의 `node_modules`와 각 빌드 결과가 필요하다. 빌드 디렉터리만 복사해 Node 의존성이 모두 포함됐다고 가정하지 않는다.
- 실제 인증서 발급·갱신 방식, 방화벽·DNS, DB 접속 계정과 TLS, 백업 저장 위치·암호화·보존 기간·복구 목표는 운영 환경에서 정한다. 예제 검증에는 이 값들이 필요하지 않다.

## 최초 서비스 운영자 지정

서비스 운영 권한은 Discord 서버 관리 권한과 별개다. 대상 사용자가 서비스에 한 번 로그인하고 현재 migration을 적용한 뒤, 웹의 DB 설정을 읽을 수 있는 서버에서 `pnpm admin:bootstrap <기존 Discord 사용자 ID>`를 실행한다. 도움말은 `pnpm admin:bootstrap --help`다. 운영자가0명일 때만 한 명을 지정하고 감사 이력을 함께 저장한다. 환경 변수로 임의 사용자를 자동 승격하지 않는다.

운영자가 이미 있으면 백오피스에서 다른 운영자를 지정하거나 회수한다. 실제 DB 권한을 매번 검사하며 마지막 운영자의 회수는 거절한다. 자기 권한을 회수하면 내 정보로 이동하고 기존 세션도 다음 요청부터 백오피스 접근을 잃는다. CLI·migration의 이번 실행은 격리 테스트 schema에 한정했으며 사용자 개발/운영 DB의 초기 지정은 실행하지 않았다.

## 저장소 CI

[ci.yml](../.github/workflows/ci.yml)은 **dev push**에서 Ubuntu 24.04·Node 24·pnpm 10.20.0으로 검사하고 GHCR에 이미지를 발행한다. main은 다음 CD 단계의 배포 트리거다. CI에는 저장소 읽기와 GHCR 발행에 필요한 `packages: write`만 부여한다. 운영 서버 접속·명령 등록·실제 봇 기동은 하지 않는다.

실행 순서는 잠금 파일로 의존성 설치 → `pnpm check` → `pnpm test` → 공통 이미지 빌드·GHCR 발행이다. `check`는 포맷·브랜딩·웹/봇 타입을, `test`는 DB 없이 실행하는 기본 웹·봇 단위 테스트를 검사한다. 검사나 빌드가 실패하면 이미지를 발행하지 않는다.

CI에는 PostgreSQL 서비스·Chromium 설치·테스트 타입 검사·DB/HTTP 통합·브라우저·환경 분리·이미지 기동 검사를 넣지 않는다. 필요한 통합 검사는 개발자가 기존 `pnpm test:hard`, `pnpm test:browser`, 아래 격리 배포 도구로 별도 실행한다. 운영 DB 접속 정보·Discord/Riot 자격 증명·배포 키도 CI에 전달하지 않는다. 원격 Actions 통과 여부는 해당 push의 실제 실행 결과로 확인한다.

### 공통 앱 이미지

[Dockerfile](../Dockerfile)은 잠금 파일로 의존성을 설치하고 웹·봇을 함께 빌드한다. Node 24의 고정 digest를 사용하고 최종 컨테이너는 `node` 사용자로 실행한다. 웹·봇·migration은 같은 이미지에서 서로 다른 명령과 환경으로 실행하며 Drizzle Kit와 pnpm workspace 의존성 구조를 유지한다.

발행 주소는 `ghcr.io/longcat2957/monkeyscrimmanager2:dev`와 같은 경로의 `:<dev 커밋 SHA>`다. GHCR 로그인에는 Actions의 기본 `GITHUB_TOKEN`을 사용한다. 타입·기본 단위 테스트를 통과한 소스를 한 번 빌드해 두 태그로 발행한다. 후속 main CD는 마지막으로 발행한 `dev` 이미지를 가져오는 방식으로 연결한다. 이때 main은 배포 요청이며 실제 앱 소스 revision은 이미지의 dev 커밋이다. 특정 버전으로 돌아갈 때는 보관된 SHA 태그를 선택한다.

Compose의 이미지 설정은 `MSM2_APP_IMAGE` 하나다. 실제 서비스 비밀 값은 기존 VPS 환경 파일에서 읽는다.

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
2. 임시 PostgreSQL에 현재 journal의 실제 `drizzle-kit migrate`를 적용한다. 별도 검증 schema에 Unicode·null·큰 정수·정밀 숫자·FK·identity 자료를 넣고, 직접 만든 업무 테이블에만 가짜 공개/비공개/탈퇴 사용자·계정 연결·세션·감사 이력·순서 있는 선호 챔피언을 준비한다. 실제 사용자 자료는 복사하지 않는다.
3. 실제 백업 도구로 dump·SHA256을 만들고 별도 빈 DB에 복원한다. 모든 테이블의 행 hash·제약·sequence와 전체 열의 자료형·기본값·NOT NULL·identity·generated를 대조한다. 덮어쓰기·비어 있지 않은 대상·확인 누락·hash 오류·실패 파일 정리를 검사하며 일반 `DATABASE_URL`을 사용하지 않는다.
4. 외부 fetch를 차단하고 운영 웹 build를 격리 DB와 빈 외부 자격 증명으로 실행한다. 실제 nginx·로컬 TLS를 통해 `/docs` 200, HTTP 이동, 내부 경로 404, HTTPS origin/CSRF, 위조 헤더 덮어쓰기, 크기 제한 413, 웹 SIGTERM 종료를 확인한다. `/docs`에 없는 form action의 POST는 origin 검사를 통과한 뒤 405여야 하며, 다른 origin은 403이어야 한다.
5. 직접 만든 프로세스·label이 일치하는 컨테이너·임시 인증서·dump를 정리한다. JSON에는 버전·단계·hash·정리 결과를 남기고 URL·쿠키·인증서 private key·DB 자료·원시 도구 오류를 넣지 않는다.

이 검사는 실제 공인 인증서·VPS·봇 Gateway·OAuth 제공자·Riot·실제 ROFL 원본·음성 청취·물리 장치를 사용하지 않는다. 현재 사용자 보류와 제외 범위는 유지한다.

## 근거

- [GitHub PostgreSQL 서비스](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [setup-node](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup)
- [nginx proxy_request_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [statement·transaction timeout](https://www.postgresql.org/docs/17/runtime-config-client.html)
- [pg Client 설정](https://node-postgres.com/apis/client), [Node 24 worker 종료](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate), [SvelteKit hooks](https://svelte.dev/docs/kit/hooks)
- 설치된 `@sveltejs/adapter-node/src/handler.js`, `src/index.js`, `index.js`와 기존 `apps/web/tests/api/support/http-child.mjs`의 실제 헤더·종료 계약
