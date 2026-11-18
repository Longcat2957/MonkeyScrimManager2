/** 알려진 0과 값 누락을 화면에서도 구분한다. */
export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
export const integer = (value: number | null) =>
    value === null ? '—' : Math.round(value).toLocaleString('ko-KR');
export const withUnit = (value: number | null, unit: string) => (value === null ? '—' : `${value}${unit}`);
