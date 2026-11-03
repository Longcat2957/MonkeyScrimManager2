import type { LolPosition, RankingEntry, RankingPage } from '#lib/features/guild/types.ts';
import { getMockRankingPage, type MockRankingEntry } from '#lib/mocks/ranking.ts';
import { dataDragonImageUrl } from '#lib/server/ddragon/assets.ts';
import { dataDragon } from '#lib/server/ddragon/client.ts';
import { dev } from '$app/env';
import { findMockGuild } from '../../mocks/session.ts';
import { getDb } from '../db/index.ts';
import { queryRankingPage } from './ranking-queries.ts';

export const RANKING_PAGE_SIZE = 10;
export const POSITION_KEYS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// 이미지 버전 조회가 실패해도 순위는 이미지 없이 보여 준다.
export async function latestDataDragonVersion() {
	try {
		return (await dataDragon.getVersions())[0] ?? null;
	} catch {
		return null;
	}
}

// 개발 서버 ID는 예시 순위, 나머지는 현재 DB 시즌을 조회한다.
export async function getRankingPage(
	guildId: string,
	position: LolPosition,
	{ offset, userId, version }: { offset: number; userId: string | null; version: string | null }
): Promise<{ seasonName: string; page: RankingPage } | null> {
	if (!(dev && findMockGuild(guildId))) {
		return queryRankingPage(getDb(), null, guildId, position, {
			offset, limit: RANKING_PAGE_SIZE, userId,
			championIcon: (championId) => version && /^[A-Za-z0-9]{1,64}$/.test(championId)
				? dataDragonImageUrl(version, 'champion', `${championId}.png`) : null
		});
	}
	const result = await getMockRankingPage(guildId, position, { offset, limit: RANKING_PAGE_SIZE, userId });
	if (!result) return null;
	const withIcon = ({ championId, ...entry }: MockRankingEntry): RankingEntry => ({
		...entry,
		iconUrl: version ? dataDragonImageUrl(version, 'champion', `${championId}.png`) : null
	});
	return {
		seasonName: result.seasonName,
		page: { entries: result.entries.map(withIcon), hasMore: result.hasMore, me: result.me && withIcon(result.me) }
	};
}
