import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { findMockGuild } from '#lib/mocks/session.ts';
import type { LayoutServerLoad } from './$types';

// TODO: 서버 접근 권한을 확인하고 DB의 서버 정보를 조회한다.
export const load: LayoutServerLoad = ({ params }) => {
	if (!dev) return { guild: null };
	const guild = findMockGuild(params.guildId);
	if (!guild) error(404, '서버를 찾을 수 없습니다.');
	return { guild };
};
