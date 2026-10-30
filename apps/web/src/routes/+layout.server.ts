import { dev } from '$app/env';
import { mockGuilds, mockUser } from '#lib/mocks/session.ts';
import type { LayoutServerLoad } from './$types';

// TODO: 인증을 연결하면 세션 사용자와 접근 가능한 서버를 조회한다.
export const load: LayoutServerLoad = () => ({
	user: dev ? mockUser : null,
	guilds: dev ? mockGuilds : []
});
