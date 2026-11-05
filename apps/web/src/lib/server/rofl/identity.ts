import type { LolPosition } from '../../features/guild/types.ts';
import { RoflError } from './format.ts';
import { readRoflMetadata } from './parser.ts';

const TEAM_POSITIONS: Readonly<Record<string, LolPosition>> = {
    TOP: 'top',
    JUNGLE: 'jungle',
    MIDDLE: 'mid',
    BOTTOM: 'bot',
    UTILITY: 'support'
};

export type RoflIdentity = {
    participantIndex: number;
    replayTeamId: number;
    position: LolPosition | null;
};

/** ROFL이 명시한 팀·포지션만 읽는다. 배열 순서·챔피언·PLAYER_ROLE로 빈 포지션을 추정하지 않는다. */
export function readRoflIdentity(bytes: Uint8Array): RoflIdentity[] {
    const raw = readRoflMetadata(bytes);
    if (raw.playerStats.length !== 10) {
        throw new RoflError('INVALID_METADATA', '출전자 열 명의 ROFL이 필요해요');
    }
    const positions = new Set<string>();
    const teams = new Map<number, number>();
    const result = raw.playerStats.map((row, participantIndex): RoflIdentity => {
        const team = row.TEAM;
        if (
            (typeof team !== 'number' && (typeof team !== 'string' || !/^\d+$/.test(team))) ||
            !Number.isSafeInteger(Number(team)) ||
            Number(team) <= 0
        ) {
            throw new RoflError('INVALID_METADATA', 'ROFL 참가자의 팀을 확인할 수 없어요');
        }
        const replayTeamId = Number(team);
        teams.set(replayTeamId, (teams.get(replayTeamId) ?? 0) + 1);
        const field = row.TEAM_POSITION;
        let position: LolPosition | null = null;
        if (field !== undefined && field !== null && field !== '' && field !== 'NONE') {
            if (typeof field !== 'string' || !Object.hasOwn(TEAM_POSITIONS, field)) {
                throw new RoflError('INVALID_METADATA', 'ROFL 참가자의 포지션을 확인할 수 없어요');
            }
            position = TEAM_POSITIONS[field]!;
            const key = `${replayTeamId}:${position}`;
            if (positions.has(key)) {
                throw new RoflError('INVALID_METADATA', 'ROFL의 같은 팀에 중복된 포지션이 있어요');
            }
            positions.add(key);
        }
        return { participantIndex, replayTeamId, position };
    });
    if (teams.size !== 2 || [...teams.values()].some((count) => count !== 5)) {
        throw new RoflError('INVALID_METADATA', 'ROFL 양 팀이 각각 다섯 명이어야 해요');
    }
    return result;
}
