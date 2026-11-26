import { dev } from '$app/env';
import { findMockGuild } from '#lib/mocks/session.ts';
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '#lib/server/auth/cookies.ts';
import { requireGuildView } from '#lib/server/guild/access.ts';
import { routeError } from '#lib/server/http.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, parent, url, cookies }) => {
    // 같은 서버 안에서 이동해도 갱신된 운영 권한을 상위 문맥에 반영한다.
    url.pathname;
    const preview = dev ? findMockGuild(params.guildId) : null;
    if (preview) return { guild: preview };
    try {
        await parent();
        const guild = await requireGuildView(locals.actor, params.guildId);
        // 로그인 사용자가 실제로 연 서버만 다음 서버 진입의 대표 서버로 기억한다.
        if (locals.actor && cookies.get(LAST_GUILD_COOKIE) !== guild.id)
            cookies.set(LAST_GUILD_COOKIE, guild.id, lastGuildCookieOptions);
        return { guild };
    } catch (cause) {
        routeError(cause);
    }
};
