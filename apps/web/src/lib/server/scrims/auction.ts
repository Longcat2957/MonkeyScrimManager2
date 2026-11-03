import { randomInt } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { TEAM_SIZE, type AuctionView } from '../../features/scrims/formation.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import { auctionAcquisitions, auctionLots, auctionQueueEntries, auctionTeams, auctions, scrimParticipants, scrims, scrimTeams } from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { createBracketDraft } from './bracket.ts';
import { formationPlayers, selectedParticipants } from './manual.ts';
import { mutateScrim, type ScrimRow } from './operation.ts';
import { findScrim, readGuild } from './queries.ts';
import type { RevisionInput, ScrimAccessDependencies } from './service.ts';
import { requireUuid } from './validation.ts';

const DEFAULT_POINTS = 1000;
const MAX_POINTS = 2_147_483_647;
type SetupTeam = { captainId: string | null; startPoints: number };
type LotInput = RevisionInput & { lotId: string };

export function auctionPoints(value: unknown, minimum: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > MAX_POINTS) {
		throw new DomainError('INVALID_INPUT', `포인트는 ${minimum} 이상 ${MAX_POINTS} 이하의 정수여야 해요`);
	}
	return value;
}

export function auctionSetup(value: unknown): SetupTeam[] {
	if (!Array.isArray(value) || value.length < 2 || value.length > 4) throw new DomainError('INVALID_INPUT', '팀 설정을 다시 확인해 주세요');
	const teams = value.map((team: unknown) => {
		if (!team || typeof team !== 'object' || !('captainId' in team) || !('startPoints' in team)) throw new DomainError('INVALID_INPUT', '팀 설정을 다시 확인해 주세요');
		return { captainId: team.captainId === null ? null : requireUuid(team.captainId, '팀장'), startPoints: auctionPoints(team.startPoints, 1) };
	});
	const captains = teams.flatMap((team) => team.captainId ? [team.captainId] : []);
	if (new Set(captains).size !== captains.length) throw new DomainError('INVALID_INPUT', '같은 참가자를 두 팀의 팀장으로 정할 수 없어요');
	return teams;
}

function shuffled<T>(entries: T[]): T[] {
	const result = [...entries];
	for (let index = result.length - 1; index > 0; index--) {
		const target = randomInt(index + 1);
		[result[index], result[target]] = [result[target]!, result[index]!];
	}
	return result;
}

async function auctionState(tx: Transaction, row: ScrimRow) {
	const [auction] = await tx.select().from(auctions).where(eq(auctions.scrimId, row.id));
	const allTeams = await tx.select().from(scrimTeams).where(eq(scrimTeams.scrimId, row.id)).orderBy(asc(scrimTeams.ordinal));
	const settings = auction ? await tx.select().from(auctionTeams).where(eq(auctionTeams.auctionId, auction.id)) : [];
	const teams = allTeams.filter((team) => team.isActive).map((team) => {
		const setup = settings.find((entry) => entry.teamId === team.id);
		return { ...team, captainId: setup?.captainParticipantId ?? null, startPoints: setup?.initialPoints ?? DEFAULT_POINTS };
	});
	const lots = auction ? await tx.select().from(auctionLots).where(eq(auctionLots.auctionId, auction.id)).orderBy(asc(auctionLots.sequenceNumber)) : [];
	const acquisitions = auction ? await tx.select().from(auctionAcquisitions).where(eq(auctionAcquisitions.auctionId, auction.id)).orderBy(asc(auctionAcquisitions.acquiredAt), asc(auctionAcquisitions.id)) : [];
	const queue = auction ? await tx.select().from(auctionQueueEntries).where(eq(auctionQueueEntries.auctionId, auction.id)).orderBy(asc(auctionQueueEntries.ordinal)) : [];
	const selected = await selectedParticipants(tx, row.id);
	const active = acquisitions.filter((entry) => !entry.voidedAt);
	const occupied = new Set([...teams.flatMap((team) => team.captainId ? [team.captainId] : []), ...active.map((entry) => entry.scrimParticipantId)]);
	const open = lots.find((lot) => lot.status === 'open') ?? null;
	const queued = new Set(queue.map((entry) => entry.scrimParticipantId));
	const lastAttempts = new Map(lots.filter((lot) => !lot.voidedAt).map((lot) => [lot.scrimParticipantId, lot]));
	const unsold = selected.filter(({ participant }) => !occupied.has(participant.id) && !queued.has(participant.id) && open?.scrimParticipantId !== participant.id && lastAttempts.get(participant.id)?.status === 'unsold').map(({ participant }) => participant.id);
	return { auction, teams, allTeams, lots, acquisitions, active, queue, selected, occupied, open, unsold };
}

type State = Awaited<ReturnType<typeof auctionState>>;
type MutableState = State & { auction: NonNullable<State['auction']> };

export async function getAuction(db: Database, actor: Actor | null, guildId: string, scrimId: string, access?: ScrimAccessDependencies): Promise<AuctionView | null> {
	requireUuid(scrimId, '내전');
	return readGuild(db, actor, guildId, async (tx) => {
		const row = await findScrim(tx, guildId, scrimId);
		if (!row) throw new DomainError('NOT_FOUND', '내전을 찾을 수 없어요');
		if (row.formationMethod !== 'auction') throw new DomainError('CONFLICT', '경매 편성 내전이 아니에요');
		if (row.status === 'recruit') return null;
		const state = await auctionState(tx, row);
		const players = await formationPlayers(tx, row, state.selected);
		const participants = await tx.select({ id: scrimParticipants.id, displayName: scrimParticipants.displayName }).from(scrimParticipants).where(eq(scrimParticipants.scrimId, row.id));
		const pick = (id: string) => players.find((player) => player.participantId === id);
		return {
			status: state.auction?.status ?? 'setup', players,
			teams: state.teams.map((team) => ({
				id: team.id, name: team.name, captainId: team.captainId, startPoints: team.startPoints, remainingPoints: remainingPoints(state, team.id),
				members: [
					...(team.captainId && pick(team.captainId) ? [{ player: pick(team.captainId)!, via: 'captain' as const, price: null }] : []),
					...state.active.filter((entry) => entry.teamId === team.id && pick(entry.scrimParticipantId)).map((entry) => ({ player: pick(entry.scrimParticipantId)!, via: entry.method, price: entry.price }))
				]
			})),
			openLot: state.open ? pick(state.open.scrimParticipantId) ?? null : null,
			openLotId: state.open?.id ?? null,
			// 실제 전적 조회가 연결되기 전에는 임의의 수치를 만들지 않는다.
			openProfile: null,
			queue: state.queue.flatMap((entry) => pick(entry.scrimParticipantId) ? [pick(entry.scrimParticipantId)!] : []),
			unsold: state.unsold.flatMap((id) => pick(id) ? [pick(id)!] : []),
			history: state.lots.filter((lot) => lot.status === 'sold' || lot.status === 'unsold').map((lot) => {
				const acquisition = state.acquisitions.find((entry) => entry.lotId === lot.id);
				return { id: lot.id, order: lot.sequenceNumber, displayName: participants.find((entry) => entry.id === lot.scrimParticipantId)!.displayName,
					result: acquisition?.method === 'manual' ? 'manual' : lot.status === 'sold' ? 'sold' : 'unsold',
					teamName: state.allTeams.find((team) => team.id === acquisition?.teamId)?.name ?? null,
					price: acquisition?.price ?? null, voided: Boolean(lot.voidedAt || acquisition?.voidedAt) };
			})
		};
	}, access);
}

async function mutateAuction<T>(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput,
	status: 'setup' | 'in_progress', operation: (tx: Transaction, row: ScrimRow, user: Actor, state: MutableState) => Promise<T>, access?: ScrimAccessDependencies): Promise<T> {
	return mutateScrim(db, actor, guildId, scrimId, input, async (tx, row, user) => {
		if (row.formationMethod !== 'auction' || row.status !== 'preparing') throw new DomainError('CONFLICT', '경매 편성 중에만 변경할 수 있어요');
		await tx.insert(auctions).values({ scrimId: row.id }).onConflictDoNothing({ target: auctions.scrimId });
		const state = await auctionState(tx, row);
		if (!state.auction || state.auction.status !== status) throw new DomainError('CONFLICT', '경매 단계가 바뀌었어요. 새로고침해 주세요');
		if (state.teams.length !== row.teamCount || state.selected.length !== row.teamCount * TEAM_SIZE) throw new DomainError('CONFLICT', '팀 수와 선발 참가자를 다시 확인해 주세요');
		await tx.insert(auctionTeams).values(state.teams.map((team) => ({ scrimId: row.id, auctionId: state.auction!.id, teamId: team.id, initialPoints: team.startPoints }))).onConflictDoNothing();
		return operation(tx, row, user, { ...state, auction: state.auction });
	}, access);
}

async function replaceQueue(tx: Transaction, state: MutableState, participantIds: string[]) {
	await tx.delete(auctionQueueEntries).where(eq(auctionQueueEntries.auctionId, state.auction.id));
	if (participantIds.length) await tx.insert(auctionQueueEntries).values(participantIds.map((id, index) => ({ scrimId: state.auction.scrimId, auctionId: state.auction.id, scrimParticipantId: id, ordinal: index + 1 })));
}

function remainingPoints(state: State, teamId: string): number {
	return state.teams.find((team) => team.id === teamId)!.startPoints - state.active.filter((entry) => entry.teamId === teamId).reduce((sum, entry) => sum + (entry.price ?? 0), 0);
}

function currentLot(state: MutableState, lotId: string) {
	requireUuid(lotId, '현재 후보');
	if (!state.open || state.open.id !== lotId) throw new DomainError('CONFLICT', '현재 후보가 바뀌었어요. 새로고침 후 다시 시도해 주세요');
	return state.open;
}

async function openLot(tx: Transaction, state: MutableState, participantId: string) {
	if (state.occupied.has(participantId) || !state.selected.some(({ participant }) => participant.id === participantId)) throw new DomainError('CONFLICT', '진행할 수 없는 후보예요');
	const [lot] = await tx.insert(auctionLots).values({ scrimId: state.auction.scrimId, auctionId: state.auction.id, scrimParticipantId: participantId, sequenceNumber: (state.lots.at(-1)?.sequenceNumber ?? 0) + 1 }).returning();
	return lot!;
}

export async function saveAuctionSetup(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { teams: unknown }, access?: ScrimAccessDependencies) {
	const teams = auctionSetup(input.teams);
	return mutateAuction(db, actor, guildId, scrimId, input, 'setup', async (tx, row, _user, state) => {
		if (teams.length !== state.teams.length || teams.some((team) => team.captainId && !state.selected.some(({ participant }) => participant.id === team.captainId))) throw new DomainError('INVALID_INPUT', '팀 수와 선발된 팀장 후보를 다시 확인해 주세요');
		// 팀장 교환 시 고유 제약에 걸리지 않게 모두 해제한 다음 같은 트랜잭션에서 저장한다.
		await tx.update(auctionTeams).set({ captainParticipantId: null }).where(eq(auctionTeams.auctionId, state.auction.id));
		await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.scrimId, row.id));
		for (const [index, team] of teams.entries()) {
			const teamId = state.teams[index]!.id;
			await tx.update(auctionTeams).set({ captainParticipantId: team.captainId, initialPoints: team.startPoints }).where(and(eq(auctionTeams.auctionId, state.auction.id), eq(auctionTeams.teamId, teamId)));
			if (team.captainId) await tx.update(scrimParticipants).set({ teamId }).where(eq(scrimParticipants.id, team.captainId));
		}
	}, access);
}

export async function startAuction(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'setup', async (tx, _row, _user, state) => {
		if (state.teams.some((team) => !team.captainId || !state.selected.some(({ participant }) => participant.id === team.captainId))) throw new DomainError('CONFLICT', '모든 팀의 팀장을 정해야 해요');
		await replaceQueue(tx, state, shuffled(state.selected.map(({ participant }) => participant.id).filter((id) => !state.occupied.has(id))));
		await tx.update(auctions).set({ status: 'in_progress', startedAt: new Date(), endedAt: null }).where(eq(auctions.id, state.auction.id));
	}, access);
}

export async function drawAuctionLot(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, _row, _user, state) => {
		if (state.open) throw new DomainError('CONFLICT', '진행 중인 후보를 먼저 처리해 주세요');
		const next = state.queue[0];
		if (!next) throw new DomainError('CONFLICT', '대기 중인 후보가 없어요');
		await tx.delete(auctionQueueEntries).where(and(eq(auctionQueueEntries.auctionId, state.auction.id), eq(auctionQueueEntries.scrimParticipantId, next.scrimParticipantId)));
		await openLot(tx, state, next.scrimParticipantId);
	}, access);
}

async function acquire(tx: Transaction, row: ScrimRow, user: Actor, state: MutableState, lot: typeof auctionLots.$inferSelect, teamId: string, price: number | null) {
	const team = state.teams.find((entry) => entry.id === teamId);
	if (!team) throw new DomainError('NOT_FOUND', '이 내전의 팀을 찾을 수 없어요');
	if (state.occupied.has(lot.scrimParticipantId)) throw new DomainError('CONFLICT', '이미 팀에 배정된 참가자예요');
	const memberCount = (team.captainId ? 1 : 0) + state.active.filter((entry) => entry.teamId === team.id).length;
	if (memberCount >= TEAM_SIZE) throw new DomainError('CONFLICT', '이 팀은 정원이 찼어요');
	if (price !== null && price > remainingPoints(state, team.id)) throw new DomainError('CONFLICT', '남은 포인트보다 높게 낙찰할 수 없어요');
	if (!team.captainId) throw new DomainError('CONFLICT', '팀장이 없는 팀에는 배정할 수 없어요');
	await tx.insert(auctionAcquisitions).values({ scrimId: row.id, auctionId: state.auction.id, scrimParticipantId: lot.scrimParticipantId,
		teamId, buyerParticipantId: price === null ? null : team.captainId, method: price === null ? 'manual' : 'auction', price, lotId: lot.id, recordedByUserId: user.userId });
	await tx.update(auctionLots).set({ status: 'sold', closedAt: new Date() }).where(eq(auctionLots.id, lot.id));
	// 희망 포지션을 실출전 포지션으로 간주하지 않는다.
	await tx.update(scrimParticipants).set({ teamId, position: null }).where(eq(scrimParticipants.id, lot.scrimParticipantId));
	const complete = state.teams.every((entry) => (entry.captainId ? 1 : 0) + state.active.filter((value) => value.teamId === entry.id).length + (entry.id === teamId ? 1 : 0) === TEAM_SIZE);
	if (complete) {
		await tx.update(auctions).set({ status: 'completed', endedAt: new Date() }).where(eq(auctions.id, state.auction.id));
		await createBracketDraft(tx, row);
		await tx.update(scrims).set({ status: 'ready' }).where(eq(scrims.id, row.id));
	}
}

export async function awardAuctionLot(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: LotInput & { teamId: string; price: number }, access?: ScrimAccessDependencies) {
	requireUuid(input.teamId, '팀');
	const price = auctionPoints(input.price, 0);
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', (tx, row, user, state) => acquire(tx, row, user, state, currentLot(state, input.lotId), input.teamId, price), access);
}

export async function passAuctionLot(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: LotInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, _row, _user, state) => {
		await tx.update(auctionLots).set({ status: 'unsold', closedAt: new Date() }).where(eq(auctionLots.id, currentLot(state, input.lotId).id));
	}, access);
}

export async function assignAuctionCurrent(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: LotInput & { teamId: string }, access?: ScrimAccessDependencies) {
	requireUuid(input.teamId, '팀');
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', (tx, row, user, state) => acquire(tx, row, user, state, currentLot(state, input.lotId), input.teamId, null), access);
}

function requireUnsold(state: MutableState, participantId: string) {
	if (state.open) throw new DomainError('CONFLICT', '진행 중인 후보를 먼저 처리해 주세요');
	if (!state.unsold.includes(participantId)) throw new DomainError('CONFLICT', '유찰 후보가 바뀌었어요. 새로고침해 주세요');
}

export async function assignAuctionUnsold(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { participantId: string; teamId: string }, access?: ScrimAccessDependencies) {
	requireUuid(input.participantId, '참가자'); requireUuid(input.teamId, '팀');
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, row, user, state) => {
		requireUnsold(state, input.participantId);
		await acquire(tx, row, user, state, await openLot(tx, state, input.participantId), input.teamId, null);
	}, access);
}

export async function restoreAuctionUnsold(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput & { participantId: string }, access?: ScrimAccessDependencies) {
	requireUuid(input.participantId, '참가자');
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, _row, _user, state) => {
		requireUnsold(state, input.participantId);
		await openLot(tx, state, input.participantId);
	}, access);
}

export async function shuffleAuctionQueue(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, _row, _user, state) => {
		await replaceQueue(tx, state, shuffled(state.queue.map((entry) => entry.scrimParticipantId)));
	}, access);
}

export async function revertAuctionLot(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', async (tx, _row, user, state) => {
		const last = state.lots.findLast((lot) => !lot.voidedAt && (lot.status === 'sold' || lot.status === 'unsold'));
		if (!last) throw new DomainError('CONFLICT', '되돌릴 기록이 없어요');
		const now = new Date();
		const voided = { voidedAt: now, voidedByUserId: user.userId, voidReason: '마지막 기록 되돌리기' };
		await tx.update(auctionLots).set(voided).where(eq(auctionLots.id, last.id));
		await tx.update(auctionAcquisitions).set(voided).where(and(eq(auctionAcquisitions.lotId, last.id), isNull(auctionAcquisitions.voidedAt)));
		await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.id, last.scrimParticipantId));
		if (state.open) await tx.update(auctionLots).set({ status: 'cancelled', closedAt: now, ...voided }).where(eq(auctionLots.id, state.open.id));
		// 같은 유찰 후보를 다시 올린 뒤 되돌려도 대기열과 현재 후보에 중복되지 않는다.
		const queued = [
			...(state.open && state.open.scrimParticipantId !== last.scrimParticipantId ? [state.open.scrimParticipantId] : []),
			...state.queue.map((entry) => entry.scrimParticipantId).filter((id) => id !== last.scrimParticipantId)
		];
		await replaceQueue(tx, state, queued);
		state.occupied.delete(last.scrimParticipantId);
		await openLot(tx, state, last.scrimParticipantId);
	}, access);
}

async function clearAuction(tx: Transaction, row: ScrimRow, user: Actor, state: MutableState, setup: boolean) {
	const now = new Date();
	const voided = { voidedAt: now, voidedByUserId: user.userId, voidReason: setup ? '경매 설정 다시 열기' : '경매 초기화' };
	if (state.open) await tx.update(auctionLots).set({ status: 'cancelled', closedAt: now }).where(eq(auctionLots.id, state.open.id));
	await tx.update(auctionLots).set(voided).where(and(eq(auctionLots.auctionId, state.auction.id), isNull(auctionLots.voidedAt)));
	await tx.update(auctionAcquisitions).set(voided).where(and(eq(auctionAcquisitions.auctionId, state.auction.id), isNull(auctionAcquisitions.voidedAt)));
	await tx.update(scrimParticipants).set({ teamId: null, position: null }).where(eq(scrimParticipants.scrimId, row.id));
	for (const team of state.teams) if (team.captainId) await tx.update(scrimParticipants).set({ teamId: team.id }).where(eq(scrimParticipants.id, team.captainId));
	const captains = new Set(state.teams.map((team) => team.captainId));
	await replaceQueue(tx, state, setup ? [] : shuffled(state.selected.map(({ participant }) => participant.id).filter((id) => !captains.has(id))));
	await tx.update(auctions).set({ status: setup ? 'setup' : 'in_progress', startedAt: setup ? null : state.auction.startedAt, endedAt: null }).where(eq(auctions.id, state.auction.id));
}

export async function resetAuction(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', (tx, row, user, state) => clearAuction(tx, row, user, state, false), access);
}

export async function reopenAuctionSetup(db: Database, actor: Actor | null, guildId: string, scrimId: string, input: RevisionInput, access?: ScrimAccessDependencies) {
	return mutateAuction(db, actor, guildId, scrimId, input, 'in_progress', (tx, row, user, state) => clearAuction(tx, row, user, state, true), access);
}
