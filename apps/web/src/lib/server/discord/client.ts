const API_BASE = 'https://discord.com/api/v10';
const MAX_GUILDS = 1_000;

export class DiscordError extends Error {
    readonly status: 429 | 502 | 503 | 504;
    readonly retryAfterSeconds?: number;

    constructor(status: DiscordError['status'], message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = 'DiscordError';
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export type DiscordGuildSummary = { id: string; name: string; iconHash: string | null };
export type DiscordRole = { id: string; permissions: bigint };
export type DiscordGuildRole = DiscordRole & { name: string; position: number; managed: boolean };
export type DiscordGuild = DiscordGuildSummary & { ownerId: string; roles: DiscordRole[] };
export type DiscordPermissionOverwrite = { id: string; type: 0 | 1; allow: bigint; deny: bigint };
export type DiscordGuildChannel = {
    id: string;
    type: 0 | 4 | 5;
    name: string;
    position: number;
    parentId: string | null;
    overwrites: DiscordPermissionOverwrite[];
};
export type DiscordMember = {
    user: { id: string; username: string; globalName: string | null; avatarHash: string | null };
    roleIds: string[];
    communicationDisabledUntil?: string | null;
};

export function isDiscordId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        /^[1-9]\d{0,19}$/.test(value) &&
        BigInt(value) <= 18_446_744_073_709_551_615n
    );
}

function invalidResponse(): never {
    throw new DiscordError(502, 'Discord에서 올바른 서버 정보를 받지 못했어요');
}

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidResponse();
    return value as Record<string, unknown>;
}

function id(value: unknown): string {
    if (!isDiscordId(value)) invalidResponse();
    return value;
}

function name(value: unknown, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) invalidResponse();
    return value;
}

function hash(value: unknown): string | null {
    if (value === null) return null;
    if (typeof value !== 'string' || !/^(?:a_)?[a-f0-9]{32}$/.test(value)) invalidResponse();
    return value;
}

function permissions(value: unknown): bigint {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,39})$/.test(value)) invalidResponse();
    return BigInt(value);
}

function position(value: unknown): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2_147_483_647)
        invalidResponse();
    return value;
}

function guildRole(value: unknown): DiscordGuildRole {
    const role = record(value);
    if (typeof role.managed !== 'boolean') invalidResponse();
    return {
        id: id(role.id),
        permissions: permissions(role.permissions),
        name: name(role.name, 100),
        position: position(role.position),
        managed: role.managed
    };
}

function guildChannels(value: unknown, guildId: string): DiscordGuildChannel[] {
    if (!Array.isArray(value) || value.length > 1_000) invalidResponse();
    const seen = new Set<string>();
    const result: DiscordGuildChannel[] = [];
    for (const entry of value) {
        const item = record(entry);
        const channelId = id(item.id);
        if (seen.has(channelId) || item.guild_id !== guildId || !Number.isSafeInteger(item.type))
            invalidResponse();
        seen.add(channelId);
        // 게시 채널과 그 카테고리만 보관하며 포럼·스레드·음성 채널은 선택지에서 제외한다.
        if (item.type !== 0 && item.type !== 4 && item.type !== 5) continue;
        if (!Array.isArray(item.permission_overwrites) || item.permission_overwrites.length > 1_000)
            invalidResponse();
        const overwrites = item.permission_overwrites.map((value): DiscordPermissionOverwrite => {
            const overwrite = record(value);
            if (overwrite.type !== 0 && overwrite.type !== 1) invalidResponse();
            return {
                id: id(overwrite.id),
                type: overwrite.type,
                allow: permissions(overwrite.allow),
                deny: permissions(overwrite.deny)
            };
        });
        if (
            new Set(overwrites.map((overwrite) => `${overwrite.type}:${overwrite.id}`)).size !==
            overwrites.length
        )
            invalidResponse();
        result.push({
            id: channelId,
            type: item.type,
            name: name(item.name, 100),
            position: position(item.position),
            parentId: item.parent_id == null ? null : id(item.parent_id),
            overwrites
        });
    }
    return result;
}

function guildSummary(value: unknown): DiscordGuildSummary {
    const item = record(value);
    return { id: id(item.id), name: name(item.name, 100), iconHash: hash(item.icon) };
}

function guild(value: unknown, expectedId: string): DiscordGuild {
    const item = record(value);
    const summary = guildSummary(item);
    if (summary.id !== expectedId || !Array.isArray(item.roles) || item.roles.length > 1_000)
        invalidResponse();
    const roles = item.roles.map((value) => {
        const role = record(value);
        return { id: id(role.id), permissions: permissions(role.permissions) };
    });
    if (
        new Set(roles.map((role) => role.id)).size !== roles.length ||
        !roles.some((role) => role.id === summary.id)
    ) {
        invalidResponse();
    }
    return { ...summary, ownerId: id(item.owner_id), roles };
}

function member(value: unknown, expectedUserId: string): DiscordMember {
    const item = record(value);
    const user = record(item.user);
    if (user.id !== expectedUserId || !Array.isArray(item.roles) || item.roles.length > 1_000)
        invalidResponse();
    const roleIds = item.roles.map(id);
    if (new Set(roleIds).size !== roleIds.length) invalidResponse();
    const communicationDisabledUntil = item.communication_disabled_until;
    if (
        communicationDisabledUntil !== undefined &&
        communicationDisabledUntil !== null &&
        (typeof communicationDisabledUntil !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
                communicationDisabledUntil
            ) ||
            !Number.isFinite(Date.parse(communicationDisabledUntil)) ||
            new Date(`${communicationDisabledUntil.slice(0, 10)}T00:00:00.000Z`)
                .toISOString()
                .slice(0, 10) !== communicationDisabledUntil.slice(0, 10))
    )
        invalidResponse();
    return {
        user: {
            id: id(user.id),
            username: name(user.username, 32),
            globalName: user.global_name == null ? null : name(user.global_name, 32),
            avatarHash: hash(user.avatar)
        },
        roleIds,
        ...(communicationDisabledUntil === undefined ? {} : { communicationDisabledUntil })
    };
}

/** 웹의 길드 접근 확인에 필요한 읽기만 제공하며 토큰이나 원본 오류를 밖으로 내보내지 않는다. */
export function createDiscordClient(options: { token: string; fetch?: typeof fetch; timeoutMs?: number }) {
    const token = options.token.trim();
    const fetcher = options.fetch ?? fetch;
    const timeoutMs = options.timeoutMs ?? 8_000;

    async function request(path: string, allowMissing = false): Promise<unknown> {
        if (!token || /\s/.test(token)) throw new DiscordError(503, 'Discord 연동을 사용할 수 없어요');
        const signal = AbortSignal.timeout(timeoutMs);
        try {
            const response = await fetcher(`${API_BASE}${path}`, {
                headers: { Authorization: `Bot ${token}`, Accept: 'application/json' },
                signal,
                redirect: 'error'
            });
            if (allowMissing && response.status === 404) return undefined;
            if (response.status === 429) {
                const retryAfter = Number(response.headers.get('Retry-After'));
                throw new DiscordError(
                    429,
                    'Discord 요청이 많아요. 잠시 후 다시 시도해 주세요',
                    Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined
                );
            }
            if (response.status === 401 || response.status === 403) {
                throw new DiscordError(503, 'Discord 서버 정보를 확인할 수 없어요');
            }
            if (!response.ok) throw new DiscordError(502, 'Discord 서버 정보를 가져오지 못했어요');
            const body = await response.text();
            if (body.length > 2_000_000) invalidResponse();
            try {
                return JSON.parse(body) as unknown;
            } catch {
                invalidResponse();
            }
        } catch (error) {
            if (error instanceof DiscordError) throw error;
            if (signal.aborted) throw new DiscordError(504, 'Discord 응답이 늦어지고 있어요');
            throw new DiscordError(502, 'Discord에 연결하지 못했어요');
        }
    }

    return {
        async listGuilds(): Promise<DiscordGuildSummary[]> {
            const guilds: DiscordGuildSummary[] = [];
            const seen = new Set<string>();
            let after: string | undefined;
            while (guilds.length <= MAX_GUILDS) {
                const value = await request(`/users/@me/guilds?limit=200${after ? `&after=${after}` : ''}`);
                if (!Array.isArray(value) || value.length > 200) invalidResponse();
                const page = value.map(guildSummary);
                for (const item of page) {
                    if (seen.has(item.id) || (after && BigInt(item.id) <= BigInt(after))) invalidResponse();
                    seen.add(item.id);
                    guilds.push(item);
                }
                if (guilds.length > MAX_GUILDS) break;
                if (page.length < 200) return guilds;
                after = page.reduce(
                    (highest, item) => (BigInt(item.id) > BigInt(highest) ? item.id : highest),
                    page[0].id
                );
            }
            // 일부 목록으로 탈퇴를 판단하지 않도록 조회 상한을 넘으면 전체 동기화를 실패시킨다.
            throw new DiscordError(503, 'Discord 서버 목록을 모두 확인할 수 없어요');
        },
        async getGuild(guildId: string): Promise<DiscordGuild | null> {
            if (!isDiscordId(guildId)) throw new DiscordError(502, 'Discord 서버 식별자가 올바르지 않아요');
            const value = await request(`/guilds/${guildId}`, true);
            return value === undefined ? null : guild(value, guildId);
        },
        async getMember(guildId: string, userId: string): Promise<DiscordMember | null> {
            if (!isDiscordId(guildId) || !isDiscordId(userId))
                throw new DiscordError(502, 'Discord 멤버 식별자가 올바르지 않아요');
            const value = await request(`/guilds/${guildId}/members/${userId}`, true);
            return value === undefined ? null : member(value, userId);
        },
        async listRoles(guildId: string): Promise<DiscordGuildRole[]> {
            if (!isDiscordId(guildId)) throw new DiscordError(502, 'Discord 서버 식별자가 올바르지 않아요');
            const value = await request(`/guilds/${guildId}/roles`);
            if (!Array.isArray(value) || value.length > 1_000) invalidResponse();
            const roles = value.map(guildRole);
            if (
                new Set(roles.map((role) => role.id)).size !== roles.length ||
                !roles.some((role) => role.id === guildId)
            )
                invalidResponse();
            return roles;
        },
        async listChannels(guildId: string): Promise<DiscordGuildChannel[]> {
            if (!isDiscordId(guildId)) throw new DiscordError(502, 'Discord 서버 식별자가 올바르지 않아요');
            return guildChannels(await request(`/guilds/${guildId}/channels`), guildId);
        },
        async getMessage(
            channelId: string,
            messageId: string
        ): Promise<{ id: string; channelId: string; authorId: string; components: unknown[] } | null> {
            if (!isDiscordId(channelId) || !isDiscordId(messageId))
                throw new DiscordError(502, '메시지 식별자가 올바르지 않아요');
            const value = await request(`/channels/${channelId}/messages/${messageId}`, true);
            if (value === undefined) return null;
            const message = record(value);
            const author = record(message.author);
            if (
                message.id !== messageId ||
                message.channel_id !== channelId ||
                !Array.isArray(message.components)
            )
                invalidResponse();
            return {
                id: id(message.id),
                channelId: id(message.channel_id),
                authorId: id(author.id),
                components: message.components
            };
        },
        async getCurrentUserId(): Promise<string> {
            const user = record(await request('/users/@me'));
            if (user.bot !== true) invalidResponse();
            return id(user.id);
        }
    };
}

type FullDiscordClient = ReturnType<typeof createDiscordClient>;
export type DiscordClient = Pick<FullDiscordClient, 'listGuilds' | 'getGuild' | 'getMember'> &
    Partial<Pick<FullDiscordClient, 'listRoles' | 'listChannels' | 'getCurrentUserId' | 'getMessage'>>;
