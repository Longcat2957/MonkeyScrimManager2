import { and, asc, eq, isNull } from 'drizzle-orm';
import { bracketSeats, bracketTemplate, isBestOf, resolveWinners, STAGE_LABEL, type BracketMatch, type BracketStage, type BracketView } from '../../features/scrims/bracket.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { games, matches, scrimBracketNodes, scrimBracketSlots, scrimParticipantRegistrations, scrimParticipants, scrimRounds, scrims, scrimTeams } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { findScrim, readGuild } from './queries.ts';
import { mutateScrim, type ScrimRow } from './operation.ts';
import type { RevisionInput, ScrimAccessDependencies } from './service.ts';
import { requireUuid } from './validation.ts';

function nodeKey(teamCount: number, round: number, number: number): string {
	if (teamCount === 2 || round === 2) return 'final';
	return teamCount === 3 ? 'semi' : `semi-${number}`;
}

export async function getBracketInTransaction(tx: Transaction, row: ScrimRow, canManage: boolean): Promise<BracketView | null> {
	const rounds = await tx.select().from(scrimRounds).where(eq(scrimRounds.scrimId, row.id)).orderBy(asc(scrimRounds.roundNumber));
	if (!rounds.length) return null;
	const nodes = await tx.select().from(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, row.id));
	const slots = await tx.select().from(scrimBracketSlots).where(eq(scrimBracketSlots.scrimId, row.id));
	const persisted = await tx.select().from(matches).where(eq(matches.scrimId, row.id));
	const results = await tx.select({ matchId: games.matchId, blueTeamSlot: games.blueTeamSlot, winnerSide: games.winnerSide }).from(games)
		.where(and(eq(games.scrimId, row.id), eq(games.status, 'completed')));
	const teams = await tx.select().from(scrimTeams).where(and(eq(scrimTeams.scrimId, row.id), eq(scrimTeams.isActive, true))).orderBy(asc(scrimTeams.ordinal));
	const members = await tx.select({ id: scrimParticipants.id, teamId: scrimParticipants.teamId, displayName: scrimParticipants.displayName, position: scrimParticipants.position })
		.from(scrimParticipants).innerJoin(scrimParticipantRegistrations, eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id))
		.where(and(eq(scrimParticipants.scrimId, row.id), eq(scrimParticipantRegistrations.status, 'selected'), isNull(scrimParticipantRegistrations.withdrawnAt))).orderBy(asc(scrimParticipants.id));
	const keys = new Map(nodes.map((node) => [node.id, nodeKey(row.teamCount, rounds.find((round) => round.id === node.roundId)!.roundNumber, node.matchNumber)]));
	const template = bracketTemplate(row.teamCount);
	const entries: BracketMatch[] = template.map((item) => {
		const node = nodes.find((entry) => keys.get(entry.id) === item.key);
		if (!node) throw new DomainError('CONFLICT', '저장된 대진 구조를 확인해야 해요');
		const match = persisted.find((entry) => entry.id === node.matchId);
		const side = (slot: 'a' | 'b') => {
			const stored = slots.find((entry) => entry.nodeId === node.id && entry.slot === slot);
			if (!stored) throw new DomainError('CONFLICT', '저장된 대진 자리를 확인해야 해요');
			return { seat: stored.sourceNodeId ? null : `${item.key}-${slot}`, from: stored.sourceNodeId ? keys.get(stored.sourceNodeId) ?? null : null, teamId: stored.teamId };
		};
		let scoreA = 0;
		let scoreB = 0;
		for (const game of results.filter((result) => result.matchId === match?.id)) {
			const winner = game.winnerSide === 'blue' ? game.blueTeamSlot : game.blueTeamSlot === 'a' ? 'b' : 'a';
			if (winner === 'a') scoreA += 1; else scoreB += 1;
		}
		return { ...item, a: side('a'), b: side('b'), scoreA, scoreB, status: match?.status ?? (['ended_early', 'cancelled'].includes(row.status) ? 'cancelled' : 'pending'),
			winner: match?.winnerTeamId ? match.winnerTeamId === match.teamAId ? 'a' : 'b' : null, matchId: match?.id ?? null };
	});
	const bestOf: BracketView['bestOf'] = {};
	for (const round of rounds) {
		if (!isBestOf(round.bestOf)) throw new DomainError('CONFLICT', '저장된 경기 방식을 확인해야 해요');
		bestOf[row.teamCount === 2 || round.roundNumber === 2 ? 'final' : 'semi'] = round.bestOf;
	}
	return { teams: teams.map((team) => ({ id: team.id, name: team.name, members: members.filter((member) => member.teamId === team.id).map(({ teamId: _, ...member }) => ({ ...member, iconUrl: null })) })),
		matches: resolveWinners(entries), bestOf, confirmed: row.bracketConfirmedAt !== null,
		can: { edit: canManage && row.status === 'ready' && row.bracketConfirmedAt === null, unlock: canManage && row.status === 'ready' && row.bracketConfirmedAt !== null } };
}

export async function getBracket(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies) {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx, _user, guild) => {
		const row = await findScrim(tx, guildId, scrimId);
		if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
		return getBracketInTransaction(tx, row, guild.isAdmin);
	}, access);
}

export async function assertNoGames(tx: Transaction, scrimId: string): Promise<void> {
	const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.scrimId, scrimId)).limit(1);
	if (game) throw new DomainError('CONFLICT', '기록된 게임이 있어 이전 단계로 되돌릴 수 없어요');
}

/** Game이 하나도 없는 Match만 제거하며, 먼저 대진의 참조를 비운다. */
export async function removeUnplayedMatches(tx: Transaction, scrimId: string): Promise<void> {
	await tx.select({ id: matches.id }).from(matches).where(eq(matches.scrimId, scrimId)).orderBy(asc(matches.id)).for('update');
	await assertNoGames(tx, scrimId);
	await tx.update(scrimBracketNodes).set({ matchId: null }).where(eq(scrimBracketNodes.scrimId, scrimId));
	await tx.delete(matches).where(eq(matches.scrimId, scrimId));
}

export async function deleteDraftBracket(tx: Transaction, scrimId: string): Promise<void> {
	await removeUnplayedMatches(tx, scrimId);
	await tx.delete(scrimBracketSlots).where(eq(scrimBracketSlots.scrimId, scrimId));
	await tx.delete(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, scrimId));
	await tx.delete(scrimRounds).where(eq(scrimRounds.scrimId, scrimId));
	await tx.update(scrims).set({ bracketConfirmedAt: null, bracketConfirmedByUserId: null }).where(eq(scrims.id, scrimId));
}

/** 편성 확정의 트랜잭션에서만 빈 대진을 만든다. 조회에서는 호출하지 않는다. */
export async function createBracketDraft(tx: Transaction, row: ScrimRow): Promise<void> {
	await deleteDraftBracket(tx, row.id);
	const template = bracketTemplate(row.teamCount);
	if (!template.length) throw new DomainError('CONFLICT', '팀 수를 확인해 주세요');
	const roundIds = new Map<BracketStage, string>();
	for (const stage of row.teamCount === 2 ? ['final'] as const : ['semi', 'final'] as const) {
		const [round] = await tx.insert(scrimRounds).values({ scrimId: row.id, roundNumber: stage === 'final' && row.teamCount > 2 ? 2 : 1,
			label: STAGE_LABEL[stage], bestOf: stage === 'final' && row.teamCount > 2 ? 5 : 3 }).returning();
		roundIds.set(stage, round!.id);
	}
	const nodeIds = new Map<string, string>();
	for (const item of template) {
		const [node] = await tx.insert(scrimBracketNodes).values({ scrimId: row.id, roundId: roundIds.get(item.stage)!, matchNumber: item.key === 'semi-2' ? 2 : 1 }).returning();
		nodeIds.set(item.key, node!.id);
	}
	for (const item of template) for (const slot of ['a', 'b'] as const) {
		await tx.insert(scrimBracketSlots).values({ scrimId: row.id, nodeId: nodeIds.get(item.key)!, slot, sourceNodeId: item[slot].from ? nodeIds.get(item[slot].from!) : null });
	}
}

async function editableBracket(tx: Transaction, row: ScrimRow, confirmed = false) {
	if (row.status !== 'ready' || Boolean(row.bracketConfirmedAt) !== confirmed) throw new DomainError('CONFLICT', confirmed ? '대진 확정을 해제할 수 없는 단계예요' : '대진 준비 단계에서 확정을 해제한 뒤 변경해 주세요');
	const bracket = await getBracketInTransaction(tx, row, true);
	if (!bracket) throw new DomainError('CONFLICT', '팀 편성을 먼저 확정해 주세요');
	return bracket;
}

export async function placeBracketTeam(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { seat: string; teamId: string | null }, access?: ScrimAccessDependencies) {
	if (input.teamId !== null) requireUuid(input.teamId, '팀');
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		const bracket = await editableBracket(tx, row);
		if (!bracketSeats(bracket.matches).some((seat) => seat.key === input.seat)) throw new DomainError('INVALID_INPUT', '배치할 자리를 다시 골라 주세요');
		if (input.teamId && !bracket.teams.some((team) => team.id === input.teamId)) throw new DomainError('NOT_FOUND', '이 내전의 팀을 찾을 수 없어요');
		const roundRows = await tx.select().from(scrimRounds).where(eq(scrimRounds.scrimId, row.id));
		const nodeRows = await tx.select().from(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, row.id));
		const side = input.seat.endsWith('-a') ? 'a' : 'b';
		const key = input.seat.slice(0, -2);
		const node = nodeRows.find((item) => nodeKey(row.teamCount, roundRows.find((round) => round.id === item.roundId)!.roundNumber, item.matchNumber) === key)!;
		if (input.teamId) await tx.update(scrimBracketSlots).set({ teamId: null }).where(and(eq(scrimBracketSlots.scrimId, row.id), eq(scrimBracketSlots.teamId, input.teamId)));
		await tx.update(scrimBracketSlots).set({ teamId: input.teamId }).where(and(eq(scrimBracketSlots.nodeId, node.id), eq(scrimBracketSlots.slot, side), isNull(scrimBracketSlots.sourceNodeId)));
	}, access);
}

export async function setBracketBestOf(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { stage: string; bestOf: number }, access?: ScrimAccessDependencies) {
	if (!isBestOf(input.bestOf) || !['semi', 'final'].includes(input.stage)) throw new DomainError('INVALID_INPUT', '경기 방식을 다시 골라 주세요');
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		const bracket = await editableBracket(tx, row);
		if (!(input.stage in bracket.bestOf)) throw new DomainError('INVALID_INPUT', '이 대진에 없는 라운드예요');
		await tx.update(scrimRounds).set({ bestOf: input.bestOf }).where(and(eq(scrimRounds.scrimId, row.id), eq(scrimRounds.roundNumber, input.stage === 'final' && row.teamCount > 2 ? 2 : 1)));
	}, access);
}

export async function resetBracket(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		await editableBracket(tx, row);
		await tx.update(scrimBracketSlots).set({ teamId: null }).where(and(eq(scrimBracketSlots.scrimId, row.id), isNull(scrimBracketSlots.sourceNodeId)));
	}, access);
}

export async function confirmBracket(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row, user) => {
		const bracket = await editableBracket(tx, row);
		const seats = bracketSeats(bracket.matches);
		if (bracket.teams.length !== row.teamCount || seats.length !== row.teamCount || seats.some((seat) => !bracket.teams.some((team) => team.id === seat.teamId)) || new Set(seats.map((seat) => seat.teamId)).size !== row.teamCount) {
			throw new DomainError('CONFLICT', '모든 팀을 서로 다른 자리에 배치해 주세요');
		}
		await tx.update(scrims).set({ bracketConfirmedAt: new Date(), bracketConfirmedByUserId: user.userId }).where(eq(scrims.id, row.id));
	}, access);
}

export async function unlockBracket(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		await editableBracket(tx, row, true);
		await assertNoGames(tx, row.id);
		await tx.update(scrims).set({ bracketConfirmedAt: null, bracketConfirmedByUserId: null }).where(eq(scrims.id, row.id));
	}, access);
}

/** 시작과 결과 등록이 같은 트랜잭션에서 호출한다. 양 팀이 정해진 노드만 실제 경기를 갖는다. */
export async function createResolvedMatches(tx: Transaction, row: ScrimRow): Promise<number> {
	if (row.status !== 'ready' && row.status !== 'in_progress') throw new DomainError('CONFLICT', '현재 단계에서 경기를 만들 수 없어요');
	const bracket = await getBracketInTransaction(tx, row, true);
	if (!bracket?.confirmed) throw new DomainError('CONFLICT', '대진을 먼저 확정해 주세요');
	const rounds = await tx.select().from(scrimRounds).where(eq(scrimRounds.scrimId, row.id));
	const nodes = await tx.select().from(scrimBracketNodes).where(eq(scrimBracketNodes.scrimId, row.id));
	let created = 0;
	for (const item of bracket.matches) {
		if (item.matchId || !item.a.teamId || !item.b.teamId) continue;
		if (item.a.teamId === item.b.teamId) throw new DomainError('CONFLICT', '서로 다른 두 팀이 필요해요');
		const node = nodes.find((entry) => nodeKey(row.teamCount, rounds.find((round) => round.id === entry.roundId)!.roundNumber, entry.matchNumber) === item.key)!;
		const [match] = await tx.insert(matches).values({ scrimId: row.id, teamAId: item.a.teamId, teamBId: item.b.teamId, label: item.label,
			bestOf: bracket.bestOf[item.stage]!, isHardFearless: row.isHardFearless, status: 'in_progress', startedAt: new Date() }).returning({ id: matches.id });
		await tx.update(scrimBracketNodes).set({ matchId: match!.id }).where(eq(scrimBracketNodes.id, node.id));
		created += 1;
	}
	return created;
}
