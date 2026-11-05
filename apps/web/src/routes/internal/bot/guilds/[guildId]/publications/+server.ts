import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { listFailedPublications } from '#lib/server/discord/bot-service.ts';
import { botResponse } from '#lib/server/discord/bot-http.ts';

export const GET: RequestHandler = ({ request, params, url }) =>
    botResponse(request, () =>
        listFailedPublications(getDb(), params.guildId!, url.searchParams.get('actorId') ?? '')
    );
