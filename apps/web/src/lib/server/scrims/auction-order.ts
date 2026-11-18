import { randomInt } from 'node:crypto';

export function orderAuctionCandidates<T>(
    candidates: readonly T[],
    price: (candidate: T) => number | null,
    randomIndex: (limit: number) => number = randomInt
): T[] {
    const ranked = [...candidates];
    function shuffle(start: number, end: number) {
        for (let i = end - 1; i > start; i--) {
            const j = start + randomIndex(i - start + 1);
            [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!];
        }
    }
    // 안정 정렬 전에 한 번 섞어 동점자가 그룹 경계에서 신청순으로 나뉘지 않게 한다.
    shuffle(0, ranked.length);
    if (ranked.length !== 8 && ranked.length !== 16) return ranked;
    ranked.sort((a, b) => (price(b) ?? -1) - (price(a) ?? -1));
    const size = ranked.length / 4;
    for (let start = 0; start < ranked.length; start += size) shuffle(start, start + size);
    return ranked;
}

export function byCandidateName(
    a: { displayName: string; participantId: string },
    b: { displayName: string; participantId: string }
): number {
    return a.displayName.localeCompare(b.displayName, 'ko') || a.participantId.localeCompare(b.participantId);
}
