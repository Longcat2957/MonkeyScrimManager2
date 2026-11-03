import type { Actor } from '../auth/types.ts';
import { requireUser } from '../auth/guards.ts';
import type { Database, Transaction } from '../db/types.ts';
import type { scrims } from '../db/schema.ts';
import { requireGuildAdmin } from '../guild/access.ts';
import { bumpRevision, lockScrim, type RevisionInput, type ScrimAccessDependencies } from './service.ts';
import { requireRevision, requireUuid } from './validation.ts';

export type ScrimRow = typeof scrims.$inferSelect;

/** 편성·대진·단계 변경은 같은 내전 잠금과 revision 검사를 공유한다. */
export async function mutateScrim<T>(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput,
	operation: (tx: Transaction, row: ScrimRow, actor: Actor) => Promise<T>, access?: ScrimAccessDependencies): Promise<T> {
	const user = requireUser(actor);
	requireUuid(scrimId, '내전');
	const revision = requireRevision(input.expectedRevision);
	await requireGuildAdmin(user, guildId, { ...access, db });
	return db.transaction(async (tx) => {
		const row = await lockScrim(tx, user, guildId, scrimId, true, revision);
		const result = await operation(tx, row, user);
		await bumpRevision(tx, row.id);
		return result;
	});
}
