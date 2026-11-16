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
trap 'rm -rf -- "$DOCKER_CONFIG"' EXIT
docker login ghcr.io --username "$registry_user" --password-stdin
docker pull "$image"
resolved_image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$image")
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")

backup_dir=$(mktemp -d /var/backups/monkeybot/release-"$(date -u +%Y%m%dT%H%M%SZ)"-XXXXXX)
cp -a .env compose.yml compose.app.yml nginx "$backup_dir/"
if [[ -f deploy.sh ]]; then cp -a deploy.sh "$backup_dir/"; fi
docker compose -f compose.yml exec -T postgres sh -c \
    'exec pg_dump -U "$POSTGRES_USER" -d msm2_main -Fc --no-owner --no-acl' > "$backup_dir/database.dump.part"
mv "$backup_dir/database.dump.part" "$backup_dir/database.dump"
docker compose -f compose.yml exec -T postgres pg_restore --list < "$backup_dir/database.dump" > /dev/null
(cd "$backup_dir" && sha256sum database.dump > database.dump.sha256)
printf '배포 전 백업: %s\n' "$backup_dir"

if [[ "$source_dir" != "$deploy_dir" ]]; then
    cp "$source_dir/compose.yml" "$source_dir/compose.app.yml" "$source_dir/deploy.sh" .
    cp -a "$source_dir/nginx/." nginx/
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
docker compose up -d --wait --wait-timeout 180
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 --output /dev/null https://monkeybot.lol/docs
printf '배포 완료: %s (%s)\n' "$resolved_image" "$revision"
docker compose ps
