import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { GuildRanking, NextScrim } from '#lib/features/guild/types.ts';
import { groupSeasonTitles } from '#lib/features/players/achievements.ts';
import { mapSection } from '#lib/features/section.ts';
import { observedSection as toSection } from '#lib/server/operations/section.ts';
import { listMockRecentMatches } from '#lib/mocks/matches.ts';
import { mockSeasonTitles } from '#lib/mocks/players.ts';
import { findMockNextScrim, listMockActiveScrims } from '#lib/mocks/scrims.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listMatches } from '#lib/server/matches/queries.ts';
import { findNextScrim, listActiveScrims, readGuild } from '#lib/server/scrims/queries.ts';
import { readSeasonTitles } from '#lib/server/records/season-titles.ts';
import { randomChampionSplash } from '#lib/server/ddragon/champions.ts';
import { getRankingPage, latestDataDragonVersion, POSITION_KEYS } from '#lib/server/guild/ranking.ts';
import { getRecordSeasons, mockRecordSeasons } from '#lib/server/records/seasons.ts';
import type { RecordSeasonSelection } from '#lib/features/seasons.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const RECENT_MATCH_LIMIT = 5;

// 포지션마다 순위 첫 쪽을 받는다. 시즌이 없으면 null이다.
async function loadRanking(
    guildId: string,
    userId: string | null,
    seasonId: string | null
): Promise<GuildRanking | null> {
    const pages = await Promise.all(
        POSITION_KEYS.map((position) => getRankingPage(guildId, position, { offset: 0, userId, seasonId }))
    );
    if (pages.some((page) => !page)) return null;
    return {
        seasonName: pages[0]!.seasonName,
        positions: Object.fromEntries(
            POSITION_KEYS.map((position, index) => [position, pages[index]!.page])
        ) as GuildRanking['positions']
    };
}

export const load: PageServerLoad = async ({ parent, params, url, depends, locals }) => {
    const { guild, user } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');
    depends('app:guild-home');

    // 개발 모드에서 ?preview=error로 한 영역의 조회 실패를 재현한다.
    const preview = dev ? url.searchParams.get('preview') : null;
    const version = await latestDataDragonVersion();
    const mock = dev && Boolean(findMockGuild(params.guildId));
    let seasonSelection: RecordSeasonSelection;
    try {
        seasonSelection = mock
            ? mockRecordSeasons(url.searchParams.get('season'))
            : await getRecordSeasons(getDb(), locals.actor, params.guildId, url.searchParams.get('season'));
    } catch (cause) {
        routeError(cause);
    }

    // 각 조회 영역은 독립적으로 실패를 표시하며, 일반 서버에 목 기록을 섞지 않는다.
    const [next, activeScrims, recentMatches, ranking, achievements] = await Promise.allSettled([
        mock ? findMockNextScrim(params.guildId) : findNextScrim(getDb(), locals.actor, params.guildId),
        mock ? listMockActiveScrims(params.guildId) : listActiveScrims(getDb(), locals.actor, params.guildId),
        mock
            ? listMockRecentMatches(params.guildId, { fail: preview === 'error', limit: RECENT_MATCH_LIMIT })
            : listMatches(getDb(), locals.actor, params.guildId, {
                  page: 1,
                  pageSize: RECENT_MATCH_LIMIT
              }).then((result) => result.matches),
        loadRanking(params.guildId, user?.userId ?? null, seasonSelection.selectedSeasonId),
        mock
            ? groupSeasonTitles(mockSeasonTitles(params.guildId))
            : readGuild(getDb(), locals.actor, params.guildId, async (tx) =>
                  groupSeasonTitles(
                      await readSeasonTitles(
                          tx,
                          params.guildId,
                          seasonSelection.selectedSeasonId,
                          undefined,
                          1
                      )
                  )
              )
    ]);

    const nextScrim: NextScrim | null =
        next.status === 'fulfilled' && next.value
            ? { ...next.value, artUrl: await randomChampionSplash(version) }
            : null;

    return {
        ...seasonSelection,
        guild,
        nextScrim,
        // 맨 위 카드에 보인 내전은 목록에서 빼서 같은 대상으로 가는 링크가 두 번 나오지 않게 한다.
        activeScrims: mapSection(toSection(activeScrims, 'guild-home/active-scrims'), (items) =>
            items.filter((scrim) => scrim.id !== nextScrim?.scrim.id)
        ),
        recentMatches: toSection(recentMatches, 'guild-home/recent-matches'),
        ranking: toSection(ranking, 'guild-home/ranking'),
        achievements: toSection(achievements, 'guild-home/season-titles')
    };
};
