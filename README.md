# MonkeyScrimManager2

리그 오브 레전드 내전 운영과 ROFL 기반 전적 관리를 위한 전면 재구축 프로젝트.
방향과 제약은 [프로젝트 목적](docs/purpose.md)을 따른다.

## 개발 환경

- Node.js 22.17 이상인 22.x 또는 24 이상
- pnpm 10.20.0 (`packageManager`에 고정)
- 웹: SvelteKit 3, Svelte 5, TypeScript 6, Vite 8
- 봇: discord.js 14, TypeScript 6, tsx
- 디자인 프레임워크: [STDF 3](https://stdf.dev/), Tailwind CSS 4
- 운영 서버: VPS에서 `@sveltejs/adapter-node`로 실행
- 데이터베이스: PostgreSQL 사용 예정. 연결과 스키마는 아직 구현하지 않았다.

프로젝트 루트에서 실행한다.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

기본 개발 주소는 `http://localhost:5173`이다. 첫 화면은 STDF 스타일과 버튼 동작을
확인하기 위한 개발 환경 확인 페이지다.

## 진입점

| 위치 | 역할 |
| --- | --- |
| `apps/web/src/app.html` | 공통 HTML 템플릿 |
| `apps/web/src/routes/+layout.svelte` | 공통 레이아웃 및 전역 CSS 로딩 |
| `apps/web/src/routes/layout.css` | Tailwind CSS, STDF 소스와 기본 테마 |
| `apps/web/src/routes/+page.svelte` | `/` 첫 페이지 |
| `apps/web/vite.config.ts` | SvelteKit, Tailwind CSS, Node 어댑터 설정 |
| `apps/web/build/index.js` | `pnpm build`로 생성되는 운영 서버 진입점 |
| `apps/bot/src/index.ts` | Discord 봇 진입점 |
| `apps/bot/dist/index.js` | `pnpm build:bot`으로 생성되는 봇 운영 진입점 |

`deploy/`의 배포 설정은 아직 없으며 구체적인 운영 요구사항을 정한 뒤 추가한다.

## Discord 봇

프로젝트 루트에서 환경 변수 예제를 복사한다.

```sh
cp apps/bot/.env.example apps/bot/.env
```

`apps/bot/.env`의 `DISCORD_TOKEN`에 봇 토큰을 설정한 뒤 실행한다.
환경 변수는 Node.js가 직접 읽으며, 서비스 관리자에서 주입할 수도 있다.

```sh
pnpm dev:bot
```

봇은 `Guilds` 인텐트로 로그인하고 준비 완료 시 계정 정보를 출력한다.
명령어와 내전 운영 기능은 아직 구현하지 않았다.

운영 실행은 다음과 같다.

```sh
pnpm build:bot
pnpm start:bot
```

## 검증 및 운영 실행

`pnpm check`와 `pnpm build`는 웹과 봇을 모두 검사·빌드한다.
`pnpm dev`와 `pnpm start`는 웹을 실행한다.

```sh
pnpm check
pnpm build
pnpm start
```

운영 서버의 기본 포트는 `3000`이다. VPS의 서비스 관리자에서 환경 변수를
설정하여 실행한다. 예를 들어 로컬에서 빌드 결과를 확인할 때는 다음과 같다.

```sh
HOST=127.0.0.1 PORT=3000 pnpm start
```

STDF 설정은 [공식 Quick start](https://github.com/any-tdf/any-tdf/blob/main/content/stdf/guide/quickStart_en.md)를 따른다.
