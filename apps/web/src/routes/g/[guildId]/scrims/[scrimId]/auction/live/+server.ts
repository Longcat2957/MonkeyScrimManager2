import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { getMockAuction } from '#lib/mocks/teams.ts';
import { findMockScrim } from '#lib/mocks/scrims.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { championResolver } from '#lib/server/ddragon/champions.ts';
import {
    getChampionPreferenceCatalog,
    preferredChampionResolver
} from '#lib/server/ddragon/champion-preferences.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { getAuction } from '#lib/server/scrims/auction.ts';
import { getScrim } from '#lib/server/scrims/queries.ts';
import { routeError } from '#lib/server/http.ts';
import type { AuctionLiveSnapshot } from '#lib/features/scrims/auction-live.ts';
import type { RequestHandler } from './$types';

// 소비자는 공개 경매 화면의 자동/수동 갱신이며, 기존 공개 읽기 권한을 그대로 사용한다.
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
    setHeaders({ 'cache-control': 'private, no-store' });
    try {
        const preview = dev && Boolean(findMockGuild(params.guildId));
        const scrim = preview
            ? findMockScrim(params.guildId, params.scrimId)
            : await getScrim(getDb(), locals.actor, params.guildId, params.scrimId);
        if (!scrim) error(404, '내전을 찾을 수 없습니다.');
        let auction = null;
        if (scrim.formationMethod === 'auction' && scrim.status !== 'recruit') {
            const version = await latestDataDragonVersion();
            const [champion, catalog] = await Promise.all([
                championResolver(version),
                preview ? Promise.resolve([]) : getChampionPreferenceCatalog(version).catch(() => [])
            ]);
            auction = preview
                ? await getMockAuction(params.guildId, params.scrimId, champion)
                : await getAuction(
                      getDb(),
                      locals.actor,
                      params.guildId,
                      params.scrimId,
                      undefined,
                      champion,
                      preferredChampionResolver(catalog)
                  );
        }
        return json({ scrim, auction } satisfies AuctionLiveSnapshot);
    } catch (cause) {
        routeError(cause);
    }
};
