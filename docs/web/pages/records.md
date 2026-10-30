# 기록 페이지

작성일: 2026-10-30. 모두 서버 범위 헤더를 쓴다. 결과·통계는 ROFL에서 검증·저장한 값만 표시한다([ROFL 적재 모델](../../rofl-import.md)).

## 표시 규칙

- 누락값은 `-`로 표시한다. 0이나 임의 아이콘으로 채우지 않는다.
- 실제 경기 시각을 모르면 표시하지 않는다. 업로드 시각으로 대신하지 않는다.
- 단위가 검증되지 않은 원값(CC 시간·사망 시간 등)은 표시하지 않는다.
- 아이템·주문·룬은 "최종 세팅"이다. 구매 순서로 보이게 나열하지 않는다.
- Riot ID는 해당 사용자의 현재 공개 설정이 허용할 때만. `load`가 걸러서 준다.
- 승패는 "승"/"패" 글자와 `Tag state="success" | "error"`를 함께 쓴다.
- Match의 A/B 팀은 시리즈 내 고정 구분이고, 게임마다의 블루/레드 진영과 다르다. 게임 화면에는 진영을, 시리즈 점수에는 팀 이름을 쓴다.

## `/g/[guildId]/matches` — 경기 기록

**목적** 서버의 시리즈를 찾아 상세로 들어간다. 특정 내전의 경기 흐름은 그 내전의 대진 페이지가 담당한다.

**데이터**

```ts
{
  matches: { id, scrimTitle, teamA, teamB, scoreA, scoreB, bestOf, status, playedAt: string | null }[],
  total, page, q, statusFilter: 'all' | 'in_progress' | 'done'
}
```

**화면**

```text
[h1] 경기 기록
[Input search: 내전·팀 이름]        [Tabs] 전체 | 진행 중 | 종료
───────────────────────────────────────────────────────────────
[10월]  1팀 2 : 1 2팀                     ← 이긴 팀 굵게
[ 24 ]  BO3 · 10월 정기 내전
[10월]  바나나 공장 1 : 1 정글 차이       [진행 중]
[ 30 ]  BO3 · 금요일 칼바람 내전
…
[Pagination]
모바일: 검색 → 탭 → 목록 한 열
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 검색 | `Input type="search" clear` | Enter → `?q=`. 참가자 이름 검색은 공개 정책 결정 전 제외 |
| 필터 | `Tabs` | `?status=`. `done` = 종료·중도 종료·취소 |
| 목록 | `CellGroup` + `MatchListRow` → `/matches/[id]` | 서버 홈과 같은 행. 점수는 결과가 기록된 게임 기준, 상태 태그는 종료 외 상태만 |
| 페이지 | `Pagination` | `?page=` |

**상태** 기록 없음 "아직 기록된 경기가 없어요" / 검색 결과 없음 "'{q}'에 맞는 경기가 없어요".

**미결정** 검색 대상·기간 필터, 정렬 기준(경기 시각 미확인 시), 취소 시리즈 기본 포함 여부, 비멤버 열람 범위.

## `/g/[guildId]/matches/[matchId]` — 경기 상세

**목적** 시리즈 점수와 게임별 결과·개인 성적을 보고, 권한이 있으면 ROFL을 올려 결과를 기록한다.

**권한** 열람: 서버 열람 권한. 업로드: `can.upload`.

**데이터**

```ts
{
  match: { id, scrim: { id, title }, teamA, teamB, scoreA, scoreB, bestOf, status, hardFearless },
  games: { id, order, status, winnerSlot: 'a' | 'b' | null }[],
  game: {                                              // ?game으로 선택된 게임, 결과 없으면 null
    id, order, durationSec, playedAt: string | null, patch, mmrStatus: 'applied' | 'pending' | 'none',
    sides: { side: 'blue' | 'red', slot: 'a' | 'b', win: boolean,
             players: { userId: string | null, displayName, riotId: string | null, championId, position,
                        kills, deaths, assists, cs: number | null, damage: number | null, gold: number | null,
                        items: (number | null)[], spells, runes, fearlessViolation: boolean }[] }[]
  } | null,
  usedChampions: { a: ChampionId[], b: ChampionId[] } | null,   // 하드 피어리스일 때만
  can: { upload: boolean, uploadBlockedReason: string | null }
}
```

**화면**

```text
[h1] 1팀 vs 2팀                                              [ROFL 업로드]
6월 정기 내전 · BO3 · 하드 피어리스   [종료]               ← 내전 이름은 /scrims/[id] 링크
            1팀  2 : 1  2팀                                 ← 큰 점수

[Tabs] 1게임 ✓ | 2게임 ✓ | 3게임 ✓                          ← ✓ = 결과 있음
───────────────────────────────────────────────────────────────
1게임 · 32:14 · 패치 14.21 · 10/24 21:03         [MMR 반영 대기]
[h3] 블루 · 1팀 · 승
<table> 챔피언 | 플레이어 | K/D/A | CS | 피해량 | 골드 | 최종 아이템 | [상세]
[h3] 레드 · 2팀 · 패
<table> …

[h2] 다음 게임에서 쓸 수 없는 챔피언                        ← 하드 피어리스만
 1팀: [아리][리신]…    2팀: […]
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 시리즈 머리 | `h1`, 메타 한 줄(내전 링크 `<a>`), `Tag`, 점수 | 점수는 완료 게임 기준. 중도 종료면 승자 표시 없음 |
| ROFL 업로드 | `Button fill="base"` | `can.upload`일 때만. 불가 사유가 있으면 `disabled` + 아래 한 줄 |
| 게임 선택 | `Tabs` (`labels` = `N게임`) | `goto('?game=<id>', { noScroll: true, keepFocus: true })` |
| 게임 메타 | 텍스트 한 줄 + `Tag`(MMR 대기일 때만 `state="warning"`) | |
| 팀 표 | `<table>` 진영별 두 개, `caption`=진영·팀·결과 | 챔피언 `ChampionIcon`, 플레이어 `PlayerName`, 숫자 우정렬. 피어리스 위반 행은 챔피언 옆 `Tag state="warning" text="피어리스"` |
| 행 상세 | 행 끝 `Button fill="text"` `상세` → `Popup`(데스크톱 right, 모바일 bottom) | 주문·룬·전체 수치를 `CellGroup`으로 |
| 모바일 표 | 같은 `<table>`에서 챔피언·플레이어·K/D/A·상세 열만 | 나머지 열은 `hidden lg:table-cell` (같은 DOM, 데이터 셀만 숨김) |
| 피어리스 안내 | `h2` + 팀별 `ChampionIcon` 나열 | 진행 중 시리즈만. 업로드를 막지 않는다 |

### ROFL 업로드 팝업

```text
[h2] ROFL 업로드
[ImageList accept=".rofl" multiple max={bestOf}]
  ┌───────────────────────────────┐
  │ KR-7312345678.rofl  12.4MB    │  [업로드 중…]
  │ KR-7312345990.rofl  11.8MB    │  ✓ 2게임으로 기록했어요
  │ KR-7312346001.rofl   9.1MB    │  ✗ 이 경기의 참가자가 아니에요 [다시 시도]
  └───────────────────────────────┘
                                         [닫기] [업로드]
```

| 단계 | 처리 |
| --- | --- |
| 파일 선택 | `ImageList onadd`. 확장자·크기만 클라이언트에서 확인(`onoversized` → 해당 항목 오류) |
| 업로드 | 파일마다 순차 전송, 항목 `status="uploading"`. `업로드` 버튼 `loading` |
| 성공 | 항목 `status="success"`, `message`에 기록된 게임 번호. 팝업을 닫으면 `invalidateAll()` 후 마지막으로 기록된 게임 탭 선택 |
| 실패 | 항목 `status="error"`, `message`에 아래 문구. 다른 파일은 계속 진행 |
| 응답 없음 | 항목 오류 "기록 여부를 확인하지 못했어요" + 닫을 때 `invalidateAll()`로 실제 반영 확인. 같은 파일 재전송은 서버가 중복으로 처리 |

| 서버 결과 | 항목 메시지 |
| --- | --- |
| 손상·미지원 형식 | 읽을 수 없는 ROFL 파일이에요 |
| 참가자 연결 실패 | 이 경기의 참가자와 맞지 않는 플레이어가 있어요: {이름} (권한 범위 안에서만 이름 표시) |
| 이미 기록됨 (같은 파일) | 이미 {N}게임으로 기록된 파일이에요 |
| 결과 충돌·불완전 | 결과를 확인할 수 없어 기록하지 않았어요 |
| 시리즈 종료·권한 상실 | 지금은 이 경기에 업로드할 수 없어요 |

정상 파일은 검토·승인 단계 없이 바로 기록된다. 승패 수동 입력으로 실패를 우회하는 UI를 만들지 않는다. 원본 파일은 보관하지 않는다.

**상태**

| 상황 | 처리 |
| --- | --- |
| 게임 없음 | 탭 대신 "아직 기록된 게임이 없어요" |
| `?game`이 잘못됨 | 기본 게임 선택(쿼리 무시) |
| 일부 수치·이미지 누락 | 해당 칸 `-`, 이미지 대신 이름 |
| 사용자 연결 없는 플레이어 | `PlayerName` 링크 없음 |

**미결정** 업로드 권한·허용 시점, 파일 크기·개수 제한, 등록 대상 게임 순번 결정 방식(서버가 ROFL에서 판단할지 사용자가 지정할지 — 지정하게 되면 팝업에 `Radio` 추가), 기존 결과 정정·재분석, 예외 연결 해결 담당, 표에 노출할 지표 범위, Match 중도 종료·취소 조작 위치.

## `/g/[guildId]/players/[userId]` — 사용자 전적

**목적** 한 사용자가 이 서버에서 쌓은 전적을 본다. 여러 Riot 계정의 기록을 사용자 기준으로 합산한다.

**권한** 서버 열람 권한 + 대상의 공개 설정(정책 미결정). 비공개면 `load`에서 403 또는 404.

**데이터**

```ts
{
  player: { userId, displayName, avatarUrl, riotIds: string[] },      // riotIds는 공개 허용 시에만
  summary: { games, wins, kda: number | null, mainPosition: LolPosition | null },
  mmr: { position, rating, games, status: 'applied' | 'pending' | 'none' }[] | null,
  history: { matchId, gameId, scrimTitle, playedAt, win, championId, position, kills, deaths, assists, cs }[],
  total, page, position: LolPosition | 'all'
}
```

**화면**

```text
[img] [h1] 홍길동
Hide on bush#KR1 · 다른계정#KR2

[Tabs] 전체 | 탑 | 정글 | 미드 | 원딜 | 서폿
[Grids cols=4 (모바일 2)]  게임 42 | 승률 57% | KDA 3.2 | 주 포지션 미드

[h2] 포지션별 MMR                    ← 제공 확정 시
<table> 포지션 | MMR | 게임 | 상태

[h2] 최근 게임
LinkCell  [승] 아리 · 미드      7/2/9 · CS 231
          6월 정기 내전 · 10/24
[Pagination]
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 포지션 필터 | `Tabs` | `?position=`. 요약 지표와 최근 게임 모두에 적용. 선택 범위를 지표 제목에 쓰지 않고 탭 선택 상태로 드러낸다 |
| 요약 | `Grids` + `Grid` 숫자·라벨 | 표본 0이면 `-` |
| MMR | `<table>` | 상태: 반영 / 반영 대기(`Tag warning`) / 기록 없음. 기본값 1500과 "기록 없음"을 구분 |
| 최근 게임 | `CellGroup` + `LinkCell` → `/matches/[matchId]?game=[gameId]` | `detailChild`에 승/패 `StatusTag`. 행 하나에 링크 하나 |

**미결정** 열람 정책·비공개 응답, 기본 집계 기간, MMR·Riot ID 노출 범위, 탈퇴자 처리.

## `/g/[guildId]/stats` — 서버 통계

**목적** 서버 전체 누적 지표를 본다.

**화면**

```text
[h1] 통계
[Tabs] 기간·시즌 범위 (미결정)
[Grids cols=4 (모바일 2)]  내전 18 | 게임 61 | 평균 게임 시간 29:40 | 참가자 54
[h2] 챔피언
<table> 챔피언 | 픽 | 승률     ← 픽 수 내림차순, 최소 표본 미만은 승률 `-`
```

| 영역 | 사용 |
| --- | --- |
| 범위 | `Tabs` (`?range=`) |
| 핵심 지표 | `Grids` + `Grid` |
| 챔피언 | `<table>` + `ChampionIcon`, `Pagination` |

첫 제공은 위 두 영역이다. 사용자 순위·포지션 분석은 지표·공개 정책이 정해진 뒤 추가한다. 빈 순위표를 미리 두지 않는다.

**상태** 게임 없음: "아직 기록된 게임이 없어요" (지표 0 대신). 집계 지연이 있으면 범위 탭 아래 "{시각} 기준" 한 줄.

**미결정** 지표·계산식·최소 표본, 기간·시즌 범위, 사용자 단위 집계·순위 제공 여부, 갱신 주기.
