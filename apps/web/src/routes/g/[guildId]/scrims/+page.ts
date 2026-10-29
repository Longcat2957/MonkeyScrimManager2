import { dev } from '$app/env';
import { listScrims } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

// 목록 필터는 URL로만 관리한다. 뒤로가기·공유·상세 복귀에서 같은 조건을 복원하기 위해서다.
const STATUS_VALUES = ['all', 'recruit', 'preparing', 'in_progress', 'completed'] as const;
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
	const status = parseStatus(url.searchParams.get('status'));
	const page = parsePage(url.searchParams.get('page'));
	const pageSize = 20;

	const result = await listScrims(params.guildId, { status, page, pageSize }, scenario);

	return { result, status, page, pageSize };
};
