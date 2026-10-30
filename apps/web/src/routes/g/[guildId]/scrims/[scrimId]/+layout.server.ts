import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { findMockScrim } from '#lib/mocks/scrims.ts';
import type { LayoutServerLoad } from './$types';

// TODO: 내전 열람 권한을 확인하고 DB의 내전 요약을 조회한다.
export const load: LayoutServerLoad = ({ params }) => {
	if (!dev) return { scrim: null };
	const scrim = findMockScrim(params.guildId, params.scrimId);
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	return { scrim };
};
