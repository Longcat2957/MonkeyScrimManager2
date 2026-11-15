import { sql } from 'drizzle-orm';
import type { Transaction } from '../db/types.ts';

/** 가입 상태·운영 권한·종료 내전 재개는 다른 행보다 먼저 같은 트랜잭션 잠금을 잡는다. */
export async function lockUserLifecycleChanges(tx: Transaction): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(779002, 1)`);
}
