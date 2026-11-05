import { dev } from '$app/env';
import { error as httpError, fail, type RequestEvent } from '@sveltejs/kit';
import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
import type { GuildDiscordSettingKey } from '#lib/features/guild/types.ts';
import { getMockDiscord, isMockMember, listMockMembers, setMockDiscordSetting } from '#lib/mocks/admin.ts';
import {
    linkMockRiotAccount,
    lookupMockRiotAccount,
    setMockPrimary,
    unlinkMockRiotAccount
} from '#lib/mocks/me.ts';
import { findMockGuild, mockUser } from '#lib/mocks/session.ts';
import { listGuildMembers, lookupRiotAccount } from '#lib/server/accounts/queries.ts';
import { linkRiotAccount, setPrimaryRiotAccount, unlinkRiotAccount } from '#lib/server/accounts/service.ts';
import { getDb } from '#lib/server/db/index.ts';
import { DiscordError } from '#lib/server/discord/client.ts';
import { DomainError } from '#lib/server/errors.ts';
import { getGuildDiscordSettings, setGuildDiscordSetting } from '#lib/server/guild/settings.ts';
import { RiotError } from '#lib/server/riot/errors.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;
const isMockGuild = (guildId: string) => dev && (guildId === 'devGuild001' || guildId === 'devGuild002');
const field = (data: FormData, name: string) =>
    typeof data.get(name) === 'string' ? String(data.get(name)) : '';
const DISCORD_SETTING_KEYS: GuildDiscordSettingKey[] = [
    'operatorRoleId',
    'recruitmentChannelId',
    'entryChannelId',
    'resultChannelId'
];

function requireMockAdmin(guildId: string) {
    if (!findMockGuild(guildId)?.isAdmin) throw new DomainError('FORBIDDEN', '서버 관리자만 바꿀 수 있어요');
}

function expectedError(error: unknown, setHeaders: RequestEvent['setHeaders']) {
    if (!(error instanceof DomainError || error instanceof DiscordError || error instanceof RiotError))
        throw error;
    if ('retryAfterSeconds' in error && error.retryAfterSeconds !== undefined)
        setHeaders({ 'Retry-After': String(error.retryAfterSeconds) });
    const message =
        error instanceof RiotError
            ? error.status === 404
                ? 'Riot 계정을 찾을 수 없어요'
                : error.status === 429
                  ? '계정 조회가 많아요. 잠시 후 다시 시도해 주세요'
                  : 'Riot 계정을 조회하지 못했어요. 잠시 후 다시 시도해 주세요'
            : error.message;
    return { status: error.status, message };
}

async function runAction<T>(
    setHeaders: RequestEvent['setHeaders'],
    run: () => Promise<T>,
    riotIdField = false
) {
    try {
        return await run();
    } catch (error) {
        const failure = expectedError(error, setHeaders);
        return fail(failure.status, {
            message: failure.message,
            ...(riotIdField ? { riotIdError: failure.message } : {})
        });
    }
}

export const load: PageServerLoad = async ({ params, url, locals, setHeaders }) => {
    const tab = url.searchParams.get('tab') === 'discord' ? 'discord' : 'members';
    const q = (url.searchParams.get('q') ?? '').slice(0, 50);
    const requestedPage = Number(url.searchParams.get('page'));
    const page =
        Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 10_000
            ? requestedPage
            : 1;
    const pagination = { tab, q, page, pageSize: PAGE_SIZE };
    try {
        if (isMockGuild(params.guildId)) {
            requireMockAdmin(params.guildId);
            return {
                ...listMockMembers(params.guildId, { q, page, pageSize: PAGE_SIZE }),
                discord: getMockDiscord(params.guildId, mockUser.userId),
                ...pagination
            };
        }
        if (tab === 'discord') {
            return {
                members: [],
                total: 0,
                adminCount: 0,
                discord: await getGuildDiscordSettings(getDb(), locals.actor, params.guildId),
                ...pagination
            };
        }
        return {
            ...(await listGuildMembers(getDb(), locals.actor, params.guildId, {
                q,
                page,
                pageSize: PAGE_SIZE
            })),
            discord: null,
            ...pagination
        };
    } catch (error) {
        const failure = expectedError(error, setHeaders);
        httpError(failure.status, failure.message);
    }
};

function requireMockMember(guildId: string, userId: string) {
    if (!isMockMember(guildId, userId)) throw new DomainError('NOT_FOUND', '멤버를 찾을 수 없어요');
}

export const actions: Actions = {
    discord: async ({ request, params, locals, setHeaders }) =>
        runAction(setHeaders, async () => {
            const data = await request.formData();
            const key = field(data, 'key');
            if (isMockGuild(params.guildId)) {
                requireMockAdmin(params.guildId);
                if (!DISCORD_SETTING_KEYS.includes(key as GuildDiscordSettingKey))
                    return fail(400, { message: '바꿀 수 없는 설정이에요' });
                const failure = await setMockDiscordSetting(
                    params.guildId,
                    mockUser.userId,
                    key as GuildDiscordSettingKey,
                    field(data, 'value') || null
                );
                return failure ? fail(failure.status, { message: failure.message }) : undefined;
            }
            await setGuildDiscordSetting(
                getDb(),
                locals.actor,
                params.guildId,
                key,
                field(data, 'value') || null
            );
        }),

    lookup: async ({ request, params, locals, setHeaders }) =>
        runAction(
            setHeaders,
            async () => {
                const riotId = field(await request.formData(), 'riotId');
                if (isMockGuild(params.guildId)) {
                    requireMockAdmin(params.guildId);
                    const parsed = parseRiotId(riotId);
                    if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
                    const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
                    if ('status' in result) return fail(result.status, { riotIdError: result.message });
                    return { lookup: result };
                }
                return { lookup: await lookupRiotAccount(getDb(), locals.actor, params.guildId, riotId) };
            },
            true
        ),

    link: async ({ request, params, locals, setHeaders }) =>
        runAction(
            setHeaders,
            async () => {
                const data = await request.formData();
                const userId = field(data, 'userId');
                const riotId = field(data, 'riotId');
                if (isMockGuild(params.guildId)) {
                    requireMockAdmin(params.guildId);
                    requireMockMember(params.guildId, userId);
                    const parsed = parseRiotId(riotId);
                    if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
                    const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
                    if ('status' in result) return fail(result.status, { riotIdError: result.message });
                    await linkMockRiotAccount(userId, result);
                    return;
                }
                await linkRiotAccount(getDb(), locals.actor, params.guildId, userId, riotId);
            },
            true
        ),

    primary: async ({ request, params, locals, setHeaders }) =>
        runAction(setHeaders, async () => {
            const data = await request.formData();
            const userId = field(data, 'userId');
            if (isMockGuild(params.guildId)) {
                requireMockAdmin(params.guildId);
                requireMockMember(params.guildId, userId);
                const failure = await setMockPrimary(userId, field(data, 'id'));
                return failure ? fail(failure.status, { message: failure.message }) : undefined;
            }
            await setPrimaryRiotAccount(getDb(), locals.actor, params.guildId, userId, field(data, 'id'));
        }),

    unlink: async ({ request, params, locals, setHeaders }) =>
        runAction(setHeaders, async () => {
            const data = await request.formData();
            const userId = field(data, 'userId');
            if (isMockGuild(params.guildId)) {
                requireMockAdmin(params.guildId);
                requireMockMember(params.guildId, userId);
                const failure = await unlinkMockRiotAccount(userId, field(data, 'id'));
                return failure ? fail(failure.status, { message: failure.message }) : undefined;
            }
            await unlinkRiotAccount(getDb(), locals.actor, params.guildId, userId, field(data, 'id'));
        })
};
