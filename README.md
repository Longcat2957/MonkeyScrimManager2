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
- 데이터베이스: PostgreSQL, Drizzle ORM + `pg`, Drizzle Kit. 연결 설정만 준비했으며 테이블은 아직 정의하지 않았다.

프로젝트 루트에서 실행한다.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

기본 개발 주소는 `http://localhost:5173`이다. 대부분의 업무 페이지는 공통 레이아웃과 제목만 갖춘 상태다.
개발 모드의 `/me`에는 목 데이터 기반 계정 연결·공개 범위 UI와 상호작용을 구현했다.

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

합의한 목표 라우트와 내비게이션은 [웹 구조 설계](docs/web/routing.md)를 따른다.
해당 문서는 구현 전 설계이며, 아래는 현재 구현된 공통 화면의 상태다.
페이지별 역할·접근 대상·필요 정보·상호작용·상태·미결정 사항은
[페이지 요구사항 색인](docs/web/page-requirements.md)과 연결된 상세 문서에서 관리한다.
기존 합의와 상호작용 초안을 구분하며, 문서에 적힌 동작이 구현 완료를 의미하지는 않는다.
[UI 배치·컴포넌트 계획](docs/web/ui-plan.md)은 전역·서버·내전 헤더의 교체 구조와
페이지별 데스크톱·모바일 배치, STDF 적용 근거를 다룬다. 실제 UI 구현과 구분한 문서 설계다.

`/me`는 본인 식별, Riot 계정 조회·연결·해제, 공개 범위 편집·저장과 작업별 오류·재시도를 개발용 목 데이터로 제공한다.
[페이지 구현](apps/web/src/routes/me/+page.svelte)과 [내 정보 배치안](docs/web/ui/global.md#2-me--내-정보),
[목 데이터·상태 미리보기 안내](apps/web/src/lib/mocks/README.md)를 참고한다.
실제 Discord 인증·계정 소유권 확인·DB 저장은 후속 작업이다. 운영 모드에서는 목 개인정보를 반환하지 않고 로그인 안내만 표시하며 개발용 `preview` 쿼리를 무시한다.

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

## PostgreSQL / Drizzle

접속 정보는 **`apps/web/.env`**의 `DATABASE_URL`에 설정한다.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

기존 `.env`는 유지하고 해당 항목만 채운다. 운영 환경에서는 서비스 관리자가 같은 환경 변수를 주입할 수 있다.
값을 바꾸면 웹 서버를 재시작한다. 합의한 테이블과 관계는 `schema.ts`에서 관리한다.

현재 로컬 개발 환경에서는 `msm2-dev` 컨테이너의 PostgreSQL 17을 사용한다.
호스트 접속 주소는 `127.0.0.1:35432`이며, MSM2 전용 DB·접속 계정 이름은 `msm2`다.
비밀번호를 포함한 접속 정보는 로컬 `.env`에만 저장한다.
현재 컨테이너는 기존 `/home/min/workspace/aibidder/compose.yaml`의 `postgres` 서비스에서 관리하며,
`container_name`을 `msm2-dev`로 설정했다. 데이터 볼륨은 기존 `aibidder_postgres_data`를 유지한다.

| 위치 | 역할 |
| --- | --- |
| `apps/web/src/lib/server/db/index.ts` | 서버 전용 `getDb()`, 프로세스별 연결 풀과 개발 HMR 재사용 |
| `apps/web/src/lib/server/db/schema.ts` | 31개 테이블과 관계, 조회·삽입 타입 정의 |
| `apps/web/drizzle.config.ts` | PostgreSQL 스키마·마이그레이션 출력 경로 설정 |
| `apps/web/drizzle/` | SQL 마이그레이션과 메타데이터의 보관 경로 |

DB는 `getDb()`를 처음 호출할 때 초기화한다. 주소 미설정 상태에서도 기존 화면·타입 검사·빌드는 가능하다.
풀은 최대 10개 연결, 연결 대기는 10초로 제한한다. 실제 연결은 쿼리 실행 시 시작한다.

스키마는 사용자·길드·Riot 계정, 초과 모집·참가 선발, 내전·팀·참가자, 경매 이력, 라운드·대진,
Match·Game, 버전별 ROFL 데이터, 포지션별 MMR과 반영 이력, 공개 범위·Discord 설정을 포함한다.
전체 관계와 주요 제약은 [DB ERD](docs/database-erd.md)에서 확인할 수 있다.
MMR의 계산 기준과 후속 반영 절차는 [MMR 저장 계약](docs/mmr.md)에 정리한다.
스키마 변경을 확정한 뒤 프로젝트 루트에서 SQL을 생성하고 내용을 검토한 다음 적용한다.

```sh
pnpm db:generate
pnpm db:migrate
```

두 명령은 `apps/web/.env`를 읽으며, 이미 설정된 프로세스 환경 변수가 우선한다.
`db:generate`는 DB 접속 없이 스키마 변경에 대한 SQL을 생성한다.
`db:migrate`는 실제 DB에 접속해 검토한 마이그레이션을 적용하는 명령이다.
생성한 SQL과 메타데이터는 Git으로 관리하고 접속 정보는 제외한다.
현재 관리하는 마이그레이션은 `0000_create_users`뿐이다. 이후 추가한 테이블과 제약은
스키마 정의 단계이며, 해당 변경의 마이그레이션 생성·DB 적용은 아직 하지 않았다.

### User

로그인은 Discord OAuth2만 사용한다. `users` 테이블의 한 행은 Discord 계정 하나에 대응하며,
조회 타입 `User`와 삽입 타입 `NewUser`를 스키마에서 추론한다.

| 필드 | 저장 내용 |
| --- | --- |
| `id` | Discord 사용자 ID 문자열, 기본키 |
| `username` | Discord 사용자명, 필수. 계정 식별이나 고유 제약에 사용하지 않음 |
| `globalName` | Discord 전역 표시 이름, 없으면 `null` |
| `avatarHash` | Discord 전역 아바타 해시, 없으면 `null` |
| `isServiceAdmin` | 전체 서비스 운영자 여부, 기본값 `false`. 길드 관리자 권한과 구분 |
| `createdAt` | 서비스 사용자 생성 시각, `timestamptz(3)`, 기본값 `now()` |
| `updatedAt` | 사용자 정보 수정 시각, `timestamptz(3)`, 기본값 `now()` |

프로필 필드는 Discord 응답의 복사본이며 서버별 닉네임·프로필과 구분한다.
`updatedAt`은 Drizzle의 수정 쿼리에서 자동 갱신한다. 직접 SQL로 수정할 때는 호출자가 함께 갱신해야 한다.
비밀번호·이메일·OAuth 토큰·길드 권한은 User에 저장하지 않는다.
사용자 한 명은 여러 `riot_accounts`를 연결할 수 있으며, 길드 소속과 관리자 권한은 `guild_members`에서 관리한다.
OAuth 로그인 처리와 세션 관리는 아직 구현하지 않았다.

필드 근거: [Discord User](https://docs.discord.com/developers/resources/user#user-object),
[Discord Snowflake](https://docs.discord.com/developers/reference#snowflakes).

설정 근거: [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql),
[Drizzle Kit 설정](https://orm.drizzle.team/docs/drizzle-config-file), [pg 연결 풀](https://node-postgres.com/features/pooling).

## ROFL 분석

ROFL2 메타데이터·청크·패킷 경계를 읽는 자체 서버 파서와 로컬 명령을 제공한다.
경기 시간·참가자·챔피언·팀·승패·KDA·CS를 요약하고, 개발자가 명시적으로 실행한 로컬 연구에서는
전체 원본 필드와 미해석 패킷도 추출할 수 있다.
외부 ROFL 라이브러리 없이 Node.js 기본 Zstd를 사용한다.

```sh
pnpm --silent rofl:inspect /path/to/replay.rofl
pnpm --silent rofl:project /path/to/replay.rofl
pnpm --silent rofl:research samples/replay.rofl samples/replay-research
```

`rofl:research`는 새 디렉터리에 원본 사본·전체 메타데이터·압축 해제 청크·패킷 인덱스·분석 보고서를 만든다.
패킷의 시각·ID·본문 위치를 추출하며, 킬·이동 등 본문의 의미 해석은 아직 검증하지 않았다.
서비스 업로드·경기 등록·DB 저장은 아직 구현하지 않았다.
로컬 원본·분석 결과는 Git에서 제외되는 프로젝트 루트 `samples/`에 둔다.
명령과 출력 형식은 [ROFL 분석 문서](docs/rofl.md), 실측 결과와 후속 과제는 [연구 기록](docs/rofl-research.md)을 따른다.

`rofl:project`는 서비스에 사용할 P0~P2 통계 33개와 최종 아이템·주문·룬을 선별한다.
`prepareRoflImport`는 파일 지문과 서비스의 서버·경기·내전 참가자 연결을 받아 공통 메타데이터와 버전별 테이블에 맞는 행을 만든다.
서비스는 모집·팀 편성·대진을 운영하며, 밴픽과 경기 중 과정은 게임에서 처리한다.
결과는 ROFL을 서버에서 검증한 뒤 자동 등록하는 것이 목표이며, 수동 결과 입력·상시 승인 절차는 두지 않는다.
서비스에서는 원본 파일·전체 메타데이터·패킷·파일 보관 경로를 저장하지 않으며, 재분석에는 파일 재업로드가 필요하다.
필드·검증 규칙과 실제 DB 저장 전 범위는 [ROFL 적재 모델](docs/rofl-import.md)에 정리했다.

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
