import type { LolPosition } from '#lib/features/guild/types.ts';
import type { ChampionRef, PlayerGame } from '#lib/features/players/types.ts';
import { CHAMPIONS, mockPlayers, type MockPlayer } from './ranking.ts';

// 순위 목 데이터의 사용자별 포지션 기록(게임 수·승수·주 챔피언)에 맞춰 게임 기록을 만든다.
// 사용자마다 고정 시드를 써서 새로고침해도 같은 기록이 나온다.

const MATCHES = [
    { matchId: 'devMatch002', scrimTitle: '10월 3주차 정기 내전' },
    { matchId: 'devMatch003', scrimTitle: '10월 3주차 정기 내전' },
    { matchId: 'devMatch004', scrimTitle: '10월 2주차 정기 내전' }
];
// 포지션별 분당 CS·피해량·받은 피해량·골드와 게임당 시야 기준값.
const BASE: Record<LolPosition, { cs: number; damage: number; taken: number; gold: number; vision: number }> =
    {
        top: { cs: 7.2, damage: 780, taken: 1150, gold: 410, vision: 22 },
        jungle: { cs: 5.6, damage: 620, taken: 1250, gold: 390, vision: 34 },
        mid: { cs: 7.8, damage: 900, taken: 760, gold: 420, vision: 24 },
        bot: { cs: 8.4, damage: 960, taken: 640, gold: 440, vision: 20 },
        support: { cs: 1.3, damage: 380, taken: 700, gold: 260, vision: 72 }
    };
const MAX_GAMES_PER_POSITION = 30;

function seeded(text: string) {
    let seed = [...text].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 2147483647, 7) || 7;
    return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function buildGames(player: MockPlayer, champion: (id: string) => ChampionRef): PlayerGame[] {
    const random = seeded(player.userId);
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
    const others = mockPlayers.filter((other) => other.userId !== player.userId);
    const rows: Omit<PlayerGame, 'playedAt' | 'gameId' | 'matchId' | 'scrimTitle'>[] = [];
    for (const [position, record] of Object.entries(player.records) as [
        LolPosition,
        NonNullable<MockPlayer['records'][LolPosition]>
    ][]) {
        const games = Math.min(record.games, MAX_GAMES_PER_POSITION);
        const wins = Math.round((record.wins / record.games) * games);
        const pool = [record.championId, ...CHAMPIONS[position]];
        for (let index = 0; index < games; index++) {
            const win = index < wins;
            const durationSec = 1320 + Math.floor(random() * 960);
            const minutes = durationSec / 60;
            const base = BASE[position];
            const teamKills = 12 + Math.floor(random() * 25);
            const kills = Math.floor(random() * (position === 'support' ? 4 : 11)) + (win ? 1 : 0);
            const assists = Math.floor(random() * (position === 'support' ? 18 : 10)) + (win ? 3 : 0);
            rows.push({
                win,
                champion: champion(random() < 0.45 ? record.championId : pick(pool)),
                position,
                kills: Math.min(kills, teamKills),
                deaths: Math.floor(random() * 8) + (win ? 0 : 2),
                assists: Math.min(assists, teamKills),
                cs: Math.round(base.cs * minutes * (0.8 + random() * 0.4)),
                damage: Math.round(base.damage * minutes * (0.7 + random() * 0.6)),
                damageTaken: Math.round(base.taken * minutes * (0.7 + random() * 0.6)),
                gold: Math.round(base.gold * minutes * (0.85 + random() * 0.3) + (win ? 1500 : 0)),
                visionScore: Math.round(base.vision * (0.7 + random() * 0.6)),
                teamKills,
                durationSec,
                // 같은 팀 네 명. 앞쪽 몇 명과 자주 함께하도록 고정 인원에서 더 자주 뽑는다.
                teammates: Array.from({ length: 4 }, () =>
                    pick(random() < 0.6 ? others.slice(0, 11) : others)
                ).map(({ userId, displayName }) => ({ userId, displayName }))
            });
        }
    }
    // 승패가 몰리지 않게 섞은 뒤 최근 게임부터 날짜를 붙인다.
    for (let index = rows.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [rows[index], rows[swap]] = [rows[swap]!, rows[index]!];
    }
    return rows.map((row, index) => {
        const match = MATCHES[index % MATCHES.length]!;
        return {
            ...row,
            ...match,
            gameId: `${match.matchId}-g1`,
            playedAt: new Date(Date.UTC(2026, 9, 24, 12) - index * 2.5 * 86_400_000).toISOString()
        };
    });
}

export function findMockPlayer(guildId: string, userId: string) {
    if (guildId !== 'devGuild001') return null;
    return mockPlayers.find((player) => player.userId === userId) ?? null;
}

/** 사용자의 전체 게임 기록(최근 순). 챔피언 이름·아이콘은 서버가 넘겨준 함수로 채운다. */
export function listMockPlayerGames(player: MockPlayer, champion: (id: string) => ChampionRef): PlayerGame[] {
    return buildGames(player, champion);
}

/** 서버 전체 사용자의 게임 기록. 얼굴은 가장 많이 뛴 포지션의 주 챔피언이다. */
export function listMockGuildPlayers(champion: (id: string) => ChampionRef) {
    return mockPlayers.map((player) => {
        const main = Object.values(player.records).sort((a, b) => b.games - a.games)[0];
        return {
            userId: player.userId,
            displayName: player.displayName,
            championId: main?.championId ?? null,
            iconUrl: main ? champion(main.championId).iconUrl : null,
            games: buildGames(player, champion)
        };
    });
}
