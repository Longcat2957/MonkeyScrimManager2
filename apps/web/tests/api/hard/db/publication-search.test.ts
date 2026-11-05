import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { listFailedPublications } from '../../../../src/lib/server/discord/bot-service.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import { errorCode } from '../../support/domain-fixtures.ts';
import {
    seedLiteralPublications,
    seedPublicationSearch,
    seedPublicationTargets
} from '../../support/publication-search-fixtures.ts';

test('게시 복구 검색은 최신 25개보다 오래된 작업을 해당 서버에서 찾는다', async (t) => {
    const f = await createAccessFixture(t);
    const seeded = await seedPublicationSearch(f.db, f.ids.guild, f.ids.otherGuild);
    const initial = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies);
    assert.equal(initial.publications.length, 25);
    assert.ok(initial.publications.every((job) => job.id !== seeded.oldJob.id));
    const found = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies, '이전 주차');
    assert.deepEqual(
        found.publications.map((job) => job.id),
        [seeded.oldJob.id]
    );
    const foreign = await listFailedPublications(
        f.db,
        f.ids.otherGuild,
        f.ids.owner,
        f.dependencies,
        '이전 주차'
    );
    assert.deepEqual(
        foreign.publications.map((job) => job.id),
        [seeded.foreignJob.id]
    );
    const trimmed = await listFailedPublications(
        f.db,
        f.ids.guild,
        f.ids.owner,
        f.dependencies,
        '  이전 주차  '
    );
    assert.deepEqual(
        trimmed.publications.map((job) => job.id),
        [seeded.oldJob.id]
    );
    await f.db.insert(schema.discordPublicationJobs).values(
        (['pending', 'sent'] as const).map((status, index) => ({
            scrimId: seeded.older.id,
            kind: index ? ('lineup' as const) : ('entry' as const),
            subjectId: '보내지-않을-대상',
            nonce: randomUUID(),
            status
        }))
    );
    const failedOnly = await listFailedPublications(
        f.db,
        f.ids.guild,
        f.ids.owner,
        f.dependencies,
        '이전 주차'
    );
    assert.deepEqual(
        failedOnly.publications.map((job) => job.id),
        [seeded.oldJob.id]
    );
});

test('게시 복구 검색은 %, _, 역슬래시를 문자 그대로 찾고 대소문자를 구분하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const jobs = await seedLiteralPublications(f.db, f.ids.guild);
    for (const [query, index] of [
        ['%', 0],
        ['_', 2],
        ['\\', 4],
        ['mixed case', 6]
    ] as const) {
        const found = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies, query);
        assert.deepEqual(
            found.publications.map((job) => job.id),
            [jobs[index]!.id],
            query
        );
    }
});

test('같은 내전의 경기·세트·취소 결과·출전 명단·수신자를 구분하고 검색한다', async (t) => {
    const f = await createAccessFixture(t);
    const targets = await seedPublicationTargets(f.db, f.ids.guild, [f.ids.owner, f.ids.member]);
    const result = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies);
    assert.equal(result.publications.length, 7);
    assert.ok(result.publications.every((job) => job.title === targets.scrim.title));
    const labels = new Map(result.publications.map((job) => [job.id, job.targetLabel]));
    assert.equal(labels.get(targets.result1.id), '1세트 · 준결승 A · 포로팀 vs 칼날부리팀');
    assert.equal(labels.get(targets.result2.id), '2세트 · 준결승 A · 포로팀 vs 칼날부리팀');
    assert.equal(
        labels.get(targets.cancelledResult.id),
        '취소 결과 · 1세트 · 준결승 A · 포로팀 vs 칼날부리팀'
    );
    assert.equal(labels.get(targets.lineupA.id), '준결승 A · 포로팀 vs 칼날부리팀');
    assert.equal(labels.get(targets.lineupB.id), '준결승 B · 돌거북팀 vs 바위게팀');
    assert.equal(labels.get(targets.dmA.id), '수신자 A%');
    assert.equal(labels.get(targets.dmB.id), '수신자 B_');
    for (const [query, expected] of [
        ['2세트', targets.result2.id],
        ['취소 결과', targets.cancelledResult.id],
        ['준결승 B', targets.lineupB.id],
        ['바위게팀', targets.lineupB.id],
        ['수신자 A%', targets.dmA.id],
        ['수신자 B_', targets.dmB.id]
    ]) {
        const found = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies, query);
        assert.deepEqual(
            found.publications.map((job) => job.id),
            [expected],
            query
        );
    }
    const [foreignScrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.ids.otherGuild, title: '다른 서버 내전' })
        .returning();
    await f.db.insert(schema.discordPublicationJobs).values({
        scrimId: foreignScrim!.id,
        kind: 'result',
        subjectId: targets.result2.subjectId,
        status: 'blocked',
        nonce: randomUUID()
    });
    const foreign = await listFailedPublications(
        f.db,
        f.ids.otherGuild,
        f.ids.owner,
        f.dependencies,
        '포로팀'
    );
    assert.deepEqual(foreign.publications, [], '다른 내전의 Game ID를 넣어도 게시 대상 이름을 읽을 수 없다.');
});

test('게시 복구 검색은 관리자 권한과 검색어 길이·NUL 검증을 유지한다', async (t) => {
    const f = await createAccessFixture(t);
    await assert.rejects(
        listFailedPublications(f.db, f.ids.guild, f.ids.member, f.dependencies, '내전'),
        errorCode('FORBIDDEN')
    );
    await assert.rejects(
        listFailedPublications(f.db, f.ids.guild, f.ids.outsider, f.dependencies, '내전'),
        errorCode('NOT_FOUND')
    );
    for (const query of ['가'.repeat(101), '잘못된\0검색']) {
        await assert.rejects(
            listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies, query),
            errorCode('INVALID_INPUT')
        );
    }
    assert.deepEqual(
        (await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies, '가'.repeat(100)))
            .publications,
        []
    );
});

test('삭제된 라인업의 게시 정리 작업도 원본 대상 ID로 구분하고 검색한다', async (t) => {
    const f = await createAccessFixture(t);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({ guildId: f.ids.guild, title: '삭제된 대진 정리' })
        .returning();
    const jobs = await f.db
        .insert(schema.discordPublicationJobs)
        .values(
            [1, 2].map(() => ({
                scrimId: scrim!.id,
                kind: 'lineup' as const,
                subjectId: randomUUID(),
                status: 'blocked' as const,
                nonce: randomUUID()
            }))
        )
        .returning();
    const found = await listFailedPublications(f.db, f.ids.guild, f.ids.owner, f.dependencies);
    assert.deepEqual(
        found.publications.map((job) => job.targetLabel).sort(),
        jobs.map((job) => '삭제된 라인업 · ' + job.subjectId).sort()
    );
    const searched = await listFailedPublications(
        f.db,
        f.ids.guild,
        f.ids.owner,
        f.dependencies,
        jobs[0]!.subjectId
    );
    assert.deepEqual(
        searched.publications.map((job) => job.id),
        [jobs[0]!.id]
    );
});
