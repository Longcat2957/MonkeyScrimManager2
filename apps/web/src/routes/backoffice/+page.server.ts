import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// 서버 관리자 권한으로 대체하지 않고 서비스 운영자만 연다.
export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user?.isServiceAdmin) error(403, '서비스 운영자만 볼 수 있어요.');
};
