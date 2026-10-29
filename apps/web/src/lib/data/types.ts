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

/** 내전 요약 화면의 데이터. 신청·운영 권한은 서버가 판단한 값만 전달한다. */
export interface ScrimDetail extends ScrimSummary {
	createdAt: string;
	registrations: Registration[];
	viewerRegistration: Registration | null;
	capabilities: {
		canManage: boolean;
		canRegister: boolean;
		/** 신청할 수 없는 이유. 없으면 null. */
		registerBlockedReason: string | null;
	};
}

/** 한 경기의 출전 기록. 값이 없으면 null이며 0으로 채우지 않는다. */
export interface GameParticipantLine {
	participantId: string;
	player: PlayerRef;
	champion: string;
	position: Position;
	side: GameSide;
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	gold: number;
	vision: number;
}

export interface GameDetail {
	id: string;
	number: number;
	status: GameStatus;
	blueTeam: TeamRef;
	redTeam: TeamRef;
	winnerSide: GameSide | null;
	/** 실제 경기 길이. 확인하지 못했으면 null이다. */
	durationMs: number | null;
	participants: GameParticipantLine[];
}

export interface MatchDetail extends MatchSummary {
	games: GameDetail[];
	isHardFearless: boolean;
	capabilities: { canUploadRofl: boolean };
}

export interface PlayerRecentGame {
	matchId: string;
	gameId: string;
	gameNumber: number;
	opponent: string;
	champion: string;
	result: 'win' | 'loss' | 'unknown';
	playedAt: string | null;
}

export interface PlayerProfile {
	player: PlayerRef;
	totals: { games: number; wins: number; losses: number };
	/** 승률. 출전 Game이 없으면 null이다. */
	winRate: number | null;
	mmrSeason: string | null;
	/** 공개 범위에서 MMR을 제공하지 않으면 null이다. */
	positionMmr: { position: Position; value: number; status: 'applied' | 'pending' }[] | null;
	recent: PlayerRecentGame[];
	total: number;
}

export interface GuildStatsView {
	games: number;
	players: number;
	averageDurationMs: number | null;
	positions: { position: Position; games: number; kda: number; cs: number }[];
}

export interface GuildAdminView {
	members: { player: PlayerRef; role: 'member' | 'admin'; joinedAt: string }[];
	settings: { recruitChannel: string | null; resultChannel: string | null };
	capabilities: { canEdit: boolean; canChangeRoles: boolean };
}

export interface RegistrationInput {
	positions: Position[];
}

export interface RiotAccountView {
	id: string;
	gameName: string;
	tagLine: string;
	platform: string;
	verified: boolean;
}

export interface PrivacySettingsView {
	publicProfile: boolean;
	showRiotIds: boolean;
}

export interface ViewerProfile {
	accounts: RiotAccountView[];
	privacy: PrivacySettingsView;
}
