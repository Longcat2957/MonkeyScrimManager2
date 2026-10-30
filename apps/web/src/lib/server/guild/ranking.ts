import type { LolPosition, RankingEntry, RankingPage } from '#lib/features/guild/types.ts';
import { getMockRankingPage, type MockRankingEntry } from '#lib/mocks/ranking.ts';
import { dataDragonImageUrl } from '#lib/server/ddragon/assets.ts';
import { dataDragon } from '#lib/server/ddragon/client.ts';

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

// TODO: DB 조회로 바꾼다. 시즌이 없으면 null을 돌려준다.
export async function getRankingPage(
	guildId: string,
	position: LolPosition,
	{ offset, userId, version }: { offset: number; userId: string | null; version: string | null }
): Promise<{ seasonName: string; page: RankingPage } | null> {
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
