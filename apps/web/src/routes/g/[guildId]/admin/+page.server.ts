import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
import type { GuildDiscordSettingKey } from '#lib/features/guild/types.ts';
import { getMockDiscord, isMockMember, listMockMembers, setMockDiscordSetting } from '#lib/mocks/admin.ts';
import { linkMockRiotAccount, lookupMockRiotAccount, setMockPrimary, unlinkMockRiotAccount } from '#lib/mocks/me.ts';
import { mockUser } from '#lib/mocks/session.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;

// TODO: 인증·권한이 연결되면 로그인 사용자와 서버 관리자 여부를 실제로 확인한다.
function requireDev() {
	if (!dev) error(404, '서버를 찾을 수 없습니다.');
}

export const load: PageServerLoad = async ({ parent, params, url }) => {
	requireDev();
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	if (!guild.isAdmin) error(403, '서버 관리자만 볼 수 있어요.');
	const tab = url.searchParams.get('tab') === 'discord' ? 'discord' : 'members';
	const q = (url.searchParams.get('q') ?? '').slice(0, 50);
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
	return {
		...listMockMembers(params.guildId, { q, page, pageSize: PAGE_SIZE }),
		discord: getMockDiscord(params.guildId, mockUser.userId),
		tab,
		q,
		page,
		pageSize: PAGE_SIZE
	};
};

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

const DISCORD_SETTING_KEYS: GuildDiscordSettingKey[] = ['operatorRoleId', 'recruitmentChannelId', 'entryChannelId', 'resultChannelId'];

// Riot 계정 작업은 이 서버 멤버에게만 한다.
function requireMember(guildId: string, userId: string) {
	return isMockMember(guildId, userId) ? null : fail(404, { message: '멤버를 찾을 수 없어요' });
}

export const actions: Actions = {
	discord: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const key = field(data, 'key');
		if (!DISCORD_SETTING_KEYS.includes(key as GuildDiscordSettingKey)) return fail(400, { message: '바꿀 수 없는 설정이에요' });
		const failure = await setMockDiscordSetting(params.guildId, mockUser.userId, key as GuildDiscordSettingKey, field(data, 'value') || null);
		return failure ? fail(failure.status, { message: failure.message }) : undefined;
	},

	lookup: async ({ request }) => {
		requireDev();
		const parsed = parseRiotId(field(await request.formData(), 'riotId'));
		if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
		const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
		if ('status' in result) return fail(result.status, { riotIdError: result.message });
		return { lookup: result };
	},

	link: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const userId = field(data, 'userId');
		const denied = requireMember(params.guildId, userId);
		if (denied) return denied;
		const parsed = parseRiotId(field(data, 'riotId'));
		if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
		// 조회 단계의 결과를 그대로 믿지 않고 연결 직전에 다시 확인한다.
		const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
		if ('status' in result) return fail(result.status, { riotIdError: result.message });
		await linkMockRiotAccount(userId, result);
	},

	primary: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const denied = requireMember(params.guildId, field(data, 'userId'));
		if (denied) return denied;
		const failure = await setMockPrimary(field(data, 'userId'), field(data, 'id'));
		return failure ? fail(failure.status, { message: failure.message }) : undefined;
	},

	unlink: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const denied = requireMember(params.guildId, field(data, 'userId'));
		if (denied) return denied;
		const failure = await unlinkMockRiotAccount(field(data, 'userId'), field(data, 'id'));
		return failure ? fail(failure.status, { message: failure.message }) : undefined;
	}
};
