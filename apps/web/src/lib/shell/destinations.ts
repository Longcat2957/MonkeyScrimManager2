/*
 * 헤더 레일 목적지의 순수 규칙.
 * SvelteKit API에 의존하지 않아 테스트에서 그대로 검증할 수 있다.
 */

export interface Destination {
	label: string;
	href: string;
	/** 활성 판정에 쓰는 경로 접두사. */
	match: string;
	exact?: boolean;
}

function matches(destination: Destination, pathname: string): boolean {
	if (destination.exact) return pathname === destination.href;
	return pathname === destination.match || pathname.startsWith(`${destination.match}/`);
}

/**
 * 활성 목적지 하나의 href를 고른다.
 * 중첩 경로(예: /teams/manual)에서는 가장 긴 match 접두사를 가진 항목만 활성이다. 없으면 null.
 */
export function activeDestination(items: Destination[], pathname: string): string | null {
	const matched = items.filter((item) => matches(item, pathname)).sort((a, b) => b.match.length - a.match.length);
	return matched[0]?.href ?? null;
}
