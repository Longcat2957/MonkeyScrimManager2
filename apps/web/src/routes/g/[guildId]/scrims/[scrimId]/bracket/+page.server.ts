import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { bracketPath, hasResult } from '#lib/features/scrims/paths.ts';
import {
	confirmMockBracket,
	getMockBracket,
	placeMockBracketTeam,
	resetMockBracket,
	setMockBracketBestOf,
	unlockMockBracket
} from '#lib/mocks/bracket.ts';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { Actions, PageServerLoad } from './$types';

// TODO: DB 조회와 운영 권한 확인으로 바꾼다.
function requireDev() {
	if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

export const load: PageServerLoad = async ({ parent, params }) => {
	requireDev();
	const { scrim } = await parent();
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	// 끝난 내전은 결과 화면에서 본다.
	if (hasResult(scrim.status)) redirect(307, bracketPath(params, scrim.status));
	const version = await latestDataDragonVersion();
	const bracket = await getMockBracket(params.guildId, params.scrimId, (id) => championIconUrl(version, id));
	return { scrim, bracket };
};

function failWith(failure: MockFailure | null) {
	return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

const field = (data: FormData, name: string) => String(data.get(name) ?? '');

export const actions: Actions = {
	place: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		return failWith(await placeMockBracketTeam(params.guildId, params.scrimId, field(data, 'seat'), field(data, 'teamId') || null));
	},
	bestOf: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		return failWith(await setMockBracketBestOf(params.guildId, params.scrimId, field(data, 'stage'), Number(field(data, 'bestOf'))));
	},
	reset: async ({ params }) => {
		requireDev();
		return failWith(await resetMockBracket(params.guildId, params.scrimId));
	},
	confirm: async ({ params }) => {
		requireDev();
		return failWith(await confirmMockBracket(params.guildId, params.scrimId));
	},
	unlock: async ({ params }) => {
		requireDev();
		return failWith(await unlockMockBracket(params.guildId, params.scrimId));
	}
};
