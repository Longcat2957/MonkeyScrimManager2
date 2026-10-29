/*
 * 화면 표시 형식.
 * 시간대는 서비스 기준(Asia/Seoul)으로 고정하고, 누락된 값은 0이나 추정치로 바꾸지 않는다.
 */

const KST_TIME_ZONE = 'Asia/Seoul';

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
	timeZone: KST_TIME_ZONE,
	month: 'long',
	day: 'numeric',
	weekday: 'short',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
	timeZone: KST_TIME_ZONE,
	month: 'numeric',
	day: 'numeric'
});

/** 예정·경기 시각. 값이 없으면 "시각 미정"이다. */
export function formatDateTime(iso: string | null): string {
	if (!iso) return '시각 미정';
	const parts = dateTimeFormatter.formatToParts(new Date(iso));
	const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
	return `${value('month')} ${value('day')}일 (${value('weekday')}) ${value('hour')}:${value('minute')}`;
}

/** 목록에서 날짜만 필요할 때 */
export function formatDate(iso: string | null): string {
	return iso ? dateFormatter.format(new Date(iso)) : '시각 미정';
}

/** 밀리초를 "31분 24초"로 표시한다. 값이 없으면 "확인되지 않음"이다. */
export function formatDuration(ms: number | null): string {
	if (ms === null) return '확인되지 않음';
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}분 ${seconds}초`;
}

/** 시리즈 점수. 승패 색은 컴포넌트가 정하고 여기서는 숫자만 만든다. */
export function formatScore(score: readonly [number, number]): string {
	return `${score[0]} : ${score[1]}`;
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat('ko-KR').format(value);
}
