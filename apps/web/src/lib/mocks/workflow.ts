import type { FormationMethod, ScrimNextAction, ScrimRevertAction, ScrimStatus } from '#lib/features/scrims/types.ts';
import { dropMockBracket, getMockBracketProgress, setMockBracketEnded } from './bracket.ts';
import { counts, findMockScrimRecord, type MockFailure, type MockScrim } from './scrims.ts';
import { dropMockFormation, reopenMockFormation } from './teams.ts';

// 내전 단계 진행·되돌리기·중도 종료의 개발용 규칙이다. 편성·대진 목을 함께 고치므로 내전 목과 나눠 둔다.

const wait = () => new Promise((resolve) => setTimeout(resolve, 300));

const NEXT_STATUS: Record<ScrimNextAction['key'], ScrimStatus> = {
	close: 'preparing',
	ready: 'ready',
	start: 'in_progress',
	complete: 'completed'
};

// 단계마다 다음 단계 하나와 화면에서 확인할 수 있는 조건만 둔다.
async function nextAction(scrim: MockScrim): Promise<ScrimNextAction | null> {
	const { selected, playCapacity: capacity } = counts(scrim);
	const bracket = ['ready', 'in_progress'].includes(scrim.status) ? await getMockBracketProgress(scrim.guildId, scrim.id) : null;
	switch (scrim.status) {
		case 'recruit':
			return {
				key: 'close',
				label: '모집 마감',
				blockedReason: selected !== capacity ? `선발 인원이 ${capacity}명이어야 해요 (현재 ${selected}명)` : null
			};
		case 'preparing':
			return { key: 'ready', label: '대진 준비로', blockedReason: scrim.formationMethod ? '팀 편성을 확정해야 해요' : '편성 방식을 골라야 해요' };
		case 'ready':
			return { key: 'start', label: '내전 시작', blockedReason: bracket?.confirmed ? null : '대진을 확정해야 해요' };
		case 'in_progress':
			return { key: 'complete', label: '내전 종료', blockedReason: bracket && !bracket.finished ? '모든 경기가 끝나야 해요' : null };
		default:
			return null;
	}
}

// 운영 메뉴의 이전 단계 되돌리기다. 취소한 내전은 되돌리지 않는다.
async function revertAction(scrim: MockScrim): Promise<ScrimRevertAction | null> {
	switch (scrim.status) {
		case 'preparing':
			return { label: '모집 다시 열기', message: '편성 방식과 지금까지의 팀 편성이 지워지고 다시 신청을 받아요.', blockedReason: null };
		case 'ready':
			return { label: '팀 편성 다시 하기', message: '대진 배치가 지워지고 팀 편성을 다시 고칠 수 있어요.', blockedReason: null };
		case 'in_progress': {
			const bracket = await getMockBracketProgress(scrim.guildId, scrim.id);
			return {
				label: '대진 준비로 되돌리기',
				message: '대진을 다시 고칠 수 있게 시작 전으로 돌아가요.',
				blockedReason: bracket?.started ? '기록된 게임이 있어 되돌릴 수 없어요' : null
			};
		}
		case 'completed':
		case 'ended_early':
			return { label: '진행 중으로 되돌리기', message: '끝낸 내전을 다시 열어요. 중도 종료로 멈춘 경기도 다시 진행 중이 돼요.', blockedReason: null };
		default:
			return null;
	}
}

/** 요약 화면의 운영 작업. 운영 권한이 없으면 모두 null·false다. */
export async function getMockScrimOperations(guildId: string, scrimId: string) {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim?.canManage) return { nextAction: null, revert: null, endEarly: false };
	return {
		nextAction: await nextAction(scrim),
		revert: await revertAction(scrim),
		endEarly: scrim.status === 'in_progress'
	};
}

function target(guildId: string, scrimId: string): MockScrim | MockFailure {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (!scrim.canManage) return { status: 403, message: '내전을 운영할 권한이 없어요' };
	return scrim;
}

/** 다음 단계로 넘긴다. 모집을 마감하면 편성 방식은 비어 있고 팀 편성 화면에서 고른다. */
export async function advanceMockScrim(guildId: string, scrimId: string, key: string): Promise<MockFailure | null> {
	await wait();
	const scrim = target(guildId, scrimId);
	if ('message' in scrim) return scrim;
	const action = await nextAction(scrim);
	if (!action || action.key !== key) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	if (action.blockedReason) return { status: 409, message: action.blockedReason };
	scrim.status = NEXT_STATUS[action.key];
	return null;
}

/** 이전 단계로 되돌린다. 기록된 게임은 어느 단계에서도 지우지 않는다. */
export async function revertMockScrim(guildId: string, scrimId: string): Promise<MockFailure | null> {
	await wait();
	const scrim = target(guildId, scrimId);
	if ('message' in scrim) return scrim;
	const action = await revertAction(scrim);
	if (!action) return { status: 409, message: '되돌릴 단계가 없어요' };
	if (action.blockedReason) return { status: 409, message: action.blockedReason };
	switch (scrim.status) {
		case 'preparing':
			dropMockFormation(scrim.id);
			scrim.formationMethod = null;
			scrim.status = 'recruit';
			break;
		case 'ready':
			reopenMockFormation(scrim);
			dropMockBracket(guildId, scrimId);
			scrim.status = 'preparing';
			break;
		case 'in_progress':
			scrim.status = 'ready';
			break;
		case 'ended_early':
			await setMockBracketEnded(guildId, scrimId, false);
			scrim.status = 'in_progress';
			break;
		case 'completed':
			scrim.status = 'in_progress';
			break;
	}
	return null;
}

/** 편성 중인 내전의 편성 방식을 정한다. */
export async function chooseMockFormationMethod(guildId: string, scrimId: string, method: FormationMethod | null): Promise<MockFailure | null> {
	await wait();
	const scrim = target(guildId, scrimId);
	if ('message' in scrim) return scrim;
	if (!method) return { status: 400, message: '편성 방식을 골라 주세요' };
	if (scrim.status !== 'preparing' || scrim.formationMethod) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	scrim.formationMethod = method;
	return null;
}

/** 편성 중인 내전을 방식 선택으로 되돌린다. 지금까지의 수동 배치·경매 기록은 지운다. */
export async function clearMockFormationMethod(guildId: string, scrimId: string): Promise<MockFailure | null> {
	await wait();
	const scrim = target(guildId, scrimId);
	if ('message' in scrim) return scrim;
	if (scrim.status !== 'preparing' || !scrim.formationMethod) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	dropMockFormation(scrim.id);
	scrim.formationMethod = null;
	return null;
}

/** 남은 경기를 치르지 않고 내전을 끝낸다. 지금까지 기록된 게임과 점수는 전적에 남는다. */
export async function endMockScrimEarly(guildId: string, scrimId: string): Promise<MockFailure | null> {
	await wait();
	const scrim = target(guildId, scrimId);
	if ('message' in scrim) return scrim;
	if (scrim.status !== 'in_progress') return { status: 409, message: '진행 중인 내전만 중도 종료할 수 있어요' };
	await setMockBracketEnded(guildId, scrimId, true);
	scrim.status = 'ended_early';
	return null;
}
