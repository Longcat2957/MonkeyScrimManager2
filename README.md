# MonkeyScrimManager2

**Monkeybot**은 Discord 서버의 리그 오브 레전드 내전을 운영한다. 모집·팀 편성·대진을 관리하고, ROFL에서 검증한 경기 결과로 전적과 포지션별 MMR을 갱신한다.

## 로컬 실행

Node.js 22.17 이상인 22.x 또는 24 이상과 pnpm 10.20.0을 사용한다.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

- [모집·참가자 개발 화면](http://localhost:5173/g/devGuild001/scrims/devScrim001)은 DB나 Discord 로그인 없이 디자인을 확인할 수 있다. 개발 샘플과 실제 서버 데이터는 분리한다.
- 실제 서버에 연결할 때는 [웹 환경 변수 예제](apps/web/.env.example)를 `apps/web/.env`로 복사하고 PostgreSQL·Discord·Riot 값을 설정한다. 기존 `.env`는 덮어쓰지 않는다.
- `pnpm db:migrate`는 `DATABASE_URL`이 가리키는 DB를 변경한다. 적용 대상을 먼저 확인한다. 봇 설정과 명령 등록은 [Discord 봇](docs/bot.md)을 따른다.

## 검증

```sh
pnpm check
pnpm test
pnpm build
```

`pnpm check`는 포맷·브랜딩·웹·봇 타입을 검사한다. DB·HTTP·브라우저 테스트는 별도의 `TEST_DATABASE_URL`을 사용한다. 설치와 실행 조건은 [테스트 안내](docs/testing.md)에 있다.

## 문서

| 찾는 내용 | 기준 문서 |
| --- | --- |
| 유지할 MSM1 규칙과 MSM2에서 바꾼 점 | [프로젝트 목적](docs/purpose.md) · [MSM1 대조](docs/backend-plan.md) |
| 웹 화면과 조작 | [웹 문서](docs/web/README.md) |
| 화면 디자인 | [Rift 원본 HTML](apps/web/.impeccable/mocks/decision/rift-tactical.html) · [자체 Svelte 컴포넌트와 Tailwind 토큰](docs/web/design-system.md) |
| SvelteKit 서버와 데이터 | [서버 구조](apps/web/src/lib/server/README.md) · [DB 관계](docs/database-erd.md) |
| 경기 결과와 점수 | [ROFL 적재 계약](docs/rofl-import.md) · [MMR](docs/mmr.md) |
| 외부 연동과 운영 | [Riot API](docs/riot-api.md) · [Discord 봇](docs/bot.md) · [배포·복구](docs/deployment.md) |
