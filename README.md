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

기본 개발 주소는 `http://localhost:5173`이다. 현재 페이지는 공통 레이아웃과 제목만 갖춘 상태다.

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
서비스 도메인과 문서·이용약관·개인정보 처리방침을 제공한다. 정책·문서 링크는 같은 탭에서
내부 `/docs`, `/terms`, `/privacy` 페이지로 이동한다. 각 페이지의 본문은 아직 작성하지 않았다.
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

## Riot API

Riot API 키는 **`apps/web/.env`**의 `RIOT_API_KEY`에 입력한다.
새 환경에서는 [환경 변수 예제](apps/web/.env.example)를 복사해 사용한다.

```sh
cp apps/web/.env.example apps/web/.env
```

```dotenv
RIOT_API_KEY=
RIOT_ACCOUNT_REGION=asia
RIOT_PLATFORM=kr
RIOT_API_TIMEOUT_MS=10000
```

`RIOT_ACCOUNT_REGION`은 계정 조회 지역, `RIOT_PLATFORM`은 프로필·개인 랭크를 조회할 LoL 플랫폼이다.
한국 계정은 위 기본값을 사용한다. `RIOT_API_TIMEOUT_MS`는 요청 제한 시간이며
기본값은 10초, 허용 범위는 1–60000ms다. 기존 `.env`에는 키가 있으면 충분하며 나머지는 기본값을 사용한다.

프로젝트 루트에서 `pnpm dev`로 실행한다. 값을 변경하면 개발 서버를 재시작한다.
`pnpm start`도 `apps/web/.env`를 읽으며, 운영 환경에서는 서비스 관리자가 환경 변수를 주입할 수 있다.
키는 서버에서만 사용하고 `.env`는 Git에서 제외한다. `pnpm check`와 `pnpm build`에는 키가 필요하지 않다.

현재 서비스의 계정·참가자 정보와 화면 표시에 필요한 **Riot 조회 5개, Data Dragon 2개 라우트 패턴**을 제공한다.

| 구분 | 지원 범위 |
| --- | --- |
| Riot 조회 | Riot ID·PUUID·활성 지역, 참가자 프로필·개인 랭크 |
| Data Dragon | 버전 목록, 챔피언·아이템·룬·소환사 주문·프로필 아이콘 카탈로그 및 이미지 URL 생성 |

각 경로의 사용 목적·파라미터·응답·제약은 [Riot API 연동 문서](docs/riot-api.md)에 정리했다.
외부 API는 현재 기능에서 사용할 근거가 있을 때만 추가한다. 화면·봇 연결과 사용자 계정 저장은 아직 구현하지 않았다.

공통 요청 처리는 `apps/web/src/lib/server/riot/transport.ts`, 환경 변수 연결은 `client.ts`,
계정 조회는 `account.ts`, LoL 조회는 `lol/`의 각 모듈이 담당한다.
HTTP 경로와 웹 서버 내부의 호출은 동일한 조회 함수를 사용한다.

현재 조회 API에는 사용자 인증을 적용하지 않았다. 웹 서버 프로세스당 Riot 요청은 최대 8개를 동시에 처리하고,
`429` 응답을 받으면 `Retry-After`에 따라 해당 호스트의 후속 요청을 일시 중단한다.
Riot 응답 캐시와 자동 재시도는 적용하지 않았다. Data Dragon은 API 키 없이 별도로 요청하며,
버전 목록은 5분, 버전별 정적 데이터는 24시간 캐시한다.

Riot 요청 처리 테스트는 실제 키와 외부 API 호출 없이 실행한다.

```sh
pnpm --filter @msm2/web test
```

## ROFL 분석

ROFL2 메타데이터·청크·패킷 경계를 읽는 자체 서버 파서와 로컬 명령을 제공한다.
경기 시간·참가자·챔피언·팀·승패·KDA·CS를 요약하고, 전체 원본 필드와 미해석 패킷도 보존한다.
외부 ROFL 라이브러리 없이 Node.js 기본 Zstd를 사용한다.

```sh
pnpm --silent rofl:inspect /path/to/replay.rofl
pnpm --silent rofl:research samples/replay.rofl samples/replay-research
```

`rofl:research`는 새 디렉터리에 원본 사본·전체 메타데이터·압축 해제 청크·패킷 인덱스·분석 보고서를 만든다.
패킷의 시각·ID·본문 위치를 추출하며, 킬·이동 등 본문의 의미 해석은 아직 검증하지 않았다.
현재는 파일 분석 단계이며 업로드·경기 등록·DB 저장은 구현하지 않았다.
로컬 원본·분석 결과는 Git에서 제외되는 프로젝트 루트 `samples/`에 둔다.
명령과 출력 형식은 [ROFL 분석 문서](docs/rofl.md), 실측 결과와 후속 과제는 [연구 기록](docs/rofl-research.md)을 따른다.

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
