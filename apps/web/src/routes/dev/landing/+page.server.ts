import { dev } from '$app/env';
import { isLoopback } from '#lib/ui/local-preview.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
    if (!dev || !isLoopback(url.hostname)) error(404, '페이지를 찾을 수 없습니다.');
};
