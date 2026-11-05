import type { LolPosition } from '#lib/features/guild/types.ts';
import type { MatchStatus } from '#lib/features/matches/types.ts';

export type BestOf = 1 | 3 | 5;
export const BEST_OF: readonly BestOf[] = [1, 3, 5];
export const bestOfLabel = (bestOf: BestOf) =>
    bestOf === 1 ? '단판' : `${bestOf}전 ${Math.ceil(bestOf / 2)}선승`;
export const isBestOf = (value: number): value is BestOf => value === 1 || value === 3 || value === 5;

export type BracketStage = 'semi' | 'final';
export const STAGE_LABEL: Record<BracketStage, string> = { semi: '준결승', final: '결승' };

export type BracketTeam = {
    id: string;
    name: string;
    members: { id: string; displayName: string; iconUrl: string | null; position: LolPosition | null }[];
};

/**
 * 경기 한쪽 자리. 운영자가 팀을 놓는 자리(seat)이거나 앞 경기의 승자(from)가 올라오는 자리다.
 * teamId는 놓인 팀 또는 앞 경기 승자로 정해진 팀이며, 아직 없으면 null이다.
 */
export type BracketSide = { seat: string | null; from: string | null; teamId: string | null };

export type BracketMatch = {
    key: string;
    label: string;
    stage: BracketStage;
    a: BracketSide;
    b: BracketSide;
    scoreA: number;
    scoreB: number;
    status: MatchStatus;
    winner: 'a' | 'b' | null;
    // 실제 경기가 만들어진 뒤에만 경기 상세로 연결한다.
    matchId: string | null;
};

export type BracketView = {
    teams: BracketTeam[];
    matches: BracketMatch[];
    bestOf: Partial<Record<BracketStage, BestOf>>;
    confirmed: boolean;
    can: { edit: boolean; unlock: boolean };
};

/** 팀을 놓을 수 있는 자리 목록. 결승 직행처럼 앞 경기 없이 바로 결승에 놓는 자리도 포함한다. */
export function bracketSeats(
    matches: BracketMatch[]
): { key: string; label: string; teamId: string | null }[] {
    const direct = matches.length === 2;
    return matches.flatMap((match) =>
        (['a', 'b'] as const).flatMap((side) => {
            const { seat, teamId } = match[side];
            if (!seat) return [];
            const label =
                direct && match.stage === 'final'
                    ? '결승 직행'
                    : `${match.label} ${side === 'a' ? '왼쪽' : '오른쪽'}`;
            return [{ key: seat, label, teamId }];
        })
    );
}

const side = (seat: string | null, from: string | null = null): BracketSide => ({ seat, from, teamId: null });
const match = (
    key: string,
    label: string,
    stage: BracketStage,
    a: BracketSide,
    b: BracketSide
): BracketMatch => ({
    key,
    label,
    stage,
    a,
    b,
    scoreA: 0,
    scoreB: 0,
    status: 'pending',
    winner: null,
    matchId: null
});

/**
 * 팀 수에 맞는 빈 대진 틀. 2팀은 결승, 3팀은 준결승 + 결승 직행, 4팀은 준결승 두 경기 + 결승이다.
 * 결승 직행은 운영자가 정하는 시드이며 자동 승리·점수를 기록하지 않는다.
 */
export function bracketTemplate(teamCount: number): BracketMatch[] {
    if (teamCount === 2) return [match('final', '결승', 'final', side('final-a'), side('final-b'))];
    if (teamCount === 3) {
        return [
            match('semi', '준결승', 'semi', side('semi-a'), side('semi-b')),
            match('final', '결승', 'final', side(null, 'semi'), side('final-b'))
        ];
    }
    if (teamCount === 4) {
        return [
            match('semi-1', '준결승 A', 'semi', side('semi-1-a'), side('semi-1-b')),
            match('semi-2', '준결승 B', 'semi', side('semi-2-a'), side('semi-2-b')),
            match('final', '결승', 'final', side(null, 'semi-1'), side(null, 'semi-2'))
        ];
    }
    return [];
}

/** 앞 경기 승자가 정해지면 다음 경기의 승자 자리에 채운다. 경기 순서가 앞에서 뒤로 정렬되어 있어야 한다. */
export function resolveWinners(matches: BracketMatch[]): BracketMatch[] {
    const winnerOf = new Map<string, string | null>();
    return matches.map((item) => {
        const fill = (value: BracketSide): BracketSide =>
            value.from ? { ...value, teamId: winnerOf.get(value.from) ?? null } : value;
        const next = { ...item, a: fill(item.a), b: fill(item.b) };
        winnerOf.set(next.key, next.status === 'completed' && next.winner ? next[next.winner].teamId : null);
        return next;
    });
}
