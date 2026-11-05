import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { mutateBotRegistration } from '#lib/server/discord/bot-service.ts';
import { botResponse, botJson } from '#lib/server/discord/bot-http.ts';
import { DomainError } from '#lib/server/errors.ts';
import type { BotRegistrationInput } from '../../../../../../../../../../../shared/bot-api.js';

const keys = ['actorId', 'interactionId', 'action', 'registrationId', 'riotAccountId', 'positions'];
export const POST: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotRegistrationInput>(request, keys);
        if (input.action !== 'create')
            throw new DomainError('INVALID_INPUT', 'POST는 신규 신청에 사용해 주세요');
        return mutateBotRegistration(getDb(), params.guildId!, params.scrimId!, input);
    });
export const PATCH: RequestHandler = ({ request, params }) =>
    botResponse(request, async () => {
        const input = await botJson<BotRegistrationInput>(request, keys);
        if (input.action !== 'update' && input.action !== 'withdraw')
            throw new DomainError('INVALID_INPUT', 'PATCH는 신청 수정과 철회에 사용해 주세요');
        return mutateBotRegistration(getDb(), params.guildId!, params.scrimId!, input);
    });
