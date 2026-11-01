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
	const streaks = { win: 0, loss: 0 };
	let run = 0;
	for (const [index, game] of games.entries()) {
		run = index > 0 && games[index - 1]!.win === game.win ? run + 1 : 1;
		if (game.win) streaks.win = Math.max(streaks.win, run);
		else streaks.loss = Math.max(streaks.loss, run);
	}
	return {
		games: games.length,
		wins: games.filter((game) => game.win).length,
		kills: kills / games.length,
		deaths: deaths / games.length,
		assists: assists / games.length,
		kda: ratio(kills, deaths, assists),
		csPerMin: sum(games, (game) => game.cs) / minutes,
		damagePerMin: sum(games, (game) => game.damage) / minutes,
		goldPerMin: sum(games, (game) => game.gold) / minutes,
		damageTakenPerMin: sum(games, (game) => game.damageTaken) / minutes,
		visionPerGame: sum(games, (game) => game.visionScore) / games.length,
		killParticipation: (kills + assists) / Math.max(1, sum(games, (game) => game.teamKills)),
		champions: new Set(games.map((game) => game.champion.id)).size,
		maxKills: Math.max(...games.map((game) => game.kills)),
		winStreak: streaks.win,
		lossStreak: streaks.loss,
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

/** 상위 %를 매기는 지표. ascending이면 낮을수록 앞선다. */
export const RANKED_METRICS = {
	winRate: { value: (s: PlayerSummary) => s.wins / s.games },
	kda: { value: (s: PlayerSummary) => s.kda },
	kills: { value: (s: PlayerSummary) => s.kills },
	deaths: { value: (s: PlayerSummary) => s.deaths, ascending: true },
	assists: { value: (s: PlayerSummary) => s.assists },
	killParticipation: { value: (s: PlayerSummary) => s.killParticipation },
	csPerMin: { value: (s: PlayerSummary) => s.csPerMin },
	goldPerMin: { value: (s: PlayerSummary) => s.goldPerMin },
	damagePerMin: { value: (s: PlayerSummary) => s.damagePerMin },
	damageTakenPerMin: { value: (s: PlayerSummary) => s.damageTakenPerMin },
	visionPerGame: { value: (s: PlayerSummary) => s.visionPerGame },
	champions: { value: (s: PlayerSummary) => s.champions },
	maxKills: { value: (s: PlayerSummary) => s.maxKills },
	winStreak: { value: (s: PlayerSummary) => s.winStreak }
} satisfies Record<string, { value: (summary: PlayerSummary) => number; ascending?: boolean }>;

export type RankedMetric = keyof typeof RANKED_METRICS;

/**
 * 지표마다 서버 사람들 중 상위 몇 %인지 센다. 자신보다 앞선 사람 수로 세어 동점은 같은 순위가 된다.
 * others에는 자신도 들어 있어야 한다.
 */
export function topPercents(summary: PlayerSummary, others: PlayerSummary[]): Record<RankedMetric, number> {
	const entries = Object.entries(RANKED_METRICS).map(([key, metric]) => {
		const mine = metric.value(summary);
		const ahead = others.filter((other) => ('ascending' in metric ? metric.value(other) < mine : metric.value(other) > mine)).length;
		return [key, Math.max(1, Math.ceil(((ahead + 1) / Math.max(1, others.length)) * 100))];
	});
	return Object.fromEntries(entries) as Record<RankedMetric, number>;
}
