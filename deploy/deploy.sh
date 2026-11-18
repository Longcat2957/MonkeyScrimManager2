#!/usr/bin/env bash
set -euo pipefail
umask 077

deploy_dir=${1:?배포 경로가 필요합니다}
image=${2:?CI 이미지가 필요합니다}
registry_user=${3:?GHCR 사용자가 필요합니다}
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd -- "$deploy_dir"
test -f .env
exec 9>.deploy.lock
flock -n 9

# Actions의 일회용 토큰은 임시 Docker 설정에서만 사용한다.
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
legacy_proxies=()
proxy_cutover=false
deployment_complete=false
cleanup() {
    status=$?
    trap - EXIT
    # 최초 프록시 이관이 실패하면 포트를 반환하고 기존 nginx를 다시 기동한다.
    if [[ "$proxy_cutover" == true && "$deployment_complete" != true ]]; then
        docker compose stop caddy || true
        docker start "${legacy_proxies[@]}" || true
        printf 'Caddy 이관 실패: 기존 nginx를 다시 기동했습니다. 백업: %s\n' "$backup_dir" >&2
    fi
    rm -rf -- "$DOCKER_CONFIG"
    exit "$status"
}
trap cleanup EXIT
docker login ghcr.io --username "$registry_user" --password-stdin
docker pull "$image"
resolved_image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$resolved_image")
if [[ ! "$revision" =~ ^[0-9a-f]{40}$ || "${image##*:}" != "$revision" ]]; then
    printf '배포 중단: 요청 이미지 %s와 이미지 revision %s가 일치하지 않습니다.\n' "$image" "$revision" >&2
    exit 1
fi

backup_dir=$(mktemp -d /var/backups/monkeybot/release-"$(date -u +%Y%m%dT%H%M%SZ)"-XXXXXX)
for path in .env compose.yml compose.app.yml deploy.sh nginx caddy; do
    if [[ -e "$path" ]]; then cp -a "$path" "$backup_dir/"; fi
done
docker compose -f compose.yml exec -T postgres sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d msm2_main -Fc --no-owner --no-acl' > "$backup_dir/database.dump.part"
mv "$backup_dir/database.dump.part" "$backup_dir/database.dump"
docker compose -f compose.yml exec -T postgres pg_restore --list < "$backup_dir/database.dump" > /dev/null
(cd "$backup_dir" && sha256sum database.dump > database.dump.sha256)
printf '배포 전 백업: %s\n' "$backup_dir"

if [[ "$source_dir" != "$deploy_dir" ]]; then
    cp "$source_dir/compose.yml" "$source_dir/compose.app.yml" "$source_dir/deploy.sh" .
    mkdir -p caddy
    cp -a "$source_dir/caddy/." caddy/
fi
# 운영 비밀 파일을 읽거나 변경하지 않고 Compose의 실행 파일·이미지만 갱신한다.
python3 - "$resolved_image" <<'PY'
import os, pathlib, sys
path = pathlib.Path('.env')
keys = {'COMPOSE_FILE', 'MSM2_APP_IMAGE', 'MSM2_WEB_IMAGE', 'MSM2_BOT_IMAGE', 'MSM2_MIGRATE_IMAGE', 'MSM2_MIGRATION_IMAGE'}
lines = [line for line in path.read_text().splitlines() if line.split('=', 1)[0] not in keys]
lines += ['COMPOSE_FILE=compose.yml:compose.app.yml', 'MSM2_APP_IMAGE=' + sys.argv[1]]
temporary = path.with_name('.env.next')
temporary.write_text('\n'.join(lines) + '\n')
temporary.chmod(0o600)
os.replace(temporary, path)
PY
docker compose config --quiet
docker compose pull caddy
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# 앱과 migration을 먼저 준비하여 최초 nginx→Caddy 전환의 포트 중단을 줄인다.
docker compose up -d --wait --wait-timeout 180 web bot
mapfile -t legacy_proxies < <(docker ps -q \
    --filter label=com.docker.compose.project=monkeybot \
    --filter label=com.docker.compose.service=nginx)
if [[ ${#legacy_proxies[@]} -gt 0 ]]; then
    proxy_cutover=true
    docker stop --time 15 "${legacy_proxies[@]}"
fi
docker compose up -d --no-deps --wait --wait-timeout 60 caddy
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
# 자동 인증서의 최초 발급을 기다리며 Cloudflare와 별도로 원본 TLS도 검증한다.
http_status=$(curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-max-time 90 --retry-all-errors \
    --connect-timeout 3 --max-time 10 --resolve monkeybot.lol:443:127.0.0.1 \
    --output /dev/null --write-out '%{http_code}' https://monkeybot.lol/docs)
if [[ "$http_status" != 200 ]]; then
    printf '원본 /docs 응답: HTTP %s (200 필요)\n' "$http_status" >&2
    exit 1
fi
http_status=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 --output /dev/null --write-out '%{http_code}' https://monkeybot.lol/docs)
if [[ "$http_status" != 200 ]]; then
    printf '공개 /docs 응답: HTTP %s (200 필요)\n' "$http_status" >&2
    exit 1
fi
for path in /internal /internal/; do
    http_status=$(curl --silent --show-error --connect-timeout 3 --max-time 10 \
        --resolve monkeybot.lol:443:127.0.0.1 --output /dev/null --write-out '%{http_code}' "https://monkeybot.lol$path")
    if [[ "$http_status" != 404 ]]; then
        printf '비공개 경로 %s 응답: HTTP %s (404 필요)\n' "$path" "$http_status" >&2
        exit 1
    fi
done
deployment_complete=true
if [[ ${#legacy_proxies[@]} -gt 0 ]]; then docker rm "${legacy_proxies[@]}"; fi
printf '배포 완료: %s (%s)\n' "$resolved_image" "$revision"
docker compose ps
