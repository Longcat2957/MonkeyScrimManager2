import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { and, asc, eq } from 'drizzle-orm';
import type { ChampionPreferenceInput } from '../../../../src/lib/features/me/champions.ts';
import {
    getMyChampionPreferences,
    replaceMyChampionPreferences
} from '../../../../src/lib/server/accounts/champions.ts';
import { withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    parseChampionPreferenceCatalog,
    preferredChampionResolver
} from '../../../../src/lib/server/ddragon/champion-preferences.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';
import { errorCode } from '../../support/domain-fixtures.ts';

const data = {
    Ahri: { id: 'Ahri', key: '103', name: '아리' },
    Garen: { id: 'Garen', key: '86', name: '가렌' },
    Lux: { id: 'Lux', key: '99', name: '럭스' },
    Ashe: { id: 'Ashe', key: '22', name: '애쉬' },
    Braum: { id: 'Braum', key: '201', name: '브라움' },
    Darius: { id: 'Darius', key: '122', name: '다리우스' },
    Jinx: { id: 'Jinx', key: '222', name: '징크스' },
    LeeSin: { id: 'LeeSin', key: '64', name: '리 신' },
    Nautilus: { id: 'Nautilus', key: '111', name: '노틸러스' },
    Zed: { id: 'Zed', key: '238', name: '제드' },
    Yasuo: { id: 'Yasuo', key: '157', name: '야스오' }
};
const catalog = parseChampionPreferenceCatalog({ data }, '26.21.1');
const dependencies = { catalog: async () => catalog };
const input = (championIds: number[], position: ChampionPreferenceInput['position'] = 'mid') => ({
    position,
    championIds
});
const unavailable = {
    catalog: async () => {
        throw new Error('검증용 카탈로그 장애');
    }
};

test('선호 카탈로그는 실제 key·canonical id를 연결하고 손상·중복·빈 자료를 거절한다', () => {
    const resolve = preferredChampionResolver(catalog);
    assert.deepEqual(resolve(103), {
        id: 'Ahri',
        name: '아리',
        iconUrl: 'https://ddragon.leagueoflegends.com/cdn/26.21.1/img/champion/Ahri.png'
    });
    assert.equal(resolve(999999), null);
    for (const value of [
        null,
        { data: {} },
        { data: [] },
        { data: { Ahri: { ...data.Ahri, id: 'Lux' } } },
        { data: { Ahri: { ...data.Ahri, key: '0' } } },
        { data: { Ahri: { ...data.Ahri, key: '1e2' } } },
        { data: { Ahri: { ...data.Ahri, key: '2147483648' } } },
        { data: { Ahri: { ...data.Ahri, name: '' } } },
        { data: { ...data, Lux: { ...data.Lux, key: '103' } } }
    ])
        assert.throws(
            () => parseChampionPreferenceCatalog(value, '26.21.1'),
            errorCode('SERVICE_UNAVAILABLE')
        );
});

test('본인 선호는 입력순서대로 한 포지션만 교체하고 같은 챔피언을 다른 포지션에 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    const save = (values: number[], position: ChampionPreferenceInput['position'] = 'mid') =>
        replaceMyChampionPreferences(f.db, f.member, input(values, position), dependencies);
    assert.deepEqual((await getMyChampionPreferences(f.db, f.member, dependencies)).preferences, {
        top: [],
        jungle: [],
        mid: [],
        bot: [],
        support: []
    });
    await save([103, 86], 'top');
    const ten = catalog.slice(0, 10).map((entry) => entry.championId);
    assert.deepEqual((await save(ten)).mid, ten);
    const ordered = await save([99, 103, 86]);
    assert.deepEqual(ordered.mid, [99, 103, 86]);
    assert.deepEqual(ordered.top, [103, 86]);
    const rows = await f.db
        .select()
        .from(schema.userChampionPreferences)
        .orderBy(asc(schema.userChampionPreferences.position), asc(schema.userChampionPreferences.ordinal));
    await save([99, 103, 86]);
    assert.deepEqual(
        await f.db
            .select()
            .from(schema.userChampionPreferences)
            .orderBy(
                asc(schema.userChampionPreferences.position),
                asc(schema.userChampionPreferences.ordinal)
            ),
        rows
    );
    const cleared = await save([]);
    assert.deepEqual(cleared.mid, []);
    assert.deepEqual(cleared.top, [103, 86]);
});

test('잘못된 포지션·배열·숫자·개수·중복·새 unknown은 기존 선호를 바꾸지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    await replaceMyChampionPreferences(f.db, f.member, input([103]), dependencies);
    const before = await f.db.select().from(schema.userChampionPreferences);
    for (const value of [
        { position: 'MID', championIds: [] },
        { position: 'mid', championIds: '103' },
        input([103, 103]),
        input(catalog.map((entry) => entry.championId)),
        input([0]),
        input([-1]),
        input([1.5]),
        input([Infinity]),
        input([2147483648]),
        input(['103'] as unknown as number[]),
        input([999999])
    ])
        await assert.rejects(
            replaceMyChampionPreferences(f.db, f.member, value as ChampionPreferenceInput, dependencies),
            errorCode('INVALID_INPUT')
        );
    assert.deepEqual(await f.db.select().from(schema.userChampionPreferences), before);
});

test('기존 unknown은 같은 포지션에서 보존·이동·삭제할 수 있고 다른 포지션으로 새로 복사할 수 없다', async (t) => {
    const f = await createAccessFixture(t);
    await f.db.insert(schema.userChampionPreferences).values([
        { userId: f.ids.member, position: 'mid', championId: 999999, ordinal: 1 },
        { userId: f.ids.member, position: 'mid', championId: 103, ordinal: 2 }
    ]);
    const result = await replaceMyChampionPreferences(f.db, f.member, input([103, 999999]), dependencies);
    assert.deepEqual(result.mid, [103, 999999]);
    await assert.rejects(
        replaceMyChampionPreferences(f.db, f.member, input([999999], 'top'), dependencies),
        errorCode('INVALID_INPUT')
    );
    assert.deepEqual(
        (await replaceMyChampionPreferences(f.db, f.member, input([103]), dependencies)).mid,
        [103]
    );
    await assert.rejects(
        replaceMyChampionPreferences(f.db, f.member, input([103, 999999]), dependencies),
        errorCode('INVALID_INPUT')
    );
});

test('본인 경계와 탈퇴 상태를 검사하고 카탈로그 장애에도 저장값을 유지하며 빈 목록 해제는 허용한다', async (t) => {
    const f = await createAccessFixture(t);
    await replaceMyChampionPreferences(f.db, f.member, input([103]), dependencies);
    await replaceMyChampionPreferences(f.db, f.owner, input([86]), dependencies);
    assert.deepEqual((await getMyChampionPreferences(f.db, f.owner, dependencies)).preferences.mid, [86]);
    const view = await getMyChampionPreferences(f.db, f.member, unavailable);
    assert.deepEqual(view.preferences.mid, [103]);
    assert.deepEqual(view.catalog, []);
    assert.ok(view.catalogError);
    await assert.rejects(
        replaceMyChampionPreferences(f.db, f.member, input([99]), unavailable),
        errorCode('SERVICE_UNAVAILABLE')
    );
    assert.deepEqual((await replaceMyChampionPreferences(f.db, f.member, input([]), unavailable)).mid, []);
    assert.deepEqual((await getMyChampionPreferences(f.db, f.owner, dependencies)).preferences.mid, [86]);
    await assert.rejects(getMyChampionPreferences(f.db, null, dependencies), errorCode('UNAUTHENTICATED'));
    await assert.rejects(
        replaceMyChampionPreferences(f.db, null, input([103]), dependencies),
        errorCode('UNAUTHENTICATED')
    );
    await withdrawAccount(f.db, f.member, { confirm: true });
    await assert.rejects(
        getMyChampionPreferences(f.db, f.member, dependencies),
        errorCode('UNAUTHENTICATED')
    );
    await assert.rejects(
        replaceMyChampionPreferences(f.db, f.member, input([103]), unavailable),
        errorCode('UNAUTHENTICATED')
    );
});

test('선호 교체 INSERT 실패는 먼저 삭제한 목록과 순서도 롤백한다', async (t) => {
    const f = await createAccessFixture(t);
    await replaceMyChampionPreferences(f.db, f.member, input([103, 86]), dependencies);
    const before = await f.db.select().from(schema.userChampionPreferences);
    await f.pool.query(
        'ALTER TABLE user_champion_preferences ADD CONSTRAINT fixture_champion_failure CHECK (champion_id <> 99)'
    );
    await assert.rejects(replaceMyChampionPreferences(f.db, f.member, input([99]), dependencies));
    assert.deepEqual(await f.db.select().from(schema.userChampionPreferences), before);
});

test('동시 같은·다른 포지션 저장은 완전한 목록 단위로 커밋하고 다른 포지션을 잃지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    await Promise.all([
        replaceMyChampionPreferences(f.db, f.member, input([103, 99]), dependencies),
        replaceMyChampionPreferences(f.db, f.member, input([86, 103], 'top'), dependencies)
    ]);
    const first = (await getMyChampionPreferences(f.db, f.member, dependencies)).preferences;
    assert.deepEqual(first.mid, [103, 99]);
    assert.deepEqual(first.top, [86, 103]);
    await Promise.all([
        replaceMyChampionPreferences(f.db, f.member, input([99, 103]), dependencies),
        replaceMyChampionPreferences(f.db, f.member, input([86]), dependencies)
    ]);
    const next = (await getMyChampionPreferences(f.db, f.member, dependencies)).preferences;
    assert.ok(JSON.stringify(next.mid) === '[99,103]' || JSON.stringify(next.mid) === '[86]');
    assert.deepEqual(next.top, first.top);
});

for (const withdrawFirst of [false, true])
    test(`선호 저장·탈퇴 경합은 탈퇴 뒤 설정을 재생성하지 않는다: ${withdrawFirst ? '탈퇴 우선' : '저장 우선'}`, async (t) => {
        const f = await createAccessFixture(t);
        const control = await f.pool.connect();
        let pending: Promise<PromiseSettledResult<unknown>>[] = [];
        const settle = (work: Promise<unknown>) =>
            work.then(
                (value): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value }),
                (reason): PromiseSettledResult<unknown> => ({ status: 'rejected', reason })
            );
        let open = false;
        try {
            await control.query('BEGIN');
            open = true;
            const pid = (await control.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
            await control.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [f.ids.member]);
            const waiting = async (count: number) => {
                const until = Date.now() + 2000;
                while (Date.now() < until) {
                    const result = await f.pool.query<{ total: number }>(
                        'WITH RECURSIVE waiting AS (SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid)) UNION SELECT activity.pid FROM pg_stat_activity AS activity JOIN waiting ON waiting.pid = ANY(pg_blocking_pids(activity.pid))) SELECT count(DISTINCT pid)::integer AS total FROM waiting',
                        [pid]
                    );
                    if (result.rows[0]!.total >= count) return;
                    await delay(10);
                }
                throw new Error('사용자 잠금 대기를 확인하지 못했습니다.');
            };
            const save = () => replaceMyChampionPreferences(f.db, f.member, input([103]), dependencies);
            const withdraw = () => withdrawAccount(f.db, f.member, { confirm: true });
            pending.push(settle(withdrawFirst ? withdraw() : save()));
            await waiting(1);
            pending.push(settle(withdrawFirst ? save() : withdraw()));
            await waiting(2);
            await control.query('COMMIT');
            open = false;
            const results = await Promise.all(pending);
            assert.equal(results[withdrawFirst ? 0 : 1]!.status, 'fulfilled');
            if (withdrawFirst)
                assert.ok(
                    results[1]!.status === 'rejected' && errorCode('UNAUTHENTICATED')(results[1]!.reason)
                );
            else assert.equal(results[0]!.status, 'fulfilled');
            assert.equal((await f.db.select().from(schema.userChampionPreferences)).length, 0);
            assert.ok(
                (await f.db.select().from(schema.users).where(eq(schema.users.id, f.ids.member)))[0]!
                    .withdrawnAt
            );
        } finally {
            if (open) await control.query('ROLLBACK');
            control.release();
            await Promise.all(pending);
        }
    });

test('0013은 기존 미정 순서를 생성시각·식별자로 채우고 10개 초과 항목도 삭제하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    await f.pool.query('ALTER TABLE user_champion_preferences DROP COLUMN ordinal CASCADE');
    await f.pool.query(
        "INSERT INTO user_champion_preferences(user_id, position, champion_id, created_at) VALUES ($1,'mid',103,'2026-01-02'),($1,'mid',99,'2026-01-01'),($1,'mid',86,'2026-01-01'),($2,'top',103,'2026-01-01')",
        [f.ids.member, f.ids.owner]
    );
    for (let id = 1; id <= 11; id++)
        await f.pool.query(
            "INSERT INTO user_champion_preferences(user_id,position,champion_id) VALUES ($1,'support',$2)",
            [f.ids.member, id]
        );
    const before = (
        await f.pool.query(
            'SELECT user_id,position,champion_id,created_at FROM user_champion_preferences ORDER BY user_id,position,champion_id'
        )
    ).rows;
    await f.pool.query(f.migrationSql('0013_champion_preference_order'));
    const after = await f.db
        .select()
        .from(schema.userChampionPreferences)
        .orderBy(
            asc(schema.userChampionPreferences.userId),
            asc(schema.userChampionPreferences.position),
            asc(schema.userChampionPreferences.championId)
        );
    assert.deepEqual(
        after.map(({ userId, position, championId, createdAt }) => ({
            user_id: userId,
            position,
            champion_id: championId,
            created_at: createdAt
        })),
        before
    );
    const mid = after
        .filter((row) => row.userId === f.ids.member && row.position === 'mid')
        .sort((left, right) => left.ordinal - right.ordinal);
    assert.deepEqual(
        mid.map((row) => row.championId),
        [86, 99, 103]
    );
    assert.equal(after.filter((row) => row.position === 'support').length, 11);
    await assert.rejects(
        f.db
            .insert(schema.userChampionPreferences)
            .values({ userId: f.ids.member, position: 'mid', championId: 22, ordinal: 1 })
    );
    await assert.rejects(
        f.db
            .insert(schema.userChampionPreferences)
            .values({ userId: f.ids.member, position: 'top', championId: 22, ordinal: 0 })
    );
});
