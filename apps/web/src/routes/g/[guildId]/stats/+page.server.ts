import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { normalizeStatsFilters } from '#lib/features/stats/types.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import { getGuildStatsSnapshot } from '#lib/server/stats/snapshot.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, params, url, locals, request, setHeaders }) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');
    if (request.method === 'GET') setHeaders({ 'Cache-Control': 'private, no-store' });
    const preview = dev && Boolean(findMockGuild(params.guildId));
    try {
        return await getGuildStatsSnapshot(
            preview ? null : getDb(),
            locals.actor,
            params.guildId,
            normalizeStatsFilters(url.searchParams),
            { preview }
        );
    } catch (cause) {
        routeError(cause);
    }
};
