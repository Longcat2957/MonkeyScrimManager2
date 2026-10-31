# 내전 페이지

작성일: 2026-10-30. 목록은 서버 범위 헤더, `[scrimId]` 하위는 내전 범위 헤더를 쓴다.

## 데이터 계약 요약

화면이 지켜야 하는 DB 규칙. 서버가 검증하고 화면은 같은 규칙으로 버튼 활성·안내를 정한다.

- 실출전 정원 = 팀 수 × 5. 전체 신청 정원 = 실출전 정원 + 추가 신청 정원(`reserveCapacity`). 팀 수 ≥ 2.
- 신청 상태: `pending` 신청 → `selected` 선발 / `standby` 대기, 종료 상태 `withdrawn` 철회 / `excluded` 제외. 활성 신청은 참가자당 하나. 같은 사용자·같은 Riot 계정 중복 참가 불가.
- 신청 순서로 자동 선발하거나 철회 시 대기자를 자동 승급하지 않는다.
- 팀 편성 시작 조건: 선발 수 = 실출전 정원, 편성 방식 결정.
- 경매: 열린 후보는 하나. 유효 영입은 참가자당 하나. 시작 후 팀·팀장·시작 포인트 변경 불가. 구매 정정은 원래 기록을 보존한다. 0점 낙찰과 가격 없는 수동 배정을 구분한다.
- 경기 시작 후 팀 재편성 불가(새 내전으로). Game 생성 후 시리즈 A/B 팀 변경 불가. 경기 시작 후 BO·피어리스 변경 불가.

## `/g/[guildId]/scrims` — 내전 목록

**목적** 내전을 찾아 열거나, 새 모집을 만든다.

**권한** 열람: 서버 열람 권한. 생성: `can.createScrim`.

**데이터**

```ts
{
  scrims: { id, title, status, scheduledAt: string | null, formationMethod, registered, capacity }[],
  total, page, statusFilter: 'all' | 'recruit' | 'active' | 'done',
  counts: Record<statusFilter, number>,
  can: { createScrim: boolean }
}
```

**화면**

```text
[h1] 내전                                                       [모집 만들기]
[Tabs] 전체 24 | 모집 중 2 | 진행 중 1 | 종료 21
─────────────────────────────────────────────────────────────────────────
[10월]  10월 정기 내전                                       [모집 중]
[ 31 ]  토 20:00 · 수동 편성 · 신청 8/12명                     신청함
[미정]  방식 미정 내전                                       [모집 중]
        신청 3/14명
…
[Pagination]
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 모집 만들기 | `Button fill="base" size="auto"` | `can.createScrim`일 때만. 모집 생성 팝업 열기 |
| 상태 필터 | `Tab` (라벨에 개수) | `?status=` 변경. `active` = 편성 중·대진 준비·진행 중, `done` = 종료·중도 종료·취소 |
| 목록 | `CellGroup` + `ScrimListRow` → `/scrims/[id]` | 서버 홈과 같은 행. 날짜 배지, 부제 = 요일·시각 · 편성 방식 · 신청/정원(모집 중) 또는 팀 수, 오른쪽 상태와 내 신청. 데스크톱은 상태 왼쪽에 참가자 얼굴 `AvatarStack`(선발 우선 5명 + 남은 수) |
| 페이지 | `Pagination pageSize={20}` | `?page=` |

정렬: 예정 시각이 있는 내전은 가까운 순, 없는 내전은 생성 최신순으로 뒤에. (확정 전 제안)

### 모집 생성 팝업

```text
[h2] 모집 만들기
[Input]    제목                        필수, 최대 50자
[Input]    날짜 (readonly → Calendar)  [Input] 시각 HH:mm       둘 다 비우면 일정 미정
[Stepper]  팀 수        2               [Stepper] 추가 신청 정원  2
           → "실출전 10명 · 최대 신청 12명"                      ← 입력값에서 계산한 한 줄
[Radio]    편성 방식    (미정) (수동) (경매)
[Switch]   하드 피어리스
                                              [취소] [만들기]
```

| 필드 | 컴포넌트 | 검증 |
| --- | --- | --- |
| 제목 | `Input maxlength={50} required` | 공백만 불가 |
| 날짜 | `Input readonly` → 아래에 펼치는 `Calendar mode="single" popup={null}` | 시각만 입력하면 오류 |
| 시각 | `Input inputmode="numeric" placeholder="20:00"` | `HH:mm`, 날짜만 입력하면 오류 |
| 팀 수 | `Stepper min={2} max={4}` | 상한은 미결정 |
| 추가 신청 정원 | `Stepper min={0} max={10}` | |
| 편성 방식 | `Radio` 3개, 기본 `미정` | |
| 하드 피어리스 | `Switch` + 라벨 텍스트 | 기본 꺼짐 |

성공 시 팝업을 닫고 `goto('/g/[guildId]/scrims/[newId]')`. 예정 시각은 서버 시간대 기준 표시(미결정).

**상태** 빈 서버: "아직 내전이 없어요". 필터 결과 없음: "조건에 맞는 내전이 없어요".

**미결정** 생성 권한, 팀 수 상한, 지난 시각 허용 여부, 표시 시간대, 기본 정렬.

## `[scrimId]` 공통 — `ScrimSummary`

내전 하위 세 페이지(요약·팀 편성·대진) 맨 위에 한 번 표시한다. `[scrimId]/+layout.svelte`가 렌더링한다. 경매 화면은 작업판을 넓게 쓰도록 `compact`로 제목·일정 한 줄만 표시한다(카드·Steps 없음).

```text
┌ 어두운 카드 (배경: 전체 챔피언 중 무작위 스플래시) ────────────────────┐
│ [h1] 10월 정기 내전  (● 모집 중)                                          │
│ (10/31(토) 20:00) (2팀) (수동 편성) (하드 피어리스)      ← 설정 칩       │
└────────────────────────────────────────────────────────────────────────────┘
  (✓)────(2)────(3)────(4)────(5)        ← STDF Steps, 전체 폭
  모집   편성   대진   진행   종료
```

| 상태 | `Steps current` (1부터 셈) |
| --- | --- |
| `recruit` | 1 모집 |
| `preparing` | 2 편성 |
| `ready` | 3 대진 |
| `in_progress` | 4 진행 |
| `completed` | 6 (모든 단계 완료) |
| `ended_early`, `cancelled` | `Steps`를 렌더링하지 않고 상태 표시만 |

- 진행 단계 표시는 MSM1의 운영 단계 표시처럼 완료·현재·예정이 모양으로 구분되어야 한다. `Steps`의 단계마다 `step.bar`에 번호, `finishStep.bar`에 `✓`를 주고 `radius="full"`로 원형 막대를 쓴다(기본 점 막대는 완료와 예정이 같은 빈 원이라 쓰지 않는다).
- `Steps`는 목록 구조와 현재 단계를 알리지 않으므로 화면용 `Steps`는 `aria-hidden`, 같은 내용을 `sr-only` `<ol>`에 `aria-current="step"`으로 둔다.
- 어두운 카드 위에서는 `StatusTag`가 묻히므로 흰 글자 + 상태색 점으로 상태를 표시한다.

## `/g/[guildId]/scrims/[scrimId]` — 요약

**목적** 참가자는 자신의 신청을 관리하고, 운영자는 참가자를 선발하고 내전을 다음 단계로 진행한다.

**권한** 열람: 서버 열람 권한. 신청: 로그인 + 연결된 Riot 계정. 운영: `can.manage`.

**데이터**

```ts
{
  scrim,                                               // 레이아웃에서
  me: { registration: { id, status, riotAccountId, positions } | null, riotAccounts, primaryAccountId } | null,
  participants: { registrationId, userId: string | null, displayName, iconUrl: string | null, riotId: string | null,
                  positions: LolPosition[], status, registeredAt }[],
  counts: { pending, selected, standby, withdrawn, excluded, activeCapacity, playCapacity },
  settings, editable,                                  // 운영자의 설정 수정 팝업용
  can: { register, registerBlockedReason, editRegistration, manage, select, nextAction: { key, label, blockedReason } | null }
}
```

**화면** MSM1의 모집 화면처럼 한 열로 둔다. 내 작업(내 신청·운영)은 한 상자에 한 줄씩, 그 아래 참가자 패널 하나.

```text
ScrimSummary
┌──────────────────────────────────────────────────────────────────────────┐
│ 내 신청 [신청] Hide on bush#KR1 (미드)(탑)                   철회  [수정] │  ← 미신청이면 오른쪽 [신청하기]
├──────────────────────────────────────────────────────────────────────────┤
│ 운영  선발 인원이 10명이어야 해요 (현재 8명)            [⋯] [모집 마감]  │  ← can.manage
└──────────────────────────────────────────────────────────────────────────┘
┌ 참가자  신청 11/12명  선발 8/10명                          [선발 관리] ┐
│ [Tab] 전체 13 | 신청 3 | 선발 8 | 대기 0 | 철회·제외 2                  │
│ [img] 홍길동  Hide on bush#KR1                     (미드)(탑)   [선발]  │
│ …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 내 신청 — 미신청 | 한 줄: 제목 + 오른쪽 `신청하기` `Button` | `RegistrationDialog`(`Popup` + `<form>`): Riot 계정 `Radio layout="v"`(계정 1개면 고정 텍스트, 기본 선택은 대표 계정), 희망 포지션 `Checkbox` 5개. 성공 시 팝업이 닫히고 줄이 신청 상태로 바뀜(알림 없음) |
| 내 신청 — 신청함 | 한 줄: 상태 `Tag`, 계정, 포지션 칩. 오른쪽 `철회`(`fill="textState" state="error"`) · `수정`(`fill="lineLight"`) | 수정: 같은 팝업. 철회: `confirm` |
| 내 신청 — 불가 | 한 줄에 `can.registerBlockedReason` | 예: "모집이 마감됐어요", "Riot 계정을 연결해야 신청할 수 있어요 — 계정 메뉴의 내 정보에서 연결해요". `/me` 링크를 따로 두지 않는다 |
| 운영 — 다음 단계 | 한 줄 오른쪽 `Button` 하나 (`can.nextAction`) | 조건 미충족이면 `disabled` + 같은 줄 왼쪽에 이유. 누르면 `confirm` |
| 운영 — 기타 | `⋯` `Button` + `ActionMenu` | `내전 설정 수정`(`ScrimSettingsDialog`, 단계에 따라 편집 가능 필드 제한) · `내전 취소`(`confirm`, `style="error"`) |
| 참가자 — 머리 | 패널 안 제목 + `신청 11/12명`(운영자는 `선발 8/10명`도) + `선발 관리` | |
| 참가자 — 필터 | `Tab` (데스크톱만 라벨에 개수) | 클라이언트 필터(쿼리 없음). 모바일 폭에는 숫자를 뺀다(신청·선발 수는 머리에 있음) |
| 참가자 — 보기 | `<ul>` + `PlayerName`(주 챔피언 아이콘) + 포지션 칩(첫 포지션 강조) + `Tag` | `PlayerName`이 `/players/[userId]` 링크. `userId` 없으면 링크 없음 |
| 참가자 — 선발 관리 | `선발 관리` → 같은 패널 본문을 `List batchSelectable batchMode`로 전환 | `batchActions`: `선발`(success) · `대기`(info) · `제외`(error → `confirm`). `완료`로 보기 목록 복귀. 이 모드에서는 이름 링크 없음 |

**상태**

| 상황 | 처리 |
| --- | --- |
| 정원 마감 | 내 신청 줄: "신청 정원이 찼어요". 신청 버튼 미렌더링 |
| 동시 신청으로 마감 | 제출 409 → 팝업 안 오류 문구 + `invalidateAll()` |
| 사용자 연결이 사라진 참가 기록 | 이름만 표시, 링크 없음 |
| 종료·중도 종료·취소 | 내 작업 상자 미렌더링. 참가자 패널만 |

**미결정** 운영 권한 부여, 계정 미연결 참가 허용, 희망 포지션 개수·순위, 신청 수정·철회 마감 시점, 제외 사유 공개, 상태 전이(다음 단계 버튼의 목록과 조건).

## `/g/[guildId]/scrims/[scrimId]/teams` — 팀 편성 진입

`load`가 방식에 따라 redirect한다([routing.md 1.2](../routing.md#12-teams-진입-규칙)). 렌더링되는 경우는 방식 미정뿐이다.

```text
ScrimSummary
[h2] 팀 편성
편성 방식이 정해지지 않았어요.                       ← 열람자
요약의 내전 설정에서 편성 방식을 정할 수 있어요.      ← 운영자에게만 덧붙임
```

## `/g/[guildId]/scrims/[scrimId]/teams/manual` — 수동 편성

**목적** 운영자가 선발 참가자를 팀·포지션에 배정하고 확정한다. 열람자는 결과를 본다.

**근거** MSM1의 엔트리 편성(`EntryDraftBoard`·`EntryTeamColumn`·`EntryCandidatePool`·`entryDraft.ts`). 팀×포지션 자리, 드래그 앤 드롭과 탭 선택 배치, 자리 교환 규칙, 미배정 목록, 배치 수 요약, 초기화, 팀 평균 MMR, 상세 보기(팀 시너지·라인 상대 전적, `EntrySynergyRail`·`EntryHeadToHeadRail`)를 따른다.

**레이아웃** MSM1 작업판([design-system 5.1](../design-system.md#51-작업판-레이아웃-팀-편성경매)): 도구 줄 → 팀 열(두 팀이면 BLUE·RED, 자리마다 포지션 아이콘) → 미배정 목록이 1px 경계로 붙는다. 상세를 열면 `[1팀 시너지 | 1팀 | 라인 상대 전적 | 2팀 | 2팀 시너지]`.

**데이터**

```ts
{
  scrim,                                                // 레이아웃
  formation: { teams: { id, name }[],
               players: { registrationId, userId, displayName, iconUrl, positions, mmr: Record<LolPosition, number> }[],
               assignments: Record<registrationId, `${teamId}:${LolPosition}`>,
               confirmed: boolean,
               pairs: Record<'a|b', { together: { plays, wins }, against: { plays, firstWins } }> } | null,  // 모집 중이면 null
  can: { edit: boolean }                                // 운영자 + 편성 중 + 미확정
}
```

**화면**

```text
[h2] 수동 편성  6/10 배치                           [상세] [초기화] [편성 확정]
홍길동 선택됨 · 놓을 자리를 누르세요 [선택 취소]   ← 선택 중. 아니면 "미배정 4명이 남았어요"
grid lg:grid-cols-2 (팀 수만큼)
┌ 1팀  평균 MMR 1,565        [이름 변경] ┐
│ 탑   [img] 개발자  탑 1,627          × │   ← 자리 MMR, 희망 포지션 밖이면 "희망 외"
│ 정글 [   여기에 배치   ]               │   ← 선택 중이면 빈 자리·다른 사람 자리가 대상 버튼
│ …                                      │
└────────────────────────────────────────┘
┌ 미배정 4명 ────────────────────────────┐
│ [img] 강감찬 (정글)(서폿) 1,573  …     │
└────────────────────────────────────────┘
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 끌어 놓기 | 자리·미배정 타일 `draggable`, 자리·미배정 목록이 놓기 대상 | 자리에 놓으면 배치·교환, 미배정 목록에 놓으면 배정 해제. 놓을 수 있는 대상은 강조 |
| 참가자 선택 | 자리·미배정 타일 `<button aria-pressed>` | 누르면 선택, 다시 누르거나 `Escape`·`선택 취소`로 해제 |
| 배치·교환 | 선택 중의 자리 타일 `<button>` | 빈 자리면 배치. 사람이 있으면 서로 바뀜(옮기는 사람에게 원래 자리가 없으면 상대는 미배정) |
| 배정 해제 | 자리 오른쪽 `×` `Button` | 미배정으로 |
| 팀 이름 | `이름 변경` → `TeamNameDialog`(`Popup` + `Input`) | 최대 20자 |
| 상세 | `상세`/`상세 닫기` `Button` | 팀 카드 아래 시너지(탑-정글·정글-미드·원딜-서폿이 같은 팀으로 뛴 전적), 두 팀이면 가운데 라인 상대 전적(왼쪽 팀 기준 승패·우위) |
| 초기화 | `Button fill="lineLight"` → `confirm` | 모두 미배정 |
| 편성 확정 | `Button` → `confirm('확정하면 팀을 바꿀 수 없어요')` | 미배정이 있으면 비활성 + 이유. 확정하면 내전이 대진 준비로 |

배정·해제·이동은 서버에 즉시 저장하고 화면은 응답 전에 먼저 바꾼다(낙관적 갱신). 실패하면 되돌리고 `toast.error`.
확정 후·열람자는 같은 팀 카드를 조작 없이 표시하고, 확정 전 열람자에게는 미배정 목록도 보인다.

**상태** 모집 중: "모집이 마감되면 선발된 참가자로 팀을 편성할 수 있어요".

**미결정** 저장 단위(즉시/일괄), 확정 해제 허용, 포지션 미지정 허용, 팀 이름 규칙.

## `/g/[guildId]/scrims/[scrimId]/teams/auction` — 경매

**목적** 운영자가 팀장·포인트를 정하고 후보를 한 명씩 뽑아 낙찰·유찰을 기록한다. 열람자는 진행 상황을 본다.

**근거** MSM1의 `AuctionTournamentCaptainPointSetupBoard`(준비)와 `AuctionTournamentBidDraftWorkbench`(진행). 팀장 지정 순서, 팀 카드의 입찰 입력·±10·낙찰, 무작위 다음 후보, 현재 후보 상세보기, 현재·유찰 후보를 팀 카드로 끌어 수동 배치, 유찰자 다시 올리기, 대기 순서 섞기, 마지막 기록 되돌리기, 초기화, 조정 타이머(10초)를 따른다. 팀당 5명이며 팀장이 한 자리를 차지한다.

**데이터**

```ts
{
  auction: {
    status: AuctionStatus,
    teams: { id, name, captainId, startPoints, remainingPoints,
             members: { player, via: 'captain' | 'auction' | 'manual', price: number | null }[] }[],
    players,                         // 선발 참가자 전체(준비 단계의 팀장 후보)
    openLot: player | null, queue: player[], unsold: player[],
    history: { id, order, displayName, result: 'sold' | 'unsold' | 'manual', teamName, price, voided }[],
    openProfile: { summary, mainLane, championRecords, laneGames, preferredChampions, recentGames, riot } | null
  } | null,                          // 모집 중이면 null
  can: { manage: boolean }
}
```

### 준비 (`setup`)

```text
[h2] 경매 준비                                         [설정 저장] [경매 시작]
모든 팀의 팀장을 정해야 해요                       ← 시작할 수 없는 이유 한 줄
┌ 팀장 고르기 ────────┐  ┌ 1팀 ─────────────┐ ┌ 2팀 ──────┐
│ [Input 검색]         │  │ [img] 김철수 팀장 │ │ 팀장 미지정│
│ 개발자 (미드)  후보  │  │ 시작 포인트 [1000]│ │ …          │
│ 김철수 (정글) 1팀 팀장│  └──────────────────┘ └────────────┘
```

- 참가자를 누르는 순서대로 비어 있는 첫 팀의 팀장이 되고, 다시 누르면 해제(`aria-pressed`).
- 시작 포인트는 `Input inputmode="numeric"`, 1 이상의 정수.
- `경매 시작`은 저장된 설정이 완성돼야 활성. 누르면 `confirm('시작하면 팀장과 시작 포인트를 바꿀 수 없어요')`. 시작 시 남은 참가자를 무작위 순서로 대기열에 넣는다.

### 진행 (`in_progress`)

**레이아웃** MSM1 입찰 진행 화면: 한 줄 내전 머리 → 상태 줄(`경매` + 상태 태그) → 크게 둔 조정 타이머 막대(남은 초, 10~7초 녹색 · 6~3초 주황 · 3초 미만 빨간색) → 작업판 `[현재 매물(라인·티어 배지, 큰 얼굴·이름·MMR, 승률·승패·최근) / 후보 현황(후보 목록·순서 섞기·초기화 + 현재·대기·유찰 수) | 팀 패널 2×2]`. 현재 매물 머리에 `되돌리기`·`상세보기`·`다음 후보`. 유찰자 배치·다시 올리기는 `후보 목록` 팝업에서.

```text
경매 내전  11/2(월) 21:00                    ← compact 내전 머리
[h2] 경매 (진행 중)
[████████████████████████░░░░░░░░ 6초]       ← 조정 타이머, 녹색→주황→빨강
xl:grid-cols-[24rem_1fr]
┌ 현재 후보 ──────────┐   ┌ 1팀 · 김철수      980P ┐ ┌ 2팀 … ┐
│                      │   │ 시작 1000P  인원 2/5    │
│      [img]           │   │ ▮▮▯▯▯                    │
│      황진이 (정글)   │   │ [입찰가] [±10][낙찰]     │
│ 탑 정글 미드 원딜 서폿│   │ 김철수 팀장 / 김유신 20P │
│ [유찰]               │   └──────────────────────────┘
└──────────────────────┘
┌ 유찰 1명: 황진이 [1팀 배치][2팀 배치]… [다시 올리기] ┐
┌ 대기 12명: 이름 칩(이름순) ┐
[Accordion] 경매 기록 (n)  → <table> 순서·후보·결과·팀·가격, 되돌린 기록은 취소선 + "(되돌림)"
```

| 영역 | 사용 | 동작 (운영자) |
| --- | --- | --- |
| 현재 후보 | 카드: `PlayerFace` 큰 얼굴, 포지션 칩, 포지션별 MMR 5칸(희망 포지션 강조) | `유찰`. 후보가 없으면 `다음 후보 뽑기`(대기열에서 무작위). 얼굴 영역을 팀 카드로 끌면 가격 없는 수동 배치 |
| 상세보기 | `AuctionTargetProfile` | 내전 전적·주력 챔피언·라인별 MMR과 게임 수·선호 챔피언·최근 게임·Riot 전적. 열면 위의 MMR 5칸은 숨긴다 |
| 조정 타이머 | 토큰 막대 + 남은 초 | 작업판 위 전체 폭. 후보·입찰가가 바뀌면 10초로 다시 참. 10~7초 `success`, 6~3초 `warning`, 3초 미만 `error` 색. 결과를 강제하지 않는 안내 |
| 입찰가 조정 | `Button` `±10` | 좌클릭 +10, 우클릭 −10(감싸는 요소의 `contextmenu`). 키보드는 입찰가 직접 입력 |
| 팀 카드 | 남은 포인트, 인원 막대 5칸, 입찰 `Input` + `−10`·`+10` + `낙찰` | 가격 ≤ 남은 포인트, 정원 미만. 0점 낙찰 허용 |
| 유찰 | 팀별 `○팀 배치`(가격 없는 수동 배치) · `다시 올리기`(현재 후보로), 팀 카드로 끌어 놓기 | 진행 중인 후보가 있으면 비활성 |
| 대기 | 이름 칩 + `순서 섞기` | 다음 후보는 대기열 앞에서 뽑는다 |
| 되돌리기 | `마지막 기록 되돌리기` → `confirm` | 마지막 기록을 무효로 남기고 그 후보를 다시 현재 후보로. 기존 현재 후보는 대기열 맨 앞 |
| 초기화 | `Button fill="textState" state="error"` → `confirm` | 모든 기록을 무효로, 팀장·시작 포인트만 남김 |

모든 작업은 서버 확인 후 갱신한다(낙관적 갱신 없음). 충돌하면 `toast.error` + 최신값.
열람자에게는 조작 대신 `새로고침`(`invalidate('app:auction')`)을 둔다. 실시간 갱신 방식은 미결정.
모든 팀 정원이 차면 자동으로 완료되고 내전은 대진 준비로 넘어간다.

### 완료·취소

완료: 상태 줄 + 팀 카드(조작 없음) + 기록 `Accordion`. 경매 취소를 내전 취소로 표시하지 않는다.

**미결정** 시작 포인트·가격 단위, 유찰자 재등장 규칙, 구매 정정 권한·시점, 시작 전 팀장 교체, 열람자 실시간 갱신 방식, MMR 노출 여부, 최소 입찰 단위.

## `/g/[guildId]/scrims/[scrimId]/bracket` — 대진

**목적** 운영자가 라운드와 대진을 구성하고, 모두가 시리즈 진행을 본다. 게임 결과 등록은 경기 상세가 담당한다.

**데이터**

```ts
{
  rounds: { id, order, bestOf,
            matches: { id: string | null, slotA: Slot, slotB: Slot, scoreA, scoreB, status, winner: 'a' | 'b' | null }[] }[],
  can: { manage: boolean }
}
// Slot = { kind: 'team', teamName } | { kind: 'winnerOf', label: '1라운드 1경기' } | { kind: 'empty' }
```

**화면**

```text
데스크톱: 라운드를 가로 열로 (grid-flow-col auto-cols-[18rem] overflow-x-auto)
[h2] 대진                                                   [라운드 추가]
 1라운드 · BO3                     결승 · BO5
 ┌ Card 1경기 ───────[편집]┐      ┌ Card 결승 ──────────┐
 │ <a> 1팀       2   승    │      │ 1경기 승자    -     │
 │     2팀       1         │      │ 2경기 승자    -     │
 └─────────────────────────┘      └─────────────────────┘
 ┌ Card 2경기 ─────────────┐
 │ <a> 3팀  …              │
 └─────────────────────────┘
 [경기 추가]                        [경기 추가]

모바일: [Tabs] 1라운드 | 결승   → 선택한 라운드의 카드만 한 열
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 라운드 열 제목 | `h3` "1라운드 · BO3" | 운영자: 제목 옆 `⋯` `ActionPopover` → `BO 변경`(시작 전만) · `라운드 삭제`(빈 라운드만) |
| 경기 카드 | `Card` (`onclick` 없음) | 본문의 두 팀 행 전체가 `<a href="/matches/[id]">`. Match가 아직 없으면 링크 없음 |
| 팀 행 | 팀 이름 + 점수(`tabular-nums`) + 승자에 "승" 글자 | 미정 자리: "1경기 승자" 또는 "미정"을 흐린 텍스트로 |
| 카드 편집 | `header`의 `Button fill="text"` `편집` (운영자) | `Popup` + `<form>`: A·B 자리 각각 `Radio` [팀 지정 / 이전 경기 승자] + `ActionSheet`(팀 또는 경기). 순환·중복 검증 |
| 라운드 추가 | `Button fill="lineLight"` | `Popup`: BO `Radio` (1·3·5) |
| 경기 추가 | 라운드 열 아래 `Button fill="text"` | 빈 카드 생성 후 편집 팝업 열기 |
| 라운드 전환 (모바일) | `Tabs` | 클라이언트 상태 |

**상태**

| 상황 | 처리 |
| --- | --- |
| 팀 미확정 | "팀 편성이 끝나면 대진을 만들 수 있어요". 라운드 추가 미렌더링 |
| 대진 없음 | 운영자: `라운드 추가`만. 열람자: "아직 대진이 없어요" |
| 한 팀만 정해짐 | 자동 승리로 표시하지 않는다 |
| 중도 종료·취소 시리즈 | 상태 `Tag`, 승자 표시 없음 |

**미결정** 지원 대진 형식, 자동 생성 여부, 승자 자동 반영 시점, Match 생성 시점, 부전승·순위 결정전, 부분 완료 후 수정 범위.
