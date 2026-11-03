import { eq } from 'drizzle-orm';
import type { Database } from '../db/types.ts';
import { sessions, users } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import type { DiscordProfile } from './oauth.ts';
import { hashSessionToken, newSession, sessionExpired, sessionUser } from './session-core.ts';

function sessionUnavailable() {
	return new DomainError('SERVICE_UNAVAILABLE', '로그인 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요');
}

/** DB 연결은 호출 시 주입한다. 세션 저장 규칙은 웹과 DB 검증에서 같은 구현을 사용한다. */
export function createSessionStore(getDb: () => Database) {
	async function createSession(profile: DiscordProfile, previousToken?: string) {
		const issued = newSession(profile.id);
		const previousHash = previousToken ? hashSessionToken(previousToken) : null;
		try {
			const user = await getDb().transaction(async (tx) => {
				// OAuth 프로필 갱신은 DB에서 관리하는 서비스 운영 권한을 변경하지 않는다.
				const [saved] = await tx.insert(users).values(profile).onConflictDoUpdate({
					target: users.id,
					set: { username: profile.username, globalName: profile.globalName, avatarHash: profile.avatarHash }
				}).returning();
				if (previousHash) await tx.delete(sessions).where(eq(sessions.tokenHash, previousHash));
				await tx.insert(sessions).values(issued.record);
				return saved;
			});
			return { token: issued.token, session: { tokenHash: issued.record.tokenHash, expiresAt: issued.record.expiresAt }, user: sessionUser(user) };
		} catch {
			throw sessionUnavailable();
		}
	}

	async function getUser(userId: string) {
		try {
			const [user] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
			return user ? sessionUser(user) : null;
		} catch {
			throw sessionUnavailable();
		}
	}

	async function validateSession(token: string, now = new Date()) {
		const tokenHash = hashSessionToken(token);
		if (!tokenHash) return null;
		try {
			const [row] = await getDb().select({ user: users, expiresAt: sessions.expiresAt })
				.from(sessions).innerJoin(users, eq(sessions.userId, users.id))
				.where(eq(sessions.tokenHash, tokenHash)).limit(1);
			if (!row) return null;
			if (sessionExpired(row.expiresAt, now)) {
				await getDb().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
				return null;
			}
			return {
				session: { tokenHash, expiresAt: row.expiresAt },
				actor: { userId: row.user.id, isServiceAdmin: row.user.isServiceAdmin },
				user: sessionUser(row.user)
			};
		} catch {
			throw sessionUnavailable();
		}
	}

	async function deleteSession(token: string | undefined) {
		const tokenHash = token ? hashSessionToken(token) : null;
		if (!tokenHash) return;
		try {
			await getDb().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
		} catch {
			throw sessionUnavailable();
		}
	}

	return { createSession, getUser, validateSession, deleteSession };
}
