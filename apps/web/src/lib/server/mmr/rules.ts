import type { LolPosition } from '../../features/guild/types.ts';
import { DomainError } from '../errors.ts';

export const INITIAL_MMR = 1500;
export const K_FACTOR = 32;
export const MMR_POSITIONS: readonly LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

export type MmrPlayer = { userId: string; position: LolPosition; side: 'blue' | 'red'; mmr: number };
export type MmrChange = MmrPlayer & {
    opponentUserId: string;
    beforeMmr: number;
    afterMmr: number;
    delta: number;
};

/** MSM1과 동일하게 반영 전 동포지션 점수로 계산하고 소수를 반올림하지 않는다. */
export function calculateElo(mmr: number, opponentMmr: number, won: boolean) {
    if (!Number.isFinite(mmr) || !Number.isFinite(opponentMmr) || typeof won !== 'boolean') {
        throw new DomainError('INVALID_INPUT', 'MMR 계산 근거를 확인해 주세요');
    }
    const expected = 1 / (1 + 10 ** ((opponentMmr - mmr) / 400));
    const delta = K_FACTOR * (Number(won) - expected);
    return { beforeMmr: mmr, afterMmr: mmr + delta, delta };
}

/** 양 팀의 확정된 다섯 포지션을 모두 확인한 뒤 각 상대 쌍에 같은 계산을 적용한다. */
export function calculateGameMmr(players: readonly MmrPlayer[], winnerSide: 'blue' | 'red'): MmrChange[] {
    if (
        players.length !== 10 ||
        new Set(players.map((player) => player.userId)).size !== 10 ||
        !['blue', 'red'].includes(winnerSide) ||
        players.some((player) => !player.userId || !Number.isFinite(player.mmr))
    ) {
        throw new DomainError('CONFLICT', '출전자 열 명과 경기 결과를 확인해야 MMR을 반영할 수 있어요');
    }
    const changes: MmrChange[] = [];
    for (const position of MMR_POSITIONS) {
        const pair = (['blue', 'red'] as const).map((side) =>
            players.filter((player) => player.position === position && player.side === side)
        );
        if (pair.some((members) => members.length !== 1))
            throw new DomainError('CONFLICT', '양 팀의 모든 포지션이 확정되어야 해요');
        for (const [player, opponent] of [
            [pair[0][0]!, pair[1][0]!],
            [pair[1][0]!, pair[0][0]!]
        ]) {
            changes.push({
                ...player!,
                opponentUserId: opponent!.userId,
                ...calculateElo(player!.mmr, opponent!.mmr, player!.side === winnerSide)
            });
        }
    }
    return changes;
}
