import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { createSessionStore } from '../../../../src/lib/server/auth/session-store.ts';
import { hashSessionToken } from '../../../../src/lib/server/auth/session-core.ts';
import { sessions, users } from '../../../../src/lib/server/db/schema.ts';
import { DomainError } from '../../../../src/lib/server/errors.ts';
import { createTestDatabase } from '../../support/database.ts';

const profile = { id: '910000000000000001', username: '세션 사용자', globalName: null, avatarHash: null };

test('세션 생성은 사용자와 토큰 해시를 커밋하며 다른 연결에서 읽을 수 있다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    // 관찰 연결을 먼저 점유해 서비스가 반드시 다른 연결에서 커밋하게 한다.
    const observer = await f.pool.connect();
    try {
        const issued = await store.createSession(profile);
        const stored = await observer.query('SELECT token_hash, user_id, expires_at FROM sessions');
        assert.equal(stored.rowCount, 1);
        assert.equal(stored.rows[0].token_hash, hashSessionToken(issued.token));
        assert.notEqual(stored.rows[0].token_hash, issued.token);
        assert.equal(stored.rows[0].user_id, profile.id);
        assert.equal(stored.rows[0].expires_at.getTime(), issued.session.expiresAt.getTime());
        const validated = await store.validateSession(issued.token);
        assert.deepEqual(validated?.actor, { userId: profile.id, isServiceAdmin: false });
        assert.equal(validated?.user.displayName, profile.username);
        assert.equal('tokenHash' in validated!.user, false);
    } finally {
        observer.release();
    }
});

test('재로그인은 이전 세션만 폐기하고 프로필 갱신 시 운영자 권한을 보존한다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    const old = await store.createSession(profile);
    const independent = await store.createSession(profile);
    await f.db.update(users).set({ isServiceAdmin: true }).where(eq(users.id, profile.id));
    const current = await store.createSession(
        { ...profile, username: '변경 이름', globalName: '현재 표시명' },
        old.token
    );
    assert.equal(await store.validateSession(old.token), null);
    assert.ok(await store.validateSession(independent.token));
    assert.equal((await store.validateSession(current.token))?.actor.isServiceAdmin, true);
    assert.equal((await store.getUser(profile.id))?.displayName, '현재 표시명');
    assert.equal((await f.db.select().from(sessions)).length, 2);
});

test('세션 만료 시각 직전에는 유효하고 정확한 만료 시각에는 DB에서도 삭제한다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    const issued = await store.createSession(profile);
    const expires = issued.session.expiresAt;
    assert.ok(await store.validateSession(issued.token, new Date(expires.getTime() - 1)));
    assert.equal(await store.validateSession(issued.token, expires), null);
    assert.equal((await f.db.select().from(sessions)).length, 0);
    assert.ok(await store.getUser(profile.id));
});

test('로그아웃 재요청은 안전하며 다른 사용자 세션을 삭제하지 않는다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    const first = await store.createSession(profile);
    const second = await store.createSession({ ...profile, id: '910000000000000002' });
    await store.deleteSession(first.token);
    await store.deleteSession(first.token);
    await store.deleteSession(undefined);
    await store.deleteSession('잘못된 토큰');
    assert.equal(await store.validateSession(first.token), null);
    assert.ok(await store.validateSession(second.token));
    assert.equal(await store.validateSession('잘못된 토큰'), null);
    assert.equal(await store.validateSession('z'.repeat(43)), null);
    assert.equal(await store.getUser('존재하지 않는 사용자'), null);
});

test('세션 삽입 실패 시 프로필 수정과 이전 세션 삭제도 함께 롤백한다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    const previous = await store.createSession(profile);
    // 실제 PostgreSQL 오류를 저장 도중 발생시켜 부분 커밋을 검사한다.
    await f.pool.query(`CREATE FUNCTION reject_session_insert() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION '검증용 삽입 실패'; END $$`);
    await f.pool.query(
        'CREATE TRIGGER reject_session_insert BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION reject_session_insert()'
    );
    await assert.rejects(
        store.createSession({ ...profile, username: '저장되면 안 되는 이름' }, previous.token),
        (error: unknown) => error instanceof DomainError && error.code === 'SERVICE_UNAVAILABLE'
    );
    assert.equal((await store.getUser(profile.id))?.displayName, profile.username);
    assert.ok(await store.validateSession(previous.token));
    assert.equal((await f.db.select().from(sessions)).length, 1);
});

test('사용자 삭제는 세션을 폐기하며 이후 검증은 인증된 실행자를 반환하지 않는다', async (t) => {
    const f = await createTestDatabase(t);
    const store = createSessionStore(() => f.db);
    const issued = await store.createSession(profile);
    await f.db.delete(users).where(eq(users.id, profile.id));
    assert.equal(await store.validateSession(issued.token), null);
    assert.equal((await f.db.select().from(sessions)).length, 0);
});
