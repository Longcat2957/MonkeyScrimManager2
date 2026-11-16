import type { RequestHandler } from './$types';
import type { BotManualRegistrationInput } from '../../../../../../../../../../../shared/bot-api.js';
import { getDb } from '#lib/server/db/index.ts';
import { addBotParticipant, getBotManualRegistration } from '#lib/server/discord/bot-service.ts';
import { botJson, botResponse } from '#lib/server/discord/bot-http.ts';

export const GET: RequestHandler = ({ request, params, url }) =>
    botResponse(request, () =>
        getBotManualRegistration(
            getDb(),
            params.guildId!,
            params.scrimId!,
            url.searchParams.get('actorId') ?? ''
        )
    );

export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotManualRegistrationInput>(request, [
            'actorId',
            'interactionId',
            'userId'
        ]);
        return addBotParticipant(getDb(), params.guildId!, params.scrimId!, input);
    });
