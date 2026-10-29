import { error } from '@sveltejs/kit';
import { getGuildContext } from '#lib/data/index.ts';
import type { LayoutLoad } from './$types';

// 서버 문맥. 접근 권한과 존재 여부를 확인한 뒤에만 헤더·하위 페이지에 전달한다.
export const load: LayoutLoad = async ({ params, parent }) => {
	const { viewer } = await parent();
	const guild = await getGuildContext(params.guildId, viewer ?? null);

	if (guild === 'missing') error(404, { message: '서버를 찾을 수 없습니다.' });
	if (guild === 'forbidden') error(403, { message: '이 서버를 볼 권한이 없습니다.' });

	return { guild };
};
