import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
	if (!dev) error(404, '페이지를 찾을 수 없습니다.');

	const status = Number(url.searchParams.get('status') ?? 404);
	error([403, 404, 500].includes(status) ? status : 404, '오류 화면 미리보기');
};
