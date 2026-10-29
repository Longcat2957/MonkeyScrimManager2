import { error } from '@sveltejs/kit';
import { getViewerProfile } from '#lib/data/index.ts';
import type { PageLoad } from './$types';

// 본인 정보. 로그인하지 않았으면 개인 데이터를 만들지 않고 접근 오류로 처리한다.
export const load: PageLoad = async ({ parent }) => {
	const { viewer } = await parent();
	if (!viewer) error(403, { message: '로그인이 필요합니다.' });
	return { profile: await getViewerProfile() };
};
