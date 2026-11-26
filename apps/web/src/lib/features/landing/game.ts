import { POSITIONS } from '#lib/features/labels.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';
import type { GameDetail, GamePlayer, MatchOperationContext } from '#lib/features/matches/types.ts';
import type { RoflPreview } from '#lib/features/matches/rofl-preview.ts';

// 소개 화면 체험의 샘플 세트. 서버가 실제 Data Dragon 이름·아이콘으로 만든 기록 틀에
// 방문자가 경매로 꾸린 팀과 고른 블루 팀을 브라우저에서 채운다.

/** 진영별 기록 순서(탑→서폿)대로 둔 출전자 기록이다. 이름·키는 비어 있다. */
export type DemoGameTemplate = {
    durationSec: number;
    patch: string;
    blueWin: boolean;
    sides: Record<'blue' | 'red', Omit<GamePlayer, 'key' | 'userId' | 'displayName' | 'riotId'>[]>;
};

export type DemoLineupTeam = {
    slot: 'a' | 'b';
    name: string;
    // 포지션 순서(탑→서폿)의 출전자.
    players: { participantId: string; displayName: string; position: LolPosition }[];
};

const LANES = POSITIONS.map((position) => position.key);

/** 선호 포지션 순서대로 겹치지 않게 다섯 자리를 정한다. 남은 사람은 빈 자리에 차례로 둔다. */
export function assignLanes<T extends { positions: LolPosition[] }>(members: T[]) {
    const lanes = new Map<LolPosition, T>();
    const rest: T[] = [];
    for (const member of members) {
        const lane = member.positions.find((position) => !lanes.has(position));
        if (lane) lanes.set(lane, member);
        else rest.push(member);
    }
    for (const lane of LANES) if (!lanes.has(lane) && rest.length) lanes.set(lane, rest.shift()!);
    return LANES.flatMap((lane) => {
        const member = lanes.get(lane);
        return member ? [{ lane, member }] : [];
    });
}

function sideTeams(teams: [DemoLineupTeam, DemoLineupTeam], blueSlot: 'a' | 'b') {
    const blue = teams.find((team) => team.slot === blueSlot)!;
    const red = teams.find((team) => team.slot !== blueSlot)!;
    return { blue, red };
}

/** ROFL 업로드 미리보기. 실제 화면과 같이 출전자·포지션·챔피언·K/D/A를 보여 준다. */
export function demoPreview(
    template: DemoGameTemplate,
    teams: [DemoLineupTeam, DemoLineupTeam],
    blueSlot: 'a' | 'b'
): RoflPreview {
    const sides = sideTeams(teams, blueSlot);
    return {
        order: 1,
        blueTeamSlot: blueSlot,
        winner: template.blueWin ? 'blue' : 'red',
        players: (['blue', 'red'] as const).flatMap((side) =>
            template.sides[side].map((record, index) => {
                const player = sides[side].players[index]!;
                return {
                    side,
                    displayName: player.displayName,
                    riotId: `${player.displayName}#KR1`,
                    position: player.position,
                    champion: record.champion.name,
                    kills: record.kills,
                    deaths: record.deaths,
                    assists: record.assists,
                    newConnection: true
                };
            })
        ),
        digest: 'demo'
    };
}

/** 기록된 세트 상세와 확정 라인업. 경기 화면의 결과 표 컴포넌트에 그대로 넘긴다. */
export function demoGame(
    template: DemoGameTemplate,
    teams: [DemoLineupTeam, DemoLineupTeam],
    blueSlot: 'a' | 'b'
): { game: GameDetail; lineup: MatchOperationContext['lineup'] } {
    const sides = sideTeams(teams, blueSlot);
    const game: GameDetail = {
        id: 'demo-game',
        order: 1,
        durationSec: template.durationSec,
        playedAt: null,
        patch: template.patch,
        mmrStatus: 'applied',
        splashUrl: null,
        sides: (['blue', 'red'] as const).map((side) => ({
            side,
            slot: sides[side].slot,
            teamName: sides[side].name,
            win: (side === 'blue') === template.blueWin,
            players: template.sides[side].map((record, index) => {
                const player = sides[side].players[index]!;
                return {
                    ...record,
                    key: player.participantId,
                    userId: null,
                    displayName: player.displayName,
                    riotId: `${player.displayName}#KR1`
                };
            })
        }))
    };
    return {
        game,
        lineup: {
            id: 'demo-lineup',
            status: 'confirmed',
            players: teams.flatMap((team) =>
                team.players.map(({ participantId, position }) => ({ participantId, position }))
            )
        }
    };
}
