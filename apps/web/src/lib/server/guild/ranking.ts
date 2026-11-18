import type { LolPosition, RankingPage } from '#lib/features/guild/types.ts';
import { getMockRankingPage } from '#lib/mocks/ranking.ts';
import { dataDragon } from '#lib/server/ddragon/client.ts';
import { dev } from '$app/env';
import { findMockGuild } from '../../mocks/session.ts';
import { getDb } from '../db/index.ts';
import { queryRankingPage } from './ranking-queries.ts';
import { mockRecordSeasons } from '../records/seasons.ts';

export const RANKING_PAGE_SIZE = 10;
export const POSITION_KEYS: LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

// 이미지 버전 조회가 실패해도 챔피언 이미지를 제외한 기록은 보여 준다.
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
    { offset, userId, seasonId }: { offset: number; userId: string | null; seasonId?: string | null }
): Promise<{ seasonName: string; page: RankingPage } | null> {
    if (!(dev && findMockGuild(guildId))) {
        return queryRankingPage(getDb(), null, guildId, position, {
            offset,
            limit: RANKING_PAGE_SIZE,
            userId,
            seasonId
        });
    }
    mockRecordSeasons(seasonId);
    return getMockRankingPage(guildId, position, { offset, limit: RANKING_PAGE_SIZE, userId });
}
