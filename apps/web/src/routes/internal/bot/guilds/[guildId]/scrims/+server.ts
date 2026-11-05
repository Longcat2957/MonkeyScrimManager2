import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { createBotScrim } from '#lib/server/discord/bot-service.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import type { BotCreateScrimInput } from '../../../../../../../../../shared/bot-api.js';

export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotCreateScrimInput>(request, [
            'actorId',
            'interactionId',
            'title',
            'scheduledAt',
            'teamCount',
            'reserveCapacity',
            'hardFearless'
        ]);
        return createBotScrim(getDb(), params.guildId!, input);
    });
