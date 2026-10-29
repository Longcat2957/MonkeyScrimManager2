import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	if (!dev) error(404, '페이지를 찾을 수 없습니다.');
};
