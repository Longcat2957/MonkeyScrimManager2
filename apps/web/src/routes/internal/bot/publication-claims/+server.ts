import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { claimPublication } from '#lib/server/discord/publications.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';

export const POST: RequestHandler = ({ request }) =>
    botResponse(request, async () => {
        const input = await botJson<{ workerId: string }>(request, ['workerId']);
        return { publications: await claimPublication(getDb(), input.workerId) };
    });
