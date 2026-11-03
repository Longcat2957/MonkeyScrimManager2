import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { listMockMatches } from '#lib/mocks/matches.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { listMatches } from '#lib/server/matches/queries.ts';
import { routeError } from '#lib/server/http.ts';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ parent, params, url, locals }) => {
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');

	// 알 수 없는 쿼리 값은 기본값으로 읽는다. 쪽 이동은 종료된 경기에만 적용한다.
	const page = Math.min(100_000, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
	const q = (url.searchParams.get('q') ?? '').slice(0, 50);
	if (!(dev && findMockGuild(params.guildId))) {
		try {
			const [live, done] = await Promise.all([
				listMatches(getDb(), locals.actor, params.guildId, { status: 'in_progress', q, page: 1, pageSize: 100 }),
				listMatches(getDb(), locals.actor, params.guildId, { status: 'done', q, page, pageSize: PAGE_SIZE })
			]);
			return { live: live.matches, done: done.matches, doneTotal: done.total, empty: done.empty, page, pageSize: PAGE_SIZE, q };
		} catch (cause) { routeError(cause); }
	}

	// 진행 중인 경기는 몇 개뿐이므로 한 번에 모두 보여 준다.
	const [live, done] = await Promise.all([
		listMockMatches(params.guildId, { status: 'in_progress', q, page: 1, pageSize: 100 }),
		listMockMatches(params.guildId, { status: 'done', q, page, pageSize: PAGE_SIZE })
	]);
	return { live: live.matches, done: done.matches, doneTotal: done.total, empty: done.empty, page, pageSize: PAGE_SIZE, q };
};
