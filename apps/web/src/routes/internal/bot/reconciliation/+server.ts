import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import { reconcileBotGuilds } from '#lib/server/discord/bot-service.ts';

export const POST: RequestHandler = ({ request }) =>
    botResponse(request, async () => {
        await botJson<Record<string, never>>(request, []);
        await reconcileBotGuilds(getDb());
        return { ok: true };
    });
