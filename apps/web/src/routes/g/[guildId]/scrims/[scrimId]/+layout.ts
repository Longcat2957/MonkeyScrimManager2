import { error } from '@sveltejs/kit';
import { getScrimContext } from '#lib/data/index.ts';
import type { LayoutLoad } from './$types';

// 내전 문맥. 서버 레이아웃이 확인한 서버 안에서만 내전을 찾는다.
export const load: LayoutLoad = async ({ params, parent }) => {
	const { guild } = await parent();
	const scrim = await getScrimContext(guild.id, params.scrimId);

	if (scrim === 'missing') error(404, { message: '내전을 찾을 수 없습니다.' });

	return { scrim };
};
