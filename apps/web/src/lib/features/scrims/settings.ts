import type { FormationMethod, ScrimSettings, ScrimSettingsField, ScrimStatus } from '#lib/features/scrims/types.ts';

export const TITLE_MAX = 50;
export const TEAM_COUNT = { min: 2, max: 4 };
export const RESERVE_CAPACITY = { min: 0, max: 10 };
export const PLAYERS_PER_TEAM = 5;

// 팝업 입력값 그대로의 형태다. 날짜는 YYYY-MM-DD, 시각은 HH:mm 문자열이다.
export type ScrimSettingsInput = {
	title: string;
	date: string;
	time: string;
	teamCount: number;
	reserveCapacity: number;
	formationMethod: FormationMethod | null;
	hardFearless: boolean;
};

export type ScrimSettingsErrors = Partial<Record<'title' | 'date' | 'time', string>>;

// 표시 시간대는 미결정이므로 labels.ts와 같이 한국 시간으로 고정한다.
const OFFSET = '+09:00';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateTimeParts = new Intl.DateTimeFormat('en-CA', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
	timeZone: 'Asia/Seoul'
});

export function playCapacity(teamCount: number) {
	return teamCount * PLAYERS_PER_TEAM;
}

// 저장된 예정 시각을 팝업의 날짜·시각 입력으로 나눈다.
export function splitSchedule(iso: string | null) {
	if (!iso) return { date: '', time: '' };
	const parts = Object.fromEntries(dateTimeParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function validateScrimSettings(input: ScrimSettingsInput): ScrimSettingsErrors {
	const errors: ScrimSettingsErrors = {};
	const title = input.title.trim();
	if (!title) errors.title = '제목을 입력해 주세요';
	else if (title.length > TITLE_MAX) errors.title = `제목은 ${TITLE_MAX}자까지 쓸 수 있어요`;

	const date = input.date.trim();
	const time = input.time.trim();
	if (date && !DATE_PATTERN.test(date)) errors.date = '날짜를 다시 골라 주세요';
	if (time && !TIME_PATTERN.test(time)) errors.time = '20:00처럼 24시간 형식으로 입력해 주세요';
	if (date && !time) errors.time = '시각도 입력해 주세요';
	if (time && !date) errors.date = '날짜도 골라 주세요';
	return errors;
}

// 검증을 통과한 입력값을 저장 형태로 바꾼다. 범위를 벗어난 숫자는 서버에서도 거절한다.
export function toScrimSettings(input: ScrimSettingsInput): ScrimSettings {
	const date = input.date.trim();
	const time = input.time.trim();
	return {
		title: input.title.trim(),
		scheduledAt: date && time ? new Date(`${date}T${time}:00${OFFSET}`).toISOString() : null,
		teamCount: input.teamCount,
		reserveCapacity: input.reserveCapacity,
		formationMethod: input.formationMethod,
		hardFearless: input.hardFearless
	};
}

export function inRange(value: number, range: { min: number; max: number }) {
	return Number.isInteger(value) && value >= range.min && value <= range.max;
}

// form action이 받은 FormData를 입력값으로 읽는다. 클라이언트는 enhance 콜백에서 같은 이름으로 넣는다.
export function readScrimSettingsForm(data: FormData): ScrimSettingsInput {
	const method = String(data.get('formationMethod') ?? '');
	return {
		title: String(data.get('title') ?? ''),
		date: String(data.get('date') ?? ''),
		time: String(data.get('time') ?? ''),
		teamCount: Number(data.get('teamCount')),
		reserveCapacity: Number(data.get('reserveCapacity')),
		formationMethod: method === 'manual' || method === 'auction' ? method : null,
		hardFearless: data.get('hardFearless') === 'true'
	};
}

export function writeScrimSettingsForm(data: FormData, input: ScrimSettingsInput) {
	data.set('title', input.title);
	data.set('date', input.date);
	data.set('time', input.time);
	data.set('teamCount', String(input.teamCount));
	data.set('reserveCapacity', String(input.reserveCapacity));
	data.set('formationMethod', input.formationMethod ?? '');
	data.set('hardFearless', String(input.hardFearless));
}

const ALL_FIELDS: ScrimSettingsField[] = ['title', 'scheduledAt', 'teamCount', 'reserveCapacity', 'formationMethod', 'hardFearless'];

// 단계마다 바꿀 수 있는 설정이다. 모집이 끝나면 정원·편성 방식을, 경기가 시작되면 피어리스를 고정한다.
export function editableFields(status: ScrimStatus): ScrimSettingsField[] {
	if (status === 'recruit') return ALL_FIELDS;
	if (status === 'preparing' || status === 'ready') return ['title', 'scheduledAt', 'hardFearless'];
	if (status === 'in_progress') return ['title', 'scheduledAt'];
	return [];
}
