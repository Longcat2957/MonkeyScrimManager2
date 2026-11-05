import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { synchronizeBotGuild } from '#lib/server/discord/bot-service.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import type { BotGuildSyncInput } from '../../../../../../../../../shared/bot-api.js';

export const PUT: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotGuildSyncInput>(request, ['state', 'memberId', 'memberRemoved']);
        await synchronizeBotGuild(getDb(), params.guildId!, input);
        return { ok: true };
    });
