// 한 페이지에서 영역별로 따로 조회해 일부가 실패해도 나머지를 보여 줄 때 쓰는 결과 형태다.
export type SectionResult<T> = { ok: true; value: T } | { ok: false };

export function toSection<T>(result: PromiseSettledResult<T>, label: string): SectionResult<T> {
	if (result.status === 'fulfilled') return { ok: true, value: result.value };
	console.error(`[${label}] 조회 실패`, result.reason);
	return { ok: false };
}

export function mapSection<T, U>(section: SectionResult<T>, map: (value: T) => U): SectionResult<U> {
	return section.ok ? { ok: true, value: map(section.value) } : section;
}
