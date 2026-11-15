import type { RequestHandler } from './$types';
import type { BotRotateSeasonInput } from '../../../../../../../../../shared/bot-api.js';
import { getDb } from '#lib/server/db/index.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import { getBotSeasons, rotateBotSeason } from '#lib/server/discord/bot-seasons.ts';

export const GET: RequestHandler = ({ request, params, url }) =>
    botResponse(request, () =>
        getBotSeasons(getDb(), params.guildId!, url.searchParams.get('actorId') ?? '')
    );

export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotRotateSeasonInput>(request, [
            'actorId',
            'interactionId',
            'expectedCurrentSeasonId',
            'name',
            'confirm'
        ]);
        return rotateBotSeason(getDb(), params.guildId!, input);
    });
