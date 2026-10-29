import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getPlayerProfile } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

function parsePage(value: string | null): number {
	const parsed = Number(value ?? '1');
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export const load: PageLoad = async ({ params, url, parent }) => {
	const { guild } = await parent();
	const scenario = currentScenario(url, dev);
	const page = parsePage(url.searchParams.get('page'));
	const pageSize = 20;

	const profile = await getPlayerProfile(guild.id, params.playerId, page, pageSize, scenario);
	if (profile === 'missing') error(404, { message: '사용자 전적을 찾을 수 없습니다.' });

	return { profile, page, pageSize };
};
