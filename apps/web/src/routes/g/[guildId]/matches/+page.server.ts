import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { parseMatchDateFilters } from '#lib/features/matches/filters.ts';
import { listMockMatches } from '#lib/mocks/matches.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listMatches } from '#lib/server/matches/queries.ts';
import { getRecordSeasons, mockRecordSeasons } from '#lib/server/records/seasons.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');

    // 쪽 번호는 허용 범위로 보정하며 종료된 경기 목록에만 적용한다.
    const page = Math.min(100_000, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
    const q = (url.searchParams.get('q') ?? '').slice(0, 50);
    const seasonId = url.searchParams.get('season');
    const dates = parseMatchDateFilters({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to')
    });
    const demo = dev && Boolean(findMockGuild(params.guildId));
    const requested = { page, pageSize: PAGE_SIZE, q, from: dates.from, to: dates.to };
    try {
        if (dates.error) {
            const selection = demo
                ? mockRecordSeasons(seasonId)
                : await getRecordSeasons(getDb(), locals.actor, params.guildId, seasonId);
            return {
                ...requested,
                seasons: selection.seasons,
                selectedSeasonId: seasonId == null ? null : selection.selectedSeasonId,
                filterError: dates.error,
                live: [],
                done: [],
                doneTotal: 0,
                empty: false
            };
        }
        const filters = { q, seasonId, from: dates.from, to: dates.to };
        const list = (options: Parameters<typeof listMatches>[3]) =>
            demo
                ? listMockMatches(params.guildId, options)
                : listMatches(getDb(), locals.actor, params.guildId, options);
        // 진행 중인 경기는 몇 개뿐이므로 한 번에 모두 보여 준다.
        const [live, done] = await Promise.all([
            list({ ...filters, status: 'in_progress', page: 1, pageSize: 100 }),
            list({ ...filters, status: 'done', page, pageSize: PAGE_SIZE })
        ]);
        return {
            ...requested,
            seasons: done.seasons,
            selectedSeasonId: done.selectedSeasonId,
            filterError: null,
            live: live.matches,
            done: done.matches,
            doneTotal: done.total,
            empty: done.empty
        };
    } catch (cause) {
        routeError(cause);
    }
};
