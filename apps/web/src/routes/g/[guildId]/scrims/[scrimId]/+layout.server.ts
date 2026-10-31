import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { findMockScrim } from '#lib/mocks/scrims.ts';
import { randomChampionSplash } from '#lib/server/ddragon/champions.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { LayoutServerLoad } from './$types';

// TODO: 내전 열람 권한을 확인하고 DB의 내전 요약을 조회한다.
export const load: LayoutServerLoad = async ({ params }) => {
	if (!dev) return { scrim: null, artUrl: null };
	const scrim = findMockScrim(params.guildId, params.scrimId);
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	// 배경 아트는 장식이라 Data Dragon에 닿지 않으면 배경색만 쓴다.
	const artUrl = await randomChampionSplash(await latestDataDragonVersion());
	return { scrim, artUrl };
};
