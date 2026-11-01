import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import { listMockMembers, setMockAdmin } from '#lib/mocks/admin.ts';
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
	const q = (url.searchParams.get('q') ?? '').slice(0, 50);
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
	return { ...listMockMembers(params.guildId, { q, page, pageSize: PAGE_SIZE }), q, page, pageSize: PAGE_SIZE, me: mockUser.userId };
};

export const actions: Actions = {
	setAdmin: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const failure = await setMockAdmin(params.guildId, mockUser.userId, String(data.get('userId') ?? ''), data.get('isAdmin') === 'true');
		return failure ? fail(failure.status, { message: failure.message }) : undefined;
	}
};
