import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { initializeBotGuild } from '#lib/server/discord/bot-service.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';

export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<{ actorId: string; interactionId: string }>(request, [
            'actorId',
            'interactionId'
        ]);
        return initializeBotGuild(getDb(), params.guildId!, input);
    });
