import {
	LANES,
	moveAssignment,
	slotKey,
	TEAM_SIZE,
	type Assignments,
	type AuctionHistoryEntry,
	type AuctionStatus,
	type AuctionView,
	type ChampionRef,
	type FormationPlayer,
	pairKey,
	type PairRecord,
	type TargetProfile,
	type FormationTeam,
	type SlotKey
} from '#lib/features/scrims/formation.ts';
import { findMockScrimRecord, type IconResolver, type MockFailure, type MockScrim } from './scrims.ts';

// 수동 편성·경매의 개발용 저장소다. 내전 목(scrims.ts)의 선발 참가자를 대상으로 하며 개발 서버를 재시작하면 처음 상태로 돌아간다.

const LATENCY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const noIcon: IconResolver = () => null;

function selected(scrim: MockScrim) {
	return scrim.participants.filter((participant) => participant.status === 'selected');
}

function toPlayers(scrim: MockScrim, icon: IconResolver): FormationPlayer[] {
	return selected(scrim).map((participant) => ({
		registrationId: participant.registrationId,
		userId: participant.userId,
		displayName: participant.displayName,
		iconUrl: icon(participant.championId),
		positions: [...participant.positions],
		mmr: { ...participant.mmr }
	}));
}

function defaultTeams(scrim: MockScrim): FormationTeam[] {
	return Array.from({ length: scrim.teamCount }, (_, index) => ({ id: `${scrim.id}-t${index + 1}`, name: `${index + 1}팀` }));
}

// 같은 입력이면 항상 같은 값을 주는 간단한 해시다. 개발용 전적을 만들 때만 쓴다.
function hash(text: string) {
	let value = 2166136261;
	for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 16777619);
	return value >>> 0;
}

// 선발 참가자 두 명씩의 지난 내전 전적(같은 팀·상대 팀)을 만든다. 일부 쌍은 기록이 없다.
function pairRecords(ids: string[]): Record<string, PairRecord> {
	const records: Record<string, PairRecord> = {};
	ids.forEach((a, index) =>
		ids.slice(index + 1).forEach((b) => {
			const key = pairKey(a, b);
			const h = hash(key);
			const together = h % 8;
			const against = (h >>> 4) % 7;
			records[key] = {
				together: { plays: together, wins: together ? (h >>> 8) % (together + 1) : 0 },
				against: { plays: against, firstWins: against ? (h >>> 12) % (against + 1) : 0 }
			};
		})
	);
	return records;
}

const PROFILE_CHAMPIONS = ['Ahri', 'LeeSin', 'Thresh', 'Jinx', 'Darius', 'Yasuo', 'Lux', 'Kaisa', 'Viego', 'Orianna', 'Sett', 'Nami'];
const TIERS = ['DIAMOND II', 'EMERALD I', 'PLATINUM III', 'GOLD II', null];

// 현재 후보의 상세 보기용 전적을 만든다. 실제로는 Game·Riot 캐시에서 조회한다.
function mockProfile(player: FormationPlayer, champion: (id: string) => ChampionRef): TargetProfile {
	const h = hash(player.registrationId);
	const pick = (offset: number) => champion(PROFILE_CHAMPIONS[(h + offset * 5) % PROFILE_CHAMPIONS.length]!);
	const games = 8 + (h % 30);
	const wins = Math.round(games * (0.35 + ((h >>> 5) % 30) / 100));
	const mainLane = player.positions[0] ?? LANES[h % LANES.length]!;
	return {
		summary: { games, wins, losses: games - wins },
		mainLane,
		championRecords: [0, 1, 2].map((index) => {
			const played = Math.max(1, Math.round(games / (index + 2)));
			return { champion: pick(index), games: played, wins: Math.round(played * (0.4 + (((h >>> index) % 40) / 100))) };
		}),
		laneGames: Object.fromEntries(LANES.map((lane, index) => [lane, lane === mainLane ? Math.round(games * 0.6) : (h >>> index) % 5])) as TargetProfile['laneGames'],
		preferredChampions: [3, 4, 5].map(pick),
		recentGames: Array.from({ length: 8 }, (_, index) => ({
			id: `${player.registrationId}-g${index}`,
			champion: pick(index % 3),
			lane: index % 3 === 2 && player.positions[1] ? player.positions[1] : mainLane,
			win: ((h >>> index) & 1) === 1,
			playedAt: new Date(Date.UTC(2026, 9, 28 - index * 3, 12)).toISOString()
		})),
		// 일부 후보는 캐시된 Riot 전적이 없는 경우를 재현한다.
		riot: h % 7 === 0 ? null : {
			tier: TIERS[h % TIERS.length] ?? null,
			games: 20,
			wins: 9 + (h % 6),
			champions: [6, 7].map(pick)
		}
	};
}

function shuffle<T>(items: T[]): T[] {
	const copy = [...items];
	for (let index = copy.length - 1; index > 0; index--) {
		const swap = Math.floor(Math.random() * (index + 1));
		[copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
	}
	return copy;
}

// ─── 수동 편성 ───────────────────────────────────────────────

type ManualState = { teams: FormationTeam[]; assignments: Assignments; confirmed: boolean };
const manualStates = new Map<string, ManualState>();

// 순서대로 팀·포지션을 채운다. 개발 데이터의 초기 배정에만 쓴다.
function fillInOrder(teams: FormationTeam[], ids: string[], limit: number): Assignments {
	const slots = teams.flatMap((team) => LANES.map((lane) => slotKey(team.id, lane)));
	return Object.fromEntries(ids.slice(0, limit).map((id, index) => [id, slots[index]!]));
}

function manualState(scrim: MockScrim): ManualState {
	let state = manualStates.get(scrim.id);
	if (!state) {
		const teams = defaultTeams(scrim);
		const ids = selected(scrim).map((participant) => participant.registrationId);
		// 편성 중인 내전은 일부만, 이미 진행된 내전은 전원 배정·확정된 상태로 시작한다.
		const done = !['recruit', 'preparing'].includes(scrim.status);
		state = { teams, assignments: fillInOrder(teams, ids, done ? ids.length : 6), confirmed: done };
		manualStates.set(scrim.id, state);
	}
	return state;
}

export async function getMockManualFormation(guildId: string, scrimId: string, icon: IconResolver = noIcon) {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim) return null;
	const state = manualState(scrim);
	return {
		teams: state.teams.map((team) => ({ ...team })),
		players: toPlayers(scrim, icon),
		assignments: { ...state.assignments },
		confirmed: state.confirmed,
		pairs: pairRecords(selected(scrim).map((participant) => participant.registrationId))
	};
}

function editableManual(guildId: string, scrimId: string): { scrim: MockScrim; state: ManualState } | MockFailure {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (!scrim.canManage) return { status: 403, message: '편성할 권한이 없어요' };
	const state = manualState(scrim);
	if (state.confirmed || scrim.status !== 'preparing') return { status: 409, message: '편성이 이미 확정됐어요' };
	return { scrim, state };
}

export async function moveMockManualPlayer(guildId: string, scrimId: string, registrationId: string, slot: SlotKey | null) {
	await wait();
	const target = editableManual(guildId, scrimId);
	if ('status' in target) return target;
	if (!selected(target.scrim).some((participant) => participant.registrationId === registrationId)) {
		return { status: 409, message: '선발 참가자가 아니에요' };
	}
	if (slot && !target.state.teams.some((team) => slot.startsWith(`${team.id}:`))) {
		return { status: 400, message: '알 수 없는 자리예요' };
	}
	target.state.assignments = moveAssignment(target.state.assignments, registrationId, slot);
	return null;
}

export async function resetMockManual(guildId: string, scrimId: string) {
	await wait();
	const target = editableManual(guildId, scrimId);
	if ('status' in target) return target;
	target.state.assignments = {};
	return null;
}

export async function renameMockTeam(guildId: string, scrimId: string, teamId: string, name: string) {
	await wait();
	const target = editableManual(guildId, scrimId);
	if ('status' in target) return target;
	const team = target.state.teams.find((item) => item.id === teamId);
	if (!team) return { status: 404, message: '팀을 찾을 수 없어요' };
	team.name = name;
	return null;
}

export async function confirmMockManual(guildId: string, scrimId: string) {
	await wait();
	const target = editableManual(guildId, scrimId);
	if ('status' in target) return target;
	const missing = selected(target.scrim).length - Object.keys(target.state.assignments).length;
	if (missing > 0) return { status: 409, message: `미배정 ${missing}명이 남았어요` };
	target.state.confirmed = true;
	target.scrim.status = 'ready';
	return null;
}

// ─── 경매 ────────────────────────────────────────────────────

type Lot = {
	id: string;
	registrationId: string;
	result: 'sold' | 'unsold' | 'manual';
	teamId: string | null;
	price: number | null;
	voided: boolean;
};

type AuctionTeamState = FormationTeam & { captainId: string | null; startPoints: number };

type AuctionState = {
	status: AuctionStatus;
	teams: AuctionTeamState[];
	queue: string[];
	open: string | null;
	unsold: string[];
	lots: Lot[];
	seq: number;
};

const auctionStates = new Map<string, AuctionState>();
const DEFAULT_POINTS = 1000;

function acquisitions(state: AuctionState) {
	return state.lots.filter((lot) => !lot.voided && (lot.result === 'sold' || lot.result === 'manual'));
}

function membersOf(state: AuctionState, teamId: string) {
	const team = state.teams.find((item) => item.id === teamId)!;
	return (team.captainId ? 1 : 0) + acquisitions(state).filter((lot) => lot.teamId === teamId).length;
}

function remainingPoints(state: AuctionState, teamId: string) {
	const team = state.teams.find((item) => item.id === teamId)!;
	const spent = acquisitions(state)
		.filter((lot) => lot.teamId === teamId)
		.reduce((sum, lot) => sum + (lot.price ?? 0), 0);
	return team.startPoints - spent;
}

function auctionState(scrim: MockScrim): AuctionState {
	let state = auctionStates.get(scrim.id);
	if (state) return state;
	const teams = defaultTeams(scrim).map((team) => ({ ...team, captainId: null as string | null, startPoints: DEFAULT_POINTS }));
	state = { status: 'setup', teams, queue: [], open: null, unsold: [], lots: [], seq: 0 };
	// 이미 편성이 끝난 내전은 팀장 다음 순서로 돌아가며 낙찰된 완료 상태를 만든다.
	if (!['recruit', 'preparing'].includes(scrim.status)) {
		const ids = selected(scrim).map((participant) => participant.registrationId);
		teams.forEach((team, index) => (team.captainId = ids[index] ?? null));
		ids.slice(teams.length).forEach((id, index) => {
			const team = teams[index % teams.length]!;
			state!.lots.push({
				id: `lot${++state!.seq}`,
				registrationId: id,
				result: index === 7 ? 'manual' : 'sold',
				teamId: team.id,
				price: index === 7 ? null : 40 + ((index * 53) % 260),
				voided: false
			});
		});
		state.status = 'completed';
	}
	auctionStates.set(scrim.id, state);
	return state;
}

export async function getMockAuction(
	guildId: string,
	scrimId: string,
	icon: IconResolver = noIcon,
	champion: (id: string) => ChampionRef = (id) => ({ id, name: id, iconUrl: null })
): Promise<AuctionView | null> {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim) return null;
	const state = auctionState(scrim);
	const players = toPlayers(scrim, icon);
	const byId = new Map(players.map((player) => [player.registrationId, player]));
	const pick = (id: string) => byId.get(id)!;
	const teamName = (id: string | null) => state.teams.find((team) => team.id === id)?.name ?? null;

	return {
		status: state.status,
		players,
		teams: state.teams.map((team) => ({
			id: team.id,
			name: team.name,
			captainId: team.captainId,
			startPoints: team.startPoints,
			remainingPoints: remainingPoints(state, team.id),
			members: [
				...(team.captainId ? [{ player: pick(team.captainId), via: 'captain' as const, price: null }] : []),
				...acquisitions(state)
					.filter((lot) => lot.teamId === team.id)
					.map((lot) => ({ player: pick(lot.registrationId), via: lot.result === 'manual' ? ('manual' as const) : ('auction' as const), price: lot.price }))
			]
		})),
		openLot: state.open ? pick(state.open) : null,
		openProfile: state.open ? mockProfile(pick(state.open), champion) : null,
		queue: state.queue.map(pick),
		unsold: state.unsold.map(pick),
		history: state.lots.map(
			(lot, index): AuctionHistoryEntry => ({
				id: lot.id,
				order: index + 1,
				displayName: pick(lot.registrationId).displayName,
				result: lot.result,
				teamName: teamName(lot.teamId),
				price: lot.price,
				voided: lot.voided
			})
		)
	};
}

function auctionTarget(guildId: string, scrimId: string, status: AuctionStatus): { scrim: MockScrim; state: AuctionState } | MockFailure {
	const scrim = findMockScrimRecord(guildId, scrimId);
	if (!scrim) return { status: 404, message: '내전을 찾을 수 없어요' };
	if (!scrim.canManage) return { status: 403, message: '경매를 진행할 권한이 없어요' };
	const state = auctionState(scrim);
	if (state.status !== status) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	return { scrim, state };
}

export async function saveMockAuctionSetup(
	guildId: string,
	scrimId: string,
	teams: { captainId: string | null; startPoints: number }[]
) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'setup');
	if ('status' in target) return target;
	const ids = new Set(selected(target.scrim).map((participant) => participant.registrationId));
	const captains = teams.map((team) => team.captainId).filter((id): id is string => Boolean(id));
	if (teams.length !== target.state.teams.length) return { status: 400, message: '팀 수가 맞지 않아요' };
	if (captains.some((id) => !ids.has(id)) || new Set(captains).size !== captains.length) {
		return { status: 400, message: '팀장을 다시 골라 주세요' };
	}
	if (teams.some((team) => !Number.isSafeInteger(team.startPoints) || team.startPoints <= 0)) {
		return { status: 400, message: '시작 포인트는 1 이상의 정수여야 해요' };
	}
	target.state.teams.forEach((team, index) => Object.assign(team, teams[index]));
	return null;
}

export async function startMockAuction(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'setup');
	if ('status' in target) return target;
	const { state, scrim } = target;
	if (state.teams.some((team) => !team.captainId)) return { status: 409, message: '모든 팀의 팀장을 정해야 해요' };
	const captains = new Set(state.teams.map((team) => team.captainId));
	state.queue = shuffle(selected(scrim).map((participant) => participant.registrationId).filter((id) => !captains.has(id)));
	state.status = 'in_progress';
	return null;
}

function completeIfFull(scrim: MockScrim, state: AuctionState) {
	if (state.teams.every((team) => membersOf(state, team.id) >= TEAM_SIZE)) {
		state.status = 'completed';
		state.open = null;
		scrim.status = 'ready';
	}
}

export async function drawMockLot(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state } = target;
	if (state.open) return { status: 409, message: '이미 진행 중인 후보가 있어요' };
	const next = state.queue.shift();
	if (!next) return { status: 409, message: '대기 중인 후보가 없어요' };
	state.open = next;
	return null;
}

export async function awardMockLot(guildId: string, scrimId: string, teamId: string, price: number) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state, scrim } = target;
	if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
	if (!state.teams.some((team) => team.id === teamId)) return { status: 404, message: '팀을 찾을 수 없어요' };
	if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
	if (!Number.isSafeInteger(price) || price < 0) return { status: 400, message: '입찰가는 0 이상의 정수여야 해요' };
	if (price > remainingPoints(state, teamId)) return { status: 409, message: '남은 포인트보다 높게 낙찰할 수 없어요' };
	state.lots.push({ id: `lot${++state.seq}`, registrationId: state.open, result: 'sold', teamId, price, voided: false });
	state.open = null;
	completeIfFull(scrim, state);
	return null;
}

export async function passMockLot(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state } = target;
	if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
	state.lots.push({ id: `lot${++state.seq}`, registrationId: state.open, result: 'unsold', teamId: null, price: null, voided: false });
	state.unsold.push(state.open);
	state.open = null;
	return null;
}

export async function assignMockUnsold(guildId: string, scrimId: string, registrationId: string, teamId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state, scrim } = target;
	if (state.open) return { status: 409, message: '진행 중인 후보를 먼저 처리해 주세요' };
	if (!state.unsold.includes(registrationId)) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
	state.lots.push({ id: `lot${++state.seq}`, registrationId, result: 'manual', teamId, price: null, voided: false });
	state.unsold = state.unsold.filter((id) => id !== registrationId);
	completeIfFull(scrim, state);
	return null;
}

export async function restoreMockUnsold(guildId: string, scrimId: string, registrationId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state } = target;
	if (state.open) return { status: 409, message: '진행 중인 후보를 먼저 처리해 주세요' };
	if (!state.unsold.includes(registrationId)) return { status: 409, message: '다른 사람이 먼저 변경했어요' };
	state.unsold = state.unsold.filter((id) => id !== registrationId);
	state.open = registrationId;
	return null;
}

// 마지막 기록을 무효로 남기고 그 후보를 다시 진행 중으로 올린다. 진행 중이던 후보는 대기열 맨 앞으로 돌아간다.
export async function revertMockLot(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state } = target;
	const last = state.lots.findLast((lot) => !lot.voided);
	if (!last) return { status: 409, message: '되돌릴 기록이 없어요' };
	last.voided = true;
	state.unsold = state.unsold.filter((id) => id !== last.registrationId);
	if (state.open) state.queue.unshift(state.open);
	state.open = last.registrationId;
	return null;
}

export async function resetMockAuction(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state, scrim } = target;
	const captains = new Set(state.teams.map((team) => team.captainId));
	for (const lot of state.lots) lot.voided = true;
	state.queue = shuffle(selected(scrim).map((participant) => participant.registrationId).filter((id) => !captains.has(id)));
	state.open = null;
	state.unsold = [];
	return null;
}

// 현재 후보를 가격 없이 팀에 넣는다. 팀 카드로 끌어 놓을 때 쓴다.
export async function assignMockCurrent(guildId: string, scrimId: string, teamId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	const { state, scrim } = target;
	if (!state.open) return { status: 409, message: '진행 중인 후보가 없어요' };
	if (!state.teams.some((team) => team.id === teamId)) return { status: 404, message: '팀을 찾을 수 없어요' };
	if (membersOf(state, teamId) >= TEAM_SIZE) return { status: 409, message: '이 팀은 정원이 찼어요' };
	state.lots.push({ id: `lot${++state.seq}`, registrationId: state.open, result: 'manual', teamId, price: null, voided: false });
	state.open = null;
	completeIfFull(scrim, state);
	return null;
}

export async function shuffleMockQueue(guildId: string, scrimId: string) {
	await wait();
	const target = auctionTarget(guildId, scrimId, 'in_progress');
	if ('status' in target) return target;
	target.state.queue = shuffle(target.state.queue);
	return null;
}
