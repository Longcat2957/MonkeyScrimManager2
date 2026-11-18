import type {
    DiscordChannel,
    DiscordRole,
    GuildDiscordSettingKey,
    GuildDiscordSettings
} from '#lib/features/guild/types.ts';
import { listMockRiotAccounts } from './me.ts';
import type { GuildAuditEntry, GuildAuditKind } from '#lib/features/guild/audit.ts';
import type { MockFailure } from './scrims.ts';
import { mockMembers as members, type MockMember } from './members.ts';
import { mockAuctionPurchaseTotals } from './teams.ts';
import { mockAvatarUrl } from './avatar.ts';
import { mockLatency } from './latency.ts';

type GuildDiscord = { roles: DiscordRole[]; channels: DiscordChannel[]; settings: GuildDiscordSettings };

const discord = new Map<string, GuildDiscord>([
    [
        'devGuild001',
        {
            roles: [
                { id: 'r-ops', name: '운영진' },
                { id: 'r-staff', name: '내전 스태프' },
                { id: 'r-gold', name: '골드 이상' },
                { id: 'r-member', name: '멤버' }
            ],
            channels: [
                { id: 'c-notice', name: '공지사항', category: '안내', botCanPost: false },
                { id: 'c-recruit', name: '내전-모집', category: '내전', botCanPost: true },
                { id: 'c-entry', name: '내전-엔트리', category: '내전', botCanPost: true },
                { id: 'c-result', name: '내전-결과', category: '내전', botCanPost: true },
                { id: 'c-scrim-chat', name: '내전-잡담', category: '내전', botCanPost: true },
                { id: 'c-general', name: '일반', category: null, botCanPost: true }
            ],
            settings: {
                operatorRoleId: 'r-ops',
                recruitmentChannelId: 'c-recruit',
                entryChannelId: 'c-entry',
                resultChannelId: null
            }
        }
    ]
]);

const auditEntries = new Map<string, GuildAuditEntry[]>();

function mockIdentity(guildId: string, userId: string) {
    return {
        userId,
        displayName: members.get(guildId)?.find((member) => member.userId === userId)?.displayName ?? userId
    };
}

function appendAudit(guildId: string, entry: Omit<GuildAuditEntry, 'id' | 'occurredAt'>) {
    const rows = auditEntries.get(guildId) ?? [];
    rows.unshift({ ...entry, id: crypto.randomUUID(), occurredAt: new Date().toISOString() });
    auditEntries.set(guildId, rows);
}

/** 개발 샘플에서도 성공한 실제 조작만 이력으로 보여 준다. */
export function listMockGuildAudit(guildId: string, page: number, pageSize: number) {
    const rows = auditEntries.get(guildId) ?? [];
    return {
        entries: structuredClone(rows.slice((page - 1) * pageSize, page * pageSize)),
        total: rows.length
    };
}

export async function auditMockAccountChange(
    guildId: string,
    actorId: string,
    userId: string,
    kind: Extract<GuildAuditKind, `riot_account_${string}`>,
    accountId: string | null,
    run: () => Promise<MockFailure | null | void>
) {
    const before = listMockRiotAccounts(userId);
    const failure = await run();
    if (failure) return failure;
    const after = listMockRiotAccounts(userId);
    if (JSON.stringify(before) === JSON.stringify(after)) return null;
    const account = accountId
        ? before.find((entry) => entry.id === accountId)
        : after.find((entry) => !before.some((previous) => previous.id === entry.id));
    const primary = (rows: typeof before) => {
        const entry = rows.find((row) => row.isPrimary);
        return entry ? { id: entry.id, riotId: `${entry.gameName}#${entry.tagLine}` } : null;
    };
    appendAudit(guildId, {
        kind,
        actor: mockIdentity(guildId, actorId),
        target: mockIdentity(guildId, userId),
        account: account ? { id: account.id, gameName: account.gameName, tagLine: account.tagLine } : null,
        primary: { before: primary(before), after: primary(after) },
        setting: null
    });
    return null;
}

// 서버 관리자는 Discord 서버 관리 권한이 있거나 운영자 역할을 가진 멤버다.
function isAdmin(member: MockMember, operatorRoleId: string | null) {
    return member.manageGuild || (operatorRoleId !== null && member.roles.includes(operatorRoleId));
}

export function listMockMembers(guildId: string, options: { q: string; page: number; pageSize: number }) {
    const all = members.get(guildId) ?? [];
    const operatorRoleId = discord.get(guildId)?.settings.operatorRoleId ?? null;
    const q = options.q.trim().toLowerCase();
    // 관리자를 먼저, 같으면 이름 순으로 보여 준다.
    const filtered = (q ? all.filter((member) => member.displayName.toLowerCase().includes(q)) : all)
        .map((member) => ({
            userId: member.userId,
            displayName: member.displayName,
            isAdmin: isAdmin(member, operatorRoleId)
        }))
        .sort(
            (a, b) =>
                Number(b.isAdmin) - Number(a.isAdmin) || a.displayName.localeCompare(b.displayName, 'ko')
        );
    const start = (options.page - 1) * options.pageSize;
    const totals = mockAuctionPurchaseTotals(guildId);
    return {
        members: filtered.slice(start, start + options.pageSize).map((member) => {
            const total = totals.get(member.userId);
            return {
                ...member,
                auctionAveragePrice: total ? total.sum / total.count : null,
                auctionPurchaseCount: total?.count ?? 0,
                iconUrl: mockAvatarUrl(member.userId),
                riotAccounts: listMockRiotAccounts(member.userId)
            };
        }),
        total: filtered.length,
        adminCount: all.filter((member) => isAdmin(member, operatorRoleId)).length
    };
}

export function getMockDiscord(guildId: string, actorId: string) {
    const guild = discord.get(guildId);
    if (!guild) return null;
    const actor = members.get(guildId)?.find((member) => member.userId === actorId);
    return {
        roles: guild.roles,
        channels: guild.channels,
        settings: { ...guild.settings },
        // 바꾼 뒤에도 내가 관리자로 남아야 하므로, 서버 관리 권한이 없으면 내가 가진 역할만 고를 수 있다.
        actorRoleIds: actor?.manageGuild ? null : (actor?.roles ?? [])
    };
}

/** Discord 연동 설정 하나를 바꾼다. 값이 null이면 설정을 비운다. */
export async function setMockDiscordSetting(
    guildId: string,
    actorId: string,
    key: GuildDiscordSettingKey,
    value: string | null
): Promise<MockFailure | null> {
    await mockLatency.wait(200);
    const guild = discord.get(guildId);
    const actor = members.get(guildId)?.find((member) => member.userId === actorId);
    if (!guild || !actor || !isAdmin(actor, guild.settings.operatorRoleId))
        return { status: 403, message: '서버 관리자만 바꿀 수 있어요' };
    if (key === 'operatorRoleId') {
        if (value !== null && !guild.roles.some((role) => role.id === value))
            return { status: 404, message: '역할을 찾을 수 없어요' };
        if (!isAdmin(actor, value))
            return { status: 409, message: '이 역할로 바꾸면 내 관리 권한이 사라져요' };
    } else if (value !== null) {
        const channel = guild.channels.find((item) => item.id === value);
        if (!channel) return { status: 404, message: '채널을 찾을 수 없어요' };
        if (!channel.botCanPost) return { status: 409, message: '봇이 이 채널에 글을 쓸 수 없어요' };
    }
    const previous = guild.settings[key];
    guild.settings[key] = value;
    if (previous !== value) {
        const name = (id: string | null) =>
            (key === 'operatorRoleId' ? guild.roles : guild.channels).find((item) => item.id === id)?.name ??
            null;
        appendAudit(guildId, {
            kind: 'discord_setting_changed',
            actor: mockIdentity(guildId, actorId),
            target: null,
            account: null,
            primary: null,
            setting: {
                key,
                before: previous ? { id: previous, name: name(previous) } : null,
                after: value ? { id: value, name: name(value) } : null
            }
        });
    }
    return null;
}

/** 서버 멤버인지 확인한다. Riot 계정 연결 대상은 이 서버 멤버로 제한한다. */
export function isMockMember(guildId: string, userId: string) {
    return Boolean(members.get(guildId)?.some((member) => member.userId === userId));
}
