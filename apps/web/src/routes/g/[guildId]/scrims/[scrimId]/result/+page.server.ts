import { dev } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import { bracketPath, hasResult } from '#lib/features/scrims/paths.ts';
import { getMockBracket } from '#lib/mocks/bracket.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { getBracket } from '#lib/server/scrims/bracket.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

// 끝난 내전의 대진 결과. 아직 끝나지 않았으면 대진 운영 화면으로 보낸다. 편집 action은 없다.
export const load: PageServerLoad = async ({ parent, params, locals }) => {
    const { scrim } = await parent();
    if (!scrim) error(404, '내전을 찾을 수 없습니다.');
    if (!hasResult(scrim.status)) redirect(307, bracketPath(params, scrim.status));
    try {
        if (!(dev && findMockGuild(params.guildId)))
            return {
                scrim,
                bracket: await getBracket(getDb(), locals.actor, params.guildId, params.scrimId)
            };
        const version = await latestDataDragonVersion();
        return {
            scrim,
            bracket: await getMockBracket(params.guildId, params.scrimId, (id) =>
                championIconUrl(version, id)
            )
        };
    } catch (cause) {
        routeError(cause);
    }
};
