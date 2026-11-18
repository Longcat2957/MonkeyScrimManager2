import { randomInt } from 'node:crypto';
import { DomainError } from '../errors.ts';

export function orderAuctionCandidates<T>(
    candidates: readonly T[],
    price: (candidate: T) => number | null,
    randomIndex: (limit: number) => number = randomInt
): T[] {
    if (candidates.length !== 8 && candidates.length !== 16)
        throw new DomainError('INVALID_INPUT', '경매 후보는 팀장을 제외한 8명 또는 16명이어야 해요');
    function shuffle<U>(items: U[]) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = randomIndex(i + 1);
            [items[i], items[j]] = [items[j]!, items[i]!];
        }
    }
    const order = [...candidates];
    const slots = Array.from(order.keys());
    shuffle(order);
    shuffle(slots);
    // 무작위 후보 쌍과 자리 쌍을 독립적으로 뽑아 높은 가격을 72% 확률로 앞에 둔다.
    // 상대보다 비쌀 확률과 짝 자리가 뒤에 있을 확률이 각각 순위·순번에 선형이다.
    for (let i = 0; i < slots.length; i += 2) {
        const early = Math.min(slots[i]!, slots[i + 1]!);
        const late = Math.max(slots[i]!, slots[i + 1]!);
        const difference = (price(order[early]!) ?? -1) - (price(order[late]!) ?? -1);
        if (difference === 0) continue;
        const preferHigher = randomIndex(25) < 18;
        if (preferHigher ? difference < 0 : difference > 0) {
            [order[early], order[late]] = [order[late]!, order[early]!];
        }
    }
    return order;
}

export function byCandidateName(
    a: { displayName: string; participantId: string },
    b: { displayName: string; participantId: string }
): number {
    return a.displayName.localeCompare(b.displayName, 'ko') || a.participantId.localeCompare(b.participantId);
}
