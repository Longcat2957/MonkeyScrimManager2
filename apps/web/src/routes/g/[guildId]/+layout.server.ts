import { dev } from '$app/env';
import { findMockGuild } from '#lib/mocks/session.ts';
import { requireGuildView } from '#lib/server/guild/access.ts';
import { routeError } from '#lib/server/http.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, locals, parent }) => {
    const preview = dev ? findMockGuild(params.guildId) : null;
    if (preview) return { guild: preview };
    try {
        await parent();
        return { guild: await requireGuildView(locals.actor, params.guildId) };
    } catch (cause) {
        routeError(cause);
    }
};
