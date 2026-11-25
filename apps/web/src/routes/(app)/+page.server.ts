import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, setHeaders }) => {
    setHeaders({ 'Cache-Control': 'private, no-store' });
    const { authenticated, mockPreview, guilds } = await parent();
    const defaultGuild = guilds[0];
    if (authenticated && !mockPreview && defaultGuild)
        redirect(303, resolve('/g/[guildId]', { guildId: defaultGuild.id }));
    return {};
};
