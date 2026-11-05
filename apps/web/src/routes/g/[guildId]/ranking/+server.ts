import { error, json } from '@sveltejs/kit';
import { dev } from '$app/env';
import { findMockGuild, mockUser } from '#lib/mocks/session.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { getRankingPage, latestDataDragonVersion, POSITION_KEYS } from '#lib/server/guild/ranking.ts';
import { routeError } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

// 서버 홈 순위 카드의 무한 스크롤이 다음 쪽을 받는 곳이다. 예: ?position=mid&offset=10
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const position = url.searchParams.get('position') as LolPosition;
    const offset = Number(url.searchParams.get('offset'));
    if (!POSITION_KEYS.includes(position) || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
        error(400, '포지션 또는 시작 위치가 올바르지 않습니다.');
    }
    try {
        const result = await getRankingPage(params.guildId, position, {
            offset,
            userId: dev && findMockGuild(params.guildId) ? mockUser.userId : (locals.actor?.userId ?? null),
            version: await latestDataDragonVersion()
        });
        if (!result) error(404, '진행 중인 시즌이 없습니다.');
        return json(result.page);
    } catch (cause) {
        routeError(cause);
    }
};
