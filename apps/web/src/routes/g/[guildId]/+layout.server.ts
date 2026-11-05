import { dev } from '$app/env';
import { findMockGuild } from '#lib/mocks/session.ts';
import { requireGuildView } from '#lib/server/guild/access.ts';
import { routeError } from '#lib/server/http.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, parent, url }) => {
    // 같은 서버 안에서 이동해도 갱신된 운영 권한을 상위 문맥에 반영한다.
    url.pathname;
    const preview = dev ? findMockGuild(params.guildId) : null;
    if (preview) return { guild: preview };
    try {
        await parent();
        return { guild: await requireGuildView(locals.actor, params.guildId) };
    } catch (cause) {
        routeError(cause);
    }
};
