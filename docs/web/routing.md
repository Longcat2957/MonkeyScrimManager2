# 라우트·레이아웃·내비게이션

갱신일: 2026-11-16. `apps/web/src/routes/`와 공통 레이아웃의 현재 구현을 기준으로 한다. 실제 서버 ID는 DB 조회와 OAuth 세션을 사용하고 개발 샘플 ID만 목 화면을 제공한다.

## 1. 라우트

```text
/                                        서비스 소개 · 로그인 시 기본 서버 홈으로 이동
├── auth/discord · auth/discord/callback Discord OAuth + PKCE
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

로그인 사용자가 `/`에 접근하면 공통 레이아웃에서 조회한 본인 소속 활성 서버 중 첫 서버의 홈으로 `redirect(303)`한다. 별도의 선호 서버 저장값은 없으며 기존 서버 목록의 이름·ID 오름차순을 따른다. 소속 서버가 없거나 서버 목록 조회가 실패하면 기존 소개 화면을 유지하고, 비로그인·명시적 개발 목 미리보기도 소개 화면에 머문다. OAuth의 명시적 `returnTo`는 그대로 따르며 복귀 경로가 `/`일 때만 이 기본 서버 이동을 적용한다.

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
| `/result` + 정상 종료·현재 대진이 완료된 한 경기 | 해당 `/matches/[matchId]`로 `redirect(307)` |
| `/result` + 그 외 미종료 상태 | `/bracket`으로 `redirect(307)` |

경로 생성은 `lib/features/scrims/paths.ts`의 `formationPath`, `hasResult`, `bracketPath`가 담당한다. URL로 편성 방식을 바꾸지 않는다. 요약의 방식 선택과 작업판의 `방식 다시 고르기`가 form action으로 변경한다. 10인·20인 전용 경로는 없다.

### 1.3 URL 상태

| 페이지 | 실제 쿼리 | 기본값·범위 |
| --- | --- | --- |
| 서버 홈 순위 | `season=<uuid>` | 생략하면 활성 시즌, 명시하면 같은 서버의 해당 시즌. 운영 내전·최근 경기에는 미적용 |
| 내전 목록 | `status=all\|recruit\|active\|done`, `page` | `all`, `1`; 페이지당 20 |
| 경기 기록 | `q`, `from`, `to`, `season=<uuid>`, `page` | 빈 검색어·기간 없음·전체 시즌·1쪽. 검색50자, 날짜는 엄격 YYYY-MM-DD/KST, 쪽 이동은 종료 목록에만 적용 |
| 경기 상세 | `game=<gameId>` | 결과가 있는 마지막 세트. 일치하는 세트가 없으면 기본 선택 |
| 사용자 전적 | `season=<uuid>`, `position=all\|top\|jungle\|mid\|bot\|support`, `page` | 활성 시즌, `all`, `1` |
| 서버 통계 | `season=<uuid>`, `position`, `recent=1`, `min` | 활성 시즌, 전체 포지션, 최근 기록 끔, 최소 5게임(`1..50`). `recent`는 개발 샘플 업적의 사용자별 최근 10게임 집계에만 적용; 임의 기간 `range`는 미구현 |
| 서버 관리 | `tab=members\|discord\|audit\|seasons`, `q`, `page` | `members`, 빈 검색어, `1`; 검색어는 50자까지. 변경 이력은 별도20개 쪽 조회 |

페이지 필터 변경은 `goto(url, { reset: false })`로 이동하고 `load`가 다시 읽는다. 검색은 폼 제출 시 반영한다. 목록 조건이 바뀌면 페이지를 초기화하며, 서버 관리 탭 변경은 해당 경로의 새 URL에서 시작한다.

세 화면의 시즌 선택은 `page`·`offset`만 제거하고 기존 포지션·최소 게임·최근 기록 등 다른 쿼리를 보존한다. 종료 시즌을 포함해 같은 서버의 한 시즌만 조회하고 전체 시즌 합산은 제공하지 않는다. 잘못된 UUID(빈 값 포함)는 400, 다른 서버 또는 없는 시즌은 404다. 활성 시즌이 없고 선택도 없으면 선택 ID는 `null`이다. 각 loader가 빈 상태에도 `seasons: {id,name,startedAt,endedAt}[]`·`selectedSeasonId`를 반환하며 개발 샘플에는 과거 이력을 만들지 않는다. 경기 목록은 전체 시즌이 기본이며 `q`·`from=YYYY-MM-DD`·`to=YYYY-MM-DD`·`season=<uuid>`를 조회 버튼에서 함께 적용하고 page를 초기화한다. 두 날짜는 한국 시각 기준이며 확인된 실제 경기일에만 적용한다. 이 목록은 개인/통계/순위의 기본 활성 시즌과 구분한다.

팝업 열림, 선택한 참가자·편성 자리, 서버 홈 현황/순위 탭, 업적 캐러셀 선택·순위 팝업, 통계 리더보드 정렬·쪽 번호 등은 컴포넌트 상태다. 서버 순위 추가 조회는 `/g/[guildId]/ranking?season=<선택한 UUID>&position=<포지션>&offset=<개수>`로 선택 시즌을 고정하고 페이지 URL을 바꾸지 않는다. 순위·리더보드·듀오의 사용자 전적 링크는 선택 시즌을 유지한다.

개발 상태 재현용 쿼리는 서버 홈 `preview=error`(최근 경기 조회 실패), 내 정보의 `preview`, `/dev/error?status=403|404|500`이다. 각 화면이 실제로 읽는 값만 사용하며 모든 페이지에 공통 `preview` 기능이 있는 것은 아니다.

### 1.4 데이터 응답 경로

화면 외에 다음 GET 핸들러가 존재한다. 새로운 외부 API는 현재 합의된 소비 기능이 있을 때만 추가한다.

- `/api/ddragon/versions`, `/api/ddragon/[version]/[locale]/[resource]`: Data Dragon 버전·리소스 응답.
- `/api/riot/account/v1/accounts/by-riot-id/[gameName]/[tagLine]`, `/api/riot/account/v1/accounts/by-puuid/[puuid]`, `/api/riot/account/v1/region/by-game/lol/by-puuid/[puuid]`.
- `/api/lol/summoner/v4/summoners/by-puuid/[puuid]`, `/api/lol/league/v4/entries/by-puuid/[puuid]`.
- `/g/[guildId]/stats/live`: 통계 화면 자동/수동 갱신이 소비하는 snapshot. SSR과 같은 공개 권한·선택 시즌·필터·개인정보 투영, `private, no-store`. 별도 사용자 페이지가 아니다.
- `/g/[guildId]/ranking`: `RankingBoard`의 무한 스크롤이 소비하는 선택 시즌 서버 순위 다음 쪽. 기존 `RankingPage` 응답 형식은 유지한다.
- `/g/[guildId]/scrims/[scrimId]/auction/live`: 경매 열람자의 자동/수동 갱신이 소비하는 현재 경매·내전 snapshot. 기존 공개 읽기 권한, `private, no-store`. 별도 사용자 페이지나 서버 입찰 endpoint가 아니다.

공통 푸터는 모든 화면에서 문서·이용약관·개인정보 처리방침과 확정 이메일로 시작하는 단일 `문의` mailto를 제공한다. 별도 문의 페이지/접수 API는 없고 실제 메일 앱·발송은 브라우저 검사에 포함하지 않는다.

Riot API 핸들러의 `region`·`platform` 등은 서버 클라이언트 설정과 검증을 따른다. 기존 프로필·티어 HTTP 조회는 공개이며, 서버 관리의 계정 조회·연결은 관리자 guard를 거친 서버 내부 호출이다.

## 2. 레이아웃 계층

```text
routes/+layout.server.ts                  user·guilds (세션 사용자·본인 소속 서버 목록)
routes/+layout.svelte                     ConfigProvider(ko_KR)
                                         본문 바로가기 · AppHeader · main · AppFooter · Feedback · ConfirmDialog
└── g/[guildId]/+layout.server.ts         guild (공개 DB 조회)
    └── scrims/[scrimId]/+layout.server.ts  scrim (공개 DB 조회)
        └── +layout.svelte                ScrimSummary·내전 메뉴 + 하위 페이지
```

- 헤더·푸터·`Feedback`·`ConfirmDialog`는 루트에 한 번만 둔다. `AppHeader`는 서버 안에서 항상 같은 서버 메뉴를 유지한다.
- 본문은 `id="main-content"`, `tabindex="-1"`인 `<main>`이다. `app-frame`을 본문·푸터가 공유하고 헤더에는 별도 최대 폭을 적용한다.
- 내전 레이아웃은 `ScrimSummary`로 제목·상태·일정·팀 수·설정과 내전 메뉴를 같은 위치에 표시한다. 작업판마다 머리 크기를 바꾸거나 배경 아트를 조회하지 않는다.
- 경기 상세도 소속 내전의 `ScrimContext`를 조회해 같은 머리·메뉴를 표시한다. 본문의 별도 소속 내전 링크는 중복하지 않는다.

## 3. 헤더

### 3.1 구성

`AppHeader`는 1024px 이상에서 224px 좌측 전술 레일, 그 미만에서 54px 상단 바다. 화면 폭 분기는 `lib/ui/viewport.svelte.ts`의 `desktop.current`(1024px)로 하나의 변형만 렌더링한다.

```text
데스크톱: 좌측 224px 레일 [로고][서버 선택][서버 메뉴 5종] … 하단 [계정 ▾]
모바일:   [로고]                           [서버 선택] [로그인] [메뉴]
모바일 메뉴: 서버 링크 → 계정 링크(화면 모드 포함)
내전·경기 본문: 제목·상태·설정 → 모집·참가자 / 팀 편성 / 대진·경기 / 결과
```

모바일 메뉴는 오른쪽 시트(`overlay` attachment + `inert` 배경)다. SSR은 모바일 구조로 그리며 루트 `onMount(markHydrated)` 이후 실제 폭을 반영한다.

| 범위 | 주 메뉴 |
| --- | --- |
| 전역 | 없음 |
| 서버 | 서버 홈 · 내전 · 경기 기록 · 통계 · 관리(`guild.isAdmin`일 때만) |
| 내전·경기 상세 | 서버 메뉴 유지. 본문에 고정 순서의 내전 메뉴 제공 |

### 3.2 동작

- 로고는 `/` 링크이며 `SERVICE_NAME`으로 접근 가능한 이름을 만든다. 데스크톱에서만 `font-brand` 워드마크를 함께 표시한다.
- `ContextNav`는 `<nav><ul><a>` 구조와 현재 항목의 `aria-current="page"`를 제공한다. 서버 홈·내전 요약은 경로가 정확히 일치할 때, 다른 항목은 하위 경로까지 현재 메뉴로 본다.
- 내전 메뉴의 순서는 `모집·참가자`·`팀 편성`·`대진·경기`·`결과`로 고정한다. 방식 미정의 팀 편성, 결과가 없는 상태의 결과 메뉴는 비활성이다. 종료 뒤에는 결과를 활성화하고 같은 목적지로 이어지는 대진 메뉴를 비활성으로 둔다. 경기 상세에서도 진행 중은 대진·경기, 종료된 내전은 결과를 현재 위치로 표시한다.
- `MenuButton`은 `PopoverMenu`를 연다. 데스크톱·모바일 모두 트리거 옆 절대 위치 패널이며 메뉴 항목 선택은 `goto`로 이동한다. 이 메뉴 항목은 `ContextNav`의 `<a>`와 다른 구조다.
- 서버 선택기는 `user`가 있을 때만 표시한다. 현재 서버는 `현재 서버` 설명과 비활성 표시만 제공하고, 다른 서버는 해당 서버 홈으로 이동한다. 서버가 없으면 비활성 안내 항목 하나를 표시한다.
- 계정 메뉴는 `내 정보`와 서비스 운영자 전용 `백오피스`다. 비로그인 상태에는 Discord 로그인 링크, 로그인 상태에는 POST 로그아웃이 있다. 모바일 비로그인의 로그인은 헤더에 한 번 표시하고 열린 메뉴에서 반복하지 않는다. 실제 비로그인 상태에는 계정 메뉴·서버 선택기가 표시되지 않지만 서버 URL로 공개 화면에 접근할 수 있다. 개발 목 미리보기는 실제 인증 세션과 별개다.
- 화면 모드는 하단 계정 메뉴 안의 `라이트 모드` 스위치 한 곳에서 전환한다. 모바일은 메뉴 시트의 계정 영역에 같은 스위치를 둔다. `setMode`가 `html[data-mode]`와 저장소를 갱신한다.
- 모바일 링크 선택은 메뉴 패널을 닫는다. `overlay`가 열린 패널 밖 헤더를 `inert`로 만들어 서버 선택기 등 배경 조작을 막는다. 별도의 전역 메뉴 상태 관리자는 없다.
- 헤더만 `sticky top-0`이며 하단 탭바는 없다.

### 3.3 푸터

`AppFooter`는 `SERVICE_NAME` 워드마크와 `SERVICE_URL`의 도메인을 링크 없는 텍스트로 표시한다. 링크는 `문서`·`이용약관`·`개인정보 처리방침` 세 개이며 개인정보 링크만 굵게 표시한다. 모바일에서 세로, `sm` 이상에서 가로 배치한다.

## 4. 오류·개발 화면과 운영 모드

| 경로·상황 | 현재 동작 |
| --- | --- |
| 공통 `+error.svelte` | 401 로그인 필요·403 권한 없음·404 없음 전용 문구, 나머지는 일반 조회 실패 문구. 상태 코드와 `noindex`를 표시하고 500 이상에서만 페이지 새로고침 버튼 제공 |
| `/dev/error` | 개발 모드에서 `status`의 403·404·500을 재현. 없거나 다른 값이면 404 |
| `/dev/components` | 개발 모드에서 네이티브 프리미티브와 서비스 컴포넌트의 폼·상태 샘플 제공. 모든 업무 화면을 대체하는 검증 공간은 아님 |
| `/dev/*` 운영 모드 | 404 |
| `/me` | 세션으로 본인의 서버별 계정을 조회. 비로그인 401 |
| `/backoffice` | 실제 세션의 `isServiceAdmin`을 검사. 명시적 개발 목 미리보기는 분리 |
| `/g/[guildId]`와 일반 하위 화면 | 활성 DB 서버·대상을 공개 조회. 없음·비활성은 404. `/admin`은 현재 관리자 검사 |
| `/` | 로그인 시 기본 서버 홈으로 이동. 서버가 없거나 조회할 수 없으면 서비스 소개 |
| `/docs`, `/terms`, `/privacy` | 정적 이용 안내·정책 준비 중 화면 |

기능별 DB 연결·개발 미리보기·ROFL 등록과 MMR 반영의 범위는 [페이지별 문서](README.md)를 따른다. 시즌 전환은 봇 `/시즌` 또는 서버 관리의 시즌 탭에서 같은 서비스로 처리하고, 과거 시즌 열람은 서버 홈의 순위·개인 전적·서버 통계에서 제공한다.
