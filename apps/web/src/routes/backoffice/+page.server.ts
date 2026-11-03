import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { requireServiceAdmin } from '#lib/server/auth/guards.ts';
import { routeError } from '#lib/server/http.ts';
import { checkServices } from '#lib/server/status.ts';
import type { PageServerLoad } from './$types';

// 서버 관리자 권한으로 대체하지 않고 서비스 운영자만 연다.
export const load: PageServerLoad = async ({ parent, depends, locals, url }) => {
	if (dev && url.searchParams.get('mock') === '1') {
		const { user } = await parent();
		if (!user?.isServiceAdmin) error(403, '서비스 운영자만 볼 수 있어요.');
	} else {
		try { requireServiceAdmin(locals.actor); } catch (cause) { routeError(cause); }
	}
	depends('app:service-status');
	// 확인이 끝나기 전에 화면을 먼저 보여 주도록 결과를 스트리밍한다.
	return { status: checkServices() };
};
