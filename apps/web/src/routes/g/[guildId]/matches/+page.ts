import { dev } from '$app/env';
import { listMatches } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

// 검색·필터·페이지는 URL로만 관리한다. 상세에서 돌아와도 같은 조건이 복원된다.
const STATUS_VALUES = ['all', 'in_progress', 'completed', 'ended_early', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function parseStatus(value: string | null): StatusFilter {
	return STATUS_VALUES.find((status) => status === value) ?? 'all';
}

function parsePage(value: string | null): number {
	const parsed = Number(value ?? '1');
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export const load: PageLoad = async ({ params, url }) => {
	const scenario = currentScenario(url, dev);
	const q = url.searchParams.get('q') ?? '';
	const status = parseStatus(url.searchParams.get('status'));
	const page = parsePage(url.searchParams.get('page'));
	const pageSize = 20;

	const result = await listMatches(params.guildId, { q, status, page, pageSize }, scenario);

	return { result, q, status, page, pageSize };
};
