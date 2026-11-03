import type { LolPosition } from '../../features/guild/types.ts';
import type { RegistrationStatus, ScrimSettings, ScrimStatus } from '../../features/scrims/types.ts';
import { editableFields, playCapacity, RESERVE_CAPACITY, TEAM_COUNT, TITLE_MAX, type ScrimSettingsInput } from '../../features/scrims/settings.ts';
import { DomainError } from '../errors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIONS: readonly LolPosition[] = ['top', 'jungle', 'mid', 'bot', 'support'];

export function requireUuid(value: unknown, label = '대상'): string {
	if (typeof value !== 'string' || !UUID.test(value)) throw new DomainError('INVALID_INPUT', `${label}을 다시 확인해 주세요`);
	return value;
}

export function requireRevision(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_646) {
		throw new DomainError('INVALID_INPUT', '변경 전 내전 정보를 다시 확인해 주세요');
	}
	return value;
}

export function assertRevision(actual: number, expected: number): void {
	if (actual !== expected) throw new DomainError('CONFLICT', '다른 사람이 먼저 변경했어요. 새로고침 후 다시 시도해 주세요');
}

export function requireRecruitment(status: ScrimStatus): void {
	if (status !== 'recruit') throw new DomainError('CONFLICT', '모집이 마감되어 변경할 수 없어요');
}

/** 폼 날짜를 실제 달력과 대조한 다음 한국 시각을 UTC로 바꾼다. */
export function parseScrimSettings(input: ScrimSettingsInput): ScrimSettings {
	const date = input.date.trim();
	const time = input.time.trim();
	const errors: Record<string, string> = {};
	let scheduledAt: string | null = null;
	if (date || time) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = '날짜를 다시 골라 주세요';
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = '20:00처럼 24시간 형식으로 입력해 주세요';
		if (!Object.keys(errors).length) {
			const parsed = new Date(`${date}T${time}:00+09:00`);
			if (!Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) !== `${date}T${time}`) {
				errors.date = '실제 달력에 있는 날짜를 골라 주세요';
			} else scheduledAt = parsed.toISOString();
		}
	}
	if (Object.keys(errors).length) throw new DomainError('INVALID_INPUT', '일정을 다시 확인해 주세요', errors);
	return validateSettings({ ...input, scheduledAt });
}

/** 서비스는 폼 어댑터를 통과하지 않은 직접 호출도 같은 범위로 제한한다. */
export function validateSettings(input: ScrimSettings): ScrimSettings {
	const title = typeof input.title === 'string' ? input.title.trim() : '';
	if (!title || title.length > TITLE_MAX) {
		throw new DomainError('INVALID_INPUT', '제목을 다시 확인해 주세요', { title: !title ? '제목을 입력해 주세요' : `제목은 ${TITLE_MAX}자까지 쓸 수 있어요` });
	}
	if (!Number.isInteger(input.teamCount) || input.teamCount < TEAM_COUNT.min || input.teamCount > TEAM_COUNT.max ||
		!Number.isInteger(input.reserveCapacity) || input.reserveCapacity < RESERVE_CAPACITY.min || input.reserveCapacity > RESERVE_CAPACITY.max) {
		throw new DomainError('INVALID_INPUT', '팀 수나 정원을 다시 확인해 주세요');
	}
	if (typeof input.hardFearless !== 'boolean') throw new DomainError('INVALID_INPUT', '피어리스 설정을 다시 확인해 주세요');
	if (input.scheduledAt !== null) {
		if (typeof input.scheduledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.scheduledAt)) {
			throw new DomainError('INVALID_INPUT', '일정을 다시 확인해 주세요', { date: '날짜를 다시 골라 주세요' });
		}
		const date = new Date(input.scheduledAt);
		if (!Number.isFinite(date.getTime()) || date.toISOString() !== input.scheduledAt) throw new DomainError('INVALID_INPUT', '일정을 다시 확인해 주세요');
	}
	return { title, scheduledAt: input.scheduledAt, teamCount: input.teamCount, reserveCapacity: input.reserveCapacity, hardFearless: input.hardFearless };
}

export function validateRegistration(input: { riotAccountId: string; positions: readonly LolPosition[] }) {
	const riotAccountId = requireUuid(input.riotAccountId, 'Riot 계정');
	if (!Array.isArray(input.positions) || input.positions.length < 1 || input.positions.length > 5 ||
		input.positions.some((value) => !POSITIONS.includes(value)) || new Set(input.positions).size !== input.positions.length) {
		throw new DomainError('INVALID_INPUT', '희망 포지션을 하나 이상 중복 없이 골라 주세요', { positions: '희망 포지션을 하나 이상 중복 없이 골라 주세요' });
	}
	return { riotAccountId, positions: [...input.positions] };
}

export function assertEditableSettings(status: ScrimStatus, current: ScrimSettings, next: ScrimSettings): void {
	const editable = editableFields(status);
	if (!editable.length) throw new DomainError('CONFLICT', '끝난 내전의 설정은 바꿀 수 없어요');
	for (const key of Object.keys(current) as (keyof ScrimSettings)[]) {
		if (!editable.includes(key) && current[key] !== next[key]) throw new DomainError('CONFLICT', '현재 단계에서 바꿀 수 없는 설정이에요');
	}
}

export type ActiveRegistration = { id: string; status: RegistrationStatus; joinedAt: Date };

export function assertCapacity(settings: Pick<ScrimSettings, 'teamCount' | 'reserveCapacity'>, registrations: readonly ActiveRegistration[]): void {
	const selected = registrations.filter((row) => row.status === 'selected').length;
	const active = registrations.filter((row) => row.status === 'selected' || row.status === 'standby').length;
	if (selected > playCapacity(settings.teamCount)) throw new DomainError('CONFLICT', '선발 인원보다 실출전 정원을 작게 바꿀 수 없어요');
	if (active > playCapacity(settings.teamCount) + settings.reserveCapacity) throw new DomainError('CONFLICT', '신청 인원보다 전체 정원을 작게 바꿀 수 없어요');
}

/** 같은 신청 시각에는 ID로 순서를 고정하여 동시 신청의 승급 결과도 일정하게 만든다. */
export function promotionIds(teamCount: number, registrations: readonly ActiveRegistration[]): string[] {
	const slots = Math.max(0, playCapacity(teamCount) - registrations.filter((row) => row.status === 'selected').length);
	return registrations.filter((row) => row.status === 'standby')
		.toSorted((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id.localeCompare(b.id))
		.slice(0, slots).map((row) => row.id);
}

export function validateSelection(registrationIds: readonly string[], status: string) {
	if (!Array.isArray(registrationIds) || registrationIds.length === 0 || registrationIds.length > 30 || new Set(registrationIds).size !== registrationIds.length) {
		throw new DomainError('INVALID_INPUT', '참가자를 다시 골라 주세요');
	}
	for (const id of registrationIds) requireUuid(id, '신청');
	if (status !== 'selected' && status !== 'standby' && status !== 'excluded') throw new DomainError('INVALID_INPUT', '참가 상태를 다시 확인해 주세요');
	return { registrationIds: [...registrationIds], status } as const;
}
