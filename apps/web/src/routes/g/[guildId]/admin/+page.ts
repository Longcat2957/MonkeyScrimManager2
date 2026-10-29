import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getGuildAdmin } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const { guild } = await parent();
	// 화면을 숨기는 것과 별개로 데이터 준비 단계에서 권한을 막는다.
	if (guild.viewerRole !== 'admin') error(403, { message: '서버 관리 권한이 필요합니다.' });

	const scenario = currentScenario(url, dev);
	const admin = await getGuildAdmin(params.guildId, scenario);
	if (admin === 'missing') error(404, { message: '서버를 찾을 수 없습니다.' });

	return { admin };
};
