import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getMockMe } from '#lib/mocks/me.ts';
import { listMyRiotAccounts } from '#lib/server/accounts/queries.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { getDb } from '#lib/server/db/index.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

// Riot 계정 연결은 서버 운영자가 서버 관리에서 하므로 이 화면에는 쓰기 action이 없다.
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { user } = await parent();
	if (dev && url.searchParams.get('mock') === '1') {
		if (!user) error(401, '로그인이 필요합니다.');
		const { riotAccounts } = getMockMe(url.searchParams.get('preview'));
		return { me: user, groups: riotAccounts.length ? [{ guildId: 'devGuild001', guildName: '개발 서버', riotAccounts }] : [] };
	}
	try {
		const actor = requireUser(locals.actor);
		if (!locals.user) error(401, '로그인이 필요합니다.');
		return { me: locals.user, groups: await listMyRiotAccounts(getDb(), actor) };
	} catch (cause) { routeError(cause); }
};
