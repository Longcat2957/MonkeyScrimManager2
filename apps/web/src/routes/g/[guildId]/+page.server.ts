import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { GuildRanking, NextScrim } from '#lib/features/guild/types.ts';
import { ACHIEVEMENT_MIN_GAMES, rankAchievements } from '#lib/features/players/achievements.ts';
import { summarize } from '#lib/features/players/stats.ts';
import { mapSection, toSection } from '#lib/features/section.ts';
import { listMockRecentMatches } from '#lib/mocks/matches.ts';
import { listMockGuildPlayers } from '#lib/mocks/players.ts';
import { findMockNextScrim, listMockActiveScrims } from '#lib/mocks/scrims.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listMatches } from '#lib/server/matches/queries.ts';
import { findNextScrim, listActiveScrims } from '#lib/server/scrims/queries.ts';
import { championIconUrl, dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
import { championResolver, randomChampionSplash } from '#lib/server/ddragon/champions.ts';
import { getRankingPage, latestDataDragonVersion, POSITION_KEYS } from '#lib/server/guild/ranking.ts';
import type { PageServerLoad } from './$types';

const RECENT_MATCH_LIMIT = 5;

// 포지션마다 순위 첫 쪽을 받는다. 시즌이 없으면 null이다.
async function loadRanking(guildId: string, userId: string | null, version: string | null): Promise<GuildRanking | null> {
	const pages = await Promise.all(
		POSITION_KEYS.map((position) => getRankingPage(guildId, position, { offset: 0, userId, version }))
	);
	if (pages.some((page) => !page)) return null;
	return {
		seasonName: pages[0]!.seasonName,
		positions: Object.fromEntries(
			POSITION_KEYS.map((position, index) => [position, pages[index]!.page])
		) as GuildRanking['positions']
	};
}

// 서버 통계와 같은 업적을 전체 포지션·전체 게임 기준으로 고른다. 카드 배경은 1위의 주 챔피언 스플래시다.
async function loadAchievements(guildId: string, version: string | null) {
	if (!dev || guildId !== 'devGuild001') return [];
	const players = listMockGuildPlayers(await championResolver(version));
	const championOf = new Map(players.map((player) => [player.userId, player.championId]));
	const achievements = rankAchievements(
		players.map(({ games, ...player }) => ({ ...player, summary: summarize(games) })),
		ACHIEVEMENT_MIN_GAMES
	);
	return achievements.map((item) => {
		const championId = championOf.get(item.entries[0]!.userId);
		return { ...item, splashUrl: version && championId ? dataDragonSplashUrl(championId) : null };
	});
}

export const load: PageServerLoad = async ({ parent, params, url, depends, locals }) => {
	const { guild, user } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	depends('app:guild-home');

	// 개발 모드에서 ?preview=error로 한 영역의 조회 실패를 재현한다.
	const preview = dev ? url.searchParams.get('preview') : null;
	const version = await latestDataDragonVersion();
	const icon = (championId: string) => championIconUrl(version, championId);
	const mock = dev && Boolean(findMockGuild(params.guildId));

	// 각 조회 영역은 독립적으로 실패를 표시하며, 일반 서버에 목 기록을 섞지 않는다.
	const [next, activeScrims, recentMatches, ranking, achievements] = await Promise.allSettled([
		mock ? findMockNextScrim(params.guildId, icon) : findNextScrim(getDb(), locals.actor, params.guildId),
		mock ? listMockActiveScrims(params.guildId, icon) : listActiveScrims(getDb(), locals.actor, params.guildId),
		mock ? listMockRecentMatches(params.guildId, { fail: preview === 'error' }).then((items) => items.slice(0, RECENT_MATCH_LIMIT))
			: listMatches(getDb(), locals.actor, params.guildId, { status: 'done', page: 1, pageSize: RECENT_MATCH_LIMIT }).then((result) => result.matches),
		loadRanking(params.guildId, user?.userId ?? null, version),
		loadAchievements(params.guildId, version)
	]);

	const nextScrim: NextScrim | null =
		next.status === 'fulfilled' && next.value ? { ...next.value, artUrl: await randomChampionSplash(version) } : null;

	return {
		guild,
		nextScrim,
		// 맨 위 카드에 보인 내전은 목록에서 빼서 같은 대상으로 가는 링크가 두 번 나오지 않게 한다.
		activeScrims: mapSection(toSection(activeScrims, 'guild-home/active-scrims'), (items) =>
			items.filter((scrim) => scrim.id !== nextScrim?.scrim.id)
		),
		recentMatches: toSection(recentMatches, 'guild-home/recent-matches'),
		ranking: toSection(ranking, 'guild-home/ranking'),
		// 업적은 볼거리라 조회에 실패하면 영역을 두지 않는다.
		achievements: achievements.status === 'fulfilled' ? achievements.value : []
	};
};
