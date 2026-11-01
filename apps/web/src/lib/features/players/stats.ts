import type { LolPosition } from '#lib/features/guild/types.ts';
import type { ChampionRecord, DuoRecord, PlayerGame, PlayerSummary } from './types.ts';

const ratio = (kills: number, deaths: number, assists: number) => (kills + assists) / Math.max(1, deaths);
const sum = (games: PlayerGame[], pick: (game: PlayerGame) => number) => games.reduce((total, game) => total + pick(game), 0);

/** 게임 목록의 요약 지표. 게임이 없으면 null이라 화면이 0 대신 빈 안내를 쓴다. */
export function summarize(games: PlayerGame[]): PlayerSummary | null {
	if (!games.length) return null;
	const minutes = sum(games, (game) => game.durationSec) / 60;
	const kills = sum(games, (game) => game.kills);
	const deaths = sum(games, (game) => game.deaths);
	const assists = sum(games, (game) => game.assists);
	const positions = new Map<LolPosition, number>();
	for (const game of games) positions.set(game.position, (positions.get(game.position) ?? 0) + 1);
	return {
		games: games.length,
		wins: games.filter((game) => game.win).length,
		kills: kills / games.length,
		deaths: deaths / games.length,
		assists: assists / games.length,
		kda: ratio(kills, deaths, assists),
		csPerMin: sum(games, (game) => game.cs) / minutes,
		damagePerMin: sum(games, (game) => game.damage) / minutes,
		visionPerGame: sum(games, (game) => game.visionScore) / games.length,
		killParticipation: (kills + assists) / Math.max(1, sum(games, (game) => game.teamKills)),
		mainPosition: [...positions].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
	};
}

/** 챔피언별 성적. 게임 수가 많은 순, 같으면 승률 순이다. */
export function championRecords(games: PlayerGame[]): ChampionRecord[] {
	const groups = new Map<string, PlayerGame[]>();
	for (const game of games) groups.set(game.champion.id, [...(groups.get(game.champion.id) ?? []), game]);
	return [...groups.values()]
		.map((list) => ({
			champion: list[0]!.champion,
			games: list.length,
			wins: list.filter((game) => game.win).length,
			kda: ratio(sum(list, (game) => game.kills), sum(list, (game) => game.deaths), sum(list, (game) => game.assists))
		}))
		.sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games);
}

/**
 * 같은 팀으로 함께한 사람별 성적. 표본이 작으면 우연이 커서 minGames 이상만 고른다.
 * best는 승률 높은 순, worst는 낮은 순으로 limit명씩이며 두 목록에 같은 사람이 겹치지 않는다.
 */
export function duoRecords(games: PlayerGame[], minGames = 3, limit = 2): { best: DuoRecord[]; worst: DuoRecord[] } {
	const records = new Map<string, DuoRecord>();
	for (const game of games) {
		for (const mate of game.teammates) {
			const record = records.get(mate.userId) ?? { ...mate, games: 0, wins: 0 };
			record.games++;
			if (game.win) record.wins++;
			records.set(mate.userId, record);
		}
	}
	const eligible = [...records.values()].filter((record) => record.games >= minGames);
	const rate = (record: DuoRecord) => record.wins / record.games;
	const best = [...eligible].sort((a, b) => rate(b) - rate(a) || b.games - a.games).slice(0, limit);
	const worst = [...eligible]
		.filter((record) => !best.includes(record))
		.sort((a, b) => rate(a) - rate(b) || b.games - a.games)
		.slice(0, limit);
	return { best, worst };
}
