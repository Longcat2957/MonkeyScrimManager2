import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getScrimDetail } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const { guild, viewer } = await parent();
	const scenario = currentScenario(url, dev);

	// 운영 권한은 서버가 확인한 서버 문맥에서만 판단한다.
	const detail = await getScrimDetail(
		guild.id,
		params.scrimId,
		viewer ?? null,
		guild.viewerRole === 'admin',
		scenario
	);

	if (detail === 'missing') error(404, { message: '내전을 찾을 수 없습니다.' });

	return { detail, scenario };
};
