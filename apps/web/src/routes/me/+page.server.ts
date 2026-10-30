import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { parseRiotId, RIOT_ID_FORMAT_ERROR } from '#lib/features/me/riot-id.ts';
import type { PrivacyKey } from '#lib/features/me/types.ts';
import {
	getMockMe,
	linkMockRiotAccount,
	lookupMockRiotAccount,
	setMockPrimary,
	setMockPrivacy,
	unlinkMockRiotAccount
} from '#lib/mocks/me.ts';
import type { Actions, PageServerLoad } from './$types';

const PRIVACY_KEYS: PrivacyKey[] = ['profilePublic', 'showRiotId'];

// TODO: 인증을 연결하면 세션 사용자로 조회하고, 비로그인은 로그인으로 보낸다.
function requireDev() {
	if (!dev) error(401, '로그인이 필요합니다.');
}

export const load: PageServerLoad = async ({ parent, url }) => {
	requireDev();
	const { user } = await parent();
	if (!user) error(401, '로그인이 필요합니다.');
	return { me: user, ...getMockMe(url.searchParams.get('preview')) };
};

export const actions: Actions = {
	lookup: async ({ request }) => {
		requireDev();
		const riotId = String((await request.formData()).get('riotId') ?? '');
		const parsed = parseRiotId(riotId);
		if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
		const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
		if ('status' in result) return fail(result.status, { riotIdError: result.message });
		return { lookup: result };
	},

	link: async ({ request }) => {
		requireDev();
		const data = await request.formData();
		const parsed = parseRiotId(String(data.get('riotId') ?? ''));
		if (!parsed) return fail(400, { riotIdError: RIOT_ID_FORMAT_ERROR });
		// 조회 단계의 결과를 그대로 믿지 않고 연결 직전에 다시 확인한다.
		const result = await lookupMockRiotAccount(parsed.gameName, parsed.tagLine);
		if ('status' in result) return fail(result.status, { riotIdError: result.message });
		await linkMockRiotAccount(result);
	},

	primary: async ({ request }) => {
		requireDev();
		await setMockPrimary(String((await request.formData()).get('id')));
	},

	unlink: async ({ request }) => {
		requireDev();
		const failure = await unlinkMockRiotAccount(String((await request.formData()).get('id')));
		if (failure) return fail(failure.status, { message: failure.message });
	},

	privacy: async ({ request }) => {
		requireDev();
		const data = await request.formData();
		const key = data.get('key') as PrivacyKey;
		if (!PRIVACY_KEYS.includes(key)) return fail(400, { message: '알 수 없는 설정이에요' });
		await setMockPrivacy(key, data.get('value') === 'true');
	}
};
