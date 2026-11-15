import { eq, inArray } from 'drizzle-orm';
import type { Actor } from '../auth/types.ts';
import { users } from '../db/schema.ts';
import type { Transaction } from '../db/types.ts';
import { isDiscordId } from '../discord/client.ts';
import { DomainError } from '../errors.ts';

export type PublicIdentity = {
    userId: string;
    // 공개 설정이 바뀌어도 같은 사람의 목록·추가 조회 키는 유지한다.
    identityKey: string;
    displayName: string;
    avatarUrl: string | null;
    profileVisible: boolean;
    showRiotIds: boolean;
};

/** DB·업무 계산의 사용자 ID는 건드리지 않고 공개 DTO에 필요한 표현만 한 번에 읽는다. */
export async function readPublicIdentities(
    tx: Transaction,
    userIds: readonly (string | null | undefined)[]
): Promise<Map<string, PublicIdentity>> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return new Map();
    const rows = await tx.select().from(users).where(inArray(users.id, ids));
    return new Map(
        rows.map((row) => {
            const visible = row.publicProfile && row.withdrawnAt === null;
            return [
                row.id,
                {
                    userId: visible ? row.id : row.publicId,
                    identityKey: row.publicId,
                    displayName: visible
                        ? row.globalName || row.username
                        : row.withdrawnAt
                          ? '탈퇴한 사용자'
                          : '비공개 사용자',
                    avatarUrl:
                        visible && row.avatarHash
                            ? `https://cdn.discordapp.com/avatars/${row.id}/${row.avatarHash}.webp?size=128`
                            : null,
                    profileVisible: visible,
                    showRiotIds: row.withdrawnAt === null && row.publicRiotIds
                }
            ];
        })
    );
}

/** 과거 이름도 현재 공개 설정을 따르며 누락된 사용자에게서 스냅샷 개인정보를 되살리지 않는다. */
export function publicDisplayName(identity: PublicIdentity | undefined, snapshotName?: string | null) {
    return identity?.profileVisible
        ? snapshotName || identity.displayName
        : identity?.displayName || '삭제된 사용자';
}

/** 공개 UUID는 기록 탐색에 쓰고 비공개 사용자의 기존 Discord 경로는 권한 확인 때만 허용한다. */
export async function resolveRecordUser(
    tx: Transaction,
    identifier: string,
    actor: Actor | null,
    privateLegacyAdmin = false
) {
    const legacy = isDiscordId(identifier);
    const opaque = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        identifier
    );
    if (!legacy && !opaque) throw new DomainError('NOT_FOUND', '사용자를 찾을 수 없어요');
    const [user] = await tx
        .select()
        .from(users)
        .where(legacy ? eq(users.id, identifier) : eq(users.publicId, identifier))
        .limit(1);
    if (
        !user ||
        (legacy &&
            (!user.publicProfile || user.withdrawnAt !== null) &&
            actor?.userId !== user.id &&
            !privateLegacyAdmin)
    )
        throw new DomainError('NOT_FOUND', '사용자를 찾을 수 없어요');
    return user;
}
