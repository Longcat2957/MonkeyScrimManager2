import type { GamePlayer, GameSide } from '#lib/features/matches/types.ts';
import { LANES, slotKey, type Assignments, type FormationPlayer } from '#lib/features/scrims/formation.ts';

export const landingTeams = [
    { id: 'poro', name: '포로팀' },
    { id: 'raptor', name: '칼날부리팀' }
];
// 이름·포지션 MMR·챔피언·킬·데스·도움·CS·피해·골드·시야. 각 팀에서 탑부터 서폿 순이다.
const records = [
    ['바위게', 1550, '오른', 3, 3, 6, 204, 13500, 12400, 21],
    ['강가수달', 1516, '바이', 8, 2, 7, 167, 18200, 13630, 42],
    ['달빛포로', 1490, '아리', 6, 4, 8, 235, 22400, 14320, 20],
    ['은빛화살', 1570, '애쉬', 7, 3, 6, 249, 25700, 15760, 25],
    ['별가루', 1525, '브라움', 1, 2, 11, 32, 8700, 9520, 72],
    ['돌거북', 1530, '나르', 2, 5, 3, 191, 15210, 10910, 19],
    ['솔방울', 1580, '신 짜오', 4, 6, 6, 153, 16200, 12134, 32],
    ['파란부적', 1510, '오리아나', 3, 5, 5, 221, 21670, 11921, 24],
    ['새벽활', 1485, '징크스', 5, 4, 3, 231, 22490, 13220, 16],
    ['등불지기', 1545, '룰루', 0, 5, 9, 24, 5432, 8120, 61]
] as const;
export const landingPlayers: FormationPlayer[] = records.map(([name, mmr], index) => {
    const position = LANES[index % LANES.length]!;
    return {
        participantId: `sample-${index}`,
        userId: null,
        iconUrl: null,
        displayName: name,
        positions: [position],
        mmr: { top: null, jungle: null, mid: null, bot: null, support: null, [position]: mmr }
    };
});
export const visitor = landingPlayers[1]!;
export const initialAssignments: Assignments = Object.fromEntries(
    landingPlayers.flatMap((player, index) =>
        player === visitor || index === 6
            ? []
            : [[player.participantId, slotKey(landingTeams[Math.floor(index / 5)]!.id, player.positions[0]!)]]
    )
);

// 이전 경기의 고정 표본이다. 이번 체험의 참가·편성이 과거 경기 기록을 바꾸지 않는다.
export const sampleSides: GameSide[] = landingTeams.map((team, side) => ({
    side: side === 0 ? 'blue' : 'red',
    slot: side === 0 ? 'a' : 'b',
    teamName: team.name,
    win: side === 0,
    players: landingPlayers.slice(side * 5, side * 5 + 5).map((player, lane): GamePlayer => {
        const [, , champion, kills, deaths, assists, cs, damage, gold, visionScore] =
            records[side * 5 + lane]!;
        return {
            key: player.participantId,
            displayName: player.displayName,
            userId: null,
            riotId: null,
            champion: { id: champion, name: champion, iconUrl: null },
            level: null,
            kills,
            deaths,
            assists,
            cs,
            damage,
            gold,
            damageTaken: null,
            visionScore,
            wardsPlaced: null,
            wardsKilled: null,
            controlWards: null,
            heal: null,
            shield: null,
            largestKillingSpree: null,
            multiKills: { double: null, triple: null, quadra: null, penta: null },
            items: [],
            spells: [],
            keystone: null,
            secondaryStyle: null,
            score: null,
            badge: null,
            titles: [],
            fearlessViolation: false
        };
    })
}));
export const sampleLineup = {
    id: 'sample-lineup',
    status: 'confirmed' as const,
    players: landingPlayers.map(({ participantId, positions }) => ({
        participantId,
        position: positions[0]!
    }))
};
