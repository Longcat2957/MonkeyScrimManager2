// 경기 화면의 숫자·시간 표기. 값이 없으면 '-'로 표시한다.

const longDate = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });

// 예: 2026년 10월 29일
export const formatLongDate = (iso: string) => longDate.format(new Date(iso));

// 예: 31분 3초
export function formatDuration(seconds: number | null) {
	if (seconds === null) return '-';
	const minutes = Math.floor(seconds / 60);
	return `${minutes}분 ${seconds % 60}초`;
}

// 예: 14.5k. 1000 미만은 그대로 쓴다.
export function formatThousands(value: number | null) {
	if (value === null) return '-';
	return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export const formatNumber = (value: number | null) => (value === null ? '-' : value.toLocaleString('ko-KR'));

// 데스가 0이면 킬+어시스트를 그대로 비율로 쓴다(예: 9/0/1 → 10.00).
export function kdaRatio({ kills, deaths, assists }: { kills: number | null; deaths: number | null; assists: number | null }) {
	if (kills === null || deaths === null || assists === null) return '-';
	return ((kills + assists) / Math.max(1, deaths)).toFixed(2);
}

export function perMinute(value: number | null, seconds: number | null) {
	return value === null || seconds === null || seconds <= 0 ? '-' : (value / (seconds / 60)).toFixed(1);
}
