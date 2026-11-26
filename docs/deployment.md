# VPS 배포와 복구

운영 환경은 Docker Compose로 Caddy, PostgreSQL, 웹(SvelteKit adapter-node), Discord 봇, Prometheus, Grafana를 실행한다. 앱 배포 결과는 해당 main CD의 Actions 실행과 VPS 상태로 확인한다. 인증서 개인 키·운영 비밀은 저장소에 넣지 않는다. systemd·nginx 예제는 Compose와 별개인 단독 실행·격리 검사용이다.

## Docker Compose 운영: 인프라 통합

운영 Compose 프로젝트는 `monkeybot`이다. 웹 주소는 `https://monkeybot.lol`, `bot.monkeybot.lol`은 예약이다. Cloudflare DNS only로 VPS에 직접 연결하고, Caddy가 공인 HTTPS 인증서를 발급·갱신한다. dev CI가 공통 앱 이미지를 발행하며 main CD가 VPS의 Compose 서비스를 갱신한다.

| 위치 | 역할 |
| --- | --- |
| [compose.yml](../deploy/compose.yml) | 기본 인프라: Caddy·PostgreSQL, 상태 확인, 로그 회전, 네트워크, 인증서 영속 볼륨과 기존 DB 외부 볼륨 |
| [compose.app.yml](../deploy/compose.app.yml) | 같은 프로젝트에 웹·봇·일회성 migration·Prometheus·Grafana를 합치는 앱 구성. 이미지 설정이 없으면 실패 |
| [Compose 환경 예제](../deploy/.env.example) | 경로·볼륨·포트와 후속 릴리스 이미지 설정. 서비스 비밀 값과 분리 |
| [caddy/](../deploy/caddy/) | Caddy 자동 HTTPS와 내부 경로 차단·앱·Grafana 프록시 설정 |
| [prometheus/](../deploy/prometheus/) | 웹 `/metrics`를 15초마다 수집하고 Compose DNS로 replica를 자동 발견하는 설정 |
| [grafana/](../deploy/grafana/) | Prometheus 데이터 소스와 API 성능 대시보드 프로비저닝 |
| [provision.sql](../deploy/postgres/provision.sql) | MSM2 전용 DB·비특권 계정·미래 migration 객체의 런타임 권한 준비 |

서버의 활성 배포 경로는 `/opt/monkeybot`이다. `deploy/`의 위 파일 구조를 그대로 배치하며 `/opt/monkeybot/.env`는 Compose 환경 예제를 기준으로 작성한다. 기본 `COMPOSE_FILE=compose.yml`은 인프라 두 서비스만 선택한다.

```sh
cd /opt/monkeybot
docker compose config --quiet
docker compose up -d --wait
docker compose ps
docker compose logs --tail=100 caddy postgres
```

서비스 환경은 서버의 `/etc/monkeybot`에 보관하며 디렉터리는 0700, 환경 파일은 0600이다. `postgres.env`는 기존 PostgreSQL 프로세스의 실제 설정을 유지하며 웹과 migration은 서로 다른 DB 계정으로 연결한다. Caddy의 인증서·ACME 계정은 `monkeybot-caddy-data` 볼륨의 `/data`, 실행 설정은 `monkeybot-caddy-config` 볼륨의 `/config`에 보관한다. 앱 교체 때 이 볼륨을 삭제하지 않는다. Caddy 설정은 읽기 전용 bind mount이며 Rocky Linux의 SELinux를 고려해 전용 경로에 `Z` 라벨을 적용한다. 기존 `/etc/monkeybot/certs`의 Cloudflare Origin CA 인증서는 새 Caddy 구성에서 사용하지 않는다.

### DB와 기존 데이터 보존

현재 운영 인프라는 PostgreSQL 18.4의 기존 이미지 digest와 `/var/lib/postgresql` 마운트를 그대로 사용한다. `monkeybot-postgres-data`는 `external: true`다. 볼륨이 없으면 자동으로 새 빈 클러스터를 만드는 대신 실패한다. 기존 `monkeybot_main`·`monkeybot_dev`는 각각 SQLx 기반 65개 테이블을 가진 별도 서비스 DB이므로 MSM2 Drizzle migration을 적용하지 않는다.

MSM2 전용 DB는 `msm2_main`이다. `msm2_migrator`는 이 DB의 소유자로서 DDL을 실행하고, `msm2_runtime`은 업무용 테이블의 SELECT·INSERT·UPDATE·DELETE와 sequence 사용 권한만 받는다. 두 계정 모두 superuser·역할 생성·DB 생성 권한이 없다. `provision.sql`은 기존 비밀번호를 변경하지 않으며 서버 환경의 `MSM2_RUNTIME_PASSWORD`·`MSM2_MIGRATOR_PASSWORD`를 읽는다. bootstrap 계정으로 `postgres` DB에 연결해 실행한다. 새 DB의 업무 테이블은 실제 앱 릴리스의 migration 단계에서 생성한다.

DB의 기존 loopback 포트 `127.0.0.1:10010`과 `deploy_data`·`monkeybot_tunnel` 네트워크는 유지한다. 앱용 `data` 네트워크는 Compose가 만드는 내부 네트워크이며 Caddy·웹·봇은 `edge` 네트워크로 통신한다. Caddy는 TCP 80·443과 HTTP/3용 UDP 443을 호스트에 공개하며 앱 구성의 웹·봇·migration에는 호스트 공개 포트가 없다.

최초 이관 전에는 `/var/backups/monkeybot/infra-<UTC시각>/`에 기존 컨테이너 설정·nginx·인증서, DB별 custom dump와 globals SQL, SHA256 목록을 보관한다. dump의 archive 목록을 검사하고 기존 DB의 테이블별 행 수·행 해시·sequence 상태·DB 소유자와 기존 역할의 권한·비밀번호 해시를 이관 전후에 비교한다. 해당 자료에는 비밀 값과 사용자 자료가 포함되므로 서버에서만 제한된 권한으로 보관한다.

최초 이관의 백업 위치는 `/opt/monkeybot/.infra-backup-path`에서 확인한다. 복구할 때 같은 PostgreSQL 볼륨을 사용하는 두 컨테이너를 동시에 시작하지 않는다.

### 앱 서비스 연결

이미지와 `web.env`·`bot.env`·`migration.env`·`grafana.env`가 준비된 릴리스에서는 `.env`의 `COMPOSE_FILE`을 `compose.yml:compose.app.yml`로 전환한다. 명령은 같은 `docker compose`를 사용한다. 앱 구성은 `postgres` 정상 → `migrate` 성공 → `web` 정상 → `bot` 정상 → Prometheus·Grafana 순서다. Caddy는 이때 `maintenance.caddy` 대신 `application.caddy`를 읽고 웹과 Grafana를 연결한다.

Caddy의 HTTP `/healthz` 200은 프록시 생존 확인이다. 앱 구성의 웹 healthcheck는 실행 계정으로 업무 테이블 조회와 `/docs` 응답을 확인한다. 봇 상태 서버는 Compose에서 `BOT_STATUS_HOST=0.0.0.0`으로 바인딩하며 공개 포트 없이 웹이 내부 상태를 조회한다. 실제 봇은 CD가 기동하며 슬래시 명령 등록은 별도 운영 명령이다.

Prometheus는 `web:3000/metrics`만 내부 네트워크에서 수집하며 공개 포트가 없다. Grafana는 `https://monkeybot.lol/grafana/`에서 로그인 후 대시보드를 보여 준다. Caddy는 `/metrics`와 `/internal`을 404로 막고 `/grafana`만 Grafana로 프록시한다. `grafana.env`의 관리자 비밀번호는 최초 기동 전에 32자 이상 난수로 채운다. 이 값은 최초 기동에만 적용된다.

### API 성능 모니터링

앱은 프로세스 누적 Prometheus 메트릭을 `/metrics`에 노출한다. Caddy와 nginx 예제는 이 경로를 공개하지 않으며 Prometheus만 Compose 내부 `web:3000`에 접속한다. Prometheus는 `web` 서비스의 DNS A 레코드로 replica 주소를 30초마다 갱신하므로 `web` scale-out 시 별도 target 등록 없이 각 인스턴스를 수집한다. 메트릭은 HTTP 요청·지연, DB 쿼리·풀 대기, Riot·Discord·Data Dragon·봇 호출, DB 풀 연결 수, 프로세스 메모리·가동 시간을 포함한다.

메트릭 이름·label·패널·PromQL·요청 로그 읽기 방법은 [모니터링 안내](monitoring.md)를 따른다.

메트릭은 앱 프로세스가 재시작하면 0부터 다시 시작하며 replica별로 별도 값이다. 장기 이력은 Prometheus가 보관한다. `monkeybot-prometheus-data` 볼륨은 30일 보존이며 삭제하지 않는다. Grafana 대시보드는 저장소의 프로비저닝 파일로 만들고 `monkeybot-grafana-data`에는 로그인·세션 상태만 둔다.

Prometheus와 Grafana 이미지는 digest로 고정한다. `docker compose up`은 `grafana.env`가 없으면 실패하므로 서버에서 먼저 0600 파일을 준비한다. Grafana는 익명 접근과 가입을 끄고 HTTPS 쿠키를 사용한다. `/grafana/api/health` 200은 프록시 연결 확인이며 대시보드 접근에는 로그인이 필요하다. `GF_SECURITY_ADMIN_PASSWORD`는 최초 기동에만 적용된다. 이후 비밀번호 변경·분실은 Grafana UI 또는 `docker compose exec -T grafana grafana cli admin reset-admin-password '<새 비밀번호>'`를 사용한다.

배포 스크립트는 `prometheus`·`grafana` 디렉터리를 서버로 복사하고 `promtool check config`와 Caddy 설정 검사를 먼저 실행한다. 배포 뒤 `/metrics`·`/internal` 공개 404와 Grafana 상태 200을 확인한다. Prometheus·Grafana 자체의 장기 백업·보존·알림 수신자는 운영 환경에서 정한다.

## 운영 환경과 이미지 분리

서버의 서비스 환경은 아래 파일로 나눈다. Compose의 `.env`에는 경로·이미지 참조 등 배포 설정만 저장하며, 애플리케이션의 비밀 값은 넣지 않는다.

| 서버 파일 | 내용 | 저장소 예제 |
| --- | --- | --- |
| `/etc/monkeybot/postgres.env` | 기존 PostgreSQL bootstrap·데이터 경로 | 최초 인프라 이관에서 실제 컨테이너 설정 보존 |
| `/etc/monkeybot/web.env` | 런타임 DB URL, Discord OAuth·봇 조회 토큰, Riot 키, 공유 내부 키 | [웹 환경](../deploy/env/web.env.example) |
| `/etc/monkeybot/bot.env` | Discord 봇 토큰·앱 ID·선택 길드, 공유 내부 키 | [봇 환경](../deploy/env/bot.env.example) |
| `/etc/monkeybot/migration.env` | migration 소유자의 DB URL만 | [migration 환경](../deploy/env/migration.env.example) |
| `/etc/monkeybot/grafana.env` | Grafana 관리자 계정과 비밀번호. 32자 이상 난수를 사용 | [Grafana 환경](../deploy/env/grafana.env.example) |

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

### 기존 환경 복구 자료

활성 환경은 `/etc/monkeybot`이다. `.env.old`는 과거 앱 설정이므로 복사해 덮어쓰지 않는다. Discord 개발자 포털에 등록한 운영 callback은 `https://monkeybot.lol/auth/discord/callback`이다. 과거 KR 플랫폼 상태 요청의 403은 키 폐기의 근거가 아니다. 키 유효성은 사용자가 별도로 확인했으며, 개별 Riot 경로의 운영 접근 결과와 구분한다.

환경 파일·SSH 설정의 변경 전 보관본은 `/var/backups/monkeybot/environment-<UTC시각>/`에 두고 `/opt/monkeybot/.env-backup-path`에서 위치를 확인한다. 구 프로젝트의 설정·로그·볼륨 복구 자료는 `/var/backups/monkeybot/legacy-cleanup-20261116T085522Z`의 `cleanup-report.json`, `final-checksums.json`, `legacy-files-manifest.json`을 따른다. 보관본에는 비밀 값과 사용자 자료가 있으므로 디렉터리 0700·파일 0600을 유지한다.

## 실행 전제

- `package.json`의 Node 엔진은 `^22.17.0 || >=24.0.0`, pnpm은 `10.20.0`이다. 새 CI와 격리 배포 검사는 실제 확인한 Node 24 계열을 사용한다.
- 아래 단독 실행 예제는 systemd와 nginx를 설치한 Linux, 같은 호스트의 웹·봇을 전제로 한다. DB는 별도 관리한 PostgreSQL 17 이상이다. 신규 Compose 운영의 경로·네트워크는 위 절차를 따른다.
- 예시 설치 경로 `/srv/monkeybot/current`, 실행 사용자/그룹 `monkeybot`, Node 경로 `/usr/bin/node`, 도메인 `monkeybot.example`을 실제 환경에 맞춰 바꾼다. `.example`은 운영 주소가 아니다.
- 애플리케이션의 `node_modules`와 각 빌드 결과가 필요하다. 빌드 디렉터리만 복사해 Node 의존성이 모두 포함됐다고 가정하지 않는다.
- 실제 인증서 발급·갱신 방식, 방화벽·DNS, DB 접속 계정과 TLS, 백업 저장 위치·암호화·보존 기간·복구 목표는 운영 환경에서 정한다. 예제 검증에는 이 값들이 필요하지 않다.

## 최초 서비스 운영자 지정

서비스 운영 권한은 Discord 서버 관리 권한과 별개다. 대상 사용자가 서비스에 한 번 로그인하고 현재 migration을 적용한 뒤, 웹의 DB 설정을 읽을 수 있는 서버에서 `pnpm admin:bootstrap <기존 Discord 사용자 ID>`를 실행한다. 도움말은 `pnpm admin:bootstrap --help`다. 운영자가0명일 때만 한 명을 지정하고 감사 이력을 함께 저장한다. 환경 변수로 임의 사용자를 자동 승격하지 않는다.

운영자가 이미 있으면 백오피스에서 다른 운영자를 지정하거나 회수한다. 실제 DB 권한을 매번 검사하며 마지막 운영자의 회수는 거절한다. 자기 권한을 회수하면 기존 세션도 다음 요청부터 백오피스 접근을 잃는다.

## 저장소 CI

[ci.yml](../.github/workflows/ci.yml)은 **dev push**에서 Ubuntu 24.04·Node 24·pnpm 10.20.0으로 검사하고 GHCR에 이미지를 발행한다. main은 아래 CD의 배포 트리거다. CI에는 저장소 읽기와 GHCR 발행에 필요한 `packages: write`만 부여한다. 운영 서버 접속·명령 등록·실제 봇 기동은 하지 않는다.

잠금 파일로 의존성을 한 번 설치한 뒤 같은 러너에서 `pnpm check`와 `pnpm test`를 병렬 실행한다. `check`는 포맷·브랜딩·웹/봇 타입을, `test`는 DB 없이 실행하는 기본 웹·봇 단위 테스트를 검사한다. 두 명령이 모두 성공해야 공통 이미지 빌드·GHCR 발행을 시작한다. 병렬화 효과는 별도 실행 없이 변경 전후 정상 dev push 각 5회의 검사 시작부터 이미지 발행 완료까지 걸린 시간의 중앙값으로 비교한다.

CI에는 PostgreSQL 서비스·Chromium 설치·테스트 타입 검사·DB/HTTP 통합·브라우저·환경 분리·이미지 기동 검사를 넣지 않는다. 필요한 통합 검사는 개발자가 기존 `pnpm test:hard`, `pnpm test:browser`, 아래 격리 배포 도구로 별도 실행한다. 운영 DB 접속 정보·Discord/Riot 자격 증명·배포 키도 CI에 전달하지 않는다. 원격 Actions 통과 여부는 해당 push의 실제 실행 결과로 확인한다.

### 공통 앱 이미지

[Dockerfile](../Dockerfile)은 잠금 파일로 의존성을 설치하고 웹·봇을 함께 빌드한다. Node 24의 고정 digest를 사용하고 최종 컨테이너는 `node` 사용자로 실행한다. 웹·봇·migration은 같은 이미지에서 서로 다른 명령과 환경으로 실행하며 Drizzle Kit와 pnpm workspace 의존성 구조를 유지한다.

CI는 검증된 커밋을 한 번 빌드해 `ghcr.io/longcat2957/monkeyscrimmanager2:<커밋 SHA>`와 `:dev`로 발행한다. GHCR 로그인에는 Actions의 기본 `GITHUB_TOKEN`을 사용한다. `:dev`는 개발용이며 운영 배포 대상을 선택하는 데 사용하지 않는다.

Compose의 이미지 설정은 `MSM2_APP_IMAGE` 하나다. 실제 서비스 비밀 값은 기존 VPS 환경 파일에서 읽는다.

## main 배포

[cd.yml](../.github/workflows/cd.yml)은 **main push**에서 `production` Environment의 SSH 설정으로 VPS에 배포한다. dev CI가 성공한 커밋으로 main을 fast-forward한다. 별도 merge·squash 커밋을 만들면 SHA가 달라져 해당 이미지가 없으므로 배포되지 않는다. CD는 재빌드하거나 CI 검사를 반복하지 않으며 진행 중인 배포를 취소하지 않는다.

`monkeybot.lol`의 A 레코드는 VPS `141.164.46.191`을 가리키고 Cloudflare 프록시는 **DNS only**로 둔다. 권한 DNS는 Cloudflare에 유지하고 HTTP 프록시 경유만 해제한다. AAAA는 VPS에서 실제로 서비스하는 공개 IPv6가 있을 때만 유지한다. Caddy에 도메인과 외부 80·443 접근을 제공하면 공인 인증서를 자동 발급·갱신한다. DNS only에서는 Cloudflare SSL/TLS 모드가 브라우저와 VPS 사이의 TLS를 처리하지 않으며 Cloudflare Origin CA 인증서를 직접 서비스하지 않는다. 기존 프록시 상태에서 전환할 때는 공인 인증서 준비를 확인하고 DNS를 변경한다. [Caddy 자동 HTTPS](https://caddyserver.com/docs/automatic-https), [Cloudflare 프록시 상태](https://developers.cloudflare.com/dns/proxy-status/)

Discord 앱은 멤버 동기화에 필요한 **Server Members Intent**를 활성화한다. [Discord 앱 설정](https://discord.com/developers/docs/resources/application#edit-current-application)

1. Compose·Caddy 설정과 [deploy.sh](../deploy/deploy.sh)를 임시 디렉터리로 전송한다.
2. Actions의 `GITHUB_TOKEN`으로 GHCR에 로그인해 main 커밋 SHA 태그를 받는다. 이미지가 없거나 받은 digest의 revision 라벨이 해당 SHA와 다르면 백업·설정 변경 전에 중단한다. 일치하면 같은 digest를 웹·봇·migration에 고정한다.
3. `/var/backups/monkeybot/release-<UTC시각>-…`에 기존 Compose·프록시 설정과 `msm2_main` custom dump·SHA256을 보관한다. 백업 검사가 실패하면 배포를 중단한다.
4. migration 성공·웹/봇 healthy를 기다리고 Caddy 설정을 검사한다. 최초 전환에서는 기존 nginx를 중지해 80·443을 넘긴 뒤 Caddy를 올린다. 전환이 실패하면 Caddy를 중지하고 이전 nginx를 다시 시작하며 성공한 뒤 이전 nginx 컨테이너를 제거한다.
5. Caddy를 reload하고 인증서 검증을 켠 VPS 직접 HTTPS와 공개 `/docs`의 HTTP 200을 확인한다. 리다이렉트 응답이나 인증서 검증 생략은 배포 성공으로 처리하지 않는다.

VPS에서는 빌드·패키지 설치를 하지 않는다. 서비스 비밀 파일과 PostgreSQL 볼륨을 유지하며, 임시 전송 파일과 GHCR 인증 정보는 작업 종료 시 제거한다. [Compose up](https://docs.docker.com/reference/cli/docker/compose/up/), [GHCR 인증](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-in-a-github-actions-workflow)

실패 시 Actions와 `docker compose ps`, `docker compose logs --tail=100 caddy web bot migrate`로 상태를 확인한다. 자동 DB 복원은 하지 않는다. 이전 앱으로 돌아가려면 백업된 `.env`·Compose·프록시 설정을 복구하고 `docker compose up -d --wait`를 실행한다. nginx 구성으로 돌아가는 경우 Caddy를 먼저 중지해 포트 충돌을 피한다. DNS only에서 브라우저가 신뢰하지 않는 과거 Origin CA 인증서를 그대로 쓰지 않는다. 이미 적용한 migration과 이전 앱의 호환성을 확인하며 DB 복원이 필요하면 보관된 dump를 별도 빈 DB에 복원해 전환한다.

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

단독 운영에 적용할 때에는 환경 파일·릴리스와 migration을 먼저 준비하고 `systemd-analyze verify`·`nginx -t`를 실행한다. 웹의 공개 화면과 내부 접근 차단을 확인한 뒤 봇을 시작한다. **봇을 시작하면 실제 Discord에 연결되고 대기 중인 게시물이 발송될 수 있다.** 격리 검증에서는 기동하지 않는다. 장애 때는 `journalctl -u monkeybot-web`, `journalctl -u monkeybot-bot`와 백오피스 상태를 확인하고 비밀 값이나 메시지 본문을 복사하지 않는다.

## HTTPS 프록시

운영 Compose는 [Caddyfile](../deploy/caddy/Caddyfile)과 [앱 프록시](../deploy/caddy/application.caddy)를 사용한다. 도메인을 지정하면 HTTP는 HTTPS로 308 이동하고 인증서는 자동으로 관리한다. `/internal`·`/internal/…`과 `/metrics`는 외부에서 404이며 봇은 Compose 내부의 웹 주소로 접근한다. 요청 본문은 70MiB로 제한하고 프록시가 본문을 파일에 버퍼링하지 않는다. 웹의 `BODY_SIZE_LIMIT=70M`과 파일 자체 64MiB 제한도 유지한다.

Caddy는 외부에서 받은 전달 헤더를 그대로 신뢰하지 않고 실제 연결의 HTTPS 정보를 웹에 제공한다. 웹 포트는 공개하지 않으며 adapter-node의 `PROTOCOL_HEADER=x-forwarded-proto`를 유지한다. Caddy의 접근 로그는 켜지 않고 OAuth callback의 query가 오류 로그에 남지 않도록 처리한다. 인증서·ACME 자료가 있는 영속 볼륨을 백업·복구 대상에 포함하고 `docker compose down -v`로 지우지 않는다. [Caddy Docker 운영](https://caddyserver.com/docs/running#docker-compose), [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

### 기존 nginx 단독 실행 예제

아래는 현재 Compose와 별개인 단독 실행·격리 검증 경로다.

[사이트 예제](../deploy/nginx.conf.example)는 nginx `http` 문맥의 sites-enabled에 포함한다. 예제의 도메인과 인증서 두 경로를 바꾸고, [내부 차단·프록시 조각](../deploy/nginx-internal.conf.example)을 `/etc/nginx/snippets/monkeybot-internal.conf`에 설치한다. HTTP는 지정 도메인의 HTTPS로 이동하며 `/internal`·`/internal/…`과 `/metrics`는 외부에서 404다. 단독 nginx 실행에는 Prometheus·Grafana가 포함되지 않는다.

nginx의 업로드 제한은 `70m`, 연결/송신/응답 대기는 각각 5/60/60초다. `proxy_request_buffering off`와 HTTP/1.1로 업로드 본문을 프록시 임시 파일에 쓰지 않고 앱으로 전달한다. 프록시 시간 제한과 별도로 아래 앱 제한이 실제 SQL·본문 읽기·파싱을 중단한다. 헤더는 nginx가 덮어쓰고 adapter-node에는 `PROTOCOL_HEADER`를 함께 설정한다.

OAuth callback의 code/state가 접근 로그에 남지 않게 이 사이트의 access log를 끈다. callback 경로는 upstream 장애의 error log도 끄며, 다른 nginx error log는 접근 제한한 운영 로그로 취급한다. 앱은 아래 요청 요약을 stdout/journal로 남기며 새 상태 API는 추가하지 않는다.

인증서 발급·갱신과 실제 서버의 TLS·방화벽·도메인 점검은 운영 환경에서 수행한다. 검증 도구의 하루짜리 자체 서명 인증서를 운영 인증서로 사용하지 않는다.

## 경매 Riot 조회

`0021_riot_auction_cache` 다음에 `0022_auction_source_retries`를 적용한다. 기존 작업의 선점·대기 시각과 전적은 보존한다. 플랫폼이 실제로 바뀌면 같은 트랜잭션에서 이전 지역의 랭크·시즌 최고·경기 자료를 폐기한다.

앱 배포 전에 DB 마이그레이션을 적용한다. 운영 웹 프로세스가 기존 `RIOT_API_KEY`로 작업을 처리하며, 봇·브라우저에 키를 전달하지 않는다. 이전 내전 전체를 일괄 조회하지 않는다. 배포 후 새 모집을 마감해 경매를 시작할 수 있는지 먼저 확인하고, 현재 랭크와 최근 경기 집계가 비동기로 표시되는지 확인한다. Riot의 429는 모집 장애가 아니며 `Retry-After` 동안 기다린다. 한 키를 여러 웹 프로세스에서 쓰면 프로세스별 호출 예산은 공유되지 않는다. 운영은 현재의 단일 웹 프로세스를 기준으로 한다.

워커는 `riot_auction_job` 뒤에 결과(`deferred`·`retry`·`stopped`), 자료(`platform`·`rank`·`match`), 오류 코드를 기록한다. `deferred`는 호출 예산이나 동시 요청 제한 대기이며 실패 횟수를 늘리지 않는다. `stopped rank`와 `stopped match`는 해당 자료만 중단하지만 플랫폼 확인이 중단되면 두 자료를 조회할 수 없다. 계정 식별자 없이 예약 상태를 확인하려면 `SELECT rank_due_at, match_due_at, available_at FROM riot_auction_jobs ORDER BY available_at;`를 사용한다.

관측 최고값은 [지역별 Riot 시즌 일정](../apps/web/src/lib/server/riot/auction-season.ts)에만 귀속한다. 새 시즌의 시작·종료가 발표되면 해당 일정과 경계 테스트를 함께 갱신한다. 확인하지 못한 기간에는 현재 등급만 갱신하고 최고값을 다른 시즌에서 가져오지 않는다.

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

요청마다 서버가 UUID를 만들고 `X-Request-ID`로 반환한다. JSON 로그에는 `event`, `requestId`, manifest의 `route` 템플릿, `kind`, 허용된 `method`, `status`, 허용된 오류 `code`, 전체 `durationMs`, `phases.sessionMs`·`accessMs`, `db.count`·`totalMs`·`maxMs`·`waitMs`·`slow`, `upstream.<target>.count`·`totalMs`·`maxMs`만 기록한다. `kind`는 `page`, `data`, `action`, `api`, `internal`, `unmatched` 중 하나다. 요청 본문·쿠키·토큰·Riot ID·원본 파일·실행자 ID·실제 경로/URL query·원시 SQL/예외 객체는 기록하지 않는다. 부분 실패도 코드만 기록하고 SvelteKit의 기본 원시 오류 출력은 대체한다. 풀의 대기 요청은 connect 호출 당시 문맥에 연결해 다른 요청에 오류를 잘못 귀속하지 않는다.

200ms 이상 SQL은 `event=db_slow`로 별도 기록하며 SQL 원문과 매개변수 대신 SHA-256 앞 12자리 `fingerprint`만 남긴다. 같은 fingerprint의 반복은 같은 쿼리 형태를 뜻한다. HTTP 요청과 위 시간 값은 같은 요청 문맥에서 계산해 Prometheus 메트릭으로도 누적한다.

`durationMs`는 서버가 응답 객체를 만들 때까지의 시간이며 브라우저의 전체 전송 시간이나 CWV가 아니다. `phases`와 `db`·`upstream` 시간은 전체 안의 구성 요소이며 서로 합산해 전체와 정확히 일치한다고 가정하지 않는다. 실제 트래픽에서 DB 잠금·쿼리 시간, 업로드 동시성·메모리, Discord 재시도 대기를 점검해 한도를 조정한다. 운영 로그의 접근 권한·회전·보존과 알림은 배포 환경에서 확인한다. 격리 기능 검사는 서버 부하 검증을 대신하지 않는다.

## DB migration과 백업·복원

웹 기동은 migration을 실행하지 않는다. Compose 배포의 일회성 `migrate` 서비스가 검토한 Drizzle journal 순서로 적용한다. 단독 실행에서도 런타임 계정이 아닌 전용 migration 계정을 사용한다. 운영 DB는 보호된 백업과 별도 빈 DB의 복원 근거를 먼저 확보하고 쓰기 중지·전환 시간을 정한다. 다음 단독 실행 명령의 작업 디렉터리는 `apps/web`이다.

```sh
node --env-file=/etc/monkeybot/migration.env node_modules/drizzle-kit/bin.cjs migrate
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

dump에는 사용자 식별 정보·세션 해시·서비스 자료가 포함될 수 있다. 접근을 제한하고 Git·CI artifact에 올리지 않는다. [개인정보 처리방침](../apps/web/src/routes/(site)/privacy/+page.svelte)에 따라 운영팀은 복구용 백업과 외부 복사본의 생성일·보관 위치를 관리하고 생성 후 30일 이내에 dump와 검증 파일을 함께 폐기한다. 도구는 보관 일정이나 자동 삭제를 실행하지 않는다. 강제 종료로 남은 파일은 소유권과 완료 여부를 확인해 개별 처리한다.

복원 후에는 행·FK·sequence·migration 상태와 대표 업무 결과를 확인한다. 백업 시점 이후의 개인정보 삭제·비공개 변경을 재반영한 뒤 새 DB로 앱을 전환한다. 실패하면 기존 데이터/릴리스를 보존한 상태로 원인을 확인한다. 이미 적용한 migration을 수정하거나 앱 시작 시 초기화하지 않는다. 구버전 코드로 돌아갈 때도 변경된 schema와의 호환성을 먼저 검토한다.

## 격리된 로컬 배포 검사

이 도구는 기존 systemd·nginx 예제를 검사한다. 현재 Caddy Compose 설정이나 공인 인증서 발급·갱신의 검증으로 합산하지 않는다.

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

이 검사는 배포 도구의 격리 실행이지 운영 복구 훈련이 아니다. 릴리스마다 실제 CI·CD 실행, DNS와 공인 TLS, DB 백업과 별도 빈 DB 복원·권한·전환 절차를 확인한다. 실제 OAuth·Riot·Discord 송수신과 League 원본 파일을 사용하는 사용자 흐름은 [테스트 경계](testing.md#검증-경계)에 따라 별도로 확인한다.

## 근거

- [GitHub PostgreSQL 서비스](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [setup-node](https://github.com/actions/setup-node), [pnpm setup](https://github.com/pnpm/action-setup)
- [nginx proxy_request_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_request_buffering)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html), [statement·transaction timeout](https://www.postgresql.org/docs/17/runtime-config-client.html)
- [Prometheus exposition formats](https://prometheus.io/docs/instrumenting/exposition_formats/), [Prometheus configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/), [Grafana provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [pg Client 설정](https://node-postgres.com/apis/client), [Node 24 worker 종료](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate), [SvelteKit hooks](https://svelte.dev/docs/kit/hooks)
- 설치된 `@sveltejs/adapter-node/src/handler.js`, `src/index.js`, `index.js`와 기존 `apps/web/tests/api/support/http-child.mjs`의 실제 헤더·종료 계약
