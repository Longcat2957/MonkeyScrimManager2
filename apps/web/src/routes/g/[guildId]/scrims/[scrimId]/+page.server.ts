import { dev } from '$app/env';
import { error, fail } from '@sveltejs/kit';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { POSITIONS } from '#lib/features/labels.ts';
import {
	editableFields,
	inRange,
	readScrimSettingsForm,
	RESERVE_CAPACITY,
	TEAM_COUNT,
	toScrimSettings,
	validateScrimSettings
} from '#lib/features/scrims/settings.ts';
import type { RegistrationAccount } from '#lib/features/scrims/types.ts';
import { getMockMe } from '#lib/mocks/me.ts';
import {
	advanceMockScrim,
	cancelMockScrim,
	findMockScrim,
	getMockScrimDetail,
	getMockScrimSettings,
	registerMock,
	setMockParticipantStatus,
	updateMockRegistration,
	updateMockScrimSettings,
	withdrawMock,
	type MockFailure
} from '#lib/mocks/scrims.ts';
import { mockUser } from '#lib/mocks/session.ts';
import { championIconUrl } from '#lib/server/ddragon/assets.ts';
import { latestDataDragonVersion } from '#lib/server/guild/ranking.ts';
import type { Actions, PageServerLoad } from './$types';

const DONE = ['completed', 'ended_early', 'cancelled'];
const SELECTION_STATUSES = ['selected', 'standby', 'excluded'] as const;

// TODO: 인증·권한이 연결되면 세션 사용자와 내전 운영 권한으로 바꾼다.
function requireDev() {
	if (!dev) error(404, '내전을 찾을 수 없습니다.');
}

function myAccounts(): RegistrationAccount[] {
	return getMockMe(null).riotAccounts.map((account) => ({
		id: account.id,
		riotId: `${account.gameName}#${account.tagLine}`
	}));
}

export const load: PageServerLoad = async ({ parent, params }) => {
	requireDev();
	const { scrim, user } = await parent();
	if (!scrim) error(404, '내전을 찾을 수 없습니다.');
	const version = await latestDataDragonVersion();
	const detail = await getMockScrimDetail(params.guildId, params.scrimId, user?.userId ?? null, (championId) =>
		championIconUrl(version, championId)
	);
	if (!detail) error(404, '내전을 찾을 수 없습니다.');

	const accounts = user ? myAccounts() : [];
	const primary = user ? getMockMe(null).riotAccounts.find((account) => account.isPrimary) : undefined;
	const active = detail.counts.pending + detail.counts.selected + detail.counts.standby;
	const registerBlockedReason = detail.myRegistration
		? null
		: scrim.status !== 'recruit'
			? '모집이 마감됐어요'
			: !user
				? '로그인하면 신청할 수 있어요'
				: accounts.length === 0
					? 'Riot 계정을 연결해야 신청할 수 있어요 — 계정 메뉴의 내 정보에서 연결해요'
					: active >= detail.counts.activeCapacity
						? '신청 정원이 찼어요'
						: null;

	return {
		// 레이아웃의 값과 같다. null이 아님을 확인한 뒤 다시 넘겨 페이지에서 바로 쓴다.
		scrim,
		participants: detail.participants,
		counts: detail.counts,
		me: user
			? { registration: detail.myRegistration, riotAccounts: accounts, primaryAccountId: primary?.id ?? accounts[0]?.id ?? null }
			: null,
		// 운영자만 설정 수정 팝업의 현재 값이 필요하다.
		settings: scrim.canManage ? getMockScrimSettings(params.guildId, params.scrimId) : null,
		editable: editableFields(scrim.status),
		finished: DONE.includes(scrim.status),
		can: {
			register: !detail.myRegistration && !registerBlockedReason,
			registerBlockedReason,
			// 신청 수정·철회 마감 시점은 미결정이므로 모집 중에만 허용한다.
			editRegistration: Boolean(detail.myRegistration) && scrim.status === 'recruit',
			manage: scrim.canManage,
			select: scrim.canManage && scrim.status === 'recruit',
			nextAction: detail.nextAction
		}
	};
};

function failWith(failure: MockFailure | null) {
	return failure ? fail(failure.status, { message: failure.message }) : undefined;
}

// 신청·수정 폼을 읽는다. 내 계정이 아니거나 포지션이 없으면 필드 오류를 돌려준다.
function readRegistration(data: FormData) {
	const account = myAccounts().find((item) => item.id === String(data.get('riotAccountId') ?? ''));
	const keys = POSITIONS.map((position) => position.key);
	const positions = String(data.get('positions') ?? '')
		.split(',')
		.filter((key): key is LolPosition => keys.includes(key as LolPosition));
	if (!account) return { error: fail(400, { message: 'Riot 계정을 다시 골라 주세요' }) };
	if (positions.length === 0) return { error: fail(400, { positionsError: '희망 포지션을 하나 이상 골라 주세요' }) };
	return {
		input: {
			userId: mockUser.userId,
			displayName: mockUser.displayName,
			riotAccountId: account.id,
			riotId: account.riotId,
			positions: [...new Set(positions)]
		}
	};
}

function requireManager(guildId: string, scrimId: string) {
	return findMockScrim(guildId, scrimId)?.canManage ? null : fail(403, { message: '내전을 운영할 권한이 없어요' });
}

export const actions: Actions = {
	register: async ({ request, params }) => {
		requireDev();
		const parsed = readRegistration(await request.formData());
		if (parsed.error) return parsed.error;
		return failWith(await registerMock(params.guildId, params.scrimId, parsed.input));
	},

	registration: async ({ request, params }) => {
		requireDev();
		const parsed = readRegistration(await request.formData());
		if (parsed.error) return parsed.error;
		return failWith(await updateMockRegistration(params.guildId, params.scrimId, parsed.input));
	},

	withdraw: async ({ params }) => {
		requireDev();
		return failWith(await withdrawMock(params.guildId, params.scrimId, mockUser.userId));
	},

	participants: async ({ request, params }) => {
		requireDev();
		const denied = requireManager(params.guildId, params.scrimId);
		if (denied) return denied;
		const data = await request.formData();
		const status = String(data.get('status')) as (typeof SELECTION_STATUSES)[number];
		const ids = String(data.get('ids') ?? '').split(',').filter(Boolean);
		if (!SELECTION_STATUSES.includes(status) || ids.length === 0) return fail(400, { message: '참가자를 다시 골라 주세요' });
		return failWith(await setMockParticipantStatus(params.guildId, params.scrimId, ids, status));
	},

	advance: async ({ request, params }) => {
		requireDev();
		const denied = requireManager(params.guildId, params.scrimId);
		if (denied) return denied;
		const key = String((await request.formData()).get('key') ?? '');
		return failWith(await advanceMockScrim(params.guildId, params.scrimId, key));
	},

	cancel: async ({ params }) => {
		requireDev();
		const denied = requireManager(params.guildId, params.scrimId);
		if (denied) return denied;
		return failWith(await cancelMockScrim(params.guildId, params.scrimId));
	},

	settings: async ({ request, params }) => {
		requireDev();
		const denied = requireManager(params.guildId, params.scrimId);
		if (denied) return denied;
		const scrim = findMockScrim(params.guildId, params.scrimId)!;
		const current = getMockScrimSettings(params.guildId, params.scrimId)!;
		const input = readScrimSettingsForm(await request.formData());
		const errors = validateScrimSettings(input);
		if (Object.keys(errors).length) return fail(400, { errors });
		if (!inRange(input.teamCount, TEAM_COUNT) || !inRange(input.reserveCapacity, RESERVE_CAPACITY)) {
			return fail(400, { message: '팀 수나 정원을 다시 확인해 주세요' });
		}
		// 이 단계에서 바꿀 수 없는 값은 요청에 무엇이 오든 현재 값을 유지한다.
		const editable = editableFields(scrim.status);
		const next = toScrimSettings(input);
		const merged = Object.fromEntries(
			Object.entries(current).map(([field, value]) => [
				field,
				editable.includes(field as keyof typeof current) ? next[field as keyof typeof next] : value
			])
		) as typeof current;
		return failWith(await updateMockScrimSettings(params.guildId, params.scrimId, merged));
	}
};
