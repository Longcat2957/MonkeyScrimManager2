import type { AuctionView } from './formation.ts';
import type { ScrimContext } from './types.ts';

/** 공개 경매 갱신에 필요한 현재 편성과 상위 내전 문맥이다. */
export type AuctionLiveSnapshot = { scrim: ScrimContext; auction: AuctionView | null };

/** 입찰·후보 변경과 달리 상위 화면까지 다시 읽어야 하는 문맥만 비교한다. */
export function auctionContextKey(scrim: ScrimContext) {
    const { revision: _revision, ...context } = scrim;
    return JSON.stringify(context);
}
