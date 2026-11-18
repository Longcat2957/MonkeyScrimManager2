import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { parseMatchDateFilters } from '#lib/features/matches/filters.ts';
import { isBestOf } from '#lib/features/scrims/bracket.ts';
import { listMockMatches } from '#lib/mocks/matches.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listMatches } from '#lib/server/matches/queries.ts';
import {
    CHAMPION_CATALOG_ERROR,
    getChampionPreferenceCatalog
} from '#lib/server/ddragon/champion-preferences.ts';
import { getRecordSeasons, mockRecordSeasons } from '#lib/server/records/seasons.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;
const championKey = (value: string) => value.normalize('NFC').toLowerCase().replace(/\s+/gu, '');

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
    const { guild } = await parent();
    if (!guild) error(404, '서버를 찾을 수 없습니다.');

    // 쪽 번호는 허용 범위로 보정하며 종료된 경기 목록에만 적용한다.
    const page = Math.min(100_000, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
    const player = (url.searchParams.get('player') ?? '').trim().slice(0, 50);
    const champion = (url.searchParams.get('champion') ?? '').trim().slice(0, 50);
    const bo = Number(url.searchParams.get('bo'));
    const bestOf = isBestOf(bo) ? bo : null;
    const seasonId = url.searchParams.get('season') || null;
    const dates = parseMatchDateFilters({
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to')
    });
    const demo = dev && Boolean(findMockGuild(params.guildId));
    const catalog = await getChampionPreferenceCatalog().catch(() => null);
    const championSuggestions = catalog?.map(({ name }) => name) ?? [];
    const filterError =
        dates.error ?? (!catalog && /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(champion) ? CHAMPION_CATALOG_ERROR : null);
    const requested = {
        page,
        pageSize: PAGE_SIZE,
        q,
        player,
        champion,
        bestOf,
        from: dates.from,
        to: dates.to
    };
    try {
        if (filterError) {
            const selection = demo
                ? mockRecordSeasons(seasonId)
                : await getRecordSeasons(getDb(), locals.actor, params.guildId, seasonId);
            return {
                ...requested,
                seasons: selection.seasons,
                selectedSeasonId: seasonId == null ? null : selection.selectedSeasonId,
                championSuggestions,
                filterError,
                matches: [],
                total: 0,
                empty: false
            };
        }
        const key = championKey(champion);
        const championIds = key
            ? catalog
                  ?.filter(({ name, id }) => championKey(name).includes(key) || championKey(id).includes(key))
                  .map(({ id }) => id)
            : undefined;
        const options = { ...requested, seasonId, championIds };
        const result = demo
            ? await listMockMatches(params.guildId, options)
            : await listMatches(getDb(), locals.actor, params.guildId, options);
        return { ...requested, ...result, championSuggestions, filterError: null };
    } catch (cause) {
        routeError(cause);
    }
};
