import { dev } from '$app/env';
import { findMockGuild, mockGuilds, mockUser } from '#lib/mocks/session.ts';
import { listAccessibleGuilds } from '#lib/server/guild/queries.ts';
import { DiscordError } from '#lib/server/discord/client.ts';
import { DomainError } from '#lib/server/errors.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, route, url, setHeaders }) => {
    if (route.id === '/(site)') setHeaders({ 'Cache-Control': 'private, no-store' });
    // 사이트 화면은 서버 목록을 쓰지 않는다. 서버 진입(/servers)과 레일 화면만 조회한다.
    const needsGuilds = !route.id?.startsWith('/(site)') || route.id === '/(site)/servers';
    // 개발 바로가기의 명시적 샘플 경로만 목 화면을 제공한다. 실제 조회 실패를 목으로 대체하지 않는다.
    const mockPreview =
        dev && (Boolean(findMockGuild(params.guildId ?? '')) || url.searchParams.get('mock') === '1');
    if (mockPreview)
        return {
            user: mockUser,
            guilds: mockGuilds,
            authenticated: Boolean(locals.actor),
            mockPreview,
            guildListError: null
        };
    let guilds = [] as typeof mockGuilds;
    let guildListError: string | null = null;
    try {
        if (needsGuilds) guilds = await listAccessibleGuilds(locals.actor);
    } catch (cause) {
        if (!(cause instanceof DiscordError || cause instanceof DomainError)) throw cause;
        guildListError = cause.message;
    }
    return { user: locals.user, guilds, authenticated: Boolean(locals.actor), mockPreview, guildListError };
};
