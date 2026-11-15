import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import {
    bootstrapServiceAdmin,
    getServiceAdminOverview,
    setServiceAdmin
} from '../../../../src/lib/server/service-admin/service.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) =>
    error instanceof DomainError && error.code === code;
const page = { page: 1, pageSize: 100 };
const webRoot = fileURLToPath(new URL('../../../../', import.meta.url));

test('최초 지정은 기존 사용자·운영자 0명 조건만 허용하며 길드 권한을 바꾸지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const memberships = await f.db.select().from(schema.guildMembers);
    await assert.rejects(bootstrapServiceAdmin(f.db, 'invalid'), domain('INVALID_INPUT'));
    await assert.rejects(bootstrapServiceAdmin(f.db, '990000000000000001'), domain('NOT_FOUND'));
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 0);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    await assert.rejects(bootstrapServiceAdmin(f.db, f.ids.owner), domain('CONFLICT'));
    await assert.rejects(bootstrapServiceAdmin(f.db, f.ids.member), domain('CONFLICT'));
    const overview = await getServiceAdminOverview(f.db, f.owner, page);
    assert.deepEqual(
        overview.admins.map((user) => user.userId),
        [f.ids.owner]
    );
    assert.equal(overview.entries.length, 1);
    assert.equal(overview.entries[0]!.source, 'bootstrap');
    assert.equal(overview.entries[0]!.kind, 'granted');
    assert.equal(overview.entries[0]!.actor, null);
    assert.deepEqual(await f.db.select().from(schema.guildMembers), memberships);
});

test('웹 지정·회수는 실제 변경만 기록하고 마지막 운영자·회수된 실행자의 오래된 권한을 막는다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    // 전달받은 boolean이 false여도 현재 DB의 실제 권한으로 판단한다.
    assert.deepEqual(await setServiceAdmin(f.db, f.owner, f.ids.member, true), {
        changed: true,
        selfRevoked: false
    });
    assert.deepEqual(await setServiceAdmin(f.db, f.owner, f.ids.member, true), {
        changed: false,
        selfRevoked: false
    });
    await setServiceAdmin(f.db, f.owner, f.ids.member, false);
    assert.deepEqual(await setServiceAdmin(f.db, f.owner, f.ids.member, false), {
        changed: false,
        selfRevoked: false
    });
    await assert.rejects(setServiceAdmin(f.db, f.owner, f.ids.owner, false), domain('CONFLICT'));
    await setServiceAdmin(f.db, f.owner, f.ids.otherMember, true);
    assert.deepEqual(await setServiceAdmin(f.db, f.owner, f.ids.owner, false), {
        changed: true,
        selfRevoked: true
    });
    const stale = { ...f.owner, isServiceAdmin: true };
    await assert.rejects(setServiceAdmin(f.db, stale, f.ids.member, true), domain('FORBIDDEN'));
    await assert.rejects(getServiceAdminOverview(f.db, stale, page), domain('FORBIDDEN'));
    const overview = await getServiceAdminOverview(f.db, f.otherMember, page);
    assert.deepEqual(
        overview.admins.map((user) => user.userId),
        [f.ids.otherMember]
    );
    assert.equal(overview.total, 5);
});

test('일반 사용자·비로그인·없는 사용자·잘못된 입력은 운영자와 감사 이력을 바꾸지 못한다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    const forged = { ...f.member, isServiceAdmin: true };
    await assert.rejects(setServiceAdmin(f.db, null, f.ids.member, true), domain('UNAUTHENTICATED'));
    await assert.rejects(getServiceAdminOverview(f.db, null, page), domain('UNAUTHENTICATED'));
    await assert.rejects(setServiceAdmin(f.db, forged, f.ids.member, true), domain('FORBIDDEN'));
    await assert.rejects(getServiceAdminOverview(f.db, forged, page), domain('FORBIDDEN'));
    await assert.rejects(setServiceAdmin(f.db, f.owner, '990000000000000001', true), domain('NOT_FOUND'));
    await assert.rejects(setServiceAdmin(f.db, f.owner, 'not-an-id', true), domain('INVALID_INPUT'));
    await assert.rejects(
        setServiceAdmin(f.db, f.owner, f.ids.member, 'true' as unknown as boolean),
        domain('INVALID_INPUT')
    );
    await assert.rejects(
        getServiceAdminOverview(f.db, f.owner, { page: 0, pageSize: 100 }),
        domain('INVALID_INPUT')
    );
    await assert.rejects(
        getServiceAdminOverview(f.db, f.owner, { page: 1, pageSize: 101 }),
        domain('INVALID_INPUT')
    );
    assert.equal((await getServiceAdminOverview(f.db, f.owner, page)).total, 1);
});

test('최초 지정이 동시에 실행되어도 한 명과 한 초기 지정 이력만 남는다', async (t) => {
    const f = await createAccessFixture(t);
    const results = await Promise.allSettled([
        bootstrapServiceAdmin(f.db, f.ids.owner),
        bootstrapServiceAdmin(f.db, f.ids.member)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && domain('CONFLICT')(rejected.reason));
    const admins = await f.db.select().from(schema.users).where(eq(schema.users.isServiceAdmin, true));
    assert.equal(admins.length, 1);
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 1);
});

test('두 운영자의 동시 자기 회수에서도 마지막 한 명은 보호한다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    await setServiceAdmin(f.db, f.owner, f.ids.member, true);
    const results = await Promise.allSettled([
        setServiceAdmin(f.db, f.owner, f.ids.owner, false),
        setServiceAdmin(f.db, f.member, f.ids.member, false)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && domain('CONFLICT')(rejected.reason));
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.isServiceAdmin, true))).length,
        1
    );
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 3);
});

test('서로의 권한을 동시에 회수하면 이미 회수된 실행자의 뒤 요청은 거절한다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    await setServiceAdmin(f.db, f.owner, f.ids.member, true);
    const results = await Promise.allSettled([
        setServiceAdmin(f.db, f.owner, f.ids.member, false),
        setServiceAdmin(f.db, f.member, f.ids.owner, false)
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected' && domain('FORBIDDEN')(rejected.reason));
    assert.equal(
        (await f.db.select().from(schema.users).where(eq(schema.users.isServiceAdmin, true))).length,
        1
    );
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 3);
});

test('감사 저장 실패는 웹 지정·회수와 최초 지정의 권한 변경을 모두 롤백한다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    await setServiceAdmin(f.db, f.owner, f.ids.member, true);
    const before = await f.db.select().from(schema.users);
    await f.pool.query(
        "ALTER TABLE service_admin_events ADD CONSTRAINT fixture_admin_audit_failure CHECK (source <> 'web') NOT VALID"
    );
    await assert.rejects(setServiceAdmin(f.db, f.owner, f.ids.otherMember, true));
    await assert.rejects(setServiceAdmin(f.db, f.owner, f.ids.member, false));
    assert.deepEqual(await f.db.select().from(schema.users), before);
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 2);
    assert.equal((await setServiceAdmin(f.db, f.owner, f.ids.member, true)).changed, false);
    const empty = await createAccessFixture(t);
    await empty.pool.query(
        'ALTER TABLE service_admin_events ADD CONSTRAINT fixture_admin_bootstrap_failure CHECK (false)'
    );
    await assert.rejects(bootstrapServiceAdmin(empty.db, empty.ids.owner));
    assert.equal(
        (await empty.db.select().from(schema.users).where(eq(schema.users.isServiceAdmin, true))).length,
        0
    );
    assert.equal((await empty.db.select().from(schema.serviceAdminEvents)).length, 0);
});

test('운영자 목록과 감사 쪽 이동은 결정적이며 삭제된 개인정보를 이력에 복제하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    await bootstrapServiceAdmin(f.db, f.ids.owner);
    await setServiceAdmin(f.db, f.owner, f.ids.member, true);
    await setServiceAdmin(f.db, f.owner, f.ids.member, false);
    await f.db.update(schema.serviceAdminEvents).set({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const full = await getServiceAdminOverview(f.db, f.owner, page);
    assert.equal(full.total, 3);
    assert.deepEqual(
        full.entries.map((entry) => entry.id),
        full.entries
            .map((entry) => entry.id)
            .sort()
            .reverse()
    );
    for (const index of [1, 2, 3]) {
        const single = await getServiceAdminOverview(f.db, f.owner, { page: index, pageSize: 1 });
        assert.equal(single.total, 3);
        assert.equal(single.entries[0]!.id, full.entries[index - 1]!.id);
    }
    const raw = await f.db.select().from(schema.serviceAdminEvents);
    assert.equal(JSON.stringify(raw).includes('사용자-'), false);
    await f.db.delete(schema.users).where(eq(schema.users.id, f.ids.member));
    const after = await getServiceAdminOverview(f.db, f.owner, page);
    const deleted = after.entries.filter((entry) => entry.source === 'web');
    assert.ok(
        deleted.every((entry) => entry.target.userId === null && entry.target.displayName === '삭제된 사용자')
    );
});

test('0010은 기존 운영자·사용자·길드 권한을 보존하며 빈 전역 감사 원장을 추가한다', async (t) => {
    const f = await createAccessFixture(t);
    await f.db.update(schema.users).set({ isServiceAdmin: true }).where(eq(schema.users.id, f.ids.owner));
    const before = await f.db.select().from(schema.users);
    const memberships = await f.db.select().from(schema.guildMembers);
    // 새 테이블 제거로 0009 상태를 재현하고 생성 SQL을 기존 사용자 위에 적용한다.
    await f.pool.query('DROP TABLE service_admin_events');
    const migration = await readFile(
        new URL('../../../../drizzle/0010_service_admin_events.sql', import.meta.url),
        'utf8'
    );
    await f.pool.query(
        migration.replaceAll('"public".', `"${f.schemaName}".`).replace(/\bpublic\./g, `"${f.schemaName}".`)
    );
    assert.deepEqual(await f.db.select().from(schema.users), before);
    assert.deepEqual(await f.db.select().from(schema.guildMembers), memberships);
    assert.equal((await f.db.select().from(schema.serviceAdminEvents)).length, 0);
});

test('실제 초기 지정 CLI는 격리 DB의 기존 사용자만 한 번 지정하고 연결을 종료한다', async (t) => {
    const f = await createAccessFixture(t);
    const run = () =>
        spawnSync(
            process.execPath,
            ['--experimental-strip-types', 'scripts/bootstrap-admin.mts', f.ids.owner],
            {
                cwd: webRoot,
                env: {
                    ...process.env,
                    DATABASE_URL: f.connectionString,
                    DISCORD_BOT_TOKEN: '',
                    DISCORD_CLIENT_SECRET: '',
                    BOT_INTERNAL_TOKEN: '',
                    RIOT_API_KEY: ''
                },
                encoding: 'utf8',
                timeout: 15_000,
                maxBuffer: 65_536
            }
        );
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /서비스 운영자를 초기 지정했습니다/);
    const repeated = run();
    assert.equal(repeated.status, 1);
    assert.match(repeated.stderr, /이미 서비스 운영자가 있어요/);
    assert.equal(repeated.stderr.includes(f.connectionString), false);
    const overview = await getServiceAdminOverview(f.db, f.owner, page);
    assert.equal(overview.admins.length, 1);
    assert.equal(overview.total, 1);
});
