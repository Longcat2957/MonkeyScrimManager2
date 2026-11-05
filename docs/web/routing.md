# 라우트·레이아웃·내비게이션

갱신일: 2026-11-03. `apps/web/src/routes/`와 공통 레이아웃의 현재 구현을 기준으로 한다. 실제 서버 ID는 DB 조회와 OAuth 세션을 사용하고 개발 샘플 ID만 목 화면을 제공한다.

## 1. 라우트

```text
/                                        서비스 소개
├── auth/login · auth/callback           Discord OAuth + PKCE
├── auth/logout                          POST 로그아웃
├── me                                   내 정보·서버별 연결된 Riot 계정 조회
├── docs · terms · privacy               이용 안내·약관·개인정보 처리방침
├── backoffice                           서비스 운영자용 서비스 상태
├── dev/components · dev/error           개발 모드 전용 검증 화면
└── g/[guildId]                          서버 홈
    ├── ranking                          서버 순위 추가 조회 GET (페이지 아님)
    ├── scrims                           내전 목록·모집 생성 팝업
    │   └── [scrimId]                    모집·참가자·운영 요약
    │       ├── manual                   수동 편성
    │       ├── auction                  경매 준비·진행·완료
    │       ├── bracket                  대진 운영
    │       └── result                   종료·중도 종료 내전 결과
    ├── matches                          서버 경기 기록
    │   └── [matchId]                    경기 라인업·세트 결과·ROFL 업로드 팝업
    ├── players/[userId]                 서버 내 사용자 전적
    ├── stats                            서버 통계
    └── admin                            멤버·Discord 연동 관리
```

서버 목록 페이지는 없으며 헤더의 서버 선택기가 담당한다. 모집 생성·ROFL 업로드는 팝업이다. 수동 결과 입력·밴픽·게임 내 진행 관리 경로는 없다.

### 1.1 식별자와 접근 처리

| 파라미터 | 의미 | 현재 처리 |
| --- | --- | --- |
| `[guildId]` | Discord 서버 ID | 활성 DB 서버를 공개 조회. 개발 샘플 ID만 `findMockGuild`로 조회 |
| `[scrimId]` | `scrims.id` | 서버 ID와 함께 DB에서 조회하고 없으면 404 |
| `[matchId]` | `matches.id` | 서버 하위 경기 경로. 대진·경기 기록에서 같은 상세로 이동 |
| `[userId]` | `users.id` (Discord 사용자 ID) | `[userId]` 폴더로 구현됨. `PlayerName`은 사용자 연결이 없거나 `link=false`이면 링크 없이 이름만 표시 |

`hooks.server.ts`는 해시 세션으로 `locals.actor`·`locals.user`를 복원한다. 일반 서버 열람은 비로그인·비소속자에게 공개하며 활성 서버·대상의 존재를 검사한다. 신청·관리 action은 실제 Discord 소속·실효 권한을 다시 확인하고 트랜잭션에서도 권한·상태를 검사한다. 개발 샘플의 `mockUser`·`can`은 실제 ID의 요청에 쓰지 않는다.

### 1.2 편성·대진 작업판 진입

내전 조회 후 각 `+page.server.ts`가 아래를 처리한다.

| 상황 | 결과 |
| --- | --- |
| `/manual`인데 방식이 `auction` 또는 그 반대 | 저장된 방식 경로로 `redirect(307)` |
| `/manual`·`/auction`인데 방식 미정 | 내전 요약으로 `redirect(307)` |
| `/bracket` + `completed`·`ended_early` | `/result`로 `redirect(307)` |
| `/result` + 그 외 상태 | `/bracket`으로 `redirect(307)` |

경로 생성은 `lib/features/scrims/paths.ts`의 `formationPath`, `hasResult`, `bracketPath`가 담당한다. URL로 편성 방식을 바꾸지 않는다. 요약의 방식 선택과 작업판의 `방식 다시 고르기`가 form action으로 변경한다. 10인·20인 전용 경로는 없다.

### 1.3 URL 상태

| 페이지 | 실제 쿼리 | 기본값·범위 |
| --- | --- | --- |
| 내전 목록 | `status=all\|recruit\|active\|done`, `page` | `all`, `1`; 페이지당 20 |
| 경기 기록 | `q`, `page` | 빈 검색어, `1`; 검색어는 50자까지, 쪽 이동은 종료 목록에만 적용 |
| 경기 상세 | `game=<gameId>` | 결과가 있는 마지막 세트. 일치하는 세트가 없으면 기본 선택 |
| 사용자 전적 | `position=all\|top\|jungle\|mid\|bot\|support`, `page` | `all`, `1` |
| 서버 통계 | `position`, `recent=1`, `min` | 전체 포지션, 최근 기록 끔, 최소 5게임(`1..50`). `recent`는 개발 샘플 업적의 사용자별 최근 10게임 집계에만 적용; 기간·시즌 `range`는 미구현 |
| 서버 관리 | `tab=members\|discord`, `q`, `page` | `members`, 빈 검색어, `1`; 검색어는 50자까지 |

페이지 필터 변경은 `goto(url, { reset: false })`로 이동하고 `load`가 다시 읽는다. 검색은 폼 제출 시 반영한다. 목록 조건이 바뀌면 페이지를 초기화하며, 서버 관리 탭 변경은 해당 경로의 새 URL에서 시작한다.

팝업 열림, 선택한 참가자·편성 자리, 서버 홈 현황/순위 탭, 통계 리더보드 정렬·쪽 번호 등은 컴포넌트 상태다. 서버 순위 추가 조회는 `/g/[guildId]/ranking?position=<포지션>&offset=<개수>`를 쓰며 페이지 URL을 바꾸지 않는다.

개발 상태 재현용 쿼리는 서버 홈 `preview=error`, 내 정보의 `preview`, `/dev/error?status=403|404|500`이다. 각 화면이 실제로 읽는 값만 사용하며 모든 페이지에 공통 `preview` 기능이 있는 것은 아니다.

### 1.4 데이터 응답 경로

화면 외에 다음 GET 핸들러가 존재한다. 새로운 외부 API는 현재 합의된 소비 기능이 있을 때만 추가한다.

- `/api/ddragon/versions`, `/api/ddragon/[version]/[locale]/[resource]`: Data Dragon 버전·리소스 응답.
- `/api/riot/account/v1/accounts/by-riot-id/[gameName]/[tagLine]`, `/api/riot/account/v1/accounts/by-puuid/[puuid]`, `/api/riot/account/v1/region/by-game/lol/by-puuid/[puuid]`.
- `/api/lol/summoner/v4/summoners/by-puuid/[puuid]`, `/api/lol/league/v4/entries/by-puuid/[puuid]`.
- `/g/[guildId]/ranking`: `RankingBoard`의 무한 스크롤이 소비하는 서버 순위 다음 쪽.

Riot API 핸들러의 `region`·`platform` 등은 서버 클라이언트 설정과 검증을 따른다. 기존 프로필·티어 HTTP 조회는 공개이며, 서버 관리의 계정 조회·연결은 관리자 guard를 거친 서버 내부 호출이다.

## 2. 레이아웃 계층

```text
routes/+layout.server.ts                  user·guilds (세션 사용자·본인 소속 서버 목록)
routes/+layout.svelte                     ConfigProvider(ko_KR)
                                         본문 바로가기 · AppHeader · main · AppFooter · Feedback · ConfirmDialog
└── g/[guildId]/+layout.server.ts         guild (공개 DB 조회)
    └── scrims/[scrimId]/+layout.server.ts  scrim·artUrl (공개 DB 조회)
        └── +layout.svelte                ScrimSummary + 하위 페이지
```

- 헤더·푸터·`Feedback`·`ConfirmDialog`는 루트에 한 번만 둔다. `AppHeader`는 `page.data`의 `scrim` → `guild` → 전역 순으로 범위를 정한다.
- 본문은 `id="main-content"`, `tabindex="-1"`인 `<main>`이다. `app-frame`을 본문·푸터가 공유하고 헤더에는 별도 최대 폭을 적용한다.
- 내전 레이아웃은 `scrim`이 있을 때 `ScrimSummary`를 한 번 렌더링한다. 요약·수동 편성은 배경 아트·상태·설정·단계가 있는 전체 머리, 경매·대진·결과는 제목·일정·하드 피어리스만 남기는 `compact` 머리다.
- 배경 아트는 서버에서 Data Dragon으로 준비한다. 확보하지 못하면 배경색을 사용한다.
- 경기 상세는 내전 레이아웃 밖에 있으며 서버 범위 헤더와 본문의 소속 내전 링크를 사용한다.

## 3. 헤더

### 3.1 구성

`AppHeader`가 STDF `NavBar`의 세 snippet을 채운다. 화면 폭 분기는 `lib/ui/viewport.svelte.ts`의 `desktop.current`(1024px)로 하나의 변형만 렌더링한다.

```text
데스크톱: [로고 Monkeybot] [범위 메뉴 · 내전 범위의 서버 메뉴] [서버 선택] [화면 모드] [계정]
모바일:   [로고]                                          [서버 선택] [메뉴]
모바일 메뉴: 범위 링크 → 내전 범위면 서버 링크 → 계정 링크 → 다크 모드
```

모바일 메뉴는 `Popup position="right" size={80}`이다. SSR은 모바일 구조로 그리며 루트 `onMount(markHydrated)` 이후 실제 폭을 반영한다. 헤더 높이는 4rem으로 고정한다.

| 범위 | 주 메뉴 |
| --- | --- |
| 전역 | 없음 |
| 서버 | 서버 홈 · 내전 · 경기 기록 · 통계 · 관리(`guild.isAdmin`일 때만) |
| 내전 | 요약 · 팀 편성(방식 선택 후) · 대진 또는 결과 |

### 3.2 동작

- 로고는 `/` 링크이며 `SERVICE_NAME`으로 접근 가능한 이름을 만든다. 데스크톱에서만 `font-brand` 워드마크를 함께 표시한다.
- `ContextNav`는 `<nav><ul><a>` 구조와 현재 항목의 `aria-current="page"`를 제공한다. 서버 홈·내전 요약은 경로가 정확히 일치할 때, 다른 항목은 하위 경로까지 현재 메뉴로 본다.
- 내전 범위의 서버 메뉴는 데스크톱 `MenuButton`, 모바일 패널의 `ContextNav`로 제공한다. 팀 편성은 `formationPath`, 대진·결과는 `bracketPath`를 사용한다.
- `MenuButton`은 `ActionMenu`를 연다. 데스크톱은 `ActionPopover`, 모바일은 `ActionSheet`이며 메뉴 항목 선택은 `goto`로 이동한다. 이 메뉴 항목은 `ContextNav`의 `<a>`와 다른 구조다.
- 서버 선택기는 `user`가 있을 때만 표시한다. 현재 서버는 `현재 서버` 설명과 비활성 표시만 제공하고, 다른 서버는 해당 서버 홈으로 이동한다. 서버가 없으면 비활성 안내 항목 하나를 표시한다.
- 계정 메뉴는 `내 정보`와 서비스 운영자 전용 `백오피스`다. 비로그인 상태에는 Discord 로그인 링크, 로그인 상태에는 POST 로그아웃이 있다. 비로그인 상태에는 계정 메뉴·서버 선택기가 표시되지 않지만 서버 URL로 공개 화면에 접근할 수 있다.
- 화면 모드는 데스크톱 아이콘 `Button`, 모바일 메뉴의 `SwitchCell` 한 곳에서 전환한다. `setMode`가 `html[data-mode]`와 저장소를 갱신한다.
- 모바일 링크 선택은 메뉴 패널을 닫는다. `overlay`가 열린 패널 밖 헤더를 `inert`로 만들어 서버 선택기 등 배경 조작을 막는다. 별도의 전역 메뉴 상태 관리자는 없다.
- 헤더만 `sticky top-0`이며 하단 탭바는 없다.

### 3.3 푸터

`AppFooter`는 `SERVICE_NAME` 워드마크와 `SERVICE_URL`의 도메인을 링크 없는 텍스트로 표시한다. 링크는 `문서`·`이용약관`·`개인정보 처리방침` 세 개이며 개인정보 링크만 굵게 표시한다. 모바일에서 세로, `sm` 이상에서 가로 배치한다.

## 4. 오류·개발 화면과 운영 모드

| 경로·상황 | 현재 동작 |
| --- | --- |
| 공통 `+error.svelte` | 403·404 전용 문구, 나머지는 일반 조회 실패 문구. 상태 코드와 `noindex`를 표시하고 500 이상에서만 페이지 새로고침 버튼 제공 |
| `/dev/error` | 개발 모드에서 `status`의 403·404·500을 재현. 없거나 다른 값이면 404 |
| `/dev/components` | 개발 모드에서 대표 STDF·서비스 컴포넌트, 폼·팝업·상태 샘플 제공. 모든 업무 화면을 대체하는 검증 공간은 아님 |
| `/dev/*` 운영 모드 | 404 |
| `/me` | 세션으로 본인의 서버별 계정을 조회. 비로그인 401 |
| `/backoffice` | 실제 세션의 `isServiceAdmin`을 검사. 명시적 개발 목 미리보기는 분리 |
| `/g/[guildId]`와 일반 하위 화면 | 활성 DB 서버·대상을 공개 조회. 없음·비활성은 404. `/admin`은 현재 관리자 검사 |
| `/`, `/docs`, `/terms`, `/privacy` | 정적 서비스 소개·이용 안내·정책 준비 중 화면 |

기능별 DB 연결·개발 미리보기·ROFL 등록과 MMR 반영의 범위는 [페이지별 문서](README.md)를 따른다. 과거 시즌 선택·편성 참고 전적 등 현재 연결되지 않은 영역은 해당 페이지의 한계에 명시한다.
