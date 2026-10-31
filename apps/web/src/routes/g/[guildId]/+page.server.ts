import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { GuildRanking, GuildStory, NextScrim } from '#lib/features/guild/types.ts';
import { mapSection, toSection } from '#lib/features/section.ts';
import { listMockRecentMatches } from '#lib/mocks/matches.ts';
import { findMockNextScrim, listMockActiveScrims } from '#lib/mocks/scrims.ts';
import { mockMainChampion } from '#lib/mocks/session.ts';
import { listMockStories } from '#lib/mocks/stories.ts';
import { championIconUrl, dataDragonSplashUrl } from '#lib/server/ddragon/assets.ts';
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

export const load: PageServerLoad = async ({ parent, params, url, depends }) => {
	const { guild, user } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	depends('app:guild-home');

	// 개발 모드에서 ?preview=error로 한 영역의 조회 실패를 재현한다.
	const preview = dev ? url.searchParams.get('preview') : null;
	const version = await latestDataDragonVersion();
	const splash = (championId: string) => (version ? dataDragonSplashUrl(championId) : null);
	const icon = (championId: string) => championIconUrl(version, championId);

	// TODO: DB 조회로 바꾼다. 각 영역은 서로 독립적으로 실패할 수 있다.
	const [next, activeScrims, recentMatches, ranking, stories] = await Promise.allSettled([
		findMockNextScrim(params.guildId, icon),
		listMockActiveScrims(params.guildId, icon),
		listMockRecentMatches(params.guildId, { fail: preview === 'error' }).then((items) =>
			items.slice(0, RECENT_MATCH_LIMIT)
		),
		loadRanking(params.guildId, user?.userId ?? null, version),
		listMockStories(params.guildId)
	]);

	const nextScrim: NextScrim | null =
		next.status === 'fulfilled' && next.value ? { ...next.value, artUrl: splash(mockMainChampion) } : null;

	return {
		guild,
		nextScrim,
		// 맨 위 카드에 보인 내전은 목록에서 빼서 같은 대상으로 가는 링크가 두 번 나오지 않게 한다.
		activeScrims: mapSection(toSection(activeScrims, 'guild-home/active-scrims'), (items) =>
			items.filter((scrim) => scrim.id !== nextScrim?.scrim.id)
		),
		recentMatches: toSection(recentMatches, 'guild-home/recent-matches'),
		ranking: toSection(ranking, 'guild-home/ranking'),
		// 스토리는 볼거리라 조회에 실패하면 영역을 두지 않는다.
		stories:
			stories.status === 'fulfilled'
				? stories.value.map(({ championId, ...story }): GuildStory => ({ ...story, artUrl: splash(championId) }))
				: []
	};
};
