// 경기 화면의 숫자·시간 표기. 값이 없으면 '-'로 표시한다.

const longDate = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul'
});

// 예: 2026년 10월 29일
export const formatLongDate = (iso: string) => longDate.format(new Date(iso));

// 예: 31분 3초
export function formatDuration(seconds: number | null) {
    if (seconds === null) return '-';
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분 ${seconds % 60}초`;
}

// 피해량은 천 단위 구분 기호로 표시한다.
export function formatThousands(value: number | null) {
    if (value === null) return '-';
    return formatNumber(value);
}

export const formatNumber = (value: number | null) =>
    value === null ? '-' : Math.round(value).toLocaleString('ko-KR');

// 소수 한 자리로 표시한다. 데스가 0이면 비율 대신 Perfect로 표시한다.
export function kdaRatio({
    kills,
    deaths,
    assists
}: {
    kills: number | null;
    deaths: number | null;
    assists: number | null;
}) {
    if (kills === null || deaths === null || assists === null) return '-';
    if (deaths === 0) return 'Perfect';
    return ((kills + assists) / deaths).toFixed(1);
}

// 빌드 번호를 뺀 주·부 버전만 표시한다(예: 16.23.839.6405 → 16.23).
export const formatPatch = (patch: string) => patch.split('.').slice(0, 2).join('.');

export function perMinute(value: number | null, seconds: number | null) {
    return value === null || seconds === null || seconds <= 0 ? '-' : (value / (seconds / 60)).toFixed(0);
}
