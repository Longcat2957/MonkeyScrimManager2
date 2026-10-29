/*
 * 결정적 목 값 생성 도구.
 * 같은 입력에서 항상 같은 값이 나와야 화면 검토와 스크린샷 비교가 가능하다.
 */

function hash(value: string): number {
	let result = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		result = Math.imul(result ^ value.charCodeAt(index), 16777619);
	}
	return result >>> 0;
}

/** seed 문자열로 0 이상 1 미만 값을 만든다. */
export function unit(seed: string): number {
	return (hash(seed) % 100000) / 100000;
}

/** seed로 min 이상 max 이하 정수를 만든다. */
export function between(seed: string, min: number, max: number): number {
	return min + Math.floor(unit(seed) * (max - min + 1));
}

/** 배열에서 seed로 하나를 고른다. */
export function pick<T>(items: readonly T[], seed: string): T {
	return items[Math.floor(unit(seed) * items.length) % items.length];
}

/** seed로 배열을 섞는다. 원본은 바꾸지 않는다. */
export function shuffle<T>(items: readonly T[], seed: string): T[] {
	return [...items]
		.map((item, index) => ({ item, key: unit(`${seed}:${index}`) }))
		.sort((a, b) => a.key - b.key)
		.map(({ item }) => item);
}
