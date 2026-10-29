import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { getMatchDetail } from '#lib/data/index.ts';
import { currentScenario } from '#lib/mocks/simulate.ts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const { guild } = await parent();
	const scenario = currentScenario(url, dev);

	// ROFL 등록은 다음 단계에서 연결한다. 지금은 조회 전용으로 표시 권한만 넘긴다.
	const detail = await getMatchDetail(guild.id, params.matchId, false, scenario);
	if (detail === 'missing') error(404, { message: '경기 기록을 찾을 수 없습니다.' });

	// Game 선택은 결과가 있는 마지막 경기를 기본으로 하고, 잘못된 값은 표시만 구분한다.
	const requested = url.searchParams.get('game');
	const valid = detail.games.find((game) => game.id === requested);
	const completed = detail.games.filter((game) => game.status === 'completed');
	const fallback = completed.at(-1)?.id ?? detail.games[0]?.id ?? null;

	return {
		detail,
		selectedGameId: valid?.id ?? fallback,
		invalidSelection: Boolean(requested) && !valid
	};
};
