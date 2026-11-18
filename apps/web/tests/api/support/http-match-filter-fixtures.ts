import { randomBytes } from 'node:crypto';
import type { TestContext } from 'node:test';
import * as schema from '../../../src/lib/server/db/schema.ts';
import type { Database } from '../../../src/lib/server/db/types.ts';
import { championCatalogUpstream } from './http-champion-preferences-fixtures.ts';
import { createHttpRecordSeasonsFixture } from './http-record-seasons-fixtures.ts';
import { HTTP_IDS } from './http.ts';

/** 기간 경계용 DB 자료이며, 앞 시즌의 업로드 fixture와 달리 실제 ROFL 파싱을 거치지 않는다. */
export async function seedMatchFilterGame(
    db: Database,
    match: typeof schema.matches.$inferSelect,
    gameNumber: number,
    startedAt: string | null
) {
    const [metadata] = await db
        .insert(schema.roflMetadata)
        .values({
            fileSha256: randomBytes(32).toString('hex'),
            fileSizeBytes: 100,
            formatVersion: 2,
            gameVersion: '26.21',
            projectionVersion: 1
        })
        .returning();
    await db.insert(schema.roflGameDataV1).values({
        roflMetadataId: metadata!.id,
        gameLengthMs: 1_200_000,
        resultStatus: 'consistent',
        winnerReplayTeamId: 100,
        teams: [
            { teamId: 100, win: true },
            { teamId: 200, win: false }
        ]
    });
    await db.insert(schema.games).values({
        scrimId: match.scrimId,
        matchId: match.id,
        gameNumber,
        blueTeamSlot: 'a',
        status: 'completed',
        winnerSide: 'blue',
        roflMetadataId: metadata!.id,
        startedAt: startedAt ? new Date(startedAt) : null
    });
}

/** 실제 ROFL 결과와, 시간·페이지 경계를 명시한 별도 조회 fixture를 구분한다. */
export async function createHttpMatchFiltersFixture(t: TestContext) {
    const f = await createHttpRecordSeasonsFixture(t, { games: 3, upstreams: [championCatalogUpstream] });
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: ('100%_기간 필터 · ' + '긴 내전 이름 확인 '.repeat(4).trim()).slice(0, 50),
            status: 'in_progress',
            formationMethod: 'manual',
            mmrSeasonId: f.currentSeason.id
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([
            { scrimId: scrim!.id, name: '현재 시즌 포로팀', ordinal: 1 },
            { scrimId: scrim!.id, name: '현재 시즌 칼날부리팀', ordinal: 2 }
        ])
        .returning();
    const noon = '2026-10-24T03:00:00.000Z';
    type Spec = {
        key: string;
        status?: (typeof schema.matches.$inferInsert)['status'];
        dates: (string | null)[];
        cancelledDate?: string;
    };
    const specs: Spec[] = [
        ...Array.from({ length: 21 }, (_, index) => ({
            key: 'sameTime' + index,
            dates: index === 0 ? [noon, '2026-10-25T03:00:00.000Z'] : [noon]
        })),
        { key: 'beforeLower', dates: ['2026-10-23T14:59:59.999Z'] },
        { key: 'atLower', dates: ['2026-10-23T15:00:00.000Z'] },
        { key: 'atUpper', dates: ['2026-10-24T14:59:59.999Z'] },
        { key: 'afterUpper', dates: ['2026-10-24T15:00:00.000Z'] },
        { key: 'unknown', dates: [null] },
        { key: 'cancelled', status: 'cancelled', dates: [], cancelledDate: noon },
        { key: 'liveKnown', status: 'in_progress', dates: ['2026-10-24T06:00:00.000Z'] },
        { key: 'liveUnknown', status: 'pending', dates: [] }
    ];
    const cases: Record<string, typeof schema.matches.$inferSelect> = {};
    for (const [index, spec] of specs.entries()) {
        const status = spec.status ?? 'completed';
        const [match] = await f.db
            .insert(schema.matches)
            .values({
                scrimId: scrim!.id,
                teamAId: teams[0]!.id,
                teamBId: teams[1]!.id,
                bestOf: status === 'in_progress' || spec.dates.length > 1 ? 3 : 1,
                isHardFearless: false,
                status,
                winnerTeamId: status === 'completed' ? teams[0]!.id : null,
                // 운영·생성 시각이 기간 필터의 실제 경기 시각을 대신하지 않게 한다.
                startedAt: status === 'pending' ? null : new Date('2026-01-01T00:00:00.000Z'),
                createdAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') - index * 60_000)
            })
            .returning();
        cases[spec.key] = match!;
        for (const [gameIndex, startedAt] of spec.dates.entries())
            await seedMatchFilterGame(f.db, match!, gameIndex + 1, startedAt);
        if (spec.cancelledDate)
            await f.db.insert(schema.games).values({
                scrimId: scrim!.id,
                matchId: match!.id,
                gameNumber: 1,
                blueTeamSlot: 'a',
                status: 'cancelled',
                startedAt: new Date(spec.cancelledDate)
            });
    }
    const [emptySeason] = await f.db
        .insert(schema.mmrSeasons)
        .values({
            guildId: HTTP_IDS.guild,
            name: '경기 없는 종료 시즌',
            startedAt: new Date('2025-01-01T00:00:00.000Z'),
            endedAt: new Date('2025-12-31T00:00:00.000Z')
        })
        .returning();
    const [foreignSeason] = await f.db
        .insert(schema.mmrSeasons)
        .values({ guildId: HTTP_IDS.otherGuild, name: '다른 서버 시즌' })
        .returning();
    return {
        ...f,
        filterScrim: scrim!,
        filterTeams: teams,
        cases,
        emptySeason: emptySeason!,
        foreignSeason: foreignSeason!,
        matchListPath: '/g/' + HTTP_IDS.guild + '/matches'
    };
}
