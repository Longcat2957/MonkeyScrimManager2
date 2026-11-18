import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import {
    linkRiotAccount,
    setPrimaryRiotAccount,
    unlinkRiotAccount
} from '../../../../src/lib/server/accounts/service.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { listGuildAudit } from '../../../../src/lib/server/guild/audit.ts';
import {
    getGuildDiscordSettings,
    setGuildDiscordSetting
} from '../../../../src/lib/server/guild/settings.ts';
import { createAccessFixture } from '../../support/access-fixtures.ts';

const domain = (code: DomainError['code']) => (error: unknown) =>
    error instanceof DomainError && error.code === code;
const page = { page: 1, pageSize: 100 };

test('계정 연결·대표 변경·해제와 자동 대표 승계를 한 기록씩 남기며 같은 요청은 추가하지 않는다', async (t) => {
    const f = await createAccessFixture(t);
    const link = (name: string) =>
        linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, name + '#KR1', f.dependencies);
    await link('First');
    await link('First');
    await link('Second');
    const accounts = await f.db.select().from(schema.riotAccounts);
    const first = accounts.find((item) => item.gameName === 'First')!;
    const second = accounts.find((item) => item.gameName === 'Second')!;
    await setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, second.id, f.dependencies);
    await setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, second.id, f.dependencies);
    await unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, second.id, f.dependencies);
    await unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, first.id, f.dependencies);

    const result = await listGuildAudit(f.db, f.owner, f.ids.guild, page, f.dependencies);
    assert.equal(result.total, 5);
    assert.ok(result.entries.every((entry) => entry.actor.userId === f.ids.owner));
    assert.ok(result.entries.every((entry) => entry.target?.userId === f.ids.member));
    const links = result.entries.filter((entry) => entry.kind === 'riot_account_linked');
    assert.equal(links.length, 2);
    assert.equal(links.find((entry) => entry.account?.id === first.id)!.primary!.before, null);
    assert.equal(links.find((entry) => entry.account?.id === second.id)!.primary!.after!.id, first.id);
    const changed = result.entries.find((entry) => entry.kind === 'riot_account_primary_changed')!;
    assert.deepEqual(changed.primary, {
        before: { id: first.id, riotId: 'First#KR1' },
        after: { id: second.id, riotId: 'Second#KR1' }
    });
    const unlinked = result.entries.filter((entry) => entry.kind === 'riot_account_unlinked');
    assert.equal(unlinked.find((entry) => entry.account?.id === second.id)!.primary!.after!.id, first.id);
    assert.equal(unlinked.find((entry) => entry.account?.id === first.id)!.primary!.after, null);
    assert.equal((await f.db.select().from(schema.guildRiotAccounts)).length, 0);
    assert.equal((await f.db.select().from(schema.riotAccounts)).length, 2);
    assert.equal(JSON.stringify(result).includes('account_First'), false);
    assert.ok(result.entries.every((entry) => !('puuid' in (entry.account ?? {}))));
});

test('Discord 설정은 조회·같은 값에 기록하지 않고 삭제된 선택지의 이전 이름과 변경값을 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    const change = (key: string, value: string | null) =>
        setGuildDiscordSetting(f.db, f.owner, f.ids.guild, key, value, { discord: f.discord });
    await getGuildDiscordSettings(f.db, f.owner, f.ids.guild, { discord: f.discord });
    await change('recruitmentChannelId', null);
    assert.equal((await f.db.select().from(schema.guildAuditEntries)).length, 0);
    await change('recruitmentChannelId', f.ids.channel);
    await change('recruitmentChannelId', f.ids.channel);
    await change('operatorRoleId', f.ids.role);
    await change('entryChannelId', f.ids.otherChannel);
    await change('resultChannelId', f.ids.otherChannel);
    f.channels.set(
        f.ids.guild,
        f.channels.get(f.ids.guild)!.filter((channel) => channel.id !== f.ids.channel)
    );
    await change('recruitmentChannelId', null);
    const result = await listGuildAudit(f.db, f.owner, f.ids.guild, page, f.dependencies);
    assert.equal(result.total, 5);
    assert.ok(result.entries.every((entry) => entry.kind === 'discord_setting_changed'));
    const cleared = result.entries.find(
        (entry) => entry.setting?.key === 'recruitmentChannelId' && entry.setting.after === null
    )!;
    assert.deepEqual(cleared.setting!.before, { id: f.ids.channel, name: '모집' });
    assert.equal(cleared.account, null);
    assert.equal(cleared.target, null);
    assert.deepEqual(
        new Set(result.entries.map((entry) => entry.setting!.key)),
        new Set(['operatorRoleId', 'recruitmentChannelId', 'entryChannelId', 'resultChannelId'])
    );
});

test('감사 목록은 관리자만 읽고 서버 경계·실시간 권한 회수·결정적인 쪽 이동을 지킨다', async (t) => {
    const f = await createAccessFixture(t);
    for (const name of ['One', 'Two', 'Three'])
        await linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, name + '#KR1', f.dependencies);
    await linkRiotAccount(f.db, f.owner, f.ids.otherGuild, f.ids.member, 'Remote#KR1', f.dependencies);
    // 이전 버전이 남긴 감사 원장은 보존하되 현재 목록의 페이지 수와 항목에는 포함하지 않는다.
    await f.pool.query(
        `INSERT INTO guild_audit_entries (guild_id, kind) VALUES
         ($1, 'auction_seed_price_changed'), ($1, 'auction_override_price_changed')`,
        [f.ids.guild]
    );
    await f.db.update(schema.guildAuditEntries).set({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const all = await listGuildAudit(f.db, f.owner, f.ids.guild, page, f.dependencies);
    assert.equal(all.total, 3);
    assert.deepEqual(
        all.entries.map((entry) => entry.id),
        all.entries
            .map((entry) => entry.id)
            .sort()
            .reverse()
    );
    const ids: string[] = [];
    for (const number of [1, 2, 3]) {
        const result = await listGuildAudit(
            f.db,
            f.owner,
            f.ids.guild,
            { page: number, pageSize: 1 },
            f.dependencies
        );
        assert.equal(result.total, 3);
        ids.push(result.entries[0]!.id);
    }
    assert.deepEqual(
        ids,
        all.entries.map((entry) => entry.id)
    );
    assert.equal(
        (await listGuildAudit(f.db, f.owner, f.ids.otherGuild, page, f.dependencies)).entries[0]!.account!
            .gameName,
        'Remote'
    );
    await assert.rejects(
        listGuildAudit(f.db, null, f.ids.guild, page, f.dependencies),
        domain('UNAUTHENTICATED')
    );
    await assert.rejects(
        listGuildAudit(f.db, f.member, f.ids.guild, page, f.dependencies),
        domain('FORBIDDEN')
    );
    await assert.rejects(
        listGuildAudit(f.db, f.owner, f.ids.guild, { page: 0, pageSize: 20 }, f.dependencies),
        domain('INVALID_INPUT')
    );
    await setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'operatorRoleId', f.ids.role, {
        discord: f.discord
    });
    assert.equal((await listGuildAudit(f.db, f.member, f.ids.guild, page, f.dependencies)).total, 4);
    f.members.get(f.ids.guild)!.get(f.ids.member)!.roleIds = [];
    await assert.rejects(
        listGuildAudit(f.db, f.member, f.ids.guild, page, f.dependencies),
        domain('FORBIDDEN')
    );
    f.members.get(f.ids.guild)!.delete(f.ids.owner);
    await assert.rejects(
        listGuildAudit(f.db, f.owner, f.ids.guild, page, f.dependencies),
        domain('NOT_FOUND')
    );
});

test('감사 저장 실패는 계정 연결·대표 변경·해제·Discord 설정까지 모두 되돌린다', async (t) => {
    const f = await createAccessFixture(t);
    const first = await f.seedAccount();
    const second = await f.seedAccount(f.ids.guild, f.ids.member, false);
    const initial = await f.db.select().from(schema.guildRiotAccounts);
    await f.pool.query('ALTER TABLE guild_audit_entries ADD CONSTRAINT fixture_audit_failure CHECK (false)');
    await assert.rejects(
        linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Rollback#KR1', f.dependencies)
    );
    await assert.rejects(
        setPrimaryRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, second.id, f.dependencies)
    );
    await assert.rejects(
        unlinkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, first.id, f.dependencies)
    );
    await assert.rejects(
        setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'operatorRoleId', f.ids.role, {
            discord: f.discord
        })
    );
    assert.deepEqual(await f.db.select().from(schema.guildRiotAccounts), initial);
    assert.equal((await f.db.select().from(schema.riotAccounts)).length, 2);
    assert.equal((await f.db.select().from(schema.guildDiscordSettings)).length, 0);
    assert.equal((await f.db.select().from(schema.guildAuditEntries)).length, 0);
    assert.equal((await f.db.select().from(schema.guildDiscordRoles)).length, 0);
});

test('동시 연결·동일 설정 저장은 성공한 실질 변경만 한 번씩 기록한다', async (t) => {
    const f = await createAccessFixture(t);
    await Promise.all(
        [1, 2].map(() =>
            linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Together#KR1', f.dependencies)
        )
    );
    await Promise.all(
        [1, 2].map(() =>
            setGuildDiscordSetting(f.db, f.owner, f.ids.guild, 'resultChannelId', f.ids.channel, {
                discord: f.discord
            })
        )
    );
    const result = await listGuildAudit(f.db, f.owner, f.ids.guild, page, f.dependencies);
    assert.equal(result.total, 2);
    assert.deepEqual(
        new Set(result.entries.map((entry) => entry.kind)),
        new Set(['riot_account_linked', 'discord_setting_changed'])
    );
});

test('사용자·계정이 삭제되면 개인정보 복제 없이 참조만 비우고 관리 작업 이력을 보존한다', async (t) => {
    const f = await createAccessFixture(t);
    await linkRiotAccount(f.db, f.owner, f.ids.guild, f.ids.member, 'Forget#KR1', f.dependencies);
    const [account] = await f.db.select().from(schema.riotAccounts);
    const [before] = await f.db.select().from(schema.guildAuditEntries);
    assert.equal(JSON.stringify(before).includes('Forget'), false);
    await f.db.delete(schema.users).where(eq(schema.users.id, f.ids.member));
    await f.db.delete(schema.riotAccounts).where(eq(schema.riotAccounts.id, account!.id));
    await f.db.delete(schema.users).where(eq(schema.users.id, f.ids.owner));
    const adminRole = {
        ...f.roles.get(f.ids.guild)!.find((role) => role.id === f.ids.role)!,
        permissions: 1n << 3n
    };
    f.roles.set(f.ids.guild, [adminRole]);
    f.guilds.get(f.ids.guild)!.roles = [adminRole];
    f.members.get(f.ids.guild)!.get(f.ids.otherMember)!.roleIds = [adminRole.id];
    const result = await listGuildAudit(f.db, f.otherMember, f.ids.guild, page, f.dependencies);
    assert.equal(result.total, 1);
    assert.deepEqual(result.entries[0]!.actor, { userId: null, displayName: '삭제된 사용자' });
    assert.deepEqual(result.entries[0]!.target, { userId: null, displayName: '삭제된 사용자' });
    assert.deepEqual(result.entries[0]!.account, { id: null, gameName: null, tagLine: null });
    assert.deepEqual(result.entries[0]!.primary, { before: null, after: { id: null, riotId: null } });
});

test('0009는 기존 계정·연결·설정을 보존하며 빈 감사 원장과 삭제 보존 외래키를 추가한다', async (t) => {
    const f = await createAccessFixture(t);
    await f.seedAccount();
    await f.db
        .insert(schema.guildDiscordSettings)
        .values({ guildId: f.ids.guild, operatorRoleId: f.ids.role });
    const accounts = await f.db.select().from(schema.riotAccounts);
    const links = await f.db.select().from(schema.guildRiotAccounts);
    const settings = await f.db.select().from(schema.guildDiscordSettings);
    // 새 테이블을 제거해 0008 상태를 재현하고 생성 도구의 실제 SQL을 기존 데이터 위에 적용한다.
    await f.pool.query('DROP TABLE guild_audit_entries');
    await f.pool.query(f.migrationSql('0009_guild_audit'));
    assert.deepEqual(await f.db.select().from(schema.riotAccounts), accounts);
    assert.deepEqual(await f.db.select().from(schema.guildRiotAccounts), links);
    assert.deepEqual(await f.db.select().from(schema.guildDiscordSettings), settings);
    assert.equal((await f.db.select().from(schema.guildAuditEntries)).length, 0);
});
