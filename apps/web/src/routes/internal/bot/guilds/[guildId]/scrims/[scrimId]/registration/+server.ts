import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { getBotRegistration } from '#lib/server/discord/bot-service.ts';
import { botResponse } from '#lib/server/discord/bot-http.ts';

export const GET: RequestHandler = ({ request, params, url }) =>
    botResponse(request, () =>
        getBotRegistration(getDb(), params.guildId!, params.scrimId!, url.searchParams.get('actorId') ?? '')
    );
