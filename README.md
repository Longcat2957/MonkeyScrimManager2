# MonkeyScrimManager2

프로젝트명은 `MonkeyScrimManager2`(`MSM2`), 사용자에게 표시하는 서비스명은 **`Monkeybot`**이다.
화면·브라우저 제목·메타데이터·봇 메시지에는 정확히 `Monkeybot`을 사용한다.

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
| `apps/web/src/routes/+layout.svelte` | 공통 헤더 연결·본문 컨테이너 및 전역 CSS 로딩 |
| `apps/web/src/lib/components/layout/AppHeader.svelte` | 상단 내비게이션·모바일 메뉴·화면 모드 전환 |
| `apps/web/src/lib/components/layout/AppFooter.svelte` | 서비스 도메인·정책·문서 링크를 담은 공통 푸터 |
| `apps/web/src/hooks.server.ts` | 요청별 인증·권한 검사를 연결할 서버 훅 |
| `apps/web/src/lib/branding.ts` | 화면 표시명 `SERVICE_NAME`과 서비스·저장소 URL의 공통 정의 |
| `apps/web/src/routes/layout.css` | Tailwind CSS, STDF 소스와 전역 Slate 테마 |
| `apps/web/src/routes/+page.svelte` | `/` 첫 페이지 |
| `apps/web/vite.config.ts` | SvelteKit, Tailwind CSS, Node 어댑터 설정 |
| `apps/web/build/index.js` | `pnpm build`로 생성되는 운영 서버 진입점 |
| `apps/bot/src/index.ts` | Discord 봇 진입점 |
| `apps/bot/dist/index.js` | `pnpm build:bot`으로 생성되는 봇 운영 진입점 |

`deploy/`의 배포 설정은 아직 없으며 구체적인 운영 요구사항을 정한 뒤 추가한다.

## 웹 공통 구조

웹의 서비스명은 `#lib/branding.ts`에서 가져온 `SERVICE_NAME`을 사용한다.
프로젝트명과 서비스명 사용 규칙은 [AGENTS.md](AGENTS.md)의 Naming and Branding을 따른다.
`pnpm check:branding`은 웹 `.svelte`·`.html`의 프로젝트명·잘못된 표기·표시명 직접 작성을 검사하며,
`pnpm check`에도 포함된다.

루트 레이아웃은 공통 화면 영역을 담당하고 각 페이지는 본문 콘텐츠만 작성한다.
상단에는 64px 높이의 sticky 헤더를 두고, 본문은 최대 84rem의 중앙 영역과 좌우 경계선으로 구분한다.
본문과 푸터는 공통 `app-frame`으로 폭과 세로 경계선을 맞춘다. 짧은 페이지에서는 푸터가 화면 하단에,
긴 페이지에서는 콘텐츠 다음에 배치된다.
헤더에는 홈·GitHub 링크를 제공하며, 1024px 미만에서는 접을 수 있는 모바일 메뉴를 사용한다.
푸터는 [MSM1 푸터](https://github.com/Longcat2957/MonkeyScrimManager/blob/8847ac77b5d939c683099f381386a242fe764517/apps/web/src/lib/components/layout/AppFooter.svelte)를 참고해
서비스 도메인과 문서·이용약관·개인정보 처리방침을 제공한다. 정책·문서 링크는 `SERVICE_URL`을 기준으로
기존 서비스의 `https://monkeybot.lol/docs`, `/terms`, `/privacy` 주소에 연결한다.
푸터는 워드마크·도메인·정책 링크를 적은 여백으로 배치한 간결한 구성이다.
경계선은 `layout.css`의 공통 `--color-border`·`--color-border-strong` 토큰으로 관리한다.
배치와 얇은 경계선은 [STDF 헤더](https://github.com/any-tdf/any-tdf/blob/main/apps/stdf-site/src/lib/header/Header.svelte)와
[공통 스타일](https://github.com/any-tdf/any-tdf/blob/main/apps/site-common/assets/styles.css)을 참고했다.

서버 훅은 `인증 정보 복원 → 권한 검사 → resolve(event)` 순서의 틀만 두었다.
현재는 모든 요청을 그대로 통과시키며, 인증 방식·역할·세션·접근 정책은 미구현이다.
이후 인증 정보를 `event.locals`에 전달하고 실제 권한은 서버에서 검사한다.
레이아웃에서 메뉴를 표시하거나 숨기는 것은 접근 권한 검사를 대신하지 않는다.

전역 색상은 [STDF 단일 테마 설정](https://github.com/any-tdf/any-tdf/blob/main/content/stdf/guide/theme_en.md)에 맞춰
`layout.css`의 `@theme`에서 관리한다. 그레이·슬레이트 계열의 강조색·배경·본문 색상과
라이트·다크 토큰을 정의했으며 기본 모드는 `html[data-mode="primary"]`다.
다크 모드는 STDF의 `switchMode('dark')` 또는 `data-mode="dark"`로 적용할 수 있다.
헤더의 모드 버튼으로 라이트·다크 모드를 전환할 수 있으며, 선택은 저장하지 않는다.

`static/brand/favicon.png`와 `logo.png`는
[MSM1 원본 에셋](https://github.com/Longcat2957/MonkeyScrimManager/tree/8847ac77b5d939c683099f381386a242fe764517/apps/web/static/brand)을
수정 없이 가져와 favicon과 공통 헤더에 연결했다.
본문·내비게이션·STDF 컨트롤은 MSM1과 동일한 `Noto Sans KR`을 사용한다. Google Fonts에서
400·500·600·700·800 굵기를 `display=swap`으로 불러오며 `@theme`의 `--font-sans`로 전역 적용한다.
`Monkeybot` 워드마크에는 Google Fonts의 `Jersey 10` regular 400을 `font-brand`로 적용한다.

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
