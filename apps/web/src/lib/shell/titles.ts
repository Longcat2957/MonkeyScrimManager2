import { SERVICE_NAME } from '#lib/branding.ts';

/**
 * 브라우저 제목. 화면을 식별하는 값부터 오른쪽으로 갈수록 큰 범위를 둔다.
 * 예: `내전 · 몽키 숙소 · Monkeybot`
 */
export function pageTitle(...parts: (string | null | undefined)[]): string {
	return [...parts.filter((part): part is string => Boolean(part)), SERVICE_NAME].join(' · ');
}
