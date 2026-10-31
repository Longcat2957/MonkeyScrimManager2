import type { auctionStatus } from '#lib/server/db/schema.ts';
import type { LolPosition } from '#lib/features/guild/types.ts';
import { POSITIONS } from '#lib/features/labels.ts';

export const TEAM_SIZE = 5;
export const LANES: LolPosition[] = POSITIONS.map((position) => position.key);

// 팀 편성·경매 화면의 선발 참가자다. mmr은 현재 시즌의 포지션별 값이다.
export type FormationPlayer = {
	registrationId: string;
	userId: string | null;
	displayName: string;
	iconUrl: string | null;
	positions: LolPosition[];
	mmr: Record<LolPosition, number>;
};

export type FormationTeam = { id: string; name: string };

// 팀·포지션 한 자리. 예: team1:mid
export type SlotKey = `${string}:${LolPosition}`;

// 참가 기록 ID → 배정된 자리. 배정되지 않은 사람은 키가 없다.
export type Assignments = Record<string, SlotKey>;

export function slotKey(teamId: string, lane: LolPosition): SlotKey {
	return `${teamId}:${lane}`;
}

export function parseSlot(slot: SlotKey): { teamId: string; lane: LolPosition } {
	const index = slot.lastIndexOf(':');
	return { teamId: slot.slice(0, index), lane: slot.slice(index + 1) as LolPosition };
}

export function occupantOf(assignments: Assignments, slot: SlotKey): string | null {
	return Object.keys(assignments).find((id) => assignments[id] === slot) ?? null;
}

/**
 * 한 사람을 자리로 옮기거나(slot) 미배정으로 돌린다(null).
 * 자리에 이미 다른 사람이 있으면 그 사람은 옮기는 사람의 원래 자리로 가고, 원래 자리가 없으면 미배정이 된다.
 */
export function moveAssignment(assignments: Assignments, registrationId: string, slot: SlotKey | null): Assignments {
	const next = { ...assignments };
	if (!slot) {
		delete next[registrationId];
		return next;
	}
	const current = occupantOf(next, slot);
	const previous = next[registrationId];
	if (current && current !== registrationId) {
		if (previous) next[current] = previous;
		else delete next[current];
	}
	next[registrationId] = slot;
	return next;
}

// 배정된 자리의 포지션 MMR 평균이다. 아무도 없으면 null이다.
export function teamAverage(teamId: string, players: FormationPlayer[], assignments: Assignments): number | null {
	const values = LANES.flatMap((lane) => {
		const id = occupantOf(assignments, slotKey(teamId, lane));
		const player = id ? players.find((item) => item.registrationId === id) : undefined;
		return player ? [player.mmr[lane]] : [];
	});
	return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

// 희망 포지션 중 가장 높은 MMR. 후보 목록에서 대략의 실력을 보여 줄 때 쓴다.
export function bestMmr(player: FormationPlayer): number {
	const lanes = player.positions.length ? player.positions : LANES;
	return Math.max(...lanes.map((lane) => player.mmr[lane]));
}

export function formatMmr(value: number | null) {
	return value === null ? '-' : value.toLocaleString('ko-KR');
}

export type AuctionStatus = (typeof auctionStatus.enumValues)[number];

// 팀원이 들어온 경로다. 0점 낙찰(auction, price 0)과 가격 없는 수동 배치(manual)를 구분한다.
export type AcquisitionVia = 'captain' | 'auction' | 'manual';

export type AuctionTeamView = {
	id: string;
	name: string;
	captainId: string | null;
	startPoints: number;
	remainingPoints: number;
	members: { player: FormationPlayer; via: AcquisitionVia; price: number | null }[];
};

// 경매 기록 한 줄. 되돌린 기록은 지우지 않고 voided로 남긴다.
export type AuctionHistoryEntry = {
	id: string;
	order: number;
	displayName: string;
	result: 'sold' | 'unsold' | 'manual';
	teamName: string | null;
	price: number | null;
	voided: boolean;
};

export type AuctionView = {
	status: AuctionStatus;
	teams: AuctionTeamView[];
	// 준비 단계에서 팀장 후보로 고를 선발 참가자 전체다.
	players: FormationPlayer[];
	openLot: FormationPlayer | null;
	queue: FormationPlayer[];
	unsold: FormationPlayer[];
	history: AuctionHistoryEntry[];
	// 현재 후보의 상세 보기다. 후보가 없으면 null이다.
	openProfile: TargetProfile | null;
};

// ─── 상세 보기용 전적 ──────────────────────────────────────────

// 같은 팀에서 붙어 다니는 포지션 쌍이다. 상세 보기에서 팀별 시너지로 보여 준다.
export const SYNERGY_PAIRS: [LolPosition, LolPosition][] = [
	['top', 'jungle'],
	['jungle', 'mid'],
	['bot', 'support']
];

// 두 사람의 지난 내전 전적. together는 같은 팀, against는 서로 다른 팀이었을 때다.
// against.firstWins는 pairKey의 앞사람 기준 승수다.
export type PairRecord = {
	together: { plays: number; wins: number };
	against: { plays: number; firstWins: number };
};

export function pairKey(a: string, b: string) {
	return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// a 기준 상대 전적(승·패)으로 바꾼다.
export function headToHead(pairs: Record<string, PairRecord>, a: string, b: string) {
	const record = pairs[pairKey(a, b)];
	if (!record || record.against.plays === 0) return null;
	const firstWins = record.against.firstWins;
	const wins = a < b ? firstWins : record.against.plays - firstWins;
	return { wins, losses: record.against.plays - wins };
}

export type ChampionRef = { id: string; name: string; iconUrl: string | null };

// 경매 현재 후보의 상세 보기다.
export type TargetProfile = {
	summary: { games: number; wins: number; losses: number };
	mainLane: LolPosition;
	championRecords: { champion: ChampionRef; games: number; wins: number }[];
	laneGames: Record<LolPosition, number>;
	preferredChampions: ChampionRef[];
	recentGames: { id: string; champion: ChampionRef; lane: LolPosition; win: boolean; playedAt: string }[];
	riot: { tier: string | null; games: number; wins: number; champions: ChampionRef[] } | null;
};

export function winRate(games: number, wins: number) {
	return games ? `${Math.round((wins / games) * 100)}%` : '-';
}

/** 낙찰·수동 배치 직후 팀 패널에 보여 주는 축하 효과. key가 바뀔 때마다 효과를 다시 재생한다. */
export type Celebration = { teamId: string; registrationId: string; label: string; key: number };

/**
 * 경매 기록과 팀 상태로 공지 막대에 흘릴 짧은 이야기를 만든다.
 * 후보 수·유찰 수처럼 화면에 이미 있는 숫자는 반복하지 않는다.
 */
export function auctionStories(auction: AuctionView): string[] {
	const sold = auction.history.filter((entry) => entry.result === 'sold' && !entry.voided && entry.price !== null);
	const stories: string[] = [];
	if (!sold.length) {
		stories.push(auction.status === 'in_progress' ? '🔔 아직 첫 낙찰 전! 첫 테이프는 어느 팀이 끊을까요?' : '🔔 낙찰 기록이 없어요');
	} else {
		const byPrice = [...sold].sort((a, b) => b.price! - a.price!);
		const top = byPrice[0]!;
		const bottom = byPrice.at(-1)!;
		const last = sold.at(-1)!;
		stories.push(`💰 현재 최고 몸값: ${top.displayName} ${top.price}P (${top.teamName})`);
		if (bottom.price! < top.price!) stories.push(`🛒 최고의 가성비: ${bottom.displayName} 단돈 ${bottom.price}P (${bottom.teamName})`);
		if (last !== top) stories.push(`🔨 방금 낙찰: ${last.displayName} → ${last.teamName} ${last.price}P`);
	}
	const spent = auction.teams.map((team) => ({ team, spent: team.startPoints - team.remainingPoints }));
	const bigSpender = [...spent].sort((a, b) => b.spent - a.spent)[0];
	if (bigSpender && bigSpender.spent > 0) stories.push(`🔥 가장 화끈하게 쓴 팀: ${bigSpender.team.name} · ${bigSpender.spent}P 지출`);
	const richest = [...auction.teams].sort((a, b) => b.remainingPoints - a.remainingPoints)[0];
	if (richest && sold.length) stories.push(`👛 지갑이 가장 두둑한 팀: ${richest.name} · ${richest.remainingPoints}P 남음`);
	for (const team of auction.teams) {
		if (team.members.length >= TEAM_SIZE) stories.push(`✅ ${team.name} 로스터 완성!`);
	}
	return stories;
}
