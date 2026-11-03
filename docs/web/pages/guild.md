# 서버 페이지

코드 대조일: 2026-11-03. 서버 범위 헤더를 쓴다. `g/[guildId]/+layout.server.ts`는 개발 모드에서 목 서버 ID를 확인하고 `guild: { id, name, isAdmin }`을 내려준다. 실제 서버 소속·열람 권한 조회는 아직 없으며, 운영 모드에는 `guild: null`을 반환해 아래 페이지들이 404가 된다.

## `/g/[guildId]` — 서버 홈

개발 모드 목 데이터로 구현한 **게임 대시보드**다. `routes/g/[guildId]/+page.server.ts`, `+page.svelte`, `ranking/+server.ts`가 담당한다. 내전·경기·MMR 순위는 각 목 저장소를 읽고, 업적은 별도로 합성한 사용자 게임에서 계산한다. Data Dragon 이름·이미지는 실제 카탈로그를 사용한다.

**목적** 들어온 사람이 "내가 지금 할 일"(다음 내전·신청)을 바로 보고, 서버의 볼거리(업적·순위)와 최근 결과로 이어진다.

**권한** 현재는 목 서버 문맥 존재 여부만 확인한다. 레이아웃이 서버 문맥을 주지 못하면 `load`에서 404. 실제 서버 열람 권한 검사는 미구현이다.

**데이터** 영역마다 따로 조회해(`Promise.allSettled`) 한 영역 실패가 페이지 전체를 막지 않게 한다.

```ts
{
  guild,
  nextScrim: NextScrim | null,                     // { kind: 'mine' | 'open', scrim, hardFearless, artUrl }
  activeScrims: SectionResult<ScrimListItem[]>,    // nextScrim으로 보여 준 내전은 뺀다
  recentMatches: SectionResult<MatchListItem[]>,   // 목 저장소의 앞 5개, 진행 중 포함
  ranking: SectionResult<GuildRanking | null>,     // 포지션별 첫 10명 + 내 기록. 시즌이 없으면 null
  achievements: (AchievementRanking & { splashUrl })[] // 서버 통계 업적과 같음. 실패하면 빈 배열(영역 숨김)
}
```

`nextScrim` 선정: 내가 참여하는 내전(선발 > 대기, 같으면 진행 중 > 예정 시각 오름차순)을 먼저, 없으면 내 선발·대기 신청이 없고 정원이 남은 모집을 예정 시각 순으로 고른다. 일정 미정은 뒤로 보낸다. 배경 아트는 전체 챔피언 중 무작위 Data Dragon 스플래시(`randomChampionSplash`).

내전 현황의 `진행 중`에는 `recruit`·`preparing`·`ready`·`in_progress`가 모두 포함되며 예정 시각 오름차순이다. 최근 경기는 현재 목 저장소 순서의 앞 5개로, 날짜 재정렬을 하지 않는다. 각 영역 결과를 모두 기다린 뒤 페이지 데이터를 반환하므로 초기 영역별 스트리밍·Skeleton은 없다.

**화면**

```text
[h1] {서버명}
┌ NextScrimHero (항상 어두운 카드, 챔피언 스플래시 배경) ─────────────────────────────┐
│ 내 다음 내전 [선발됨]                                                                │
│ 경매 내전                                                                            │
│ 11/2(월) 21:00 · 경매 · 4팀                                                          │
│ 시작까지 [3 일][06 시간][58 분][50 초]      ← 진행 중이면 LIVE · 지금 진행 중        │
│ (모집 중이면 신청 현황 Progress)                                                     │
│ [내전 보기 →]                               ← 미참가 모집은 "신청하러 가기", 진행 중은 "진행 상황 보기" │
└──────────────────────────────────────────────────────────────────────────────────────┘
업적 (AchievementCarousel, 전체 폭. 1위 카드 한 장 + 양옆 흐린 카드, 이전/다음·점 버튼)
lg: 2열 같은 폭
내전 현황 [진행 중 n | 최근 경기]  (ActivityBoard)    서버 순위 [탑|정글|미드|원딜|서폿]  (RankingBoard)
                                                       카드 안 스크롤 + 더 불러오기, 내 순위 아래 고정
모바일: hero → 업적 → 내전 현황 → 서버 순위
```

**구성**

| 영역 | 사용 | 메모 |
| --- | --- | --- |
| 다음 내전 | `NextScrimHero`: STDF `CountDown`·`Progress` + 링크 버튼 | 카운트다운은 마운트 후에만(SSR과 시각이 달라서), 보조기기에는 읽히지 않게 하고 시작 시각은 메타 문구로 전달. 없으면 "지금 참가할 내전이 없어요" |
| 내전 현황 | `ActivityBoard`: STDF `Tab`(`진행 중 n` · `최근 경기`) + `ScrimListRow` / `MatchListRow` | 한 카드에 두 목록을 탭으로. 처음 열 때 진행 중 목록이 비어 있으면 최근 경기 탭부터. hero의 내전은 진행 중 목록에서 제외("다른 진행 중인 내전이 없어요"). 탭 선택은 로컬 상태이며 URL에 넣지 않는다 |
| 업적 | `AchievementCarousel` (서버 통계와 같은 컴포넌트) | 서버 통계의 업적을 전체 포지션·전체 게임 기준으로 보여 준다. 집계 기준(`ACHIEVEMENT_MIN_GAMES`)도 같다. 필터·`업적별 순위`·집계 기준 안내는 서버 통계에만 둔다 |
| 서버 순위 | `RankingBoard`: STDF `Tab` + `InfiniteScroll` + `LinkCell` | 포지션별 MMR. 1~3위 메달 색(`--color-medal-*`)과 숫자, 주 챔피언 아이콘, `n전 n승 · 승률`. 카드 안(최대 26rem)에서 스크롤하면 `GET /g/[guildId]/ranking?position=&offset=`로 10명씩. 내 순위는 아직 불러오지 않은 구간에 있을 때만 카드 아래 고정. 포지션 선택은 로컬 상태 |

`전체 보기` 링크·모집 생성 버튼은 두지 않는다(헤더 메뉴와 내전 목록이 담당).

**상태**

| 상황 | 처리 |
| --- | --- |
| 참가할 내전 없음 | hero가 빈 안내. 내전 현황의 초기 탭은 hero 유무가 아니라 진행 중 목록이 비었는지로 결정 |
| 경기 기록·순위 없음 | 탭 안 빈 문구 / 순위는 `SectionState empty` |
| 내전 현황·최근 경기·순위 조회 실패 | 해당 영역만 `SectionState error` + `다시 시도`(`invalidate('app:guild-home')`) |
| 다음 내전·업적 조회 실패 | 다음 내전은 없음으로 처리하고, 업적은 영역을 숨김. 이 두 영역에는 오류·재시도 UI가 없음 |
| 순위 추가 조회 실패 | 목록 끝에 "불러오지 못했어요. 눌러서 다시 시도해 주세요" |
| Data Dragon 조회 실패 | 아트·아이콘 없이 표시(배경색, 이름 첫 글자) |

개발 모드 확인: `devGuild002`는 빈 서버, `?preview=error`는 최근 경기 조회 실패.

**현재 한계·미결정** 실제 조회·권한·시즌/MMR 집계 연결은 미구현이다. hero는 내전 요약 링크이며 바로 신청하지 않는다. `ranking` GET도 개발 모드·목 서버만 검사하고, 잘못된 포지션/음수 또는 정수가 아닌 offset은 400, 목 시즌이 없는 서버는 404다. 최근 경기의 운영 정렬 기준은 미결정이다.

## `/g/[guildId]/admin` — 서버 관리

**목적** 서버 관리자가 멤버의 Riot 계정 연결과 Discord 연동(운영자 역할, 모집·엔트리·결과 채널)을 관리한다. Riot 계정 연결은 사용자가 직접 하지 않고 여기서 운영자가 지정한다.

**권한** 개발 모드에서 `guild.isAdmin`이 아니면 `load`가 403을 반환한다. 헤더 `관리` 메뉴도 관리자에게만 렌더링한다. 실제 인증·권한은 아직 목 세션이다.

서버 관리자는 웹에서 한 명씩 지정하지 않는다. 멤버 목록과 Discord 설정 action은 목 멤버의 **Discord 서버 관리 권한 또는 운영자 역할**로 관리자 여부를 계산한다. 봇의 실제 역할·권한 동기화와 `guild_members.is_admin` 갱신은 연결되지 않았다. 페이지 진입에 쓰는 `guild.isAdmin`은 이 계산과 별개의 목 서버 값이다.

멤버·Discord 설정은 `lib/mocks/admin.ts`, Riot 계정은 `lib/mocks/me.ts`의 가변 메모리 저장소이며 서버 재시작 때 초기화된다. Riot 계정 조회도 실제 Riot API 요청이나 소유권 인증이 아니다.

**데이터**

```ts
{
  tab: 'members' | 'discord',                                   // ?tab=, 기본 members
  members: { userId, displayName, isAdmin, riotAccounts: RiotAccount[] }[],   // 서비스에 연결된 멤버만. 계정은 대표 먼저
  adminCount: number,
  discord: {                                                    // 목 저장소에 해당 서버 설정이 없으면 null
    roles: { id, name }[],                                      // 목 저장소에 나열된 순서
    channels: { id, name, category, botCanPost }[],
    settings: { operatorRoleId, recruitmentChannelId, entryChannelId, resultChannelId },   // 각각 null 가능
    actorRoleIds: string[] | null                               // 내 역할. 서버 관리 권한이 있으면 null(제한 없음)
  } | null
}
```

**화면** (한 열, `max-w-3xl`, 탭 두 개)

```text
[h1] 서버 관리
[Tab] 멤버 | Discord 연동

── 멤버 ──────────────────────────────────────────────
                                              관리자 2명
[Input type=search 멤버 이름 검색]
[ul]
  [img] 개발자 [관리자]   Hide on bush#KR1 외 1            [Riot 계정]
  [img] 미드갱좀          Riot 계정 없음                   [Riot 계정]
[PageNav]                                    ← 20명씩, 관리자 먼저 → 이름 순

── Discord 연동 ──────────────────────────────────────
[ul]
  운영자 역할   이 역할이나 Discord 서버 관리 권한이 있는 멤버가 서버 관리자예요   [@운영진 ▾]
  모집 채널     내전 모집 글을 올리고 참가 신청을 받아요                          [#내전-모집 ▾]
  엔트리 채널   확정된 팀 구성을 올려 밸런스를 확인해요                           [#내전-엔트리 ▾]
  결과 채널     끝난 내전의 결과를 올려요                                         [설정 안 함 ▾]
  ← 좁은 화면에서는 설명 아래 줄로 값 버튼이 내려간다
```

| 영역 | 사용 | 동작 |
| --- | --- | --- |
| 탭 | STDF `Tab` (`role="group"` 래퍼, 영역 제목은 `sr-only` `h2`) | `?tab=discord`. 기본은 멤버이며 탭을 바꾸면 기존 쿼리를 모두 지운다 |
| 멤버 검색 | `<form role="search">` + `Input type="search"` | Enter·지우기로 `?q=` 갱신, 50자 제한. 이름 부분 일치, 대소문자 무시. 검색 변경 시 page 초기화. 폼에 `nonSubmitButtons` |
| 멤버 행 | `<li>`: 사진·이름·`관리자` `Tag`·대표 Riot ID(`외 n`) + `Riot 계정` 버튼 | 관리자 여부는 표시만 한다 |
| Riot 계정 | `Button fill="lineLight"` → `MemberRiotAccountsDialog`(`Popup`) | 연결된 계정 목록(대표 `Tag`, `대표로`·`해제`(→ `confirm`)) + `Input title="연결할 Riot ID"` → `조회` → 찾은 계정 확인 → `연결`. 첫 계정은 대표가 된다. 진행 중 내전에 쓰인 계정은 `해제` 비활성 + 이유. action: `lookup`·`link`·`primary`·`unlink`(대상 `userId`는 이 서버 멤버만) |
| Discord 연동 항목 | `DiscordSettingRow`: 현재 값 `Button` → `ActionMenu`(데스크톱 팝오버, 모바일 시트) | 고르면 바로 저장(action `discord`, `key`·`value`). 맨 앞은 `설정 안 함`, 현재 값은 `현재 설정`으로 비활성 |

선택지 규칙(서버도 같은 규칙으로 검사):

- **운영자 역할**: 바꾼 뒤에도 내가 관리자로 남아야 한다. 서버 관리 권한이 없으면 내가 가진 역할만 고를 수 있고 `설정 안 함`도 고를 수 없다(비활성 + 이유).
- **채널**: 봇이 글을 쓸 수 없는 채널은 비활성 + "봇이 글을 쓸 수 없어요".

멤버 초대·추방·Discord 역할 부여는 제공하지 않는다(Discord에서 한다).

**action의 현재 검증 범위** `discord`는 목 저장소에서 관리자 여부·역할/채널 존재·자기 관리 권한 유지·봇 게시 가능 여부를 다시 검사한다. `lookup`은 개발 모드와 Riot ID 형식·목 조회 결과만 검사한다. `link`·`primary`·`unlink`는 개발 모드와 대상의 목 서버 멤버 여부를 확인하지만, 실행자의 관리자 여부를 별도로 재검사하지 않는다. `link`는 연결 직전 조회를 다시 수행하고, 첫 계정을 대표로 지정한다. 대표 계정을 해제하면 남은 첫 계정이 대표가 된다. 실제 운영 action의 권한·동시성·Riot 소유권 검증은 아직 연결되지 않았다.

**상태**

| 상황 | 처리 |
| --- | --- |
| 관리자가 아님 | `load`에서 403 |
| 검색 결과 없음 | "'{q}'에 맞는 멤버가 없어요" |
| Discord 목 설정이 없음 | Discord 연동 탭에 "봇이 아직 이 서버의 역할·채널을 가져오지 못했어요" |
| 저장 중 | 해당 값 버튼 `loading` |
| 저장 실패(권한 회수됨, 역할·채널 사라짐, 게시 권한 없음, 내 권한이 사라지는 역할) | 오류 알림, 값은 서버 값 유지 |
| Riot ID 형식 오류·계정 없음·조회 제한 | 입력 `tip`에 이유("이름#태그 형식으로 입력해 주세요", "계정을 찾을 수 없어요", "잠시 후 다시 시도해 주세요"). 현재 형식은 이름 3~16자·태그 3~5자, 태그는 유니코드 문자·숫자 |
| 이미 다른 사용자에게 연결된 계정 | `tip="이미 다른 사용자에게 연결된 계정이에요"`. 상대 정보는 보여 주지 않는다 |

목 조회 오류는 `없는계정#KR1`, `조회제한#KR1`, `충돌계정#KR1`로 확인한다. 이미 연결된 Riot ID도 같은 충돌 문구를 반환한다. `inActiveScrim` 해제 제한은 현재 목 계정의 고정 플래그이며 실제 내전 참가 현황을 조회한 결과가 아니다.

**미구현·미결정** Discord 역할·채널 동기화와 게시, 실제 Riot 계정 조회·소유권 확인·DB 저장, 실행자 권한 재검증, 모집 채널 미설정 시 정책, MMR 시즌 등 추가 설정. 역할 제외·정렬 규칙과 초기 관리자 등록 흐름도 실제 Discord 연결이 필요하다.
