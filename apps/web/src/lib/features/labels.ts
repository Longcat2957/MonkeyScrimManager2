import type { TagProps } from 'stdf';
import type { LolPosition } from '#lib/features/guild/types.ts';
import type { MatchStatus } from '#lib/features/matches/types.ts';
import type { FormationMethod, RegistrationStatus, ScrimStatus } from '#lib/features/scrims/types.ts';

type StatusLabel = { text: string; state: NonNullable<TagProps['state']> };

// 상태 문구와 Tag 색상의 대응은 docs/web/README.md의 표를 따른다.
export const SCRIM_STATUS: Record<ScrimStatus, StatusLabel> = {
	recruit: { text: '모집 중', state: 'theme' },
	preparing: { text: '편성 중', state: 'info' },
	ready: { text: '대진 준비', state: 'info' },
	in_progress: { text: '진행 중', state: 'warning' },
	completed: { text: '종료', state: 'success' },
	ended_early: { text: '중도 종료', state: 'error' },
	cancelled: { text: '취소', state: 'error' }
};

export const MATCH_STATUS: Record<MatchStatus, StatusLabel> = {
	pending: { text: '대기', state: 'theme' },
	in_progress: { text: '진행 중', state: 'warning' },
	completed: { text: '종료', state: 'success' },
	ended_early: { text: '중도 종료', state: 'error' },
	cancelled: { text: '취소', state: 'error' }
};

// 철회는 현재 참여가 아니므로 Tag 없이 흐린 텍스트로 표시한다(state null).
export const REGISTRATION_STATUS: Record<RegistrationStatus, { text: string; state: StatusLabel['state'] | null }> = {
	pending: { text: '신청', state: 'theme' },
	selected: { text: '선발', state: 'success' },
	standby: { text: '대기', state: 'info' },
	withdrawn: { text: '철회', state: null },
	excluded: { text: '제외', state: 'error' }
};

// 목록에서 내 신청을 알릴 때 쓰는 문구다. 철회·제외는 현재 참여가 아니므로 표시하지 않는다.
export const MY_REGISTRATION: Partial<Record<RegistrationStatus, string>> = {
	pending: '신청함',
	selected: '선발됨',
	standby: '대기 중'
};

export const POSITIONS: { key: LolPosition; text: string }[] = [
	{ key: 'top', text: '탑' },
	{ key: 'jungle', text: '정글' },
	{ key: 'mid', text: '미드' },
	{ key: 'bot', text: '원딜' },
	{ key: 'support', text: '서폿' }
];

// 신청자가 고른 순서대로 쓴다. 예: 미드·탑
export function positionsLabel(positions: LolPosition[]) {
	return positions.map((key) => POSITIONS.find((position) => position.key === key)?.text ?? key).join('·');
}

export function formationMethodLabel(method: FormationMethod | null) {
	if (method === 'manual') return '수동 편성';
	if (method === 'auction') return '경매';
	return '편성 방식 미정';
}

// 표시 시간대는 미결정이므로 우선 한국 시간으로 고정한다.
const dateParts = new Intl.DateTimeFormat('ko-KR', {
	month: 'numeric',
	day: 'numeric',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
	timeZone: 'Asia/Seoul'
});

export function scheduleParts(iso: string) {
	const parts = Object.fromEntries(dateParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
	return {
		month: Number(parts.month),
		day: Number(parts.day),
		weekday: parts.weekday,
		time: `${parts.hour}:${parts.minute}`
	};
}

// 예: 10/31(토) 20:00
export function formatSchedule(iso: string | null) {
	if (!iso) return '일정 미정';
	const { month, day, weekday, time } = scheduleParts(iso);
	return `${month}/${day}(${weekday}) ${time}`;
}

// 예: 10/24(금)
export function formatShortDate(iso: string) {
	const { month, day, weekday } = scheduleParts(iso);
	return `${month}/${day}(${weekday})`;
}
