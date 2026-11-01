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
| 검색 | `<form role="search">` + `Input type="search" clear` | Enter → `?q=`(내전·팀 이름). 폼에 `nonSubmitButtons`(지우기 버튼이 Enter로 눌리지 않게). 참가자 이름 검색은 공개 정책 결정 전 제외 |
| 필터 | `Tab` (라벨에 개수) | `?status=`. `done` = 종료·중도 종료·취소 |
| 목록 | `CellGroup` + `MatchListRow` → `/matches/[id]` | 서버 홈과 같은 행. 점수는 결과가 기록된 게임 기준, 상태 태그는 종료 외 상태만 |
| 페이지 | `Pagination` | `?page=` |

**상태** 기록 없음 "아직 기록된 경기가 없어요" / 검색 결과 없음 "'{q}'에 맞는 경기가 없어요".

**미결정** 검색 대상·기간 필터, 정렬 기준(경기 시각 미확인 시), 취소 시리즈 기본 포함 여부, 비멤버 열람 범위.

## `/g/[guildId]/matches/[matchId]` — 경기 상세

**목적** 시리즈 점수와 게임별 결과·개인 성적을 보고, 권한이 있으면 ROFL을 올려 결과를 기록한다.

**권한** 열람: 서버 열람 권한. 업로드: `can.upload`(현재 목: 진행 중 경기. 운영자·참가자 범위는 미결정).

**근거** `samples/매치 결과 참고자료.png`의 구성(어두운 게임 머리 + 진영별 표)을 서비스 토큰으로 옮긴다.

**데이터** (`lib/features/matches/types.ts`의 `MatchDetail`·`GameDetail`·`GamePlayer`)

```ts
{
  match: { id, scrim: { id, title }, teamA, teamB, scoreA, scoreB, bestOf, status, hardFearless,
           games: { id, order, winner: 'a' | 'b' | null }[] },
  game: {                                   // ?game으로 고른 게임, 없거나 잘못되면 마지막 게임, 기록 없으면 null
    id, order, durationSec, playedAt: string | null, patch, mmrStatus, splashUrl,
    sides: { side: 'blue' | 'red', slot: 'a' | 'b', teamName, win,
             players: { userId, displayName, riotId, champion, level, kills, deaths, assists,
                        cs, damage, damageTaken, gold, visionScore, wardsPlaced, wardsKilled, controlWards,
                        heal, shield, largestKillingSpree, multiKills,
                        items: (LoadoutIcon | null)[7], spells, keystone, secondaryStyle,
                        badge: 'mvp' | 'ace' | null, fearlessViolation }[] }[]
  } | null,
  usedChampions: { a: ChampionRef[], b: ChampionRef[] } | null,   // 하드 피어리스 진행 중만
  can: { upload: boolean }
}
```

아이템·주문·룬 이름과 아이콘은 서버가 Data Dragon `ko_KR` 카탈로그로 채운다(`loadoutResolver`). 찾지 못하면 아이콘 없이 이름 칸을 유지한다.

**화면**

```text
[h1] 1팀 vs 2팀                                              [ROFL 업로드]
10월 정기 내전 · BO3 · 하드 피어리스  [종료]                ← 내전 이름은 /scrims/[id] 링크
┌ 1팀  2 : 1  2팀 ┐                                          ← 시리즈 점수, 진 팀은 흐리게
[Tab] 1게임 | 2게임 | 3게임                                  ← 게임이 2개 이상일 때만
┌ GameHero (항상 어두운 카드, MVP 챔피언 스플래시) ───────────────────────┐
│ (레드 · 2팀 승리) [MMR 반영 대기]                      ┌ MVP ─────────┐ │
│ 25 : 42   ← 진영별 킬(블루·레드 색)                    │ 홍길동 자야 … │ │
│ 2026년 10월 24일 · 31분 3초 · 패치 16.21               └──────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
┌ 블루 · 1팀 패배  60,700 골드                         25 K · 42 D · 26 A ┐
│ 선수(챔피언·레벨·주문·룬·이름·배지) | KDA | 딜량·받은 피해 | 시야 | CS | 아이템 | 상세 │
└────────────────────────────────────────────────────────────────────────────┘
┌ 레드 · 2팀 승리 … ┐
[h2] 다음 게임에서 쓸 수 없는 챔피언                        ← 하드 피어리스 진행 중만
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 시리즈 머리 | `h1`, 메타 한 줄(내전 링크), `StatusTag`, 점수 상자 | 점수는 기록된 게임 기준. 정상 종료만 승자 표시 |
| ROFL 업로드 | `Button fill="base"` → `RoflUploadDialog` | `can.upload`일 때만. 남은 게임이 없으면 비활성 |
| 게임 선택 | `Tab` (`N게임`) | `?game=<id>`로 이동 |
| 게임 머리 | `GameHero` | 이긴 진영·팀, 진영별 킬, 날짜·시간·패치, MMR 대기 `StatusTag`, MVP 카드 |
| 진영 표 | `GameTeamTable` (`<table>` + `caption`) | 진영색 머리에 결과·총 골드·K/D/A. 열: 선수, KDA(비율), 딜량·받은 피해 막대(두 진영 최대값 기준), 시야(와드 설치/제거·시야 점수), CS(분당), 최종 아이템 7칸, `상세`. 모바일은 선수·KDA·상세만(같은 표에서 열 숨김) |
| 배지 | MVP(이긴 팀 1위)·ACE(진 팀 1위) | **임시 성과 점수**로 고른다: (K+A)/D + 킬 관여×4 + 팀 내 피해 비중×6. 점수 자체는 표시하지 않는다 |
| 피어리스 | 챔피언 옆 `StatusTag warning "피어리스"`, 하단 사용 챔피언 목록 | 같은 팀이 앞 게임에서 쓴 챔피언. 업로드를 막지 않는다 |
| 행 상세 | `GamePlayerDialog` (`Popup` 데스크톱 오른쪽, 모바일 아래) | 주문·룬·아이템 이름, 피해·골드·CS·시야·회복·보호막·연속 킬·다중 킬 |

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
| 파일 선택 | `ImageList`(`columns=3`, `maxSize=64`MB, `max`=남은 게임 수) + 숨긴 `<input type="file" accept=".rofl">`. `onclickUpload`로 입력을 열고 `addFiles()`로 넘긴다 |
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

목: 서버가 실제 ROFL 파서(`projectRoflGame`)로 읽고, 결과가 `consistent`일 때만 다음 게임으로 기록한다. 과반을 이기면 경기를 종료한다. 같은 파일(길이·챔피언 구성)은 중복으로 거절한다. 참가자 연결 검증은 저장소 연결 때 붙인다.

**미결정** MVP·ACE 계산식, 업로드 권한·허용 시점, 파일 크기·개수 제한, 등록 대상 게임 순번 결정 방식(서버가 ROFL에서 판단할지 사용자가 지정할지 — 지정하게 되면 팝업에 `Radio` 추가), 기존 결과 정정·재분석, 예외 연결 해결 담당, 표에 노출할 지표 범위, Match 중도 종료·취소 조작 위치.

## `/g/[guildId]/players/[userId]` — 사용자 전적

**목적** 한 사용자가 이 서버에서 쌓은 전적을 본다. 여러 Riot 계정의 기록을 사용자 기준으로 합산한다.

**근거** `samples/개별 전적 참고자료.png`의 머리·최근 10게임·챔피언 성적·듀오 구성을 따른다. 등급(A·B)·상위 %·레이더 차트는 지표 정의가 정해지기 전이라 두지 않는다.

**권한** 서버 열람 권한 + 대상의 공개 설정(정책 미결정). 비공개면 `load`에서 403 또는 404.

**데이터** (`lib/features/players/`의 `PlayerGame`·`summarize`·`championRecords`·`duoRecords`)

```ts
{
  player: { userId, displayName, iconUrl, riotIds: string[] },          // riotIds는 공개 허용 시에만
  recent: { matchId, gameId, win, champion }[],                         // 포지션 필터와 무관한 최근 10게임
  positions: { key: LolPosition, games }[],                             // 실제로 플레이한 포지션만
  position: LolPosition | 'all',
  summary: { games, wins, kills, deaths, assists, kda, csPerMin, damagePerMin, visionPerGame,
             killParticipation, mainPosition } | null,
  champions: { champion, games, wins, kda }[],
  duos: { best: DuoRecord[], worst: DuoRecord[] },                      // 함께 3게임 이상, 두 목록에 같은 사람 없음
  mmr: { position, rating, games }[],
  history: PlayerGame[], total, page, pageSize
}
```

**화면**

```text
[img] [h1] 쌀숭이
       쌀숭이#KR1
최근 10게임  [아이콘 테두리 승=초록 · 패=빨강] …        ← 각각 경기 상세 링크

[Tab] 전체 45 | 탑 11 | 정글 19 | 서폿 15                 ← 요약·챔피언·최근 게임에 적용
┌ 왼쪽 ───────────────────────────────┐ ┌ 오른쪽 20rem ─┐
│ [h2] 핵심 지표  Grids 4열(모바일 2) │ │ 포지션별 MMR  │
│   게임 · 승률 · KDA · 킬 관여       │ │ <table>       │
│   분당 CS · 분당 피해량 · 시야 · 주 포지션 │ 베스트 듀오   │
│ [h2] 챔피언별 성적 (상위 6, 모두 보기) │ 워스트 듀오   │
│ [h2] 최근 게임  LinkCell + Pagination │ └──────────────┘
└─────────────────────────────────────┘
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 최근 10게임 | 챔피언 아이콘 링크(승패 테두리 + `sr-only` 결과) | `/matches/[matchId]?game=[gameId]` |
| 포지션 필터 | `Tab` (라벨에 게임 수) | `?position=`. 실제로 플레이한 포지션만. 선택 범위를 지표 제목에 반복하지 않는다 |
| 핵심 지표 | `Grids` + `Grid` (`desktop.current`로 4/2열) | 게임 칸 아래에 승패, KDA 칸 아래에 평균 K/D/A |
| 챔피언별 성적 | 카드 목록, 상위 5개에 순위 배지 | 6개까지 보이고 `챔피언 N개 모두 보기`/`접기`. 포지션을 바꾸면 다시 접는다 |
| 최근 게임 | `CellGroup` + `LinkCell` | 챔피언·포지션 아이콘, K/D/A·CS, 내전·날짜, `detailChild`에 승/패 `StatusTag`. 10개씩 `Pagination` |
| MMR | `<table>` | 포지션·MMR·게임 |
| 듀오 | `DuoList` | 함께한 게임 수와 승률, 사용자 전적 링크. 없으면 "세 게임 이상 함께한 사람이 없어요" |

**미결정** 열람 정책·비공개 응답, 기본 집계 기간, MMR·Riot ID 노출 범위, 탈퇴자 처리, 등급·상위 % 지표와 레이더 차트.

## `/g/[guildId]/stats` — 서버 통계

**목적** 서버 전체 누적 지표와 사용자별 순위를 본다.

**근거** `samples/서버통계부분.png`의 지표 카드·업적·리더보드 구성을 따른다. 기간·시즌 범위와 OPS·등급 열은 정책이 정해지면 추가한다.

**화면**

```text
[h1] 통계
[Grids 6열(모바일 2)] 총 게임 | 참가자 | 평균 게임 시간 | 분당 킬 | 평균 KDA | 사용한 챔피언
[Tab] 전체 | 탑 | 정글 | 미드 | 원딜 | 서폿                ← 업적·리더보드·챔피언에 적용
[h2] 업적  (어두운 카드 6개, 모바일 가로 스냅)          ← 딜량 왕·KDA 장인·시야 장인·한타 중독·CS 머신·챔피언 폭
[h2] 리더보드        최소 게임 [Stepper]  13명 / 18명
<table> 순위 | 사용자 | 게임 | KDA | 승률 | 킬 관여 | CS/분 | 피해/분 | 시야   ← 열 머리로 정렬, 20명씩
[h2] 챔피언
<table> 챔피언 | 픽 | 승률 | KDA     ← 픽 많은 순, 5픽 미만은 승률 `-`, 15개씩 Pagination
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 핵심 지표 | `Grids` + `Grid` | 게임 수는 사용자 게임 수 ÷ 10, 분당 킬은 게임 1분당 |
| 포지션 | `Tab` | `?position=` |
| 업적 | 사용자 전적 링크 카드 | 4게임 이상인 사람 중 지표 1위 |
| 리더보드 | `LeaderboardTable` | `?min=`(기본 5)로 표본 기준. 열 머리 버튼으로 정렬(`aria-sort`), 다시 누르면 방향 전환. 모바일은 순위·사용자·게임·KDA·승률만 |
| 챔피언 | `<table>` + 챔피언 아이콘, `Pagination` | |

**상태** 게임 없음: "아직 기록된 게임이 없어요" (지표 0 대신). 리더보드 표본 없음: "{N}게임 이상 뛴 사람이 없어요".

**미결정** 지표·계산식·최소 표본, 기간·시즌 범위, 업적 기준·종류, 공개 범위, 갱신 주기.
