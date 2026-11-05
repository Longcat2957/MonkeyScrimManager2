import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { completePublication } from '#lib/server/discord/publications.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import type { BotPublicationResult } from '../../../../../../../../shared/bot-api.js';

export const PATCH: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotPublicationResult>(request, [
            'leaseToken',
            'revision',
            'outcome',
            'messageId',
            'errorCode',
            'retryAfterSeconds'
        ]);
        await completePublication(getDb(), params.id!, input);
        return { ok: true };
    });
