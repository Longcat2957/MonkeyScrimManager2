import { dev } from '$app/env';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { SlotKey } from '#lib/features/scrims/formation.ts';
import { formationPath } from '#lib/features/scrims/paths.ts';
import type { MockFailure } from '#lib/mocks/scrims.ts';
import { confirmMockManual, getMockManualFormation, moveMockManualPlayer, resetMockManual } from '#lib/mocks/teams.ts';
import { clearMockFormationMethod } from '#lib/mocks/workflow.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import { findMockGuild } from '#lib/mocks/session.ts';
import { getDb } from '#lib/server/db/index.ts';
import { actionFailure } from '#lib/server/actions.ts';
import { routeError } from '#lib/server/http.ts';
import { getManualFormation, moveManualPlayer, resetManualFormation, confirmManualFormation } from '#lib/server/scrims/manual.ts';
import { chooseFormationMethod } from '#lib/server/scrims/workflow.ts';
import type { Actions, PageServerLoad } from './$types';

const isDemo = (guildId: string) => dev && Boolean(findMockGuild(guildId));

// 실제 편성 방식과 다른 경로로 들어오면 그 방식의 작업판으로, 방식이 아직 없으면 방식을 고르는 요약으로 보낸다.
export const load: PageServerLoad = async ({ parent, params, locals }) => {
	const { scrim } = await parent();
	if (scrim && scrim.formationMethod !== 'manual') {
		redirect(307, formationPath(params, scrim.formationMethod) ?? resolve('/g/[guildId]/scrims/[scrimId]', params));
	}
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	// 모집이 끝나기 전에는 편성할 선발 인원이 확정되지 않았다.
	if (scrim.status === 'recruit') return { scrim, formation: null };

	let formation;
	try {
		if (isDemo(params.guildId)) {
			const version = await latestDataDragonVersion();
			formation = await getMockManualFormation(params.guildId, params.scrimId, (id) => championIconUrl(version, id));
		} else formation = await getManualFormation(getDb(), locals.actor, params.guildId, params.scrimId);
	} catch (cause) { routeError(cause); }
	if (!formation) error(404, '내전을 찾을 수 없습니다.');
	const editable = scrim.canManage && scrim.status === 'preparing' && !formation.confirmed;
	return { scrim, formation, can: { edit: editable } };
};

function failWith(failure: MockFailure | null) {
	return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

export const actions: Actions = {
	move: async ({ request, params, locals, setHeaders }) => {
		const data = await request.formData();
		const slot = String(data.get('slot') ?? '');
		const participantId = String(data.get('participantId') ?? '');
		if (isDemo(params.guildId)) return failWith(await moveMockManualPlayer(params.guildId, params.scrimId, participantId, slot ? slot as SlotKey : null));
		try { await moveManualPlayer(getDb(), locals.actor, params.guildId, params.scrimId, { participantId, slot: slot || null, expectedRevision: Number(data.get('expectedRevision') ?? NaN) }); }
		catch (cause) { return actionFailure(cause, setHeaders); }
	},

	reset: async ({ params, locals, request, setHeaders }) => {
		if (isDemo(params.guildId)) return failWith(await resetMockManual(params.guildId, params.scrimId));
		try { await resetManualFormation(getDb(), locals.actor, params.guildId, params.scrimId, { expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN) }); }
		catch (cause) { return actionFailure(cause, setHeaders); }
	},

	confirm: async ({ params, locals, request, setHeaders }) => {
		if (isDemo(params.guildId)) return failWith(await confirmMockManual(params.guildId, params.scrimId));
		try { await confirmManualFormation(getDb(), locals.actor, params.guildId, params.scrimId, { expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN) }); }
		catch (cause) { return actionFailure(cause, setHeaders); }
	},

	// 방식 선택으로 되돌린다. 다시 불러오면 load가 공통 진입점으로 보낸다.
	changeMethod: async ({ params, locals, request, setHeaders }) => {
		if (isDemo(params.guildId)) return failWith(await clearMockFormationMethod(params.guildId, params.scrimId));
		try { await chooseFormationMethod(getDb(), locals.actor, params.guildId, params.scrimId, { method: null, expectedRevision: Number((await request.formData()).get('expectedRevision') ?? NaN) }); }
		catch (cause) { return actionFailure(cause, setHeaders); }
	}
};
