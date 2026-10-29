# MSM1 Web UX Audit — Reverse-engineered user experience

Read-only research on `/home/min/workspace/MonkeyScrimManager` (`apps/web`, SvelteKit; referenced bot behavior from `apps/bot`, rules from `apps/api`).
Purpose: keep what worked for a clean-slate MSM2 rewrite, and fix what did not.

Evidence base: all route files under `apps/web/src/routes/**`, workflow components under `apps/web/src/lib/components/**`, contracts under `apps/web/src/lib/contracts/**`, presentation helpers, `docs/03-design-direction.md`, `docs/12-current-operating-contract.md`, `docs/routing/frontend.md`, `docs/17-auction-improvements-plan.md`, `git log --oneline -40` plus `git show --stat` on notable commits.

---

## 1. Route / screen inventory

### 1.1 Public / account shell

| Route | File | Purpose | Role | What the user can do | Weight |
|---|---|---|---|---|---|
| `/` | `apps/web/src/routes/+page.server.ts:7-19` | Redirect | any | 401 → `/landing`; default guild → `/g/{id}`; else `/me?tab=guild` | trivial |
| `/landing` | `apps/web/src/routes/landing/+page.svelte:18-156` | Marketing intro with live mock workbenches | visitor | Discord login CTA, previews of entry/auction boards, link to `/install` | medium |
| `/install` | `apps/web/src/routes/install/+page.svelte:32-51` | 3-step onboarding (invite bot, `/초기설정`, `/등록 GameName#TagLine`) | guild admin | Read only | small |
| `/me` | `apps/web/src/routes/me/+page.svelte:18-86` | Self-service: 선호 챔피언 / Riot 계정 / 대표 길드 / 개인정보, tab via `?tab=` | player | Link Riot accounts (`RiotAccountManager.svelte:283-292`), set 5 preferred champions per lane, default guild, privacy toggles | medium |
| `/records` | `apps/web/src/routes/records/+page.svelte:18-57` | External Riot match history for a Riot ID | any logged-in | Search `GameName#TagLine`, refresh (cooldown), champion table sort, load-more matches | medium |
| `/users/{discordId}` | `apps/web/src/routes/users/[discordId]/+page.svelte:12-45` | "Public profile": Discord ID, active guild count, season count | any | Read only — **no MMR, no records, no link** | trivial |
| `/docs`, `/terms`, `/privacy` | `routes/docs/+page.svelte:7-17` etc. | Static documents | any | Read | small |
| `/oauth/[...path]`, `/api/[...path]` | `routes/oauth`, `routes/api` | OAuth start/callback, same-origin API proxy | — | — | infra |
| `/dd/catalog`, `/dd/[...path]` | `routes/dd` | Data Dragon catalog + image proxy | — | — | infra |
| `/dev/users` | `apps/web/src/routes/dev/users/+page.svelte` + `lib/components/dev/DummyUserWorkspace.svelte` (2016 lines) | Dummy-user administration (non-prod) | service admin | Create/edit dummy identities, link to guilds | large |

### 1.2 Guild shell (multi-guild context)

| Route | File | Purpose | Role | What the user can do | Weight |
|---|---|---|---|---|---|
| `/g/{guildId}` | `routes/g/[guildId]/+page.svelte:27-102`, `OperationsQueueBoard.svelte:64-244` | **Operations queue** — "what do I handle now" | both | See one primary operation with a stage stepper, filter remaining work (전체/편성/픽밴/경매), jump to it; create 새 내전 / 새 경매 / 내전 전적 | medium |
| `/g/{guildId}/series` | `routes/g/[guildId]/series/+page.svelte:118-448` | Normal scrim: 진행 중 list + 완료된 내전 list + 모집 create dialog | both — any ACTIVE member may create a 모집 (`apps/api/src/repository/bot_workflow.rs:15778-15797`), but a recruitment channel must be configured (`:6685`) | Create 모집 (BO1/3/5, 하드 피어리스, 예상 시작), open rows, browse completed (score/winner) | medium |
| `/g/{guildId}/series/completed` | `routes/g/[guildId]/series/completed/+page.svelte:1-4` | Orphan stub, only `<title>` | — | nothing (dead route) | empty |
| `/g/{guildId}/recruitments/{id}` | `routes/g/[guildId]/recruitments/[id]/+page.svelte:400-741` | 모집 detail: roster, 참가자 추가 picker, 엔트리 편성 시작, 모집 취소/복구 | operator (+ creator) | Add/remove participants, start entry, cancel with typed confirmation, restore after cancel; live refresh via WS | large |
| `/g/{guildId}/recruitments/{id}/entry` | `routes/g/[guildId]/recruitments/[id]/entry/+page.svelte:743-1158`, `EntryDraftBoard.svelte` | **Manual team formation** (엔트리 편성) + 미리보기 + 시리즈 시작/경매 전환/모집 재개/DM | operator primarily, member read-only | Drag players into 2×5 lane slots, reset, see head-to-head rail, DM 참가 확정, start series, convert to auction recruitment | **heavyweight (1158 + 294 lines)** |
| `/g/{guildId}/series/{id}/pick-ban` | `routes/g/[guildId]/series/[id]/pick-ban/+page.svelte:753-1190`, `ScrimPickBanResultInputBoard.svelte` (824) | **Per-set side + ban/pick + winner entry**, revert, early finish, delete | operator | 3-step wizard (사이드→픽밴→승자), per-champion combobox, bulk paste input, revert last set, early end, cancel series | **heavyweight (1190 + 824)** |
| `/g/{guildId}/series/{id}/result` | `routes/g/[guildId]/series/[id]/result/+page.svelte:240-450`, `SeriesResultLedgerBoard.svelte` | Completed series ledger (sets, lineups, pick/ban, MMR) | both | Read; revert last game; cancel series | large |
| `/g/{guildId}/records` | `routes/g/[guildId]/records/+page.svelte` (1769 lines) | **Per-player in-guild records** (search-driven, `?q=`) | both | Search member/Riot ID, season select, 선호 챔피언, 라인별 MMR, filters 전체/일반 내전/경매 내전 + lane, expand set → both lineups + bans, 챔피언 사용 기록, load more | **heavyweight (1769, bespoke CSS)** |
| `/g/{guildId}/leaderboard` | `routes/g/[guildId]/leaderboard/+page.svelte:22-29`, `LeaderboardBoard.svelte:144-330` | Season ranking by composite or lane MMR | both | Switch role tab (통합/탑/정글/미드/원딜/서폿), search, page 25, open a player's records | medium |
| `/g/{guildId}/auction` | `routes/g/[guildId]/auction/+page.svelte:480-810` | Auction work list (진행 중 / 완료 및 보관) + 경매 모집 create dialog | both | Create 10인/20인 경매 모집, open active/completed rows, load more | medium |
| `/g/{guildId}/auction/recruitments/{id}` | `routes/g/[guildId]/auction/recruitments/[id]/+page.svelte:419-791` | Auction 모집 detail: roster (with declared lane), 참가자 추가 (lane required), 모집 마감 → draft | operator (+ creator) | Add member with lane select, remove, close recruitment, cancel/restore | large |
| `/g/{guildId}/auction/recruitments/{id}/draft` | `routes/g/[guildId]/auction/recruitments/[id]/draft/+page.svelte:204-327`, `AuctionTournamentCaptainPointSetupBoard.svelte` | **경매 준비**: team names, captains, starting points → 입찰 시작 | operator | Pick captains by search, edit team name/start points, save, create tournament, DM 참가 확정, reopen recruitment | large |
| `/g/{guildId}/auction/tournaments/{id}/draft` | `routes/g/[guildId]/auction/tournaments/[id]/draft/+page.svelte:243-312`, `AuctionTournamentBidDraftWorkbench.svelte` (1314) | **Auction bidding workbench** | operator | 다음 후보 draw, per-team bid input + ±10 + 낙찰, 유찰, 후보 목록/순서 섞기/초기화, revert last action, drag current target onto a team | **heaviest (1314 + 312)** |
| `/g/{guildId}/auction/tournaments/{id}/bracket` | `routes/g/[guildId]/auction/tournaments/[id]/bracket/+page.svelte:1-421`, `AuctionTournamentBracketMatchSetupBoard.svelte` (511) | Bracket setup: assign teams to 슬롯, lock 대진 | operator | Select team → click slot (or drag), clear slot, 대진 확정, unlock, revert to bidding, open match | large |
| `/g/{guildId}/auction/tournaments/{id}/lineup` | `routes/g/[guildId]/auction/tournaments/[id]/lineup/+page.svelte:231-310` | 20인 전용: both semifinals' 10-man lineups must lock before results | operator | Assign 5 players per team to lanes, lock/unlock | medium |
| `/g/{guildId}/auction/tournaments/{id}/result` | `routes/g/[guildId]/auction/tournaments/[id]/result/+page.svelte:122-173`, `AuctionTournamentBracketResultBoard.svelte` | Tournament status/result board, entry point to matches | both | Read bracket results, open match, 대진 확정 해제, 경기 결과 수정 | medium |
| `/g/{guildId}/auction/matches/{matchId}` | `routes/g/[guildId]/auction/matches/[matchId]/+page.svelte`, `AuctionMatchGameResultInputBoard.svelte` (373) | Per-match lineup lock + per-set result entry | operator | Assign lineup, lock, enter set result (side, picks, bans, winner), revert last set | large |

### 1.3 Guild admin & service admin

| Route | File | Purpose | Role | What | Weight |
|---|---|---|---|---|---|
| `/g/{guildId}/admin` | `admin/+layout.server.ts:7-9`, `admin/+layout.svelte:20-110`, `admin/+page.svelte:163-189` | Guarded (`OPERATOR` only, else 403) tabbed panel: 멤버 / 길드 설정 / 감사 로그 via `?tab=` | guild admin | 멤버: search, status filter, type filter, MMR 조정 dialog (`GuildMemberManagementPanel.svelte:175-521`); 설정: operator role, 모집/엔트리/결과/로그 channels, 외부 전적 공개 (`GuildSettingsAdminPanel.svelte:122-350`); 로그: audit list + load more | large |
| `/g/{guildId}/admin/seasons` | `admin/seasons/+page.svelte:180-490` | Current/previous seasons, 새 시즌 시작 dialog | guild admin | Start a season (name), see per-season counts | large |
| `/g/{guildId}/admin/data` | `admin/data/+page.svelte:1-19`, `GuildDataTransferPanel.svelte` (588) | Full guild snapshot export/import | guild admin | Download/upload JSON, preview then apply | large |
| `/g/{guildId}/admin/logs` | `admin/logs/+page.svelte:1-4` | Orphan stub (logs actually render at `?tab=logs`) | — | nothing | empty |
| `/admin/status` | `routes/admin/status/+page.svelte:185-441` | Service status cards + per-guild record reset | **no route-level guard** (only API-side) | Refresh status, reset a guild's records with typed confirmation | medium |

Empty leftover directories: `routes/admin/perms/`, `routes/dev/components/`, `routes/dev/fab/`.
Unreferenced component: `lib/components/workflow/AuctionTournamentOverviewBoard.svelte` (603 lines) — no import anywhere outside its test.

**Heavyweight screens (by size and cognitive load):** `records` (1769), pick-ban (1190), entry (1158), auction draft workbench (1314+312), auction list (810), auction recruitment detail (791), recruitment detail (741), bracket board (511), dev dummy users (2016).

---

## 2. Core user journeys (as actually experienced)

### 2.1 Discord login → guild/server selection

1. Visitor lands on `/landing`; CTA "Discord로 시작" → `/oauth/discord/start?next=/` (`landing/+page.svelte:7,72-78`).
2. After OAuth, `/` reads `/api/me`: sends to `/g/{defaultGuildId}`, otherwise to `/me?tab=guild` (`routes/+page.server.ts:15-18`).
3. In-guild, top navbar (`AppShell.svelte:113-146`) shows 내전 / 경매 / 랭킹 and 관리 (관리 only when `currentUserRole === 'OPERATOR'`).
4. Guild switching is a dropdown labeled "운영 서버 선택" listing every guild with "운영자/참가자 · N명" (`AppShell.svelte:355-394`). Selecting navigates to that guild's dashboard, **not** back to the current page.
5. Global search is a separate dropdown overlay with two tabs, `Riot` and `내전` (`AppShell.svelte:498-626`). `내전` search always targets `/g/{activeGuildId}/records?q=…` (`AppShell.svelte:196-205`) and suggests guild members/Riot accounts with debounce 200 ms (`AppShell.svelte:153-190`).

Stuck points: no "switch guild" affordance inside `records`/`admin` — the only way is the header dropdown; the guild selector navigates away, losing context; the selected guild is derived from `page.params.guildId` so deep links silently change context (`AppShell.svelte:88-97`).

### 2.2 Creating / recruiting a scrim (모집)

Normal scrim:
1. Dashboard → "새 내전" opens `/g/{id}/series?create=1` (`g/[guildId]/+page.svelte:14-19,33-47`); the same button exists in the series page header (`series/+page.svelte:120-134`).
2. Modal "내전 모집" (`series/+page.svelte:299-448`): optional 예상 시작 (date input + free-text "시간 (24시간)" with `pattern`), BO1/3/5 segmented radio-default 3, 하드 피어리스 toggle-default on, and a computed summary line `formatSeriesRules` (`seriesRules.ts:5-7`). No title field — the API auto-titles `"일반 내전 모집 #N · 예상 시작 HH:MM (KST)"` (`apps/api/src/repository/bot_workflow.rs:9945-9949`).
3. On create the user is sent to the recruitment detail.
4. **Signup happens in Discord, not on the web**: the bot posts a card with buttons `참가` / `참가 취소` and a `선호 라인 선택` multi-select (`apps/bot/src/discord/recruitment-message.ts:102-158`). At capacity the join button disappears and the card shows `정원 도달` (`recruitment-message.ts:28-31,121-135`).
5. Web recruitment detail shows the roster with "선호 라인 · 탑 · 미드" (`recruitments/[id]/+page.svelte:157-159,529-566`), adds members through a modal picker filtered to `ACTIVE` guild members not already joined (`:112-121,571-676`), removes with a trash icon per row, and refreshes live for operators via WS invalidations (`:123-143,194-221`).
6. 엔트리 편성 시작 is only enabled for an operator when `participantCount === 10` (`:108-110,430-443`); it closes the recruitment and navigates to entry.
7. Cancel is a destructive modal requiring typed confirmation `모집 #N 취소` (`:99-102,678-741`); after cancel the page shows "이 모집은 취소 이력으로 보존되어 있습니다…" with 취소 되돌리기 (`:407-421,470-478`).
8. E2E time: create → wait for 10 Discord joins → operator must be on the recruitment page to press 엔트리 편성 시작. There is **no waitlist, no deadline auto-close, no web signup**: roster size is hard-locked to 10 (`contracts/recruitmentSnapshot.ts:16`, `contracts/workflow.ts:691`), and cutoff = capacity only.

Auction recruitment (10인/20인) mirrors this: create dialog at `auction/+page.svelte:602-810` (format cards, 4강 BO only for 20인 `:646-672`, 결승 BO `:674-700`, 하드 피어리스 default on `:740-768`), roster + declared-lane picker at `auction/recruitments/[id]/+page.svelte:606-726` (lane `<select>` per candidate, `:678-688`; add blocked without a lane, `:219-230,249-255`), 모집 마감 enabled only at capacity (`:98-99,450-462`).

Where users get stuck: they expect to manage signup on the web (copy has to explain it twice: "참가와 취소는 Discord 모집 메시지에서 진행합니다" `auction/recruitments/[id]/+page.svelte:530-535`, `auction/+page.svelte:622-625`); the modal closes only on success so a validation error leaves the user inside a dialog after a failed submit (`series/+page.svelte:79-111`); free-text `23:30` time input with `pattern` gives no inline feedback (`series/+page.svelte:339-355`).

### 2.3 Team formation by manual assignment (엔트리 편성)

1. Entry page header (`recruitments/[id]/entry/+page.svelte:744-837`) carries: 편성/미리보기 tabs, 참가 확정 DM 발송, 시리즈 시작, 경매 모집 전환, 모집으로 되돌리기, 모집 취소 (icon) — up to 6 controls at once, all in one row on desktop.
2. A realtime bar shows 연결/저장/충돌 (`:840-853`).
3. Data loads client-side (`:129-136`) → full-card spinner, then `EntryDraftBoard`.
4. Board (`EntryDraftBoard.svelte:135-263`): toolbar with `{filled}/10 배치 · 후보 N명`, a `상세` toggle that expands team-average + synergy + head-to-head rails, `초기화` (confirm dialog `:267-294`), two team columns (1팀/2팀 with BLUE/RED badges, `EntryTeamColumn.svelte:72-89`), 5 lane rows each (`TOP…SUPPORT`, label 탑/정글/미드/원딜/서폿 `fixtures/workflow.ts:9-15`), a candidate pool (`EntryCandidatePool.svelte:46-94`), and a head-to-head rail per lane in the middle (`EntryHeadToHeadRail.svelte:60-99`, showing `>`/`<`/`=` and "N승 우위").
5. **Interaction is HTML5 drag & drop only** (`EntryDraftBoard.svelte:81-128`, cards `draggable` in `EntryTeamColumn.svelte:112`, `EntryCandidatePool.svelte:67`). The pool header even advertises "탭 선택 / 드래그" (`EntryCandidatePool.svelte:58`) but there is no click/tap handler — a hint that was never implemented.
6. Each drop is a server round-trip with `expectedRevision` + idempotency key (`entry/+page.svelte:388-419`); on 409 the UI blocks editing and forces "최신 상태 다시 불러오기" (`:293-330,871-891`).
7. When all 10 slots are filled, 시리즈 시작 becomes enabled (`:118-121,783-796`) → creates the series and navigates to pick-ban.
8. Alternative: 경매 모집 전환 converts the same roster into a 20/10-person auction recruitment (`:516-586`); 모집으로 되돌리기 and 모집 취소 are also here.

Stuck points:
- **Touch/mobile users cannot form teams at all** (no tap-to-place path). The design doc explicitly forbids that: "coarse pointer 또는 모바일 환경에서는 HTML5 DnD에 기대지 않고 tap-to-select / tap-to-place 흐름을 제공한다" (`docs/03-design-direction.md`, Workflow Workbench / DnD Rules).
- No visible affordance that a slot is a *drop* target until you hover while dragging (`EntryTeamColumn.svelte:64-69`).
- Swapping two occupied slots silently displaces the occupant (`lib/components/workflow/entryDraft.ts:42-51`) with no confirmation or highlight.
- Every move is a blocking network mutation; rapid re-arrangement of 10 people is 10 sequential round-trips with the whole board disabled while `mutationLocked` is true (`entry/+page.svelte:121,927`).
- `EntrySynergyRail` is mounted with an empty `synergies` array (`EntryDraftBoard.svelte:184,220`; prop never passed) — a permanently empty column taking 1/4 of the width in 상세 mode.
- Lane set is derived from `targetCount/2` (`EntryDraftBoard.svelte:53`), so 10v10 with two lanes is structurally impossible in this board.

### 2.4 Team formation by auction (경매)

1. Auction 모집 closes → 경매 준비 (`auction/recruitments/[id]/draft/+page.svelte:204-282`). `AuctionTournamentCaptainPointSetupBoard` offers: captain picker with search (`:184-241`), per-team name input (`:189`), per-team 시작 포인트 (`:270-290`), then 설정 저장 / 입찰 시작 (`:321-347`) which creates the tournament and navigates to the workbench.
2. **Bidding workbench** (`AuctionTournamentBidDraftWorkbench.svelte`):
   - Top KPI strip: 입찰 풀 / 배치 / 잔여 / 유찰 (`:400-418`) plus a capacity bar (`:419-426`).
   - A 10-second amber progress bar that resets whenever a bid input changes (`:47,80-106,383-396`). It ends nothing: the design plan states "타이머는 시각적 운영 보조만 하며, 자동 입찰/확정 side effect는 만들지 않는다" (`docs/17-auction-improvements-plan.md`, 확정: progress bar 위치).
   - Left: **현재 매물** card with avatar, declared lane, Riot tier, `MMR`, win rate/승패/최근 (`:793-870`), a `상세보기` toggle that opens 내전 전적 / 내전 주력 챔피언 / 라인별 MMR / 선호 챔피언 / 최근 게임 / Riot 전적 sections (`:536-790`), a `유찰` button (`:873-882`), and `다음 후보` (`:468-475`, Dice5 icon) which actually takes the lowest `queue_position` (`apps/api/src/repository/bot_workflow.rs:12842-12859`); randomization happens at tournament creation (`:7867-7870,12219-12238`) and via `순서 섞기` (`:12261-12294`).
   - Right: 2 or 4 team cards (`:967-1088`), each with team name + captain, `시작 {initialPoints}P`, remaining `{currentPoints}P`, a 5-slot capacity bar, a `입찰가` number input, a `±10` button whose **right-click subtracts 10** (`:1027-1040`), `낙찰` (`:1041-1048`), and the purchase list with badges 팀장/수동/낙찰 (`:369-379,1057-1084`).
   - 후보 현황 panel: 후보 목록 dialog (current/queue/unsold with per-team 배치 and 재등록 actions, `:1092-1229`), 순서 섞기, 초기화 (`:914-960`).
   - Header also exposes 마지막 입찰 되돌리기 (or 입찰 단계로 되돌리기 after bracket lock) with its own confirm dialog (`:444-453,1272-1314`).
3. Rules the operator must know without UI help: **bids are entered by the single operator on behalf of all teams** — there is no per-captain client, no "highest bid wins" comparison, no tie-break UI. The server accepts any `points` between 0 and that team's `current_points` (`bot_workflow.rs:12948-13005`), so the winner is simply whoever the operator clicks 낙찰 for. Team capacity is 5 (`available_auction_roster_slot`, `:12159`); when every team is full the tournament auto-transitions to `BRACKET_SETUP` (`:13044-13049`).
4. There is **no purchase log / bid history screen**: the snapshot carries only `draft.recentAction.kind` (`contracts/auctionTournamentDraft.ts:145-149`) and `drawCount` per candidate (`:49`). Audit is only in admin logs and Discord.

Stuck points:
- A single operator must watch a room and type 2–4 numbers per player; the ±10 gesture (right-click) is undiscoverable and unavailable on touch; typing the number and pressing 낙찰 has no "did you mean" check against other teams' inputs, so a typo overpays and is only recoverable one-step-at-a-time via 되돌리기.
- `낙찰` buttons are enabled based only on `currentPoints >= input` — the button stays active with an empty field? No: `canFinalizeBid` requires a parsed number (`:221-230`), but there is no lower-bound warning for a 0-point win.
- The 10s timer looks like a countdown that will expire the lot; users wait for it, and nothing happens.
- `다음 후보` with a dice icon reads as "random", but it is strict queue order.
- Bracket and draft pages both expose revert/입찰 단계로 되돌리기 (`bracket/+page.svelte:262-281`) while the workbench has its own (`:444-453`) — three paths to the same irreversible-ish action.

### 2.5 Bracket / tournament (대진)

1. After all teams are full: `BRACKET_SETUP`. Bracket board (`AuctionTournamentBracketMatchSetupBoard.svelte`) shows 팀 풀 (unassigned teams with captain and 5 member chips, `:270-318`) and 대진 설정 (준결승 A, 준결승 B, 결승; 10인 → single 결승, `:30-68,321-423`).
2. Assign: click a team then click an empty slot (or drag). This board *does* implement click-to-place (`:168-208,375-411`) — inconsistent with the entry board. Empty slots read "팀 배치" or "`{team} 배치`" (`:404-410`).
3. Lock with 대진 확정 (`:494-507`); it is disabled until every slot is filled and the button label doubles as a status ("팀 배치 필요"). After lock, 진행할 경기 cards list 준결승 A/B with BO and status (라인업 대기 / 시작 준비 / 진행 중 / 완료), and the first playable match is auto-opened (`bracket/+page.svelte:157-165`).
4. Best-of: semifinal BO only exists for 20인 (`contracts/workflow.ts:769-780`; `formatAuctionRules` `lib/workflow/auctionRules.ts:3-13` → "4강 BO3 · 결승 BO5 · 하드 피어리스").
5. Advancing: the final's two slot labels show `승자 대기` until semifinals complete (`AuctionTournamentBracketResultBoard.svelte:138-142,238-242`). 20인 requires both semifinal lineups locked before any semifinal result entry — clicking a semifinal card routes to the lineup page instead (`bracket/+page.svelte:95-132`).
6. Achievement end: 우승 {team} (`AuctionTournamentBracketResultBoard.svelte:89`), early finish handled by `AuctionTournamentFinishControl`, cancel by `AuctionTournamentCancelControl`, both repeated on draft/bracket/result headers (`draft/+page.svelte:250-263`, `bracket/+page.svelte:250-264`, `result/+page.svelte:135-148`).

Stuck points: no visual bracket tree (it is a stacked form), so "who plays whom in the final" must be inferred; the unlock dialog warns it is blocked if any result exists (`bracket/+page.svelte:334-336`) and the user only discovers the block on submit.

### 2.6 Submitting / importing results

There is **no replay/ROFL import in MSM1**. Results are 100% manual champion-by-champion entry (no occurrence of ROFL/리플레이 parsing anywhere in `apps/web` or `apps/api`).

Normal scrim, per set (`series/[id]/pick-ban/+page.svelte` + `ScrimPickBanResultInputBoard.svelte`):
1. Step 1 `사이드`: choose "왼쪽 팀 블루" / "오른쪽 팀 블루" (`:520-536`); required before any pick/ban (`contracts/seriesPickBan.ts:197-209`).
2. Step 2 `픽밴`: two team panels, 5 ban slots + 5 player pick comboboxes each (`ScrimPickBanResultInputTeamPanel.svelte:73-120`), keyboard Tab moves cells (`ScrimPickBanResultInputBoard.svelte:392-406`), Enter opens the champion listbox (`ScrimPickBanResultInputChampionCell.svelte:132-180`). Duplicate / hard-fearless conflicts would be listed in a red banner (`:626-652`), but that banner is gated on `validateDraft`, which defaults to `false` (`:57`) and is never passed by the real route (`routes/g/[guildId]/series/[id]/pick-ban/+page.svelte:881-893`) — so in production the hard-fearless warning never renders.
3. Optional bulk paste: "일괄 입력" dialog, comma separated, pick order 탑/정글/미드/원딜/서폿, per-field feedback, `일괄 적용 · N` (`ScrimPickBanBulkInput.svelte:124-172`).
4. Step 3 `승자`: BLUE 승리 · {team} / RED 승리 · {team} (`:653-719`), then `결과 기록` (`:774-791`).
5. After submit, the server decides next href (next set or result page) (`:428-436`).
6. Recovery: 마지막 결과 되돌리기, 엔트리로 되돌리기, 조기 종료 (three mutually exclusive dialogs, `:898-1125`), 시리즈 취소 with typed confirmation (`:1127-1189`).

Auction matches (`auction/matches/[matchId]/+page.svelte` + `AuctionMatchGameResultInputBoard.svelte`): lineup must be locked first, then the same side/pick/ban/winner flow, plus "가장 최근에 확정한 세트와 경기 점수, 이미 반영된 길드 MMR을 함께 되돌립니다" revert (`AuctionMatchGameResultInputBoard.svelte:347-362`).

UX pain in result entry:
- 20+ required champion selections per set, each a text search; two tab stops per cell; a single missed slot blocks `다음` with no indication of *which* slot is empty (`ScrimPickBanResultInputBoard.svelte:103-116,756-773`).
- Hard-fearless has no working feedback: the only UI for it is the `validateDraft`-gated banner (`:57,626-652`) that the route never enables, and the server does not validate prior-set picks either — so a fearless violation is simply accepted and stored.
- The whole board is disabled (`pointer-events-none opacity-60`) while any mutation is in flight (`:590-594`), so slow networks make entry feel frozen.
- Early finish/delete/revert live in the page header for every set, next to the entry board.

### 2.7 Viewing series / match results, per-player stats, cumulative stats

- **Series list** (`series/+page.svelte:137-296`): 진행 중 rows (title, `#displayNumber`, format, status pill, detail "7/10명 · Discord 모집 중", relative updated time, action) and 완료된 내전 (title, format, score `2 : 1`, winner with trophy icon, relative completion) — mobile card variant and desktop grid are separate markup (`:207-252` vs `:254-296`). No filters, no search, no pagination (server fetches `limit: 100`, `series/+page.server.ts:7-29`).
- **Series result** (`series/[id]/result`) renders `SeriesResultLedgerBoard`: per-set tab strip, lineups with champion icons, bans, MMR deltas.
- **Player records** (`g/{guildId}/records/+page.svelte`): header profile (avatar, Riot IDs with 대표 badge `:314-329`), season `<select>` (`:332-351`), 선호 챔피언 5-lane grid (`:355-392`), 라인별 MMR grid (`:394-405`), 승패 / 주 포지션 summary (`:407-413`), filter toolbar (`:415-448`), expandable match rows (sets → two lineups + bans, `:498-549`), 경매 entries with placement/spent points, 챔피언 사용 기록 table (`:731-758`), 더 보기 (`:721-728`). **There is no search box on this page** — it only shows an empty state telling you to search (`:766-772`); the search is the header overlay, and the result arrives via `?q=`.
- **Leaderboard** (`LeaderboardBoard.svelte`): role tabs, search, dense table (순위/플레이어/MMR/전적/승률/주 챔피언/라인 or 게임), self row highlighted with inset cyan bar (`:205-260`), pager. Rank = MMR desc, tie-break by user id (`:119`).
- **Rival / head-to-head** exists only inside entry formation (lane H2H rail) and implicitly in auction candidate profile ("라인별 MMR", "최근 게임"). There is no player-vs-player or team-vs-team page.
- **MMR screens**: no dedicated rating/MMR history page. MMR appears as a number in entry board detail, auction candidate card, leaderboard, records (lane grid + per-game delta), and admin MMR adjust.

Stuck points: to open a player's records from the leaderboard the user must **double-click** a row; a single click only draws a faint outline (`LeaderboardBoard.svelte:234-237`). From the dashboard there is no "find a player" entry point other than the global header search.

### 2.8 Profile pages, MMR/rating

- `/me` self-service tabs are URL-driven (`me/+page.svelte:25-27`) — good deep-link behavior, but each tab is a separate component with its own save button and no dirty-state banner.
- `/users/{discordId}` is essentially a stub (Discord ID, 2 counters) despite being linked from contracts as `publicProfileHref` (`contracts/workflow.ts:11,64-71`). Privacy flags exist (`publicProfile`, `showRiotIds`, `allowExternalRecordSearch`, `contracts/workflow.ts:450-456`) but the public page shows nothing to gate.

### 2.9 Guild admin / settings

1. `/g/{id}/admin` is guarded at layout level (`admin/+layout.server.ts:7-9`) and hosts three tabs in the header nav (`admin/+layout.svelte:20-99`), including two separate top-level pages (시즌, 데이터) as tabs — mixed IA.
2. Members tab: search + 상태 filter + 유형 filter, table with 권한/등록/주 포지션 MMR, MMR 조정 dialog requiring a reason placeholder "예: 누락된 경기 결과 반영" (`GuildMemberManagementPanel.svelte:216-240,437-500`), activate/deactivate with self-protection (`:153-154`).
3. Settings tab: operator role select, four channel selects (모집 필수, 엔트리, 결과 알림, 운영 로그), 외부 전적 공개 switch, 저장/취소 with inline error (`GuildSettingsAdminPanel.svelte:186-350`).
4. Seasons tab: current season card with counts, 새 시즌 시작 dialog (name only), past seasons list (`admin/seasons/+page.svelte:186-484`).
5. Data tab: full snapshot export/import with preview (`GuildDataTransferPanel.svelte`).
6. Service admin: `/admin/status` cards + a dangerous reset flow gated by typed confirmation (`routes/admin/status/+page.svelte:60-180,185-290`) but **not** by a server-side role guard — any logged-in user can open the page (API still enforces).

---

## 3. UX patterns worth carrying over (with file paths)

### 3.1 Shell / navigation
- **Operations queue as the home screen**, not a dashboard of metrics: one "지금 처리할 작업" card with a 6-step stage stepper (모집 → 팀장 → 입찰 → 대진 → 경기 → 결과 for auctions; 모집 → 편성 → 픽밴 → 결과 for scrims) plus a prioritized remainder list (`OperationsQueueBoard.svelte:64-150`; stage labels `lib/workflow/presentation.ts:58-83`; urgent-first selection `:47-49`). This is the single best idea in the legacy app.
- Guild-scoped prefix + role label in one header: `운영자`/`참가자` (`AppShell.svelte:384`, `g/[guildId]/+page.svelte:12`).
- Role-aware but same-screen: `operationActionLabelForRole` returns "진행 상황 보기" for members (`presentation.ts:51-56`); the entry board becomes read-only rather than a different page (`entry/+page.svelte:926`).
- Header workspace primitive `WorkspaceHeader` with kicker/title/description/actions (`lib/components/layout/WorkspaceHeader.svelte:14-30`) gives every route the same top rhythm.
- Search overlay with `Riot` / `내전` tabs and a 200 ms-debounced suggestion list with full ARIA combobox wiring (`AppShell.svelte:498-626,153-190`).
- Viewport-locked workspaces for list-heavy screens (`h-[100dvh] overflow-hidden` for recruitment workspace, leaderboard, admin; `AppShell.svelte:103-109,642`), so the roster scrolls inside its panel per `docs/03-design-direction.md` ("panel header와 actions는 scroll 영역 밖에").

### 3.2 States: loading / empty / error / disabled
- Route-transition skeleton with spinner + shimmer (`AppShell.svelte:643-732`) instead of a blank flash.
- Consistent three-state blocks on every heavy page: spinner card ("엔트리 정보를 불러오는 중입니다."), red card with message + 다시 시도 (`entry/+page.svelte:893-918`, same in pick-ban `:851-876`, result `:284-309`).
- Empty states that state the next action, differentiated by role: "현재 처리할 운영 작업이 없습니다." + "새 모집을 시작하거나…" vs "길드 멤버는 새 내전이나 경매 모집을 직접 시작할 수 있습니다." (`g/[guildId]/+page.svelte:73-82`).
- Every async button swaps icon→spinner and label→진행형 ("생성 중", "엔트리 편성 시작 중", "되돌리는 중") and is disabled while in flight (`series/+page.svelte:121-133`, `recruitments/[id]/+page.svelte:430-443`).
- Global realtime/conflict bar semantics: 연결(실시간 연결/재연결 중/연결 끊김) × 저장(저장됨/저장 중/저장 대기/변경 충돌) (`RealtimeEditStateBar.svelte:36-54,70-80`).
- `aria-live` roles used deliberately: assertive for errors, polite for notices (`entry/+page.svelte:855-870`).

### 3.3 Forms & validation
- Segmented radio groups for BO1/3/5 with `role="radiogroup"`/`aria-checked` (`series/+page.svelte:359-383`).
- Custom `role="switch"` toggle for 하드 피어리스 with a one-line explanation under the label (`series/+page.svelte:385-412`) and a live rule summary line below (`:414-416` → `formatSeriesRules`).
- Destructive confirmation by typing an exact phrase that is shown as placeholder: `모집 #N 취소`, `시리즈 #N 취소`, `경매 모집 #N 취소` (`recruitments/[id]/+page.svelte:99-102,701-709`; `series/[id]/pick-ban/+page.svelte:90-95,1150-1158`).
- Idempotency first: every mutation reuses a key until success (`series/+page.svelte:89,98`; `entry/+page.svelte:388-405`), so double clicks and retries cannot duplicate.
- Revision-guard UX: on 409 the app refetches authoritative state and tells the user what to do next ("… 서버 최신 상태를 불러왔습니다. 변경된 배치를 확인한 뒤 다시 시도해 주세요." `entry/+page.svelte:311-313`).

### 3.4 Tables, filters, sorting defaults
- Dense bordered grid tables with a sticky-ish 10 px uppercase header row (`series/+page.svelte:149-153,254-260`; `LeaderboardBoard.svelte:205-224`) and a separate mobile card layout rather than horizontal scroll (`series/+page.svelte:207-252`).
- Status pill component with 5 tones (`lib/components/layout/StatusPill.svelte:9-15`).
- Filters as small segmented buttons, reset-on-change to page 1, plus a human empty message per filter combination (`LeaderboardBoard.svelte:71-79,124-130`).
- Default sorts: work lists newest-updated first (`presentation.ts:332-339`); leaderboard by MMR desc then id (`LeaderboardBoard.svelte:119`); records newest first server-side; candidate queue by `queue_position`.

### 3.5 Color & status semantics
- Win/good = emerald; loss/bad = rose/red; in-progress/waiting = amber; neutral/inactive = slate (`StatusPill.svelte:9-15`; records `class:loss` → rose `routes/g/[guildId]/records/+page.svelte:456,1055-1058`).
- BLUE = blue, RED = red for sides only (`EntryTeamColumn.svelte:82-88`, `ScrimPickBanResultInputBoard.svelte:363-369`).
- Hard-fearless/unsold/undo warnings all use amber (`AuctionTournamentBidDraftWorkbench.svelte:876,954-957`).
- Selection = cyan (bg-cyan-400/10, border-cyan-300/xx) consistently across nav, tabs, filters, drop targets.
- Number formatting: `formatMmr` → `Intl.NumberFormat('ko-KR')`, `formatSignedMmr` adds `+` (`lib/numberFormat.ts:18-27`); relative time formatter "방금 / N분 전 / N시간 전 / N일 전" (`presentation.ts:10-18`).

### 3.6 Terminology users already know (keep these strings)
`경매`, `모집`, `모집 마감`, `참가자`, `엔트리 편성`, `엔트리 편성 시작`, `선호 라인`, `팀장`, `입찰`, `입찰가`, `낙찰`, `유찰`, `시작 포인트`, `다음 후보`, `순서 섞기`, `대진`, `대진 확정`, `준결승 A/B`, `결승`, `픽밴`, `세트`, `사이드`, `승자`, `결과 기록`, `마지막 결과 되돌리기`, `조기 종료`, `무승부`, `하드 피어리스`, `전적`, `승률`, `승패`, `라인별 MMR`, `주 포지션`, `선호 챔피언`, `내전 전적`, `경매 내전`, `일반 내전`, `운영자`, `참가자`.
Lane labels: `탑 / 정글 / 미드 / 원딜 / 서폿` (`fixtures/workflow.ts:9-15`, bot uses the same: `apps/bot/src/discord/recruitment-message.ts:10-16`). Note: lane is called `BOTTOM` in data, `바텀` in some auction screens (`auction/recruitments/[id]/+page.svelte:122`) and `원딜` elsewhere — inconsistency to fix.
`참가 신청` is **not** used anywhere; the web says `참가자 추가` and Discord says `참가` / `참가 취소`.

### 3.7 Mobile behavior (what exists)
- Nav collapses to icons only under `md` (`AppShell.svelte:348`), with `aria-label`/`title` kept.
- Guild name hidden below `xl` in the selector (`AppShell.svelte:362`).
- Tables get dedicated mobile card markup (series list) or horizontal scroll (`min-w-[64rem]` pick-ban board `ScrimPickBanResultInputBoard.svelte:591`, `min-w-[940px]` leaderboard `LeaderboardBoard.svelte:203`).
- FAB (`빠른 실행`: 미니게임 — ladder/roulette/coin toss — and 타이머) is mounted on every route except `/docs`, `/terms`, `/privacy` and the entry workspace (`AppShell.svelte:110-112,738-740`; `QuickActionFab.svelte:86-87`). It is the only "live scrim night" utility that is not a core operation; teams seem to actually use it during games.

---

## 4. UX problems in the legacy app (specific, cited)

### P1. Manual team formation is desktop-only and hint-misleading
Drag & drop is the only path (`EntryDraftBoard.svelte:81-128`; `EntryCandidatePool.svelte:67`), the pool advertises "탭 선택 / 드래그" without any tap handler (`EntryCandidatePool.svelte:58`), and the slot is not visibly a drop target until hover (`EntryTeamColumn.svelte:64-69`). On a phone or tablet — the common device while a scrim is being organized — the screen is unusable, contradicting the project's own rule in `docs/03-design-direction.md` (DnD Rules). The auction bracket board proves the alternative works (click team → click slot, `AuctionTournamentBracketMatchSetupBoard.svelte:168-208,375-411`).

### P2. Every roster move is a blocking network write
Ten drag operations = ten `POST`s with a full board lock (`entry/+page.svelte:121,388-419,927`; `EntryDraftBoard.svelte:62`). There is no local draft + single commit, no optimistic reorder, no batched move. Combined with revision conflicts (P3) this makes the most time-critical screen during scrim night the slowest.

### P3. Conflict recovery is a dead end the user must discover
On any `409` the UI sets `recoveryRequired`, disables all editing, and shows "최신 엔트리 상태를 확인해야 다시 변경할 수 있습니다." with a separate button (`entry/+page.svelte:293-330,871-891`). Two operators cannot work simultaneously; the second one silently loses their in-flight action and has to re-read instructions in a banner.

### P4. The auction is a single-operator spreadsheet with a fake timer and hidden gestures
Bids for all 2–4 teams are typed by one operator (`AuctionTournamentBidDraftWorkbench.svelte:1010-1048`); decrement is a **right-click** on `±10` (`:1034-1037`); the 10 s bar resets on every keystroke and enforces nothing (`:47,96-106,383-396`; confirmed by `docs/17-auction-improvements-plan.md`); `다음 후보` shows a dice icon but is queue order (`:474` vs `bot_workflow.rs:12847-12851`); there is no bid history/purchase log beyond `recentAction.kind` (`contracts/auctionTournamentDraft.ts:145-149`), so a mis-award is only visible as a wrong point balance. One mis-click on 낙찰 is recoverable only one action at a time via 되돌리기.

### P5. The same action appears in 3 places; the page header is a junk drawer
Entry page header: 편성/미리보기 tabs + 참가 확정 DM + 시리즈 시작 + 경매 모집 전환 + 모집으로 되돌리기 + 모집 취소 (`recruitments/[id]/entry/+page.svelte:745-837`). Auction: 되돌리기 exists in the workbench header (`AuctionTournamentBidDraftWorkbench.svelte:444-453`), on the bracket page header (`bracket/+page.svelte:262-281`), and again reachable from the result page; cancel/finish controls are re-instantiated on draft, bracket and result headers (`draft/+page.svelte:250-263`; `bracket/+page.svelte:250-264`; `result/+page.svelte:135-148`). Recruitment detail has both a header icon and a dialog for cancel (`recruitments/[id]/+page.svelte:455-466,678-741`), plus a close X and a 취소 button in every dialog.

### P6. Two parallel worlds: Discord owns signup, web owns management — and the web keeps apologizing for it
"참가와 취소는 Discord 모집 메시지에서 진행합니다" (`auction/recruitments/[id]/+page.svelte:530-535`, `auction/+page.svelte:622-625`), while the bot card is the only place with 참가/참가 취소/선호 라인 (`apps/bot/src/discord/recruitment-message.ts:102-158`). No waitlist, no queue position, no deadline (`recruitmentSnapshotSchema` has no waitlist/deadline field, `contracts/recruitmentSnapshot.ts:10-43`; the capacity is a literal 10 `:16`). Organizers must keep both Discord and web in sync by hand.

### P7. Status vocabulary is invented per screen and drifts from the API enums
API: `OPEN/CLOSED/CANCELLED` (`contracts/recruitmentSnapshot.ts:8`), `BIDDING/BRACKET_SETUP/IN_GAME/COMPLETED/CANCELLED` (`contracts/workflow.ts:814`). UI: series page maps CLOSED to either "엔트리 편성" or "시리즈 생성 대기" (`presentation.ts:131-136`); auction page says "참가 모집"/"마감 명단" (`presentation.ts:214`), "입찰 진행", "대진 설정", "대진 진행", "결과 입력" (`:282-329`), kind labels "모집"/"토너먼트"/"완료"/"보관" (`:193`); the dashboard calls the same entry step "편성" (`OperationsQueueBoard.svelte:23-28`) while `presentation.ts:61` uses "팀장" for auctions. Nothing on screen ever shows the real status, so support conversations cannot reference it.

### P8. Two design systems in one app
`records` is a bespoke page with its own shell, palette literals and layout (`routes/g/[guildId]/records/+page.svelte:831-1769`, e.g. hard-coded `#e2e8f0`, `rgb(34 211 238 / 0.08)`), while every other route uses Tailwind tokens and `WorkspaceHeader`. `RiotRecordsView.svelte` (1521 lines) has a third style. Colors, spacing and even the definition of a "card" differ between 결과 and 전적.

### P9. Navigation dead ends and near-empty destinations
`/users/{id}` is a stub (`routes/users/[discordId]/+page.svelte:12-45`) yet is the public identity endpoint; `/g/{id}/series/completed` and `/g/{id}/admin/logs` are title-only stubs (`series/completed/+page.svelte:1-4`, `admin/logs/+page.svelte:1-4`); leaderboard rows need a double-click (`LeaderboardBoard.svelte:234-237`); records require the global search overlay with the `내전` tab (`AppShell.svelte:196-205`) or the empty state (`records/+page.svelte:766-772`); guild switching always navigates to the dashboard (`AppShell.svelte:192-194`); no breadcrumb/back affordance on deep workbenches (only `series result` adds 내전 목록 back, `series/[id]/result/+page.svelte:244-249`).

### P10. Result entry is a 20-field tax per set
Two-part keyboard model (Tab moves cell, Enter opens listbox) with 20 required cells and no indication of the missing one (`ScrimPickBanResultInputBoard.svelte:103-116,392-406,756-773`); the hard-fearless banner exists but is unreachable in the real route (`:57,626-652`, props at `series/[id]/pick-ban/+page.svelte:881-893`); the board disables itself during any save (`:590-594`); the progress strip is three static labels with no counts (`:503-513`). BO5 = up to 5 × 20 entries plus a bulk-paste dialog most users never find (it only appears in the 픽밴 step, `:119-121,485-495`).

### P11. Admin and player views are mixed
The dashboard shows the same list to members and operators with only the action label changed (`presentation.ts:51-56`), so members see "모집 관리"/"엔트리 편성" style tasks they cannot perform unless the snapshot says so. Admin lives in the same header nav as 내전/경매/랭킹 (`AppShell.svelte:134-143`), and admin's 시즌/데이터 are separate route-level pages surfaced as tabs (`admin/+layout.svelte:36-48`). `/admin/status` has no guard while `/g/{id}/admin` does (`admin/status/+page.svelte` vs `admin/+layout.server.ts:7-9`).

### P12. Overstuffed screens and trivia
The auction workbench packs KPIs, current lot, full player profile (6 sub-sections), 2–4 team cards, a queue panel, two dialogs and a revert dialog into one viewport (`AuctionTournamentBidDraftWorkbench.svelte:398-1090`). The entry board's 상세 mode adds a synergy column that is always empty (`EntryDraftBoard.svelte:184,220` — `synergies` never passed) and a head-to-head rail with `>`/`<` glyphs (`EntryHeadToHeadRail.svelte:88`) that only make sense after reading a tooltip. `AuctionTournamentOverviewBoard.svelte` (603 lines) is dead code.

### P13. Error text is developer-shaped in places
Global error page prints `page.status` and raw `page.error?.message`, falling back to the English "Route error" (`routes/+error.svelte:10-20`); admin 403 text is "길드 관리자 권한이 필요합니다." (`admin/+layout.server.ts:8`) which surfaces through that page. Some API messages are English (`contracts/workflow.ts:46`, `contracts/seriesPickBan.ts:50`). Conversely, user-facing strings elsewhere are excellent and specific ("같은 세트에서 중복 선택된 챔피언: …").

### P14. Mobile breakage beyond entry
Pick-ban board `min-w-[64rem]` (`ScrimPickBanResultInputBoard.svelte:591`), leaderboard `min-w-[940px]` (`LeaderboardBoard.svelte:203`), bracket `2xl` layout with `h-[min(40rem,calc(100dvh-16rem))]` (`AuctionTournamentBracketMatchSetupBoard.svelte:252,322`), auction workbench `xl:h-[56rem]` (`AuctionTournamentBidDraftWorkbench.svelte:430,965`). These scroll or reflow into very tall stacks; none of them have a touch-optimized alternative.

### P15. Historical churn shows the same UX fights recurring
- `23958ca feat(web): upgrade guild operations dashboard` (OperationsQueueBoard +271 lines) and `1409ad2 fix: align operations queue progress markers` — stage semantics were wrong and had to be re-fixed.
- `f56bfe6 fix: stabilize production minigame animations` (FAB/minigames), plus `docs/17-auction-improvements-plan.md` dev-only animation bug.
- `8a444aa feat: make scrim cancellation recoverable` — cancel was previously a destructive dead end; recovery was bolted on later, which is why 취소/복구 controls are scattered.
- `9363d41 fix: hide invalid converted recruitment cancellation`, `05ccf6c fix: restore auction recruitment entrypoints` — navigation/entry-point regressions around the auction↔recruitment handoff.
- `60da948 feat(web): deep-link guild recruitment creation`, `610ce2a feat(web): keep guild creation actions available` — creation entry points kept disappearing from the dashboard; a sign that "where do I start a scrim" was never obvious.
- `14c4381 feat: add recruitment start time inputs` + `e8e8bd0 fix: default omitted recruitment start time` — the start time field was added after the fact and immediately needed a default.
- `9e0b2de feat: add auction draft queue controls`, `941c36c feat: support BO1 early completion for auction finals` — auction rules and recovery kept growing into the same 1314-line component.

---

## 5. Domain facts the UI must respect (derived from code)

### 5.1 States / enums
| Domain | Enum values | Source |
|---|---|---|
| Recruitment (normal) | `OPEN`, `CLOSED`, `CANCELLED`; list projection only exposes `OPEN`/`CLOSED` | `lib/contracts/recruitmentSnapshot.ts:8`; `lib/contracts/workflow.ts:690` |
| Recruitment title | server-generated, contains 예상 시작 (KST) | `apps/api/src/repository/bot_workflow.rs:9945-9949` |
| Series | `IN_PROGRESS`, `COMPLETED`; `terminalReason` ∈ `SCORE_REACHED`/`EARLY_WIN`/`EARLY_DRAW`; `outcome` ∈ `TEAM_1`/`TEAM_2`/`DRAW` | `lib/contracts/workflow.ts:716-722` |
| Auction recruitment | `OPEN`, `CLOSED`, `CONVERTED`, `CANCELLED` | `lib/contracts/auctionRecruitmentSnapshot.ts:12` |
| Auction tournament | `BIDDING`, `BRACKET_SETUP`, `IN_GAME`, `COMPLETED`, `CANCELLED` | `lib/contracts/workflow.ts:814` |
| Match | `LINEUP_PENDING`, `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | `lib/contracts/workflow.ts:794`; `AuctionTournamentBracketMatchSetupBoard.svelte:236-245` |
| Game set | 1..5; per-set `sidePreset` `DEFAULT`/`SWAPPED`, `sideSelected` flag, `winner` `BLUE`/`RED` | `lib/contracts/seriesPickBan.ts:63-82` |
| Candidate (auction) | `QUEUED`, `ACTIVE`, `UNSOLD`, `ASSIGNED`; `acquiredVia` `CAPTAIN`/`BID`/`MANUAL` | `lib/contracts/auctionTournamentDraft.ts:23,48` |
| Season | `ACTIVE`, `CLOSED` | `lib/contracts/workflow.ts:95,621` |
| Member | `ACTIVE`, `INACTIVE`; identity `DISCORD`/`DUMMY` | `lib/contracts/workflow.ts:516-517` |
| Guild role | `MEMBER`, `OPERATOR` | `lib/contracts/workflow.ts:483` |

### 5.2 Matchup / series formats
- BO1, BO3, BO5 only (`seriesBestOfValues`, `lib/workflow/seriesRules.ts:1`); format + hard-fearless are frozen at creation and copied into the series (`docs/12-current-operating-contract.md`).
- Auction 10인 = exactly one 결승 with `finalBestOf`; 20인 = 준결승 A/B (`semifinalBestOf`) + 결승 (`finalBestOf`); `semifinalBestOf` **must be null** for 10인 (validator `lib/contracts/workflow.ts:769-780`).
- Draw is possible only when scores are tied at early completion (`series/[id]/pick-ban/+page.svelte:1062-1077`).
- Stages are named `SEMIFINAL_A`, `SEMIFINAL_B`, `FINAL` and rendered as 준결승 A/B, 결승 (`lib/contracts/workflow.ts:183,195,792-793`).
- Result records: series record `participantCount` literal 10, tournament record literal 20 with placement 1|2|3 and `spentPoints` (`lib/contracts/workflow.ts:178,211-215`).

### 5.3 Team sizes and positions
- Normal scrim roster is exactly 10 → 2 teams × 5 (`targetCount: z.literal(10)`, `lib/contracts/recruitmentSnapshot.ts:16`; `entryDraftSlotSchema` 10 slots, `lib/contracts/entryDraft.ts:9-20`).
- Auction 10인 = 10 players / 2 teams; 20인 = 20 / 4 (`lib/contracts/workflow.ts:760-762`; auction roster `max(20)` `lib/contracts/auctionRecruitmentSnapshot.ts:74`).
- 5 canonical lanes, order TOP→SUPPORT, each team must contain all 5 exactly once (`lib/contracts/seriesPickBan.ts:16,42-53`; canonical order `lib/fixtures/workflow.ts:1,9-15`).
- Auction team capacity 5 members (`lib/contracts/auctionTournamentDraft.ts:36`; server `available_auction_roster_slot` `apps/api/src/repository/bot_workflow.rs:12159`).
- Auction recruitment forces a `declaredLane` per participant (nullable in DTO but required on add, `auction/recruitments/[id]/+page.svelte:219-230,249-255`).

### 5.4 Auction bid units and budget rules
- Bids are integer points ≥ 0, upper-bounded by the awarding team's `current_points` (`bot_workflow.rs:12962-12972`); no bid can make a team negative; `initial_points > 0` (`migrations/0006_auction_core_bracket_matches.sql:124,210`).
- Each team starts with its own `initialPoints`; points are only ever spent by AWARD_BID (point ledger row `INITIAL` then debits).
- Awards apply to the *current* lot only (`AuctionDraftCurrentTargetMismatch`); marking 유찰 sets candidate to `UNSOLD` and closes the lot as `UNSOLD` (`bot_workflow.rs:12900-12945`).
- Roster full for all teams ⇒ automatic transition to `BRACKET_SETUP` (`bot_workflow.rs:13044-13049`).
- Draw order: candidates excluding captains get randomized `queue_position` at creation; `순서 섞기` reshuffles `QUEUED` only (`bot_workflow.rs:7867-7870,12219-12294`).
- No tie-break exists because there is no automated comparison — the operator awards explicitly.

### 5.5 Participant ↔ Riot account linking
- Users enter only `GameName#TagLine`; the system resolves PUUID; platform fixed `KR`, routing `ASIA` (`lib/contracts/workflow.ts:426-442`; `docs/12-current-operating-contract.md`).
- Self-service linking at `/me?tab=riot` (`routes/me/+page.svelte:76-77`; `RiotAccountManager.svelte:283-292`); bot `/등록 GameName#TagLine` (`routes/install/+page.svelte:45-51`).
- Records/profile show Riot IDs gated by privacy (`publicProfile`, `showRiotIds`, `allowExternalRecordSearch`, `lib/contracts/workflow.ts:450-456`); guild-internal MMR is never hidden by privacy (docs 12).
- Auction candidate card shows cached Riot tier/games/win-rate only if present (`lib/contracts/auctionTournamentDraft.ts:108-131`).

### 5.6 Hard fearless (하드 피어리스)
- Boolean frozen per series/tournament; default **true** in web create dialogs (`series/+page.svelte:34,57-61`; `auction/+page.svelte:139,377-381`) and default true server-side since `docs/17-auction-improvements-plan.md` Phase 1.
- Rule: picks from any previously confirmed set cannot be picked again; `previousPickChampionIds` is the series' prior picks (`series/[id]/pick-ban/+page.svelte:718-722`) and conflict detection exists (`ScrimPickBanResultInputBoard.svelte:167-198,641-650`) but is only rendered when `validateDraft` is enabled, which the production route never does. Bans are not carried over, only picks; the API stores `hard_fearless` as a rule snapshot and does not reject prior-set picks (no such validation in `apps/api/src/repository`).
- Per-match flag surfaced on bracket cards (`AuctionTournamentBracketMatchSetupBoard.svelte:456-458`).

### 5.7 Rating / MMR display
- Composite MMR per player + per-lane MMR with games/wins (`lib/contracts/workflow.ts:327-360`); leaderboard ranks by composite or a lane MMR.
- Per-game MMR before/after is a ledger; series/tournament `mmrDelta` must equal the sum of game deltas (`lib/contracts/workflow.ts:399-424`).
- All MMR values are rendered rounded with grouping (`lib/numberFormat.ts:18-27`; commit `ba4bd6b fix(web): normalize MMR number displays`).
- Admin can manually adjust a member's lane MMR with a reason (`GuildMemberManagementPanel.svelte:106-114,437-500`), reflecting real-world corrections.

### 5.8 Permission model
- Two guild roles: `MEMBER` (read + self-service + may create a recruitment) vs `OPERATOR` (all roster/lifecycle/workbench mutations). Server exposes capabilities per snapshot rather than the client inferring (`canEdit`, `canReset`, `canCreateSeries`, `canReopen`, `canCancel`, `lib/contracts/entryDraft.ts:102-112`; `canManageDraft`/`canManageBracket`/`canRevertLast`, `auctionTournamentDraft.ts:176-183`).
- Guild admin = operator + Discord operator role configured per guild (`GuildSettingsAdminPanel.svelte:186-205`); layout guard 403 (`admin/+layout.server.ts:7-9`).
- Service admin = `me.serviceAdmin` (`lib/contracts/workflow.ts:470`), used for the dummy-user tool link (`AppShell.svelte:449-457`) and `/dev/users`; **not** used to guard `/admin/status` in the route.
- Real-time channels are only opened for operators or active editors (`entry/+page.svelte:129-166`; `auction/tournaments/[id]/draft/+page.svelte:72-106`), per docs 12's WS scope table.

---

## 6. Reusable screen ideas for the new app (prioritized top 10)

Tone target: Riot/LCU-like competitive console — dark, dense, one decisive primary action per state, numeric/scoreboard typography, no decorative timers, no apology copy.

1. **Operations console (replaces dashboard + operations queue).**
   What it is: a single "현재 작업" hero driven by server-provided stage, plus a compact queue of everything else.
   Do differently: server returns stage + next action + a deep link with the exact entity; one primary CTA; members see the same card with a status-only action (참가/결과 보기); remove the "긴급 N" badge unless priority is real; keyboard focus lands on the primary CTA. Kill the 6-step stepper that mixes auction and scrim stages (`OperationsQueueBoard.svelte:115-147`, `presentation.ts:58-83`) — use one canonical stage model per aggregate.

2. **Scrim night board (replaces separate 모집 → 엔트리 → 픽밴 → 결과 pages).**
   What it is: one route per recruitment/series with tabs that only reflect the current stage: 참가자 → 편성 → 대전 → 결과.
   Do differently: the roster, team slots, and per-set scoreboard live in one state machine; the header shows score `1 : 1`, current set, and one primary button ("경기 시작", "세트 기록"); no navigation between 4 URLs to finish one night.

3. **Team builder with tap-to-place + local draft commit (replaces `EntryDraftBoard`).**
   What it is: two 5-lane columns, candidate pool, optimistic local moves, drag *and* click/tap, one "편성 확정" commit with revision check.
   Do differently: exactly one network write per explicit save (or a debounced autosave with a visible "저장됨" state, as `RealtimeEditStateBar` already models); swap-on-drop semantics made visible; per-lane H2H and MMR delta shown as compact chips, not a 1/4-width column; mobile layout = two stacked columns + bottom candidate sheet.

4. **Live auction arena (replaces `AuctionTournamentBidDraftWorkbench`).**
   What it is: current lot card (avatar, lane, MMR, 최근 승률) + 2/4 team cards with remaining points and remaining slots, with a real per-lot bid round.
   Do differently: no fake timer — either a real server-authoritative countdown that closes the lot, or none at all; explicit +/− steppers (not right-click) plus a numeric keypad for touch; awarding requires a confirmation showing "잔여 {points} → {points-bid}P"; keep a visible, scrollable 구매 기록 (player, team, points, who/when) since the legacy snapshot has none; show "잔여 자리" per team and disable full teams; tie/overspend warnings before award; one undo per lot, not a global revert.

5. **Tournament bracket canvas (replaces stacked 대진 form + result board).**
   What it is: a real 2-slot or 4-slot bracket with 준결승 A/B → 결승, per-match BO chip, status chip (라인업 대기 / 진행 중 / 완료), winner advancing visually.
   Do differently: bracket is the navigation — clicking a match opens its workbench in a side panel instead of routing to `/matches/{id}`; assignment via click-to-place only; lock/unlock as a single toggle with consequences listed inline ("결과가 1건이라 해제 불가").

6. **Set result entry board (replaces `ScrimPickBanResultInputBoard` 3-step wizard).**
   What it is: a single-screen scoreboard: side selector, 10 ban slots, 10 pick slots, winner, one `세트 기록` button, with remaining slot counter.
   Do differently: show "몇 개 남았는지" and jump to the first empty cell; champion input as a fast typeahead with portrait chips (no free-text ambiguity); live duplicate and hard-fearless validation *as you type* with inline red cell borders; first-class "일괄 붙여넣기" entry (`ScrimPickBanBulkInput`) discoverable from the first render; Enter moves to the next empty slot.

7. **Player profile / scouting card (replaces `users/{id}` stub + parts of records).**
   What it is: one page with composite + per-lane MMR, win rate, recent form (last 10 W/L pips), main champions, and in-guild head-to-head vs the current opponent.
   Do differently: public page actually shows something (or is removed); link from leaderboard rows with a single click and an explicit "전적 열기" affordance; one "전적" and one "Riot" section, clearly separated (legacy mixes both and hides one behind a toggle).

8. **Guild records explorer (replaces the 1769-line bespoke page).**
   What it is: search-first list with a shared table component, filters (일반/경매, lane, season) in the URL, expandable sets rendering both lineups and bans.
   Do differently: an inline search box on the page (not only the header overlay); URL state for filters; shared dense-table styling instead of a third design system; virtualized list + cursor paging.

9. **Leaderboard + season view (replaces `LeaderboardBoard`).**
   What it is: role tabs, season switcher, rank rows with movement indicators, self row pinned.
   Do differently: single click opens the player; sort column headers clickable with a visible arrow; show games/min-games so low-volume MMR is not misleading; keep the exact `통합 / 탑 / 정글 / 미드 / 원딜 / 서폿` labels.

10. **Guild admin console (replaces 5-tab admin + service status).**
    What it is: one admin route with sections 멤버 / 규칙 / 시즌 / 연동 / 데이터 / 로그, each guarded by capability, and a separate clearly-marked service-admin area.
    Do differently: fold 시즌 and 데이터 into the same guarded shell (legacy splits them into routes surfaced as tabs); show capability-driven disabled states with a reason; put MMR adjustment behind an explicit "수동 조정" flow that writes an audit entry and shows the new value; guard `/admin` at the layout level for service admins too (legacy `/admin/status` is unguarded).

Cross-cutting redesign rules to adopt:
- One control per action: no duplicate cancel/revert in header + body; destructive actions only from an overflow menu with typed confirmation.
- Every state has a name the server owns; render the server's status string, don't invent per-screen Korean synonyms.
- Optimistic local edits with a visible sync state; conflicts never hard-lock the page — merge-or-reload with the user's intent preserved.
- Touch parity is a first-class requirement for every workbench (tap-to-select → tap-to-place), with drag as an enhancement.
- Loading = skeleton of the real layout (the legacy shell skeleton is good); empty = what to do next; error = message + retry + request id.
- Keep the terminology set in §3.6 verbatim; fix the `바텀`/`원딜` split once.
- Keep the quick tools (미니게임/타이머) only if they are genuinely used on scrim nights; if kept, make them a separate, quiet utility — not a floating FAB on top of every workbench.
