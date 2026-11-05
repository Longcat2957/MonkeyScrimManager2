import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../errors.ts';

export function requireBotAuthorization(
    authorization: string | null,
    configuredToken: string | undefined
): void {
    const expected = configuredToken?.trim();
    if (!expected) throw new DomainError('SERVICE_UNAVAILABLE', '봇 내부 연동이 설정되지 않았어요');
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(expected)))
        throw new DomainError('UNAUTHENTICATED', '봇 인증이 필요해요');
}
