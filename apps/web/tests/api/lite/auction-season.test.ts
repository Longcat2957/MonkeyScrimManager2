import assert from 'node:assert/strict';
import test from 'node:test';
import { auctionRankSeason, AUCTION_FRESH_MS } from '../../../src/lib/server/riot/auction-season.ts';

test('Riot 지역 현지 시각의 개시·종료 사이 공백에는 최고 기록을 귀속하지 않는다', () => {
    assert.equal(AUCTION_FRESH_MS, 2_400_000);
    const season = (platform: string | null, iso: string) => auctionRankSeason(platform, new Date(iso));
    assert.equal(season('kr', '2026-01-08T02:59:59Z'), null);
    assert.equal(season('kr', '2026-01-08T03:00:00Z'), '2026-S1');
    assert.equal(season('kr', '2026-04-28T14:59:59Z'), '2026-S1');
    assert.equal(season('kr', '2026-04-28T15:00:00Z'), null);
    assert.equal(season('kr', '2026-04-29T03:00:00Z'), '2026-S2');
    assert.equal(season('na1', '2026-04-29T03:00:00Z'), '2026-S1');
    assert.equal(season('na1', '2026-04-29T18:59:59Z'), null);
    assert.equal(season('na1', '2026-04-29T19:00:00Z'), '2026-S2');
    assert.equal(season('euw1', '2026-07-28T23:00:00Z'), null);
    assert.equal(season('euw1', '2026-07-29T11:00:00Z'), '2026-S3');
    assert.equal(season('kr', '2027-01-01T01:00:00Z'), null);
    assert.equal(season('unknown', '2026-11-22T00:00:00Z'), null);
    assert.equal(season(null, '2026-11-22T00:00:00Z'), null);
});
