import { randomBytes, randomUUID } from 'node:crypto';
import type { Database } from '../../../src/lib/server/db/types.ts';
import * as schema from '../../../src/lib/server/db/schema.ts';

/** 최신 25개 밖에도 복구할 게시 작업이 남아 있는 운영 이력을 만든다. */
export async function seedPublicationSearch(db: Database, guildId: string, otherGuildId: string) {
    const [older, foreign, ...recent] = await db
        .insert(schema.scrims)
        .values([
            { guildId, title: '이전 주차 특별 내전' },
            { guildId: otherGuildId, title: '이전 주차 특별 내전 외부 서버' },
            ...Array.from({ length: 30 }, (_, index) => ({ guildId, title: `최근 내전 ${index}` }))
        ])
        .returning();
    const [oldJob, foreignJob] = await db
        .insert(schema.discordPublicationJobs)
        .values([
            {
                scrimId: older!.id,
                kind: 'recruitment' as const,
                status: 'blocked' as const,
                nonce: randomUUID(),
                updatedAt: new Date('2024-01-01')
            },
            {
                scrimId: foreign!.id,
                kind: 'recruitment' as const,
                status: 'uncertain' as const,
                nonce: randomUUID(),
                updatedAt: new Date('2025-01-01')
            },
            ...recent.map((scrim, index) => ({
                scrimId: scrim.id,
                kind: 'recruitment' as const,
                status: index % 2 ? ('blocked' as const) : ('uncertain' as const),
                nonce: randomUUID(),
                updatedAt: new Date(Date.UTC(2024, 1, index + 1))
            }))
        ])
        .returning();
    return { older: older!, oldJob: oldJob!, foreign: foreign!, foreignJob: foreignJob! };
}

export async function seedLiteralPublications(db: Database, guildId: string) {
    const titles = [
        '100% 승률',
        '100X 승률',
        'under_score',
        'underXscore',
        'back\\slash',
        'backXslash',
        'MiXeD Case'
    ];
    const scrims = await db
        .insert(schema.scrims)
        .values(titles.map((title) => ({ guildId, title })))
        .returning();
    return db
        .insert(schema.discordPublicationJobs)
        .values(
            scrims.map((scrim) => ({
                scrimId: scrim.id,
                kind: 'recruitment' as const,
                status: 'blocked' as const,
                nonce: randomUUID()
            }))
        )
        .returning();
}

/** 저장된 게시 대상의 조회를 검증하므로 ROFL 입력과 라인업 확정 절차는 다시 실행하지 않는다. */
export async function seedPublicationTargets(db: Database, guildId: string, recipientIds: [string, string]) {
    const [scrim] = await db
        .insert(schema.scrims)
        .values({ guildId, title: '한 내전의 여러 게시 대상', teamCount: 4 })
        .returning();
    const teams = await db
        .insert(schema.scrimTeams)
        .values(
            ['포로팀', '칼날부리팀', '돌거북팀', '바위게팀'].map((name, index) => ({
                scrimId: scrim!.id,
                name,
                ordinal: index + 1
            }))
        )
        .returning();
    const matches = await db
        .insert(schema.matches)
        .values([
            {
                scrimId: scrim!.id,
                teamAId: teams[0]!.id,
                teamBId: teams[1]!.id,
                label: '준결승 A',
                bestOf: 3,
                isHardFearless: false
            },
            {
                scrimId: scrim!.id,
                teamAId: teams[2]!.id,
                teamBId: teams[3]!.id,
                label: '준결승 B',
                bestOf: 3,
                isHardFearless: false
            }
        ])
        .returning();
    const lineups = await db
        .insert(schema.matchLineups)
        .values(
            matches.map((match) => ({
                scrimId: scrim!.id,
                matchId: match.id,
                confirmedAt: new Date()
            }))
        )
        .returning();
    const metadata = await db
        .insert(schema.roflMetadata)
        .values(
            [1, 2].map(() => ({
                fileSha256: randomBytes(32).toString('hex'),
                fileSizeBytes: 100,
                formatVersion: 2,
                gameVersion: '26.21',
                projectionVersion: 1
            }))
        )
        .returning();
    const games = await db
        .insert(schema.games)
        .values([
            {
                scrimId: scrim!.id,
                matchId: matches[0]!.id,
                gameNumber: 1,
                blueTeamSlot: 'a' as const,
                status: 'completed' as const,
                winnerSide: 'blue' as const,
                roflMetadataId: metadata[0]!.id
            },
            {
                scrimId: scrim!.id,
                matchId: matches[0]!.id,
                gameNumber: 2,
                blueTeamSlot: 'a' as const,
                status: 'completed' as const,
                winnerSide: 'red' as const,
                roflMetadataId: metadata[1]!.id
            },
            {
                scrimId: scrim!.id,
                matchId: matches[0]!.id,
                gameNumber: 1,
                blueTeamSlot: 'a' as const,
                status: 'cancelled' as const,
                winnerSide: null,
                roflMetadataId: metadata[0]!.id
            }
        ])
        .returning();
    await db.insert(schema.scrimParticipants).values(
        recipientIds.map((userId, index) => ({
            scrimId: scrim!.id,
            userId,
            displayName: index === 0 ? '수신자 A%' : '수신자 B_'
        }))
    );
    const [result1, result2, cancelledResult, lineupA, lineupB, dmA, dmB] = await db
        .insert(schema.discordPublicationJobs)
        .values(
            [
                ...games.map((game) => ({ kind: 'result' as const, subjectId: game.id })),
                ...lineups.map((lineup) => ({ kind: 'lineup' as const, subjectId: lineup.id })),
                ...recipientIds.map((subjectId) => ({ kind: 'confirmation_dm' as const, subjectId }))
            ].map((target, index) => ({
                ...target,
                scrimId: scrim!.id,
                nonce: randomUUID(),
                status: index % 2 ? ('uncertain' as const) : ('blocked' as const)
            }))
        )
        .returning();
    return {
        scrim: scrim!,
        result1: result1!,
        result2: result2!,
        cancelledResult: cancelledResult!,
        lineupA: lineupA!,
        lineupB: lineupB!,
        dmA: dmA!,
        dmB: dmB!
    };
}
