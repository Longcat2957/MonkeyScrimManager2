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
| 상태 필터 | `Tabs` + `Tab showNum` | `?status=` 변경. `active` = 편성 중·대진 준비·진행 중, `done` = 종료·중도 종료·취소 |
| 목록 | `CellGroup` + `ScrimListRow` → `/scrims/[id]` | 서버 홈과 같은 행. 날짜 배지, 부제 = 요일·시각 · 편성 방식 · 신청/정원(모집 중) 또는 팀 수, 오른쪽 상태와 내 신청 |
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
| 날짜 | `Input readonly` → `Calendar mode="single"` | 시각만 입력하면 오류 |
| 시각 | `Input inputmode="numeric" placeholder="20:00"` | `HH:mm`, 날짜만 입력하면 오류 |
| 팀 수 | `Stepper min={2} max={4}` | 상한은 미결정 |
| 추가 신청 정원 | `Stepper min={0} max={10}` | |
| 편성 방식 | `Radio` 3개, 기본 `미정` | |
| 하드 피어리스 | `Switch` + 라벨 텍스트 | 기본 꺼짐 |

성공 시 팝업을 닫고 `goto('/g/[guildId]/scrims/[newId]')`. 예정 시각은 서버 시간대 기준 표시(미결정).

**상태** 빈 서버: "아직 내전이 없어요". 필터 결과 없음: "조건에 맞는 내전이 없어요".

**미결정** 생성 권한, 팀 수 상한, 지난 시각 허용 여부, 표시 시간대, 기본 정렬.

## `[scrimId]` 공통 — `ScrimSummary`

내전 하위 세 페이지(요약·팀 편성·대진) 맨 위에 한 번 표시한다. `[scrimId]/+layout.svelte`가 렌더링한다.

```text
[h1] 6월 정기 내전   [모집 중]
10/31(금) 20:00 · 2팀 · 수동 편성 · 하드 피어리스
[Steps]  모집 ─ 편성 ─ 대진 ─ 진행 ─ 종료        ← current = 상태에 대응하는 단계
```

| 상태 | `Steps current` (1부터 셈) |
| --- | --- |
| `recruit` | 1 모집 |
| `preparing` | 2 편성 |
| `ready` | 3 대진 |
| `in_progress` | 4 진행 |
| `completed` | 6 (모든 단계 완료) |
| `ended_early`, `cancelled` | `Steps`를 렌더링하지 않고 `Tag`만 |

모바일은 `Steps`를 가로 그대로 두되 단계 제목만 표시(`desc` 생략).

## `/g/[guildId]/scrims/[scrimId]` — 요약

**목적** 참가자는 자신의 신청을 관리하고, 운영자는 참가자를 선발하고 내전을 다음 단계로 진행한다.

**권한** 열람: 서버 열람 권한. 신청: 로그인 + 연결된 Riot 계정. 운영: `can.manage`.

**데이터**

```ts
{
  scrim,                                               // 레이아웃에서
  me: { registration: { id, status, riotAccountId, positions } | null, riotAccounts } | null,
  participants: { registrationId, userId: string | null, displayName, riotId: string | null,
                  positions: LolPosition[], status, registeredAt }[],
  counts: { pending, selected, standby, withdrawn, excluded, activeCapacity, playCapacity },
  can: { register: boolean, registerBlockedReason: string | null, manage: boolean, nextActions: Action[] }
}
```

**화면**

```text
ScrimSummary
─────────────────────────────────────────────────────────────────────────────
데스크톱 grid lg:grid-cols-[22rem_1fr]

┌ Card: 내 신청 ──────────────┐   [h2] 참가자   신청 11/12명 [Progress]   [선발 관리]
│ (미신청)                     │   [Tabs] 전체 11 | 신청 3 | 선발 8 | 대기 0 | 철회·제외 2
│ [Input] Riot 계정 ▾          │   ─────────────────────────────────────────────
│ [Checkbox] 희망 포지션       │   [img] 홍길동  Hide on bush#KR1   미드·탑     [선발]
│  □탑 □정글 □미드 □원딜 □서폿 │   [img] 김철수  …                  정글        [신청]
│              [신청하기]      │   …
└──────────────────────────────┘
┌ Card: 운영 (can.manage) ────┐
│ 다음 단계: 모집 마감         │
│ [모집 마감] ← disabled+이유  │
│ [ActionPopover ⋯] 내전 설정 수정 · 내전 취소
└──────────────────────────────┘
모바일: 내 신청 → 참가자 → 운영 순서 한 열
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 내 신청 — 미신청 | `Card` + `<form>`: Riot 계정 `Input readonly` → `ActionSheet`(계정 1개면 고정 텍스트), 희망 포지션 `Checkbox` 5개, `Button type="submit"` `신청하기` | 성공 시 카드가 신청 상태로 바뀜(알림 없음) |
| 내 신청 — 신청함 | `Card`: 상태 `Tag`, 계정, 포지션. `footer`에 `수정`(`fill="lineLight"`) · `철회`(`fill="text" state="error"`) | 수정: 같은 카드가 폼으로 전환. 철회: `confirm` |
| 내 신청 — 불가 | `Card`에 `can.registerBlockedReason` 한 줄 | 예: "모집이 마감됐어요", "Riot 계정을 연결해야 신청할 수 있어요 — 계정 메뉴의 내 정보에서 연결해요". `/me` 링크를 따로 두지 않는다 |
| 참가자 — 정원 | 텍스트 `신청 11/12명` + `Progress` | 운영자에게는 `선발 8/10명`도 같은 줄에 |
| 참가자 — 필터 | `Tabs showNum` | 클라이언트 필터(쿼리 없음) |
| 참가자 — 보기 | `<ul>` + `PlayerName` + 포지션 텍스트 + `Tag` | `PlayerName`이 `/players/[userId]` 링크. `userId` 없으면 링크 없음 |
| 참가자 — 선발 관리 | `선발 관리` `Button` → 같은 자리를 `List batchSelectable batchMode`로 전환 | `batchActions`: `선발`(success) · `대기`(info) · `제외`(error → `confirm`). `완료`로 보기 목록 복귀. 이 모드에서는 이름 링크 없음 |
| 운영 — 다음 단계 | `Button fill="base"` 하나 (`can.nextActions[0]`) | 조건 미충족이면 `disabled` + 아래 이유. 예: "선발 인원이 10명이어야 해요 (현재 8명)" |
| 운영 — 기타 | `Button fill="text"` `⋯` + `ActionPopover` | `내전 설정 수정`(모집 생성 팝업과 같은 폼, 단계에 따라 편집 가능 필드 제한) · `내전 취소`(`confirm`, `state="error"`) |

**상태**

| 상황 | 처리 |
| --- | --- |
| 정원 마감 | 내 신청 카드: "신청 정원이 찼어요". 신청 폼 미렌더링 |
| 동시 신청으로 마감 | 제출 409 → 카드 안 오류 문구 + `invalidateAll()` |
| 사용자 연결이 사라진 참가 기록 | 이름만 표시, 링크 없음 |
| 종료·중도 종료·취소 | 내 신청·운영 카드 미렌더링. 참가자 목록만 |

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

**데이터**

```ts
{
  teams: { id, name, slots: Record<LolPosition, { registrationId, displayName, userId } | null> }[],
  unassigned: { registrationId, displayName, userId, positions: LolPosition[] }[],
  confirmed: boolean,
  can: { edit: boolean, confirm: boolean, confirmBlockedReason: string | null }
}
```

**화면** (`can.edit` 이고 미확정일 때)

```text
ScrimSummary
[h2] 수동 편성                                              [편성 확정]
                                                  미배정 2명이 남았어요   ← 비활성 이유
데스크톱 grid lg:grid-cols-[20rem_1fr]
[h3] 미배정 2                  │ Card 1팀 [이름 변경]        Card 2팀 [이름 변경]
CellGroup                      │  탑    홍길동  ›             탑    …
 홍길동   미드·탑    ›         │  정글  비어 있음             정글  …
 김철수   정글       ›         │  미드  …                     …
                               │  원딜  …
                               │  서폿  …
모바일: 미배정 → 팀 카드 순서로 한 열
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 미배정 목록 | `CellGroup` + `Cell right="arrow" subTitle=희망 포지션` | 클릭 → 배정 팝업 |
| 배정 팝업 | `Popup` + `<form>`: 팀 `Radio`, 포지션 `Radio`(이미 찬 자리는 라벨에 현재 배정자 표시) | 찬 자리를 고르면 "기존 배정자는 미배정으로 돌아가요" 한 줄. `배정` 제출 |
| 팀 카드 | `Card` (`header`: 팀 이름 + `Button fill="text"` `이름 변경`) | 이름 변경 → `Popup` + `Input` |
| 배정된 자리 | `Cell title=포지션 detail=이름 right="arrow"` | 클릭 → `ActionPopover`: `다른 자리로 이동`(배정 팝업) · `배정 해제` |
| 빈 자리 | 정적 행 "비어 있음" | 동작 없음(배정은 미배정 목록 한 곳에서) |
| 편성 확정 | `Button fill="base"` | `confirm('확정하면 팀을 바꿀 수 없어요')`. 미배정·포지션 미지정이 있으면 비활성 + 이유 |

배정·해제·이동은 서버에 즉시 저장하고 화면은 응답 전에 먼저 바꾼다(낙관적 갱신). 실패하면 되돌리고 `toast.error`. 드래그 앤 드롭은 제공하지 않는다.

확정 후 또는 `can.edit`이 없으면 `TeamRoster`를 `grid lg:grid-cols-2`로 표시만 한다.

**미결정** 저장 단위(즉시 저장으로 할지 초안 후 일괄 저장할지 — 위는 즉시 저장 기준), 확정 해제 허용, 포지션 미지정 허용, 팀 이름 규칙.

## `/g/[guildId]/scrims/[scrimId]/teams/auction` — 경매

**목적** 운영자가 팀장·포인트를 정하고 후보를 한 명씩 올려 낙찰·유찰을 기록한다. 열람자는 진행 상황을 본다.

**데이터**

```ts
{
  auction: { id, status: AuctionStatus },
  teams: { id, name, captain: { registrationId, displayName } | null, startPoints, remainingPoints,
           members: { registrationId, displayName, price: number | null, method: 'auction' | 'manual' }[] }[],
  openLot: { lotId, registrationId, displayName, userId, positions, mmr?: Record<LolPosition, number> } | null,
  remaining: { registrationId, displayName, positions, lastLotStatus: 'unsold' | null }[],
  history: { lotId, displayName, status: AuctionLotStatus, teamName: string | null, price: number | null,
             correctedFrom: { teamName, price } | null, at }[],
  can: { manage: boolean }
}
```

### 준비 (`setup`)

```text
[h2] 경매 준비                                              [경매 시작]
CellGroup (팀마다)
  1팀 팀장       선택 안 함   ›      ← Cell → ActionSheet(선발 참가자)
  1팀 시작 포인트  1000      ›      ← Cell → Popup(Input type=number)
  2팀 …
```

`경매 시작`은 모든 팀의 팀장·시작 포인트가 정해져야 활성. 비활성이면 이유 한 줄. 시작 시 `confirm('시작하면 팀장과 포인트를 바꿀 수 없어요')`.

### 진행 (`in_progress`)

```text
데스크톱 grid lg:grid-cols-[1fr_20rem]
┌ Card: 현재 후보 ─────────────────────────┐   [h3] 남은 후보 12
│ [img] 홍길동   미드·탑                     │   CellGroup (정적)
│ MMR  미드 1620 · 탑 1540                  │    김철수   정글
│                       [유찰] [낙찰 기록]  │    박영희   서폿   (유찰 1회)
└───────────────────────────────────────────┘    …
(후보 없음) 다음 후보를 올려 주세요  [후보 올리기]
[h3] 팀
Grids cols=2 (모바일 1)
 Card 1팀 · 팀장 이몽룡
   잔여 640 / 1000  [Progress]
   영입 2/4: 홍길동 220 · 김철수 140
 Card 2팀 …
[Accordion] 낙찰 이력 (12)
모바일: 현재 후보 → 팀 → 남은 후보 → 이력
```

| 영역 | 사용 | 동작 (운영자) |
| --- | --- | --- |
| 현재 후보 | `Card` | `footer`: `유찰`(`fill="lineLight"`) · `낙찰 기록`(`fill="base"`) |
| 낙찰 기록 팝업 | `Popup` + `<form>`: 팀 `Radio`(라벨에 잔여 포인트), 가격 `Input type="number"` | 가격 ≤ 선택 팀 잔여, 팀 인원 미달 검증. 성공 시 팝업 닫힘 → 팀 카드 갱신(알림 없음) |
| 후보 없음 | 문구 + `후보 올리기` `Button` | `Popup` + `Radio`(남은 후보) → `올리기`. 선정 방식이 정해지면 바뀔 수 있음 |
| 팀 현황 | `Grids` + `Card` + `Progress` | 잔여/시작 포인트를 텍스트로도 |
| 남은 후보 | `CellGroup` 정적 행 | 유찰 횟수 `info` |
| 이력 | `Accordion` 하나, 펼치면 `<table>` | 열: 순서·후보·결과·팀·가격. 정정은 "220 → 180 (정정)"처럼 원래 값과 함께 |

모든 작업은 서버 확인 후 갱신한다(경매는 낙관적 갱신을 하지 않는다). 다른 운영자가 먼저 처리했으면 409 → `toast.error` + `invalidateAll()`.
열람자 화면의 최신화 방식(폴링·SSE)은 미결정이며, 정해지기 전에는 `현재 후보` 카드 제목 옆에 `invalidateAll()`을 부르는 `새로고침` 아이콘 버튼 하나를 둔다.

### 완료·취소

완료: `TeamRoster` 그리드 + 이력 `Accordion`. 취소: 상태 `Tag` + 이력. 경매 취소를 내전 취소로 표시하지 않는다.

**미결정** 시작 포인트·가격 단위, 후보 선정 방식(수동 선택/무작위), 유찰자 재등장 규칙, 수동 배정 허용, 구매 정정 권한·시점, 시작 전 팀장 교체, 열람자 실시간 갱신 방식, MMR 노출 여부.

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
