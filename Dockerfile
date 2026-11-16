ARG NODE_IMAGE=node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/bot/package.json apps/bot/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS build
COPY . .
RUN pnpm rebuild esbuild && pnpm build

# 같은 이미지를 웹·봇·일회성 migration 컨테이너가 각 명령으로 실행한다.
# Drizzle Kit를 포함한 workspace 의존성 경로를 유지해 별도 패키징을 줄인다.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ARG REVISION=local
LABEL org.opencontainers.image.source="https://github.com/Longcat2957/MonkeyScrimManager2" \
    org.opencontainers.image.title="Monkeybot" \
    org.opencontainers.image.revision="${REVISION}"
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/shared ./shared
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "build/index.js"]
