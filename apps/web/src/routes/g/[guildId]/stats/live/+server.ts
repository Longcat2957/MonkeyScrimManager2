import { dev } from '$app/env';
import { json } from '@sveltejs/kit';
import { normalizeStatsFilters } from '#lib/features/stats/types.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import { getGuildStatsSnapshot } from '#lib/server/stats/snapshot.ts';
import type { RequestHandler } from './$types';

// 소비자는 통계 화면의 자동·수동 갱신뿐이며 공개 읽기와 같은 권한·시즌 조건을 적용한다.
export const GET: RequestHandler = async ({ params, url, locals, setHeaders }) => {
    setHeaders({ 'Cache-Control': 'private, no-store' });
    const preview = dev && Boolean(findMockGuild(params.guildId));
    try {
        return json(
            await getGuildStatsSnapshot(
                preview ? null : getDb(),
                locals.actor,
                params.guildId,
                normalizeStatsFilters(url.searchParams),
                { preview }
            )
        );
    } catch (cause) {
        routeError(cause);
    }
};
