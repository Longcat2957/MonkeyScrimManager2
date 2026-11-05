import { createHash, randomBytes } from 'node:crypto';
import type { SessionUser } from '#lib/features/guild/types.ts';

export const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export function hashSessionToken(token: string): string | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return createHash('sha256').update(token).digest('hex');
}

export function newSession(userId: string, now = new Date()) {
    const token = randomBytes(32).toString('base64url');
    return {
        token,
        record: {
            tokenHash: hashSessionToken(token)!,
            userId,
            createdAt: now,
            expiresAt: new Date(now.getTime() + SESSION_LIFETIME_SECONDS * 1000)
        }
    };
}

export function sessionExpired(expiresAt: Date, now = new Date()) {
    return !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
}

export function sessionUser(user: {
    id: string;
    username: string;
    globalName: string | null;
    avatarHash: string | null;
    isServiceAdmin: boolean;
}): SessionUser {
    return {
        userId: user.id,
        displayName: user.globalName || user.username,
        avatarUrl: user.avatarHash
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatarHash}.webp?size=128`
            : null,
        isServiceAdmin: user.isServiceAdmin
    };
}
