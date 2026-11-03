import type { LolPosition } from '#lib/features/guild/types.ts';
import type { ChampionRecord, DuoRecord, PlayerGame, PlayerSummary } from './types.ts';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const known = (value: number | null): value is number => value !== null && Number.isFinite(value);
const mean = (values: (number | null)[]) => {
	const valid = values.filter(known);
	return valid.length ? sum(valid) / valid.length : null;
};

function kda(games: PlayerGame[]) {
	const valid = games.filter((game) => known(game.kills) && known(game.deaths) && known(game.assists));
	return valid.length ? sum(valid.map((game) => game.kills! + game.assists!)) / Math.max(1, sum(valid.map((game) => game.deaths!))) : null;
}

function perMinute(games: PlayerGame[], pick: (game: PlayerGame) => number | null) {
	const valid = games.filter((game) => known(pick(game)) && game.durationSec !== null && game.durationSec > 0);
	return valid.length ? sum(valid.map((game) => pick(game)!)) / (sum(valid.map((game) => game.durationSec!)) / 60) : null;
}

/** 누락 지표는 제외하고 각 지표에 필요한 값이 모두 있는 게임만 분모에 사용한다. */
export function summarize(games: PlayerGame[]): PlayerSummary | null {
	if (!games.length) return null;
	const positions = new Map<LolPosition, number>();
	for (const game of games) if (game.position) positions.set(game.position, (positions.get(game.position) ?? 0) + 1);
	const streaks = { win: 0, loss: 0 };
	let run = 0;
	for (const [index, game] of games.entries()) {
		run = index > 0 && games[index - 1]!.win === game.win ? run + 1 : 1;
		if (game.win) streaks.win = Math.max(streaks.win, run);
		else streaks.loss = Math.max(streaks.loss, run);
	}
	const participation = games.filter((game) => known(game.kills) && known(game.assists) && known(game.teamKills));
	const champions = new Set(games.filter((game) => game.champion.id !== 'unknown').map((game) => game.champion.id));
	const kills = games.map((game) => game.kills).filter(known);
	const chronologyKnown = games.every((game) => game.playedAt !== null);
	return {
		games: games.length, wins: games.filter((game) => game.win).length,
		kills: mean(games.map((game) => game.kills)), deaths: mean(games.map((game) => game.deaths)), assists: mean(games.map((game) => game.assists)),
		kda: kda(games), csPerMin: perMinute(games, (game) => game.cs), damagePerMin: perMinute(games, (game) => game.damage),
		goldPerMin: perMinute(games, (game) => game.gold), damageTakenPerMin: perMinute(games, (game) => game.damageTaken),
		visionPerGame: mean(games.map((game) => game.visionScore)),
		killParticipation: participation.length ? sum(participation.map((game) => game.kills! + game.assists!)) / Math.max(1, sum(participation.map((game) => game.teamKills!))) : null,
		champions: champions.size || null, maxKills: kills.length ? Math.max(...kills) : null,
		winStreak: chronologyKnown ? streaks.win : null, lossStreak: chronologyKnown ? streaks.loss : null,
		mainPosition: [...positions].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
	};
}

/** 챔피언별 성적. 게임 수가 많은 순, 같으면 승률 순이다. */
export function championRecords(games: PlayerGame[]): ChampionRecord[] {
	const groups = new Map<string, PlayerGame[]>();
	for (const game of games.filter((game) => game.champion.id !== 'unknown')) groups.set(game.champion.id, [...(groups.get(game.champion.id) ?? []), game]);
	return [...groups.values()]
		.map((list) => ({
			champion: list[0]!.champion,
			games: list.length,
			wins: list.filter((game) => game.win).length,
			kda: kda(list)
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
} satisfies Record<string, { value: (summary: PlayerSummary) => number | null; ascending?: boolean }>;

export type RankedMetric = keyof typeof RANKED_METRICS;

/**
 * 지표마다 서버 사람들 중 상위 몇 %인지 센다. 자신보다 앞선 사람 수로 세어 동점은 같은 순위가 된다.
 * others에는 자신도 들어 있어야 한다.
 */
export function topPercents(summary: PlayerSummary, others: PlayerSummary[]): Record<RankedMetric, number | null> {
	const entries = Object.entries(RANKED_METRICS).map(([key, metric]) => {
		const mine = metric.value(summary);
		if (mine === null) return [key, null];
		const values = others.map((other) => metric.value(other)).filter(known);
		const ahead = values.filter((value) => 'ascending' in metric ? value < mine : value > mine).length;
		return [key, Math.max(1, Math.ceil(((ahead + 1) / Math.max(1, values.length)) * 100))];
	});
	return Object.fromEntries(entries) as Record<RankedMetric, number | null>;
}
