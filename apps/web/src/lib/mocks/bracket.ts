import {
    bracketSeats,
    bracketTemplate,
    isBestOf,
    resolveWinners,
    type BestOf,
    type BracketMatch,
    type BracketStage,
    type BracketTeam,
    type BracketView
} from '#lib/features/scrims/bracket.ts';
import { parseSlot } from '#lib/features/scrims/formation.ts';
import { findMockScrimRecord, type IconResolver, type MockFailure, type MockScrim } from './scrims.ts';
import { setMockMatchStatus } from './matches.ts';
import { getMockAuction, getMockManualFormation } from './teams.ts';

type BracketState = {
    matches: BracketMatch[];
    bestOf: Partial<Record<BracketStage, BestOf>>;
    confirmed: boolean;
};

// 개발 서버가 살아 있는 동안만 보관한다.
const states = new Map<string, BracketState>();
const wait = () => new Promise((resolve) => setTimeout(resolve, 200));
const noIcon: IconResolver = () => null;

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
    ['ready', 'in_progress', 'completed', 'ended_early'].includes(scrim.status);

async function scrimTeams(scrim: MockScrim, icon: IconResolver): Promise<BracketTeam[]> {
    if (scrim.formationMethod === 'auction') {
        const auction = await getMockAuction(scrim.guildId, scrim.id, icon);
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
    const formation = await getMockManualFormation(scrim.guildId, scrim.id, icon);
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
    if (scrim.status === 'ready') return state;
    // 진행·종료된 내전은 자리 순서대로 팀을 놓고 기록된 결과를 붙인다.
    bracketSeats(matches).forEach((seat, index) => placeTeam(state, seat.key, teams[index]?.id ?? null));
    for (const item of matches) Object.assign(item, RESULTS[scrim.id]?.[item.key]);
    return state;
}

async function load(guildId: string, scrimId: string, icon: IconResolver) {
    const scrim = findMockScrimRecord(guildId, scrimId);
    if (!scrim) return null;
    const teams = teamsConfirmed(scrim) ? await scrimTeams(scrim, icon) : [];
    const key = `${guildId}/${scrimId}`;
    let state = states.get(key);
    if (!state && teams.length) {
        state = initialState(scrim, teams);
        states.set(key, state);
    }
    return { scrim, teams, state: state ?? null };
}

function placeTeam(state: BracketState, seat: string, teamId: string | null) {
    for (const item of state.matches) {
        for (const side of [item.a, item.b]) {
            // 옮긴 팀의 원래 자리는 비우고, 도착 자리에 있던 팀은 팀 풀로 돌아간다.
            if (side.seat === seat) side.teamId = teamId;
            else if (teamId && side.seat && side.teamId === teamId) side.teamId = null;
        }
    }
}

/** 대진 화면 데이터. 팀 편성이 끝나지 않았으면 null이다. */
export async function getMockBracket(
    guildId: string,
    scrimId: string,
    icon: IconResolver = noIcon
): Promise<BracketView | null> {
    const target = await load(guildId, scrimId, icon);
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
    update: (state: BracketState, teams: BracketTeam[]) => MockFailure | null,
    locked = false
) {
    await wait();
    const target = await load(guildId, scrimId, noIcon);
    if (!target) return { status: 404, message: '내전을 찾을 수 없어요' };
    if (!target.scrim.canManage) return { status: 403, message: '대진을 바꿀 권한이 없어요' };
    if (!target.state) return { status: 409, message: '팀 편성이 끝나면 대진을 만들 수 있어요' };
    if (target.scrim.status !== 'ready')
        return { status: 409, message: '경기가 시작된 대진은 바꿀 수 없어요' };
    if (target.state.confirmed !== locked)
        return {
            status: 409,
            message: locked
                ? '아직 확정하지 않은 대진이에요'
                : '확정된 대진이에요. 다시 편성한 뒤 바꿔 주세요'
        };
    return update(target.state, target.teams);
}

export function placeMockBracketTeam(guildId: string, scrimId: string, seat: string, teamId: string | null) {
    return mutate(guildId, scrimId, (state, teams) => {
        if (!bracketSeats(state.matches).some((item) => item.key === seat))
            return { status: 400, message: '알 수 없는 자리예요' };
        if (teamId && !teams.some((team) => team.id === teamId))
            return { status: 400, message: '이 내전의 팀이 아니에요' };
        placeTeam(state, seat, teamId);
        return null;
    });
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

export function confirmMockBracket(guildId: string, scrimId: string) {
    return mutate(guildId, scrimId, (state) => {
        if (bracketSeats(state.matches).some((seat) => !seat.teamId))
            return { status: 409, message: '모든 팀을 자리에 배치해 주세요' };
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

/** 내전 단계 판단에 쓰는 대진 요약. 대진이 없으면 null이다. */
export async function getMockBracketProgress(guildId: string, scrimId: string) {
    const target = await load(guildId, scrimId, noIcon);
    if (!target?.state) return null;
    const matches = target.state.matches;
    return {
        confirmed: target.state.confirmed,
        // 게임이 하나라도 기록됐거나 진행 중인 경기가 있으면 시작된 대진이다.
        started: matches.some((item) => item.status !== 'pending' || item.scoreA + item.scoreB > 0),
        finished: matches.every((item) => item.status === 'completed')
    };
}

/**
 * 내전을 중도 종료하면 진행 중인 경기는 지금 점수로 중도 종료, 시작하지 않은 경기는 취소한다.
 * 되돌리면 반대로 연다. 기록된 게임과 점수는 어느 쪽에서도 지우지 않는다.
 */
export async function setMockBracketEnded(guildId: string, scrimId: string, ended: boolean) {
    const target = await load(guildId, scrimId, noIcon);
    if (!target?.state) return;
    for (const item of target.state.matches) {
        const next = ended
            ? item.status === 'in_progress'
                ? 'ended_early'
                : item.status === 'pending'
                  ? 'cancelled'
                  : null
            : item.status === 'ended_early'
              ? 'in_progress'
              : item.status === 'cancelled'
                ? 'pending'
                : null;
        if (!next) continue;
        item.status = next;
        if (item.matchId) setMockMatchStatus(guildId, item.matchId, next);
    }
}
