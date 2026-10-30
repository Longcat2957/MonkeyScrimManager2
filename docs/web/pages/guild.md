# 서버 페이지

작성일: 2026-10-30. 서버 범위 헤더를 쓴다. `g/[guildId]/+layout.server.ts`가 서버 접근을 확인하고 `guild: { id, name, iconUrl, isAdmin }`를 내려준다.

## `/g/[guildId]` — 서버 홈

구현됨(개발 모드 목 데이터). 서비스의 진입 화면이라 **게임 대시보드 톤**으로 만든다. `routes/g/[guildId]/+page.server.ts`, `+page.svelte`, `ranking/+server.ts`.

**목적** 들어온 사람이 "내가 지금 할 일"(다음 내전·신청)을 바로 보고, 서버의 볼거리(이야기·순위)와 최근 결과로 이어진다.

**권한** 서버 열람 권한. 레이아웃이 서버 문맥을 주지 못하면 `load`에서 404.

**데이터** 영역마다 따로 조회해(`Promise.allSettled`) 한 영역 실패가 페이지 전체를 막지 않게 한다.

```ts
{
  guild,
  nextScrim: NextScrim | null,                     // { kind: 'mine' | 'open', scrim, hardFearless, artUrl }
  activeScrims: SectionResult<ScrimListItem[]>,    // nextScrim으로 보여 준 내전은 뺀다
  recentMatches: SectionResult<MatchListItem[]>,   // 최근 5개, 진행 중 포함
  ranking: SectionResult<GuildRanking | null>,     // 포지션별 첫 10명 + 내 기록. 시즌이 없으면 null
  stories: GuildStory[]                            // 실패하면 빈 배열(영역 숨김)
}
```

`nextScrim` 선정: 내가 참여하는 내전(선발 > 대기 > 신청, 같으면 진행 중 > 가까운 일정)을 먼저, 없으면 지금 신청할 수 있는 가장 가까운 모집. 배경 아트는 내 주 챔피언의 Data Dragon 스플래시.

**화면**

```text
[h1] {서버명}
┌ NextScrimHero (항상 어두운 카드, 챔피언 스플래시 배경) ─────────────────────────────┐
│ 내 다음 내전 [선발됨]                                                                │
│ 경매 내전                                                                            │
│ 11/2(월) 21:00 · 경매 · 4팀                                                          │
│ 시작까지 [3 일][06 시간][58 분][50 초]      ← 진행 중이면 LIVE · 지금 진행 중        │
│ (모집 중이면 신청 현황 Progress)                                                     │
│ [내전 보기 →]                               ← 모집이면 "신청하러 가기"              │
└──────────────────────────────────────────────────────────────────────────────────────┘
이번 주 이야기 [<][>]   (StoryCarousel, 전체 폭 한 줄. 데스크톱 카드 20rem씩 여러 장)
lg: 2열 같은 폭
내전 현황 [진행 중 n | 최근 경기]  (ActivityBoard)    서버 순위 [탑|정글|미드|원딜|서폿]  (RankingBoard)
                                                       카드 안 스크롤 + 더 불러오기, 내 순위 아래 고정
모바일: hero → 이번 주 이야기 → 내전 현황 → 서버 순위
```

**구성**

| 영역 | 사용 | 메모 |
| --- | --- | --- |
| 다음 내전 | `NextScrimHero`: STDF `CountDown`·`Progress` + 링크 버튼 | 카운트다운은 마운트 후에만(SSR과 시각이 달라서), 보조기기에는 읽히지 않게 하고 시작 시각은 메타 문구로 전달. 없으면 "지금 참가할 내전이 없어요" |
| 내전 현황 | `ActivityBoard`: STDF `Tab`(`진행 중 n` · `최근 경기`) + `ScrimListRow` / `MatchListRow` | 한 카드에 두 목록을 탭으로. 진행 중 내전이 없으면 최근 경기 탭부터. hero의 내전은 진행 중 목록에서 제외("다른 진행 중인 내전이 없어요") |
| 이번 주 이야기 | `StoryCarousel` | 연승·연패·최다 킬·역전승·첫 승 카드. 카드는 선수 전적 링크. 가로 스크롤 스냅 + 이전/다음 STDF `Button`. 실제 데이터: 연승·연패·역전은 게임 결과, 킬 수는 ROFL 통계 |
| 서버 순위 | `RankingBoard`: STDF `Tab` + `InfiniteScroll` + `LinkCell` | 포지션별 MMR. 1~3위 메달 색(`--color-medal-*`)과 숫자, 주 챔피언 아이콘, `n전 n승 · 승률`. 카드 안(최대 26rem)에서 스크롤하면 `GET /g/[guildId]/ranking?position=&offset=`로 10명씩. 내 순위는 아직 불러오지 않은 구간에 있을 때만 카드 아래 고정 |

`전체 보기` 링크·모집 생성 버튼은 두지 않는다(헤더 메뉴와 내전 목록이 담당).

**상태**

| 상황 | 처리 |
| --- | --- |
| 참가할 내전 없음 | hero가 빈 안내. 내전 현황은 최근 경기 탭부터 |
| 경기 기록·순위 없음 | 탭 안 빈 문구 / 순위는 `SectionState empty` |
| 한 영역 조회 실패 | 그 영역만 `SectionState error` + `다시 시도`(`invalidate('app:guild-home')`). 스토리는 실패 시 숨김 |
| 순위 추가 조회 실패 | 목록 끝에 "불러오지 못했어요. 눌러서 다시 시도해 주세요" |
| Data Dragon 조회 실패 | 아트·아이콘 없이 표시(배경색, 이름 첫 글자) |

개발 모드 확인: `devGuild002`는 빈 서버, `?preview=error`는 최근 경기 조회 실패.

**미결정** 순위·스토리에 다른 사람의 기록을 보여 주는 공개 범위(개인 공개 설정과의 관계), hero에서 바로 신청할지(현재는 내전 요약으로 이동), 스토리 선정 기준·기간, "진행 중" 범위와 최근 경기 정렬.

## `/g/[guildId]/admin` — 서버 관리

**목적** 서버 관리자가 이 서버의 서비스 설정과 관리자 권한을 관리한다.

**권한** `guild.isAdmin`. 아니면 `load`에서 403. 헤더 `관리` 메뉴도 관리자에게만 렌더링.

**데이터**

```ts
{
  members: { userId, displayName, avatarUrl, isAdmin }[],   // 서비스에 연결된 멤버만
  settings: { recruitChannel: Channel | null, resultChannel: Channel | null },
  channels: { id, name }[]                                  // 게시 설정 채택 시에만
}
```

**화면** (한 열, `max-w-3xl`)

```text
[h1] 서버 관리

[h2] 게시 채널                                        ← 봇 게시 기능 확정 시에만
[CellGroup]
  모집 공지 채널      #내전-모집   ›                   ← Cell → ActionSheet(채널 목록)
  결과 게시 채널      설정 안 함   ›

[h2] 관리자
[Input type=search 멤버 검색]
[CellGroup]
  [img] 홍길동                             [Switch]   ← 관리자 여부
  [img] 김철수                             [Switch]
[Pagination]
```

**구성**

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 게시 채널 | `Cell right="arrow" detail=현재 채널명` → `ActionSheet` | 선택 즉시 저장. 첫 항목 `설정 안 함`. 저장 성공은 `detail` 변경으로 확인되므로 알림 없음 |
| 멤버 검색 | `Input type="search"` | 이름으로 필터(쿼리 `q`) |
| 관리자 권한 | `Cell right={{ type: 'switch' }}` | 켜기는 즉시 저장. 끄기는 `confirm('{이름}님의 관리자 권한을 회수할까요?')` 후 저장. 자신·마지막 관리자는 `switchActive` 고정 + `subTitle`에 이유 |

멤버 초대·추방·Discord 역할 변경은 제공하지 않는다.

**상태**

| 상황 | 처리 |
| --- | --- |
| 채널 목록 조회 실패 (봇 권한 등) | `Cell detail`에 "채널을 불러오지 못했어요", 클릭 시 재조회 |
| 다른 관리자가 먼저 변경 | 공통 충돌 처리([patterns.md 1절](../patterns.md#1-상태-표현)) |
| 작업 중 내 관리자 권한 회수됨 | 다음 저장이 403 → `invalidateAll()` → 페이지 403 |

**미결정** 최초 관리자 지정 방식, 자신·마지막 관리자 회수 규칙, 봇 게시 기능 제공 시점, 이 페이지에서 편집할 다른 설정(MMR 시즌 등).
