import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getMockMe } from '#lib/mocks/me.ts';
import type { PageServerLoad } from './$types';

// TODO: 인증을 연결하면 세션 사용자로 조회하고, 비로그인은 로그인으로 보낸다.
function requireDev() {
	if (!dev) error(401, '로그인이 필요합니다.');
}

// Riot 계정 연결은 서버 운영자가 서버 관리에서 하므로 이 화면에는 쓰기 action이 없다.
export const load: PageServerLoad = async ({ parent, url }) => {
	requireDev();
	const { user } = await parent();
	if (!user) error(401, '로그인이 필요합니다.');
	return { me: user, ...getMockMe(url.searchParams.get('preview')) };
};
