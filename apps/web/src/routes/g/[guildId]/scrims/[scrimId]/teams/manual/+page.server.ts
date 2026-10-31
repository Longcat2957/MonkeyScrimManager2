import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { SlotKey } from '#lib/features/scrims/formation.ts';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import { confirmMockManual, getMockManualFormation, moveMockManualPlayer, renameMockTeam, resetMockManual } from '#lib/mocks/teams.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { Actions, PageServerLoad } from './$types';

const TEAM_NAME_MAX = 20;

// TODO: DB 조회와 운영 권한 확인으로 바꾼다.
function requireDev() {
	if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

// 실제 편성 방식과 다른 경로로 들어오면 공통 진입점으로 보내 올바른 경로를 다시 정한다.
export const load: PageServerLoad = async ({ parent, params }) => {
	const { scrim } = await parent();
	if (scrim && scrim.formationMethod !== 'manual') {
		redirect(307, resolve('/g/[guildId]/scrims/[scrimId]/teams', params));
	}
	requireDev();
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	// 모집이 끝나기 전에는 편성할 선발 인원이 확정되지 않았다.
	if (scrim.status === 'recruit') return { scrim, formation: null };

	const version = await latestDataDragonVersion();
	const formation = await getMockManualFormation(params.guildId, params.scrimId, (id) => championIconUrl(version, id));
	if (!formation) error(404, '내전을 찾을 수 없습니다.');
	const editable = scrim.canManage && scrim.status === 'preparing' && !formation.confirmed;
	return { scrim, formation, can: { edit: editable } };
};

function failWith(failure: MockFailure | null) {
	return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

export const actions: Actions = {
	move: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const slot = String(data.get('slot') ?? '');
		return failWith(
			await moveMockManualPlayer(params.guildId, params.scrimId, String(data.get('registrationId') ?? ''), slot ? (slot as SlotKey) : null)
		);
	},

	reset: async ({ params }) => {
		requireDev();
		return failWith(await resetMockManual(params.guildId, params.scrimId));
	},

	rename: async ({ request, params }) => {
		requireDev();
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { nameError: '팀 이름을 입력해 주세요' });
		if (name.length > TEAM_NAME_MAX) return fail(400, { nameError: `팀 이름은 ${TEAM_NAME_MAX}자까지 쓸 수 있어요` });
		return failWith(await renameMockTeam(params.guildId, params.scrimId, String(data.get('teamId') ?? ''), name));
	},

	confirm: async ({ params }) => {
		requireDev();
		return failWith(await confirmMockManual(params.guildId, params.scrimId));
	}
};
