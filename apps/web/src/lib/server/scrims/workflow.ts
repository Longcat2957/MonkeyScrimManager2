import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FormationMethod, ScrimNextAction, ScrimRevertAction } from '../../features/scrims/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { auctionAcquisitions, auctionLots, auctionQueueEntries, auctionTeams, auctions, games, matches, scrimParticipantRegistrations, scrimParticipants, scrims } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { assertNoGames, createResolvedMatches, deleteDraftBracket, getBracketInTransaction, removeUnplayedMatches } from './bracket.ts';
import { mutateScrim, type ScrimRow } from './operation.ts';
import { findScrim, readGuild } from './queries.ts';
import { closeRecruitment, type RevisionInput, type ScrimAccessDependencies } from './service.ts';
import { requireUuid } from './validation.ts';

/** 방식 변경·모집 복귀에서 경매 원장을 보존하고 현재 편성 효과만 무효화한다. */
export async function invalidateAuctionFormation(tx: Transaction, row: ScrimRow, actor: Actor, reason: string, setup: boolean): Promise<void> {
	const [auction] = await tx.select().from(auctions).where(eq(auctions.scrimId, row.id)).for('update');
	if (!auction) return;
	const now = new Date();
	await tx.update(auctionAcquisitions).set({ voidedAt: now, voidedByUserId: actor.userId, voidReason: reason })
		.where(and(eq(auctionAcquisitions.auctionId, auction.id), isNull(auctionAcquisitions.voidedAt)));
	await tx.update(auctionLots).set({ status: 'cancelled', closedAt: now }).where(and(eq(auctionLots.auctionId, auction.id), eq(auctionLots.status, 'open')));
	await tx.update(auctionLots).set({ voidedAt: now, voidedByUserId: actor.userId, voidReason: reason })
		.where(and(eq(auctionLots.auctionId, auction.id), isNull(auctionLots.voidedAt)));
	await tx.delete(auctionQueueEntries).where(eq(auctionQueueEntries.auctionId, auction.id));
	await tx.update(auctionTeams).set({ captainParticipantId: null }).where(eq(auctionTeams.auctionId, auction.id));
	await tx.update(auctions).set({ status: setup ? 'setup' : 'cancelled', startedAt: null, endedAt: setup ? null : now }).where(eq(auctions.id, auction.id));
}

export async function chooseFormationMethod(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { method: FormationMethod | null }, access?: ScrimAccessDependencies) {
	if (input.method !== null && input.method !== 'manual' && input.method !== 'auction') throw new DomainError('INVALID_INPUT', '편성 방식을 다시 골라 주세요');
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row, user) => {
		if (!['recruit', 'preparing'].includes(row.status)) throw new DomainError('CONFLICT', '편성 방식은 팀 편성을 확정하기 전에만 바꿀 수 있어요');
		if (row.formationMethod === input.method) return;
		await assertNoGames(tx, row.id);
		await deleteDraftBracket(tx, row.id);
		await invalidateAuctionFormation(tx, row, user, '편성 방식 변경', input.method === 'auction');
		await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.scrimId, row.id));
		if (input.method === 'auction') await tx.insert(auctions).values({ scrimId: row.id }).onConflictDoNothing({ target: auctions.scrimId });
		await tx.update(scrims).set({ formationMethod: input.method }).where(eq(scrims.id, row.id));
	}, access);
}

export async function advanceScrim(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { key: string }, access?: ScrimAccessDependencies) {
	if (input.key === 'close') return closeRecruitment(db, actor, guildId, scrimId, input, access);
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		if (input.key === 'start') {
			if (row.status !== 'ready' || !row.bracketConfirmedAt) throw new DomainError('CONFLICT', '대진을 확정한 뒤 내전을 시작해 주세요');
			await assertNoGames(tx, row.id);
			const created = await createResolvedMatches(tx, row);
			if (!created) throw new DomainError('CONFLICT', '시작할 경기가 없어요');
			await tx.update(scrims).set({ status: 'in_progress' }).where(eq(scrims.id, row.id));
		} else if (input.key === 'complete') {
			if (row.status !== 'in_progress') throw new DomainError('CONFLICT', '진행 중인 내전만 종료할 수 있어요');
			const bracket = await getBracketInTransaction(tx, row, true);
			if (!bracket?.matches.length || bracket.matches.some((match) => !match.matchId || match.status !== 'completed')) throw new DomainError('CONFLICT', '모든 경기가 끝나야 해요');
			await tx.update(scrims).set({ status: 'completed' }).where(eq(scrims.id, row.id));
		} else throw new DomainError('CONFLICT', '현재 단계에서 실행할 수 없는 작업이에요');
	}, access);
}

export async function revertScrim(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row, user) => {
		switch (row.status) {
			case 'preparing':
				await deleteDraftBracket(tx, row.id);
				await invalidateAuctionFormation(tx, row, user, '모집 다시 열기', row.formationMethod === 'auction');
				await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.scrimId, row.id));
				await tx.update(scrims).set({ status: 'recruit' }).where(eq(scrims.id, row.id));
				break;
			case 'ready':
				await deleteDraftBracket(tx, row.id);
				if (row.formationMethod === 'auction') await tx.update(auctions).set({ status: 'in_progress', endedAt: null }).where(eq(auctions.scrimId, row.id));
				await tx.update(scrims).set({ status: 'preparing' }).where(eq(scrims.id, row.id));
				break;
			case 'in_progress':
				await removeUnplayedMatches(tx, row.id);
				await tx.update(scrims).set({ status: 'ready' }).where(eq(scrims.id, row.id));
				break;
			case 'completed':
				await tx.update(scrims).set({ status: 'in_progress' }).where(eq(scrims.id, row.id));
				break;
			case 'ended_early': {
				const interrupted = await tx.select().from(matches).where(eq(matches.scrimId, row.id)).orderBy(asc(matches.id)).for('update');
				for (const match of interrupted) {
					if (match.statusBeforeScrimEnd !== 'pending' && match.statusBeforeScrimEnd !== 'in_progress') continue;
					await tx.update(matches).set({ status: match.statusBeforeScrimEnd, endedAt: match.endedAtBeforeScrimEnd, endReason: match.endReasonBeforeScrimEnd,
						statusBeforeScrimEnd: null, endedAtBeforeScrimEnd: null, endReasonBeforeScrimEnd: null }).where(eq(matches.id, match.id));
				}
				await tx.update(scrims).set({ status: 'in_progress' }).where(eq(scrims.id, row.id));
				break;
			}
			default: throw new DomainError('CONFLICT', '되돌릴 단계가 없어요');
		}
	}, access);
}

export async function endScrimEarly(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row) => {
		if (row.status !== 'in_progress') throw new DomainError('CONFLICT', '진행 중인 내전만 중도 종료할 수 있어요');
		const existing = await tx.select().from(matches).where(eq(matches.scrimId, row.id)).orderBy(asc(matches.id)).for('update');
		for (const match of existing) {
			if (match.status !== 'pending' && match.status !== 'in_progress') continue;
			await tx.update(matches).set({ status: match.status === 'pending' ? 'cancelled' : 'ended_early', endedAt: new Date(), endReason: '내전 중도 종료',
				statusBeforeScrimEnd: match.status, endedAtBeforeScrimEnd: match.endedAt, endReasonBeforeScrimEnd: match.endReason }).where(eq(matches.id, match.id));
		}
		await tx.update(scrims).set({ status: 'ended_early' }).where(eq(scrims.id, row.id));
	}, access);
}

export async function getScrimOperations(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies) {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx, _user, guild) => {
		const row = await findScrim(tx, guildId, scrimId);
		if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
		let nextAction: ScrimNextAction | null = null;
		let revert: ScrimRevertAction | null = null;
		if (!guild.isAdmin) return { nextAction, revert, endEarly: false };
		if (row.status === 'recruit') {
			const selected = await tx.select({ id: scrimParticipants.id }).from(scrimParticipants).innerJoin(scrimParticipantRegistrations, eq(scrimParticipantRegistrations.scrimParticipantId, scrimParticipants.id))
				.where(and(eq(scrimParticipants.scrimId, row.id), eq(scrimParticipantRegistrations.status, 'selected'), isNull(scrimParticipantRegistrations.withdrawnAt)));
			nextAction = { key: 'close', label: '모집 마감', blockedReason: selected.length === row.teamCount * 5 ? null : `선발 인원이 ${row.teamCount * 5}명이어야 해요 (현재 ${selected.length}명)` };
		} else if (row.status === 'preparing' && row.formationMethod) nextAction = { key: 'ready', label: '대진 준비로', blockedReason: '팀 편성을 확정해야 해요' };
		else if (row.status === 'ready') nextAction = { key: 'start', label: '내전 시작', blockedReason: row.bracketConfirmedAt ? null : '대진을 확정해야 해요' };
		else if (row.status === 'in_progress') {
			const bracket = await getBracketInTransaction(tx, row, true);
			nextAction = { key: 'complete', label: '내전 종료', blockedReason: bracket?.matches.length && bracket.matches.every((match) => match.status === 'completed' && match.matchId) ? null : '모든 경기가 끝나야 해요' };
		}
		if (row.status === 'preparing') revert = { label: '모집 다시 열기', message: '팀 편성을 초기화하고 다시 신청을 받아요. 편성 방식은 유지돼요.', blockedReason: null };
		else if (row.status === 'ready') revert = { label: '팀 편성 다시 하기', message: '대진을 초기화하고 팀 편성을 다시 고칠 수 있어요.', blockedReason: null };
		else if (row.status === 'in_progress') {
			const [game] = await tx.select({ id: games.id }).from(games).where(eq(games.scrimId, row.id)).limit(1);
			revert = { label: '대진 준비로 되돌리기', message: '경기를 시작하기 전 대진 준비로 돌아가요.', blockedReason: game ? '기록된 게임이 있어 되돌릴 수 없어요' : null };
		} else if (row.status === 'completed' || row.status === 'ended_early') revert = { label: '진행 중으로 되돌리기', message: '내전을 다시 열어요. 중도 종료가 멈춘 경기도 재개돼요.', blockedReason: null };
		return { nextAction, revert, endEarly: row.status === 'in_progress' };
	}, access);
}
