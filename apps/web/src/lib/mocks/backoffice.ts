import type { ServiceAdminEvent, ServiceAdminOverview } from '#lib/features/service-admin.ts';
import { DomainError } from '#lib/server/errors.ts';
import { mockUser } from './session.ts';

// 명시적인 개발 미리보기에서만 사용하며 실제 사용자 권한이나 DB를 변경하지 않는다.
const people = [
    { userId: mockUser.userId, displayName: mockUser.displayName, isAdmin: true },
    { userId: '970000000000000099', displayName: '운영 도우미', isAdmin: true }
];
const entries: ServiceAdminEvent[] = [];

function requireMockAdmin(userId: string) {
    if (!people.some((person) => person.userId === userId && person.isAdmin))
        throw new DomainError('FORBIDDEN', '서비스를 관리할 권한이 없어요');
}

export function listMockServiceAdmins(page: number, pageSize: number): ServiceAdminOverview {
    requireMockAdmin(mockUser.userId);
    return {
        admins: people.filter((person) => person.isAdmin).map(({ isAdmin: _, ...person }) => person),
        entries: entries.slice((page - 1) * pageSize, page * pageSize),
        total: entries.length
    };
}

export function setMockServiceAdmin(actorUserId: string, targetUserId: string, enabled: boolean) {
    requireMockAdmin(actorUserId);
    const target = people.find((person) => person.userId === targetUserId);
    if (!target) throw new DomainError('NOT_FOUND', '서비스에 연결된 사용자를 찾을 수 없어요');
    if (target.isAdmin === enabled) return { changed: false, selfRevoked: false };
    if (!enabled && people.filter((person) => person.isAdmin).length === 1)
        throw new DomainError('CONFLICT', '마지막 서비스 운영자는 권한을 해제할 수 없어요');
    target.isAdmin = enabled;
    if (target.userId === mockUser.userId) mockUser.isServiceAdmin = enabled;
    entries.unshift({
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        kind: enabled ? 'granted' : 'revoked',
        source: 'web',
        actor: { userId: mockUser.userId, displayName: mockUser.displayName },
        target: { userId: target.userId, displayName: target.displayName }
    });
    return { changed: true, selfRevoked: !enabled && actorUserId === targetUserId };
}
