import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { botResponse } from '#lib/server/discord/bot-http.ts';
import { listKnownBotMembers } from '#lib/server/discord/bot-service.ts';

export const GET: RequestHandler = ({ request, params, url }) =>
    botResponse(request, () =>
        listKnownBotMembers(getDb(), params.guildId!, url.searchParams.get('after') ?? undefined)
    );
