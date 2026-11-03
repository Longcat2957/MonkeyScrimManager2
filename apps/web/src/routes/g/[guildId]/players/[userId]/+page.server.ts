import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { achievementBadges, rankAchievements } from '#lib/features/players/achievements.ts';
import { championRecords, duoRecords, summarize, topPercents } from '#lib/features/players/stats.ts';
import type { PlayerGame, PlayerSummary } from '#lib/features/players/types.ts';
import { findMockPlayer, listMockGuildPlayers } from '#lib/mocks/players.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getPlayerRecords, type GuildPlayerRecords } from '#lib/server/records/queries.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 10;
const POSITIONS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];
// 업적과 상위 %는 표본이 너무 작은 사람을 빼고 비교한다. 통계 화면과 같은 기준이다.
const COMPARE_MIN_GAMES = 4;

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	const demo = dev && Boolean(findMockGuild(params.guildId));
	const champion = await championResolver(await latestDataDragonVersion());
	let player: { userId: string; displayName: string; iconUrl: string | null; riotIds: string[] };
	let games: PlayerGame[];
	let guildPlayers: GuildPlayerRecords[];
	let mmr: { position: LolPosition; rating: number; games: number }[];
	if (demo) {
		const mock = findMockPlayer(params.guildId, params.userId);
		if (!mock) error(404, '사용자를 찾을 수 없습니다.');
		guildPlayers = listMockGuildPlayers(champion);
		games = guildPlayers.find((item) => item.userId === mock.userId)!.games;
		const main = Object.values(mock.records).sort((a, b) => b.games - a.games)[0];
		player = { userId: mock.userId, displayName: mock.displayName, iconUrl: main ? champion(main.championId).iconUrl : null, riotIds: [`${mock.displayName}#KR1`] };
		mmr = POSITIONS.flatMap((position) => { const record = mock.records[position]; return record ? [{ position, rating: record.mmr, games: record.games }] : []; });
	} else {
		try {
			const result = await getPlayerRecords(getDb(), locals.actor, params.guildId, params.userId, champion);
			({ player, games, mmr } = result);
			guildPlayers = result.players;
		} catch (cause) { routeError(cause); }
	}
	// 실제로 플레이한 포지션만 고를 수 있다. 알 수 없는 값은 전체로 읽는다.
	const played = POSITIONS.filter((key) => games.some((game) => game.position === key));
	const requested = url.searchParams.get('position') as LolPosition;
	const position = played.includes(requested) ? requested : 'all';
	const filtered = position === 'all' ? games : games.filter((game) => game.position === position);
	const page = Math.min(100_000, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
	const summary = summarize(filtered);
	// 같은 포지션 범위의 다른 서버 사람들과 비교한다.
	const others = guildPlayers
		.filter((item) => item.userId !== player.userId)
		.map((item) => summarize(position === 'all' ? item.games : item.games.filter((game) => game.position === position)))
		.filter((item): item is PlayerSummary => (item?.games ?? 0) >= COMPARE_MIN_GAMES);
	const badges = achievementBadges(demo ?
		rankAchievements(guildPlayers.map(({ games: list, ...item }) => ({ ...item, summary: summarize(list) })), COMPARE_MIN_GAMES, 1) : []
	);

	return {
		player,
		overallGames: games.length,
		recordWins: games.length ? games.filter((game) => game.win).length : null,
		recent: (games.every((game) => game.playedAt !== null) ? games : []).slice(0, 10).map(({ matchId, gameId, win, champion }) => ({ matchId, gameId, win, champion })),
		positions: played.map((key) => ({ key, games: games.filter((game) => game.position === key).length })),
		position,
		summary,
		// 표본이 작으면 상위 %가 우연에 크게 흔들려 보여 주지 않는다.
		percents: summary && summary.games >= COMPARE_MIN_GAMES ? topPercents(summary, [...others, summary]) : null,
		badges: badges.get(player.userId) ?? [],
		champions: championRecords(filtered),
		duos: duoRecords(games),
		mmr,
		history: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
		total: filtered.length,
		page,
		pageSize: PAGE_SIZE
	};
};
