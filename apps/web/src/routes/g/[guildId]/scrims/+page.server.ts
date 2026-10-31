import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import {
	inRange,
	readScrimSettingsForm,
	RESERVE_CAPACITY,
	TEAM_COUNT,
	toScrimSettings,
	validateScrimSettings
} from '#lib/features/scrims/settings.ts';
import type { ScrimStatusFilter } from '#lib/features/scrims/types.ts';
import { createMockScrim, listMockScrims } from '#lib/mocks/scrims.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 20;
const FILTERS: ScrimStatusFilter[] = ['all', 'recruit', 'active', 'done'];

// TODO: 인증·권한이 연결되면 서버 관리자 대신 내전 생성 권한을 확인한다.
function requireDev() {
	if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

export const load: PageServerLoad = async ({ parent, params, url }) => {
	requireDev();
	const { guild } = await parent();
	if (!guild) error(404, '서버를 찾을 수 없습니다.');

	// 알 수 없는 쿼리 값은 기본값으로 읽는다.
	const status = url.searchParams.get('status') as ScrimStatusFilter;
	const statusFilter = FILTERS.includes(status) ? status : 'all';
	const page = Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1);

	const version = await latestDataDragonVersion();
	const result = await listMockScrims(params.guildId, { status: statusFilter, page, pageSize: PAGE_SIZE }, (championId) =>
		championIconUrl(version, championId)
	);
	return {
		...result,
		page,
		pageSize: PAGE_SIZE,
		statusFilter,
		can: { createScrim: guild.isAdmin }
	};
};

export const actions: Actions = {
	create: async ({ request, params }) => {
		requireDev();
		if (!findMockGuild(params.guildId)?.isAdmin) return fail(403, { message: '내전을 만들 권한이 없어요' });
		const input = readScrimSettingsForm(await request.formData());
		const errors = validateScrimSettings(input);
		if (Object.keys(errors).length) return fail(400, { errors });
		if (!inRange(input.teamCount, TEAM_COUNT) || !inRange(input.reserveCapacity, RESERVE_CAPACITY)) {
			return fail(400, { message: '팀 수나 정원을 다시 확인해 주세요' });
		}
		const id = await createMockScrim(params.guildId, toScrimSettings(input));
		return { id };
	}
};
