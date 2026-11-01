import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { MatchStatusFilter } from '#lib/features/matches/types.ts';
import { listMockMatches } from '#lib/mocks/matches.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;
const FILTERS: MatchStatusFilter[] = ['all', 'in_progress', 'done'];

export const load: PageServerLoad = async ({ parent, params, url }) => {
	// TODO: DB 조회와 서버 열람 권한 확인으로 바꾼다.
	if (!dev) error(404, '서버를 찾을 수 없습니다.');
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');

	// 알 수 없는 쿼리 값은 기본값으로 읽는다.
	const status = url.searchParams.get('status') as MatchStatusFilter;
	const statusFilter = FILTERS.includes(status) ? status : 'all';
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);
	const q = (url.searchParams.get('q') ?? '').slice(0, 50);

	const result = await listMockMatches(params.guildId, { status: statusFilter, q, page, pageSize: PAGE_SIZE });
	return { ...result, page, pageSize: PAGE_SIZE, statusFilter, q };
};
