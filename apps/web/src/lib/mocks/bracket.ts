import {
    bracketPlacement,
    bracketSeats,
    bracketTemplate,
    firstSetSideError,
    isBestOf,
    resolveWinners,
    type BestOf,
    type BracketMatch,
    type BracketStage,
    type BracketTeam,
    type BracketView
} from '#lib/features/scrims/bracket.ts';
import { parseSlot } from '#lib/features/scrims/formation.ts';
import { mockLatency } from './latency.ts';
import { bumpMockRevision, findMockScrimRecord, type MockFailure, type MockScrim } from './scrims.ts';
import { cancelMockMatchResults, createMockMatch, setMockMatchStatus } from './matches.ts';
import { getMockAuction, getMockManualFormation } from './teams.ts';

type BracketState = {
    matches: BracketMatch[];
    bestOf: Partial<Record<BracketStage, BestOf>>;
    confirmed: boolean;
    interrupted?: { key: string; status: BracketMatch['status']; winner: BracketMatch['winner'] }[];
};

// 개발 서버가 살아 있는 동안만 보관한다.
const states = new Map<string, BracketState>();
const cancelledStates = new Map<string, BracketState[]>();

// 이미 진행·종료된 조회용 내전의 경기 결과. 자리 순서대로 팀을 놓은 뒤 적용한다.
const RESULTS: Record<string, Record<string, Partial<BracketMatch>>> = {
    devScrim004: { final: { scoreA: 1, scoreB: 1, status: 'in_progress', matchId: 'devMatch001' } },
    devScrim005: {
        'semi-1': { scoreA: 2, scoreB: 0, status: 'completed', winner: 'a', matchId: 'devMatch002' },
        'semi-2': { scoreA: 1, scoreB: 2, status: 'completed', winner: 'b', matchId: 'devMatch003' },
        final: { scoreA: 3, scoreB: 2, status: 'completed', winner: 'a' }
    }
};

const teamsConfirmed = (scrim: MockScrim) =>
    scrim.formationMethod !== null &&
    !(scrim.status === 'ended_early' && scrim.endedEarlyFromStatus === 'preparing') &&
    ['ready', 'in_progress', 'completed', 'ended_early'].includes(scrim.status);

async function scrimTeams(scrim: MockScrim): Promise<BracketTeam[]> {
    if (scrim.formationMethod === 'auction') {
        const auction = await getMockAuction(scrim.guildId, scrim.id);
        // 경매 팀은 포지션을 정하지 않으므로 희망 포지션을 배정 결과처럼 보여 주지 않는다.
        return (auction?.teams ?? []).map((team) => ({
            id: team.id,
            name: team.name,
            members: team.members.map(({ player }) => ({
                id: player.participantId,
                displayName: player.displayName,
                iconUrl: player.iconUrl,
                position: null
            }))
        }));
    }
    const formation = await getMockManualFormation(scrim.guildId, scrim.id);
    if (!formation) return [];
    return formation.teams.map((team) => ({
        id: team.id,
        name: team.name,
        members: formation.players.flatMap((player) => {
            const slot = formation.assignments[player.participantId];
            const parsed = slot ? parseSlot(slot) : null;
            return parsed?.teamId === team.id
                ? [
                      {
                          id: player.participantId,
                          displayName: player.displayName,
                          iconUrl: player.iconUrl,
                          position: parsed.lane
                      }
                  ]
                : [];
        })
    }));
}

function initialState(scrim: MockScrim, teams: BracketTeam[]): BracketState {
    const matches = bracketTemplate(teams.length);
    const bestOf = teams.length === 2 ? { final: 3 as const } : { semi: 3 as const, final: 5 as const };
    const state: BracketState = { matches, bestOf, confirmed: scrim.status !== 'ready' };
    if (scrim.status === 'ready' || cancelledStates.has(`${scrim.guildId}/${scrim.id}`)) return state;
    // 진행·종료된 내전은 자리 순서대로 팀을 놓고 기록된 결과를 붙인다.
    bracketSeats(matches).forEach((seat, index) => placeTeam(state, seat.key, teams[index]?.id ?? null));
    for (const item of matches) Object.assign(item, RESULTS[scrim.id]?.[item.key]);
    return state;
}

async function load(guildId: string, scrimId: string) {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return null;
    const teams = teamsConfirmed(scrim) ? await scrimTeams(scrim) : [];
    const key = `${guildId}/${scrimId}`;
    let state = states.get(key);
    if (!state && teams.length) {
        state = initialState(scrim, teams);
        states.set(key, state);
    }
    return { scrim, teams, state: state ?? null };
}

function placeTeam(
    state: BracketState,
    seat: string,
    teamId: string | null,
    swapTeamId: string | null = null
) {
    for (const item of state.matches) {
        for (const side of [item.a, item.b]) {
            // 같은 경기의 진영을 바꿀 때만 원래 자리에 상대 팀이 남는다.
            if (side.seat === seat) side.teamId = teamId;
            else if (teamId && side.seat && side.teamId === teamId) side.teamId = swapTeamId;
        }
    }
}

/** 대진 화면 데이터. 팀 편성이 끝나지 않았으면 null이다. */
export async function getMockBracket(guildId: string, scrimId: string): Promise<BracketView | null> {
    const target = await load(guildId, scrimId);
    if (!target?.state) return null;
    const { scrim, teams, state } = target;
    const manage = scrim.canManage && scrim.status === 'ready';
    return {
        teams,
        matches: resolveWinners(structuredClone(state.matches)),
        bestOf: { ...state.bestOf },
        confirmed: state.confirmed,
        can: { edit: manage && !state.confirmed, unlock: manage && state.confirmed }
    };
}

async function mutate(
    guildId: string,
    scrimId: string,
    update: (state: BracketState, teams: BracketTeam[], scrim: MockScrim) => MockFailure | null,
    locked: boolean | 'either' = false
) {
    await mockLatency.wait(200);
    const target = await load(guildId, scrimId);
    if (!target) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!target.scrim.canManage) return { status: 403, message: '대진을 바꿀 권한이 없어요' };
    if (!target.state) return { status: 409, message: '팀 편성이 끝나면 대진을 만들 수 있어요' };
    if (target.scrim.status !== 'ready')
        return { status: 409, message: '경기가 시작된 대진은 바꿀 수 없어요' };
    if (locked !== 'either' && target.state.confirmed !== locked)
        return {
            status: 409,
            message: locked
                ? '아직 확정하지 않은 대진이에요'
                : '확정된 대진이에요. 다시 편성한 뒤 바꿔 주세요'
        };
    const failure = update(target.state, target.teams, target.scrim);
    if (!failure) bumpMockRevision(target.scrim);
    return failure;
}

export function placeMockBracketTeam(guildId: string, scrimId: string, seat: string, teamId: string | null) {
    return mutate(
        guildId,
        scrimId,
        (state, teams, scrim) => {
            const placement = bracketPlacement(
                state.matches,
                seat,
                teamId,
                scrim.formationMethod === 'auction'
            );
            if (state.confirmed && !placement?.swapTeamId)
                return { status: 409, message: '대진 확정을 해제한 뒤 배치를 변경해 주세요' };
            if (!placement) return { status: 400, message: '알 수 없는 자리예요' };
            if (teamId && !teams.some((team) => team.id === teamId))
                return { status: 400, message: '이 내전의 팀이 아니에요' };
            placeTeam(state, seat, teamId, placement.swapTeamId);
            return null;
        },
        'either'
    );
}

export function setMockBracketBestOf(guildId: string, scrimId: string, stage: string, bestOf: number) {
    return mutate(guildId, scrimId, (state) => {
        if (!(stage in state.bestOf) || !isBestOf(bestOf))
            return { status: 400, message: '경기 방식을 다시 골라 주세요' };
        state.bestOf[stage as BracketStage] = bestOf;
        return null;
    });
}

export function resetMockBracket(guildId: string, scrimId: string) {
    return mutate(guildId, scrimId, (state) => {
        for (const seat of bracketSeats(state.matches)) placeTeam(state, seat.key, null);
        return null;
    });
}

export function confirmMockBracket(guildId: string, scrimId: string, blueTeamIds?: Record<string, string>) {
    return mutate(guildId, scrimId, (state, teams, scrim) => {
        if (bracketSeats(state.matches).some((seat) => !seat.teamId))
            return { status: 409, message: '모든 팀을 자리에 배치해 주세요' };
        if (blueTeamIds) return startBracket(state, teams, scrim, blueTeamIds);
        state.confirmed = true;
        return null;
    });
}

export function unlockMockBracket(guildId: string, scrimId: string) {
    return mutate(
        guildId,
        scrimId,
        (state) => {
            state.confirmed = false;
            return null;
        },
        true
    );
}

// ─── 내전 단계와 함께 바뀌는 대진 ─────────────────────────────

// 팀 편성을 다시 하면 팀이 달라질 수 있으므로 대진을 지운다. 다시 확정하면 빈 틀부터 시작한다.
export function dropMockBracket(guildId: string, scrimId: string) {
    states.delete(`${guildId}/${scrimId}`);
}

function createResolvedMockMatches(
    state: BracketState,
    teams: BracketTeam[],
    scrim: MockScrim,
    blueTeamIds?: Record<string, string>
) {
    state.matches = resolveWinners(state.matches);
    for (const match of state.matches) {
        if (match.matchId || !match.a.teamId || !match.b.teamId) continue;
        match.matchId = createMockMatch({
            guildId: scrim.guildId,
            scrimId: scrim.id,
            scrimTitle: scrim.title,
            teamA: teams.find((team) => team.id === match.a.teamId)!.name,
            teamB: teams.find((team) => team.id === match.b.teamId)!.name,
            plannedBlueTeamSlot: blueTeamIds ? (blueTeamIds[match.key] === match.a.teamId ? 'a' : 'b') : null,
            bestOf: state.bestOf[match.stage]!,
            hardFearless: scrim.hardFearless,
            status: 'in_progress',
            playedAt: null
        });
        match.status = 'in_progress';
    }
}

function startBracket(
    state: BracketState,
    teams: BracketTeam[],
    scrim: MockScrim,
    blueTeamIds: Record<string, string>
) {
    const message = firstSetSideError(state.matches, blueTeamIds);
    if (message) return { status: 400, message };
    createResolvedMockMatches(state, teams, scrim, blueTeamIds);
    state.confirmed = true;
    scrim.status = 'in_progress';
    return null;
}

export function startMockBracket(guildId: string, scrimId: string, blueTeamIds: Record<string, string>) {
    return mutate(
        guildId,
        scrimId,
        (state, teams, scrim) => startBracket(state, teams, scrim, blueTeamIds),
        true
    );
}

export async function syncMockBracketResult(
    guildId: string,
    scrimId: string,
    matchId: string,
    scoreA: number,
    scoreB: number,
    status: BracketMatch['status']
) {
    const target = await load(guildId, scrimId);
    if (!target?.state || target.scrim.status !== 'in_progress') return;
    const match = target.state.matches.find((item) => item.matchId === matchId);
    if (!match) return;
    match.status = status;
    match.scoreA = scoreA;
    match.scoreB = scoreB;
    if (status === 'completed') {
        match.winner = scoreA > scoreB ? 'a' : 'b';
        createResolvedMockMatches(target.state, target.teams, target.scrim);
    }
}

export function seedMockManualFinal(scrim: MockScrim, teamIds: string[], bestOf: BestOf) {
    const matches = bracketTemplate(2);
    matches[0]!.a.teamId = teamIds[0]!;
    matches[0]!.b.teamId = teamIds[1]!;
    states.set(`${scrim.guildId}/${scrim.id}`, { matches, bestOf: { final: bestOf }, confirmed: true });
}

/** 내전 단계 판단에 쓰는 대진 요약. 대진이 없으면 null이다. */
export async function getMockBracketProgress(guildId: string, scrimId: string) {
    const target = await load(guildId, scrimId);
    if (!target?.state) return null;
    const matches = target.state.matches;
    return {
        confirmed: target.state.confirmed,
        // 게임이 하나라도 기록됐거나 진행 중인 경기가 있으면 시작된 대진이다.
        started: matches.some((item) => item.status !== 'pending' || item.scoreA + item.scoreB > 0),
        finished: matches.every((item) => item.status === 'completed'),
        recordedGames: matches.reduce((sum, item) => sum + item.scoreA + item.scoreB, 0)
    };
}

/** 과거 대진은 보관하고 다음 편성에 재사용하지 않는다. */
export async function cancelMockBracketResults(guildId: string, scrimId: string) {
    const target = await load(guildId, scrimId);
    if (!target?.state) return 0;
    const key = `${guildId}/${scrimId}`;
    const previous = cancelledStates.get(key) ?? [];
    previous.push(structuredClone(target.state));
    cancelledStates.set(key, previous);
    for (const item of target.state.matches) if (item.matchId) cancelMockMatchResults(guildId, item.matchId);
    states.delete(key);
    return target.state.matches.reduce((sum, item) => sum + item.scoreA + item.scoreB, 0);
}

/** 중도 종료의 실제 점수 우세 팀만 기록하며, 재개는 바꾼 경기의 상태·승자를 그대로 복원한다. */
export async function setMockBracketEnded(guildId: string, scrimId: string, ended: boolean) {
    const target = await load(guildId, scrimId);
    if (!target?.state) return;
    if (ended) {
        target.state.interrupted = [];
        for (const item of target.state.matches) {
            if (!['pending', 'in_progress'].includes(item.status)) continue;
            target.state.interrupted.push({ key: item.key, status: item.status, winner: item.winner });
            item.status = 'ended_early';
            item.winner = item.scoreA > item.scoreB ? 'a' : item.scoreB > item.scoreA ? 'b' : null;
            if (item.matchId) setMockMatchStatus(guildId, item.matchId, item.status);
        }
    } else {
        for (const before of target.state.interrupted ?? []) {
            const item = target.state.matches.find((match) => match.key === before.key);
            if (!item) continue;
            item.status = before.status;
            item.winner = before.winner;
            if (item.matchId) setMockMatchStatus(guildId, item.matchId, item.status);
        }
        delete target.state.interrupted;
    }
}
