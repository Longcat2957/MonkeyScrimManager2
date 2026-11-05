import type {
    DiscordChannel,
    DiscordRole,
    GuildDiscordSettingKey,
    GuildDiscordSettings
} from '#lib/features/guild/types.ts';
import { listMockRiotAccounts } from './me.ts';
import type { MockFailure } from './scrims.ts';
import { mockPlayers } from './ranking.ts';
import { mockUser } from './session.ts';

// 서버 관리 화면의 멤버·Discord 연동 설정(가변, 재시작 시 초기화). 서비스에 연결된 멤버만 담는다. Riot 계정은 me.ts 저장소에서 붙인다.
// roles·manageGuild는 봇이 Discord에서 동기화한다고 가정한 값이다.
type Member = { userId: string; displayName: string; roles: string[]; manageGuild: boolean };
type GuildDiscord = { roles: DiscordRole[]; channels: DiscordChannel[]; settings: GuildDiscordSettings };

const members = new Map<string, Member[]>([
    [
        'devGuild001',
        mockPlayers.slice(0, 30).map(({ userId, displayName }) => ({
            userId,
            displayName,
            roles:
                userId === mockUser.userId
                    ? ['r-ops', 'r-member']
                    : userId === 'u03'
                      ? ['r-staff', 'r-member']
                      : ['r-member'],
            // 서버장처럼 Discord의 서버 관리 권한이 있는 멤버
            manageGuild: userId === 'u02'
        }))
    ]
]);

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

const wait = () => new Promise((resolve) => setTimeout(resolve, 200));

// 서버 관리자는 Discord 서버 관리 권한이 있거나 운영자 역할을 가진 멤버다.
function isAdmin(member: Member, operatorRoleId: string | null) {
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
    return {
        members: filtered
            .slice(start, start + options.pageSize)
            .map((member) => ({ ...member, riotAccounts: listMockRiotAccounts(member.userId) })),
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
    await wait();
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
    guild.settings[key] = value;
    return null;
}

/** 서버 멤버인지 확인한다. Riot 계정 연결 대상은 이 서버 멤버로 제한한다. */
export function isMockMember(guildId: string, userId: string) {
    return Boolean(members.get(guildId)?.some((member) => member.userId === userId));
}
