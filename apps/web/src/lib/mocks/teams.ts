import type { LedgerAuction, LedgerPerson } from '#lib/features/stats/auction-ledger.ts';
import {
    LANES,
    moveAssignment,
    slotKey,
    TEAM_SIZE,
    type Assignments,
    type AuctionHistoryEntry,
    type AuctionStatus,
    type AuctionView,
    type ChampionRef,
    type FormationPlayer,
    pairKey,
    type PairRecord,
    type TargetProfile,
    type FormationTeam,
    type SlotKey
} from '#lib/features/scrims/formation.ts';
import { isBestOf } from '#lib/features/scrims/bracket.ts';
import { TEAM_NAMES } from '#lib/features/scrims/settings.ts';
import { byCandidateName, orderAuctionCandidates } from '#lib/server/scrims/auction-order.ts';
import { mockAvatarUrl } from './avatar.ts';
import { mockLatency } from './latency.ts';
import { seedMockManualFinal } from './bracket.ts';
import {
    bumpMockRevision,
    findMockScrimRecord,
    listMockAuctionScrims,
    type MockFailure,
    type MockScrim
} from './scrims.ts';

// 수동 편성·경매의 개발용 저장소다. 내전 목(scrims.ts)의 선발 참가자를 대상으로 하며 개발 서버를 재시작하면 처음 상태로 돌아간다.

const wait = () => mockLatency.wait(300);

function selected(scrim: MockScrim) {
    return scrim.participants.filter((participant) => participant.status === 'selected');
}

function toPlayers(scrim: MockScrim): FormationPlayer[] {
    return selected(scrim).map((participant) => ({
        participantId: participant.registrationId,
        userId: participant.userId,
        displayName: participant.displayName,
        iconUrl: mockAvatarUrl(participant.userId),
        positions: [...participant.positions],
        mmr: { ...participant.mmr }
    }));
}

function defaultTeams(scrim: MockScrim): FormationTeam[] {
    return Array.from({ length: scrim.teamCount }, (_, index) => ({
        id: `${scrim.id}-t${index + 1}`,
        name: TEAM_NAMES[index]!
    }));
}

// 같은 입력이면 항상 같은 값을 주는 간단한 해시다. 개발용 전적을 만들 때만 쓴다.
function hash(text: string) {
    let value = 2166136261;
    for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 16777619);
    return value >>> 0;
}

// 선발 참가자 두 명씩의 지난 내전 전적(같은 팀·상대 팀)을 만든다. 일부 쌍은 기록이 없다.
function pairRecords(ids: string[]): Record<string, PairRecord> {
    const records: Record<string, PairRecord> = {};
    ids.forEach((a, index) =>
        ids.slice(index + 1).forEach((b) => {
            const key = pairKey(a, b);
            const h = hash(key);
            const together = h % 8;
            const against = (h >>> 4) % 7;
            records[key] = {
                together: { plays: together, wins: together ? (h >>> 8) % (together + 1) : 0 },
                against: { plays: against, firstWins: against ? (h >>> 12) % (against + 1) : 0 }
            };
        })
    );
    return records;
}

const PROFILE_CHAMPIONS = [
    'Ahri',
    'LeeSin',
    'Thresh',
    'Jinx',
    'Darius',
    'Yasuo',
    'Lux',
    'Kaisa',
    'Viego',
    'Orianna',
    'Sett',
    'Nami'
];
const TIERS = ['DIAMOND II', 'EMERALD I', 'PLATINUM III', 'GOLD II', null];

// 현재 후보의 상세 보기용 전적을 만든다. 실제로는 Game·Riot 캐시에서 조회한다.
function mockProfile(player: FormationPlayer, champion: (id: string) => ChampionRef): TargetProfile {
    const h = hash(player.participantId);
    const pick = (offset: number) =>
        champion(PROFILE_CHAMPIONS[(h + offset * 5) % PROFILE_CHAMPIONS.length]!);
    const games = 8 + (h % 30);
    const wins = Math.round(games * (0.35 + ((h >>> 5) % 30) / 100));
    const mainLane = player.positions[0] ?? LANES[h % LANES.length]!;
    return {
        summary: { games, wins, losses: games - wins },
        mainLane,
        championRecords: [0, 1, 2].map((index) => {
            const played = Math.max(1, Math.round(games / (index + 2)));
            return {
                champion: pick(index),
                games: played,
                wins: Math.round(played * (0.4 + ((h >>> index) % 40) / 100))
            };
        }),
        laneGames: Object.fromEntries(
            LANES.map((lane, index) => [
                lane,
                lane === mainLane ? Math.round(games * 0.6) : (h >>> index) % 5
            ])
        ) as TargetProfile['laneGames'],
        preferredChampions: [3, 4, 5].map(pick),
        recentGames: Array.from({ length: 8 }, (_, index) => ({
            id: `${player.participantId}-g${index}`,
            champion: pick(index % 3),
            lane: index % 3 === 2 && player.positions[1] ? player.positions[1] : mainLane,
            win: ((h >>> index) & 1) === 1,
            playedAt: new Date(Date.UTC(2026, 9, 28 - index * 3, 12)).toISOString()
        })),
        // 일부 후보는 캐시된 Riot 전적이 없는 경우를 재현한다.
        riot:
            h % 7 === 0
                ? null
                : {
                      tier: TIERS[h % TIERS.length] ?? null,
                      games: 20,
                      wins: 9 + (h % 6),
                      champions: [6, 7].map(pick)
                  }
    };
}

// ─── 수동 편성 ───────────────────────────────────────────────

type ManualState = { teams: FormationTeam[]; assignments: Assignments; confirmed: boolean };
const manualStates = new Map<string, ManualState>();

// 순서대로 팀·포지션을 채운다. 개발 데이터의 초기 배정에만 쓴다.
function fillInOrder(teams: FormationTeam[], ids: string[], limit: number): Assignments {
    const slots = teams.flatMap((team) => LANES.map((lane) => slotKey(team.id, lane)));
    return Object.fromEntries(ids.slice(0, limit).map((id, index) => [id, slots[index]!]));
}

function manualState(scrim: MockScrim): ManualState {
    let state = manualStates.get(scrim.id);
    if (!state) {
        const teams = defaultTeams(scrim);
        const ids = selected(scrim).map((participant) => participant.registrationId);
        // 편성 중인 내전은 일부만, 이미 진행된 내전은 전원 배정·확정된 상태로 시작한다.
        const done = !['recruit', 'preparing'].includes(scrim.status);
        state = { teams, assignments: fillInOrder(teams, ids, done ? ids.length : 6), confirmed: done };
        manualStates.set(scrim.id, state);
    }
    return state;
}

export async function getMockManualFormation(guildId: string, scrimId: string) {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return null;
    const state = manualState(scrim);
    return {
        teams: state.teams.map((team) => ({ ...team })),
        players: toPlayers(scrim),
        assignments: { ...state.assignments },
        confirmed: state.confirmed,
        pairs: pairRecords(selected(scrim).map((participant) => participant.registrationId))
    };
}

function editableManual(
    guildId: string,
    scrimId: string
): { scrim: MockScrim; state: ManualState } | MockFailure {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!scrim.canManage) return { status: 403, message: '편성할 권한이 없어요' };
    const state = manualState(scrim);
    if (scrim.formationMethod !== 'manual' || state.confirmed || scrim.status !== 'preparing')
        return { status: 409, message: '편성이 이미 확정됐어요' };
    return { scrim, state };
}

export async function moveMockManualPlayer(
    guildId: string,
    scrimId: string,
    participantId: string,
    slot: SlotKey | null
) {
    await wait();
    const target = editableManual(guildId, scrimId);
    if ('status' in target) return target;
    if (!selected(target.scrim).some((participant) => participant.registrationId === participantId)) {
        return { status: 409, message: '선발 참가자가 아니에요' };
    }
    if (slot && !target.state.teams.some((team) => slot.startsWith(`${team.id}:`))) {
        return { status: 400, message: '알 수 없는 자리예요' };
    }
    target.state.assignments = moveAssignment(target.state.assignments, participantId, slot);
    return null;
}

export async function resetMockManual(guildId: string, scrimId: string) {
    await wait();
    const target = editableManual(guildId, scrimId);
    if ('status' in target) return target;
    target.state.assignments = {};
    return null;
}

export async function confirmMockManual(guildId: string, scrimId: string, bestOf?: number) {
    await wait();
    const target = editableManual(guildId, scrimId);
    if ('status' in target) return target;
    const missing = selected(target.scrim).length - Object.keys(target.state.assignments).length;
    if (missing > 0) return { status: 409, message: `미배정 ${missing}명이 남았어요` };
    if (bestOf !== undefined) {
        if (!isBestOf(bestOf) || target.scrim.teamCount !== 2)
            return { status: 400, message: '2팀 경기의 방식을 골라 주세요' };
        seedMockManualFinal(
            target.scrim,
            target.state.teams.map((team) => team.id),
            bestOf
        );
    }
    target.state.confirmed = true;
    target.scrim.status = 'ready';
    bumpMockRevision(target.scrim);
    return null;
}

export function isMockFormationConfirmed(scrim: MockScrim): boolean {
    return scrim.formationMethod === 'manual'
        ? manualState(scrim).confirmed
        : scrim.formationMethod === 'auction' && auctionState(scrim).status === 'completed';
}

// ─── 경매 ────────────────────────────────────────────────────

type Lot = {
    id: string;
    participantId: string;
    result: 'sold' | 'unsold' | 'manual';
    teamId: string | null;
    price: number | null;
    voided: boolean;
};

type AuctionTeamState = FormationTeam & { captainId: string | null; startPoints: number };

type MockAuctionAction =
    | {
          kind: 'draw' | 'pass' | 'award' | 'assign_current' | 'restore';
          participantId: string;
          lotId?: string;
      }
    | {
          kind: 'assign_candidate';
          participantId: string;
          lotId: string;
          source: 'queue' | 'unsold';
          index: number;
      };

type AuctionState = {
    status: AuctionStatus;
    teams: AuctionTeamState[];
    queue: string[];
    open: string | null;
    unsold: string[];
    lots: Lot[];
    seq: number;
    lastAction: MockAuctionAction | null;
};

const auctionStates = new Map<string, AuctionState>();
const DEFAULT_POINTS = 1000;

// 취소 복구는 이미 생성된 개발 상태의 단계만 바꾸고 후보·이력·포인트를 보존한다.
export function getMockAuctionStatus(scrimId: string): AuctionStatus | null {
    return auctionStates.get(scrimId)?.status ?? null;
}

export function setMockAuctionStatus(scrimId: string, status: AuctionStatus): void {
    const state = auctionStates.get(scrimId);
    if (state) state.status = status;
}

/** 경기까지 전체 취소하면 영입은 무효로 남기고 팀장·시작 포인트만 보존한다. */
export function cancelMockAuctionResults(scrimId: string): void {
    const state = auctionStates.get(scrimId);
    if (!state) return;
    for (const lot of state.lots) lot.voided = true;
    Object.assign(state, { status: 'cancelled', queue: [], open: null, unsold: [], lastAction: null });
}

function acquisitions(state: AuctionState) {
    return state.lots.filter((lot) => !lot.voided && (lot.result === 'sold' || lot.result === 'manual'));
}

function membersOf(state: AuctionState, teamId: string) {
    const team = state.teams.find((item) => item.id === teamId)!;
    return (team.captainId ? 1 : 0) + acquisitions(state).filter((lot) => lot.teamId === teamId).length;
}

function remainingPoints(state: AuctionState, teamId: string) {
    const team = state.teams.find((item) => item.id === teamId)!;
    const spent = acquisitions(state)
        .filter((lot) => lot.teamId === teamId)
        .reduce((sum, lot) => sum + (lot.price ?? 0), 0);
    return team.startPoints - spent;
}

function auctionState(scrim: MockScrim): AuctionState {
    let state = auctionStates.get(scrim.id);
    if (state) return state;
    const teams = defaultTeams(scrim).map((team) => ({
        ...team,
        captainId: null as string | null,
        startPoints: DEFAULT_POINTS
    }));
    state = { status: 'setup', teams, queue: [], open: null, unsold: [], lots: [], seq: 0, lastAction: null };
    // 이미 편성이 끝난 내전은 팀장 다음 순서로 돌아가며 낙찰된 완료 상태를 만든다.
    if (!['recruit', 'preparing'].includes(scrim.status)) {
        const ids = selected(scrim).map((participant) => participant.registrationId);
        teams.forEach((team, index) => (team.captainId = ids[index] ?? null));
        ids.slice(teams.length).forEach((id, index) => {
            const team = teams[index % teams.length]!;
            state!.lots.push({
                id: `lot${++state!.seq}`,
                participantId: id,
                result: index === 7 ? 'manual' : 'sold',
                teamId: team.id,
                price: index === 7 ? null : index === 5 ? 0 : 40 + ((index * 53) % 260),
                voided: false
            });
        });
        const last = state.lots.at(-1);
        if (last)
            state.lastAction = {
                kind: last.result === 'sold' ? 'award' : 'assign_current',
                participantId: last.participantId,
                lotId: last.id
            };
        state.status = 'completed';
    }
    auctionStates.set(scrim.id, state);
    return state;
}

export function mockLedgerAuction(scrim: MockScrim): LedgerAuction | null {
    const state = auctionState(scrim);
    if (state.status !== 'completed') return null;
    const people = new Map(
        scrim.participants.map((p) => [
            p.registrationId,
            {
                id: p.userId,
                name: p.userId ? p.displayName : '삭제된 사용자',
                avatarUrl: mockAvatarUrl(p.userId)
            }
        ])
    );
    const person = (id: string): LedgerPerson =>
        people.get(id) ?? { id: null, name: '삭제된 사용자', avatarUrl: null };
    const lots = acquisitions(state);
    return {
        id: scrim.id,
        title: scrim.title,
        teams: state.teams.map((team) => {
            const captain = team.captainId ? person(team.captainId) : null;
            return {
                id: team.id,
                name: team.name,
                captain,
                budget: team.startPoints,
                signings: lots.flatMap((lot, index) =>
                    lot.teamId === team.id
                        ? [
                              {
                                  id: `${scrim.id}-${lot.id}`,
                                  player: person(lot.participantId),
                                  buyer: lot.result === 'sold' ? captain : null,
                                  price: lot.price,
                                  order: index + 1,
                                  acquiredAt: null
                              }
                          ]
                        : []
                )
            };
        })
    };
}

export async function getMockAuction(
    guildId: string,
    scrimId: string,
    champion: (id: string) => ChampionRef = (id) => ({ id, name: id, iconUrl: null })
): Promise<AuctionView | null> {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return null;
    const state = auctionState(scrim);
    const players = toPlayers(scrim);
    const byId = new Map(players.map((player) => [player.participantId, player]));
    const pick = (id: string) => byId.get(id)!;
    const teamName = (id: string | null) => state.teams.find((team) => team.id === id)?.name ?? null;

    return {
        status: state.status,
        canRevert: state.status === 'in_progress' && Boolean(state.lastAction),
        players,
        teams: state.teams.map((team) => ({
            id: team.id,
            name: team.name,
            captainId: team.captainId,
            startPoints: team.startPoints,
            remainingPoints: remainingPoints(state, team.id),
            members: [
                ...(team.captainId
                    ? [{ player: pick(team.captainId), via: 'captain' as const, price: null }]
                    : []),
                ...acquisitions(state)
                    .filter((lot) => lot.teamId === team.id)
                    .map((lot) => ({
                        player: pick(lot.participantId),
                        via: lot.result === 'manual' ? ('manual' as const) : ('auction' as const),
                        price: lot.price
                    }))
            ]
        })),
        openLot: state.open ? pick(state.open) : null,
        openProfile: state.open ? mockProfile(pick(state.open), champion) : null,
        queue: state.queue.map(pick).sort(byCandidateName),
        unsold: state.unsold.map(pick),
        history: state.lots.map((lot, index): AuctionHistoryEntry => ({
            id: lot.id,
            order: index + 1,
            displayName: pick(lot.participantId).displayName,
            iconUrl: pick(lot.participantId).iconUrl,
            result: lot.result,
            teamName: teamName(lot.teamId),
            price: lot.price,
            voided: lot.voided
        }))
    };
}

function auctionTarget(
    guildId: string,
    scrimId: string,
    status: AuctionStatus
): { scrim: MockScrim; state: AuctionState } | MockFailure {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!scrim.canManage) return { status: 403, message: '경매를 진행할 권한이 없어요' };
    if (scrim.formationMethod !== 'auction' || scrim.status !== 'preparing')
        return { status: 409, message: '편성 중인 경매만 바꿀 수 있어요' };
    const state = auctionState(scrim);
    if (state.status !== status) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
    return { scrim, state };
}

export async function saveMockAuctionSetup(
    guildId: string,
    scrimId: string,
    teams: { captainId: string | null; startPoints: number }[]
) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'setup');
    if ('status' in target) return target;
    const ids = new Set(selected(target.scrim).map((participant) => participant.registrationId));
    const captains = teams.map((team) => team.captainId).filter((id): id is string => Boolean(id));
    if (teams.length !== target.state.teams.length) return { status: 400, message: '팀 수가 맞지 않아요' };
    if (captains.some((id) => !ids.has(id)) || new Set(captains).size !== captains.length) {
        return { status: 400, message: '팀장을 다시 골라 주세요' };
    }
    if (teams.some((team) => !Number.isSafeInteger(team.startPoints) || team.startPoints <= 0)) {
        return { status: 400, message: '시작 포인트는 1 이상의 정수여야 해요' };
    }
    target.state.teams.forEach((team, index) => Object.assign(team, teams[index]));
    return null;
}

export function mockAuctionPurchaseTotals(guildId: string) {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const past of listMockAuctionScrims(guildId)) {
        for (const team of mockLedgerAuction(past)?.teams ?? []) {
            for (const { player, price } of team.signings) {
                if (!player.id || price === null || price <= 0) continue;
                const total = totals.get(player.id);
                if (total) {
                    total.sum += price;
                    total.count++;
                } else totals.set(player.id, { sum: price, count: 1 });
            }
        }
    }
    return totals;
}

function newAuctionQueue(scrim: MockScrim, state: AuctionState): string[] {
    const captains = new Set(state.teams.map((team) => team.captainId));
    const candidates = selected(scrim).filter((participant) => !captains.has(participant.registrationId));
    const totals = mockAuctionPurchaseTotals(scrim.guildId);
    return orderAuctionCandidates(candidates, ({ userId }) => {
        const total = userId && totals.get(userId);
        return total ? total.sum / total.count : null;
    }).map(({ registrationId }) => registrationId);
}

export async function startMockAuction(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'setup');
    if ('status' in target) return target;
    const { state, scrim } = target;
    if (state.teams.some((team) => !team.captainId))
        return { status: 409, message: '모든 팀의 팀장을 정해야 해요' };
    state.queue = newAuctionQueue(scrim, state);
    state.status = 'in_progress';
    state.lastAction = null;
    return null;
}

function completeIfFull(scrim: MockScrim, state: AuctionState) {
    if (
        state.teams.length !== scrim.teamCount ||
        !state.teams.every((team) => membersOf(state, team.id) === TEAM_SIZE)
    )
        return false;
    state.status = 'completed';
    state.open = null;
    scrim.status = 'ready';
    bumpMockRevision(scrim);
    return true;
}

export async function confirmMockAuctionFormation(
    guildId: string,
    scrimId: string,
    expectedRevision: number
) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    if (expectedRevision !== (target.scrim.revision ?? 0))
        return { status: 409, message: '다른 사람이 먼저 변경했어요' };
    return completeIfFull(target.scrim, target.state)
        ? null
        : { status: 409, message: '모든 팀에 5명씩 배치해 주세요' };
}

export async function drawMockLot(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state } = target;
    if (state.open) return { status: 409, message: '이미 진행 중인 후보가 있어요' };
    const next = state.queue.shift();
    if (!next) return { status: 409, message: '대기 중인 후보가 없어요' };
    state.open = next;
    state.lastAction = { kind: 'draw', participantId: next };
    return null;
}

export async function awardMockLot(guildId: string, scrimId: string, teamId: string, price: number) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state, scrim } = target;
    if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
    if (!state.teams.some((team) => team.id === teamId))
        return { status: 404, message: '팀을 찾을 수 없어요' };
    if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
    if (!Number.isSafeInteger(price) || price < 0)
        return { status: 400, message: '입찰가는 0 이상의 정수여야 해요' };
    if (price > remainingPoints(state, teamId))
        return { status: 409, message: '남은 포인트보다 높게 낙찰할 수 없어요' };
    state.lots.push({
        id: `lot${++state.seq}`,
        participantId: state.open,
        result: 'sold',
        teamId,
        price,
        voided: false
    });
    state.lastAction = {
        kind: 'award',
        participantId: state.lots.at(-1)!.participantId,
        lotId: state.lots.at(-1)!.id
    };
    state.open = null;
    completeIfFull(scrim, state);
    return null;
}

export async function passMockLot(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state } = target;
    if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
    state.lots.push({
        id: `lot${++state.seq}`,
        participantId: state.open,
        result: 'unsold',
        teamId: null,
        price: null,
        voided: false
    });
    state.lastAction = {
        kind: 'pass',
        participantId: state.lots.at(-1)!.participantId,
        lotId: state.lots.at(-1)!.id
    };
    state.unsold.push(state.open);
    state.open = null;
    return null;
}

export async function assignMockCandidate(
    guildId: string,
    scrimId: string,
    participantId: string,
    teamId: string
) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state, scrim } = target;
    const queuedIndex = state.queue.indexOf(participantId);
    const source = queuedIndex >= 0 ? 'queue' : 'unsold';
    const index = source === 'queue' ? queuedIndex : state.unsold.indexOf(participantId);
    if (index < 0) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
    if (source === 'unsold' && state.open)
        return { status: 409, message: '진행 중인 후보를 먼저 처리해 주세요' };
    if (!state.teams.some((team) => team.id === teamId))
        return { status: 404, message: '팀을 찾을 수 없어요' };
    if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
    state.lots.push({
        id: `lot${++state.seq}`,
        participantId,
        result: 'manual',
        teamId,
        price: null,
        voided: false
    });
    state.lastAction = {
        kind: 'assign_candidate',
        source,
        index,
        participantId,
        lotId: state.lots.at(-1)!.id
    };
    state[source].splice(index, 1);
    completeIfFull(scrim, state);
    return null;
}

export async function restoreMockUnsold(guildId: string, scrimId: string, participantId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state } = target;
    if (state.open) return { status: 409, message: '진행 중인 후보를 먼저 처리해 주세요' };
    if (!state.unsold.includes(participantId)) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
    state.unsold = state.unsold.filter((id) => id !== participantId);
    state.open = participantId;
    state.lastAction = { kind: 'restore', participantId };
    return null;
}

// 직전 작업만 한 번 되돌린다. 새 작업을 해야 다시 되돌릴 수 있다.
export async function revertMockLot(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state } = target;
    const action = state.lastAction;
    if (!action) return { status: 409, message: '되돌릴 작업이 없어요' };
    if (action.kind === 'draw' || action.kind === 'restore') {
        if (state.open !== action.participantId) return { status: 409, message: '현재 후보가 바뀌었어요' };
        state.open = null;
        if (action.kind === 'draw') state.queue.unshift(action.participantId);
        else state.unsold.push(action.participantId);
    } else {
        const lot = state.lots.find((entry) => entry.id === action.lotId && !entry.voided);
        if (!lot || (state.open && !(action.kind === 'assign_candidate' && action.source === 'queue')))
            return { status: 409, message: '마지막 작업 상태가 바뀌었어요' };
        lot.voided = true;
        if (action.kind === 'assign_candidate')
            state[action.source].splice(action.index, 0, action.participantId);
        else {
            state.unsold = state.unsold.filter((id) => id !== action.participantId);
            state.open = action.participantId;
        }
    }
    state.lastAction = null;
    return null;
}

export async function resetMockAuction(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state, scrim } = target;
    for (const lot of state.lots) lot.voided = true;
    state.queue = newAuctionQueue(scrim, state);
    state.open = null;
    state.unsold = [];
    state.lastAction = null;
    return null;
}

// 진행 중인 경매를 준비로 되돌린다. 기록은 무효로 보존하고 지금 설정은 고치기 쉽게 남긴다.
export async function reopenMockAuctionSetup(guildId: string, scrimId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state } = target;
    for (const lot of state.lots) lot.voided = true;
    Object.assign(state, { status: 'setup', queue: [], open: null, unsold: [], lastAction: null });
    return null;
}

// 현재 후보를 가격 없이 팀에 넣는다. 팀 카드로 끌어 놓을 때 쓴다.
export async function assignMockCurrent(guildId: string, scrimId: string, teamId: string) {
    await wait();
    const target = auctionTarget(guildId, scrimId, 'in_progress');
    if ('status' in target) return target;
    const { state, scrim } = target;
    if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
    if (!state.teams.some((team) => team.id === teamId))
        return { status: 404, message: '팀을 찾을 수 없어요' };
    if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
    state.lots.push({
        id: `lot${++state.seq}`,
        participantId: state.open,
        result: 'manual',
        teamId,
        price: null,
        voided: false
    });
    state.lastAction = {
        kind: 'assign_current',
        participantId: state.lots.at(-1)!.participantId,
        lotId: state.lots.at(-1)!.id
    };
    state.open = null;
    completeIfFull(scrim, state);
    return null;
}

// ─── 단계 되돌리기 ───────────────────────────────────────────

// 모집을 다시 열 때 편성·경매 기록을 지운다. 다시 마감하면 처음부터 편성한다.
export function dropMockFormation(scrimId: string) {
    manualStates.delete(scrimId);
    auctionStates.delete(scrimId);
}

// 확정한 팀 편성을 다시 고칠 수 있게 연다. 수동 편성은 확정만 풀고, 끝난 경매는 진행 중으로 돌려 마지막 기록부터 되돌릴 수 있게 한다.
// 상태를 바꾸기 전에 불러야 지금까지의 배정이 그대로 남는다.
export function reopenMockFormation(scrim: MockScrim) {
    if (scrim.formationMethod === 'manual') manualState(scrim).confirmed = false;
    if (scrim.formationMethod === 'auction') {
        const state = auctionState(scrim);
        if (state.status === 'completed') state.status = 'in_progress';
    }
}
