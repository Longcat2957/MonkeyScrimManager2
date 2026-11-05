import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { findMockScrim } from '#lib/mocks/scrims.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getScrim } from '#lib/server/scrims/queries.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import { randomChampionSplash } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, url }) => {
    // 같은 내전의 하위 화면으로 이동할 때도 운영 권한을 다시 계산한다.
    url.pathname;
    let scrim;
    try {
        scrim =
            dev && findMockGuild(params.guildId)
                ? findMockScrim(params.guildId, params.scrimId)
                : await getScrim(getDb(), locals.actor, params.guildId, params.scrimId);
    } catch (cause) {
        routeError(cause);
    }
    if (!scrim) error(404, '내전을 찾을 수 없습니다.');
    // 배경 아트는 장식이라 Data Dragon에 닿지 않으면 배경색만 쓴다.
    const artUrl = await randomChampionSplash(await latestDataDragonVersion());
    return { scrim, artUrl };
};
