import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { retryBotPublication } from '#lib/server/discord/bot-service.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';

export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<{
            actorId: string;
            interactionId: string;
            messageId?: string;
            confirmAbsent?: boolean;
        }>(request, ['actorId', 'interactionId', 'messageId', 'confirmAbsent']);
        await retryBotPublication(getDb(), params.guildId!, params.id!, input);
        return { ok: true };
    });
