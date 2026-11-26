export type DocHeading = { id: string; title: string };

/** 장 ID와 제목의 표에서 목차와 본문 제목이 같은 문구를 쓰도록 목록을 만든다. */
export function docHeadings<T extends Record<string, string>>(titles: T): DocHeading[] {
    return Object.entries(titles).map(([id, title]) => ({ id, title }));
}
