/*
 * 화면이 사용하는 도메인 계약.
 * DB 스키마의 enum과 1:1로 맞추고, 화면에 필요한 값만 담는다.
 * 데이터가 없는 경우(연결되지 않은 참가자, 확인되지 않은 시각)는 null로 표현한다.
 */

export type Position = 'top' | 'jungle' | 'mid' | 'bot' | 'support';

export type ScrimStatus =
	| 'recruit'
	| 'preparing'
	| 'ready'
	| 'in_progress'
	| 'completed'
	| 'ended_early'
	| 'cancelled';

export type FormationMethod = 'manual' | 'auction';

export type RegistrationStatus = 'pending' | 'selected' | 'standby' | 'withdrawn' | 'excluded';

export type MatchStatus = 'pending' | 'in_progress' | 'completed' | 'ended_early' | 'cancelled';

export type GameStatus = 'pending' | 'in_progress' | 'awaiting_result' | 'completed' | 'cancelled';

export type GameSide = 'blue' | 'red';

export type AuctionStatus = 'setup' | 'in_progress' | 'completed' | 'cancelled';

export type LotStatus = 'open' | 'sold' | 'unsold' | 'cancelled';

/** 조회 결과가 일부 실패해도 나머지 영역을 유지하기 위한 결과 값. */
export type Loadable<T> = { status: 'ready'; data: T } | { status: 'error'; message: string };

/** 화면에 표시하는 사용자 식별. 기록 당시 이름을 유지하며, 연결이 없으면 userId가 null이다. */
export interface PlayerRef {
	userId: string | null;
	displayName: string;
	riotId: string | null;
}

export interface TeamRef {
	id: string;
	name: string;
}

export interface ScrimSummary {
	id: string;
	title: string;
	status: ScrimStatus;
	formationMethod: FormationMethod | null;
	teamCount: number;
	/** 실출전 정원 = 팀 수 × 5 */
	playingCapacity: number;
	/** 전체 신청 정원 = 실출전 정원 + 추가 신청 */
	appliedCapacity: number;
	applicantCount: number;
	selectedCount: number;
	expectedStartAt: string | null;
	isHardFearless: boolean;
}

export interface Registration {
	participantId: string;
	player: PlayerRef;
	status: RegistrationStatus;
	/** 희망 포지션(우선순위 순) */
	positions: Position[];
	joinedAt: string;
	teamId: string | null;
	teamPosition: Position | null;
}

export interface MatchSummary {
	id: string;
	scrimId: string;
	scrimTitle: string;
	teamA: TeamRef;
	teamB: TeamRef;
	bestOf: number;
	/** 완료된 Game 기준 점수. 순서는 teamA, teamB다. */
	score: [number, number];
	status: MatchStatus;
	/** 실제 경기 시각. 확인하지 못했으면 null이다. */
	playedAt: string | null;
}

export interface GuildHome {
	activeScrims: Loadable<ScrimSummary[]>;
	recentMatches: Loadable<MatchSummary[]>;
	summary: Loadable<{ completedGames: number; players: number; averageDurationMs: number | null }>;
}

export interface ScrimListFilter {
	status: ScrimStatus | 'all';
	page: number;
	pageSize: number;
}

export interface PageResult<T> {
	items: T[];
	total: number;
}

export interface MatchListFilter {
	q: string;
	status: MatchStatus | 'all';
	page: number;
	pageSize: number;
}

export interface NewScrimInput {
	title: string;
	expectedStartAt: string | null;
	teamCount: number;
	reserveCapacity: number;
	formationMethod: FormationMethod | null;
	isHardFearless: boolean;
}

/** 포지션 표시 순서. 모든 편성·명단 화면이 같은 순서를 쓴다. */
export const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'bot', 'support'];
