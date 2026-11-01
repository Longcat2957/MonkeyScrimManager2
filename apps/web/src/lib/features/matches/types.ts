import type { matchStatus } from '#lib/server/db/schema.ts';

export type MatchStatus = (typeof matchStatus.enumValues)[number];

// 서버 홈·경기 기록의 한 행이다. 점수는 결과가 기록된 게임만 센다.
export type MatchListItem = {
	id: string;
	scrimTitle: string;
	teamA: string;
	teamB: string;
	scoreA: number;
	scoreB: number;
	bestOf: number;
	status: MatchStatus;
	// 실제 경기 시각을 확인하지 못했으면 null이다. 업로드 시각으로 대신하지 않는다.
	playedAt: string | null;
};

export type MatchStatusFilter = 'all' | 'in_progress' | 'done';

/** 게임 표의 아이템·주문·룬 아이콘. 카탈로그에서 찾지 못하면 이름이 비고 아이콘이 null이다. */
export type LoadoutIcon = { id: number; name: string; iconUrl: string | null };

export type GamePlayer = {
	key: string;
	userId: string | null;
	displayName: string;
	// 공개 설정이 허용할 때만 채운다.
	riotId: string | null;
	champion: { id: string; name: string; iconUrl: string | null };
	level: number | null;
	kills: number;
	deaths: number;
	assists: number;
	cs: number | null;
	damage: number | null;
	damageTaken: number | null;
	gold: number | null;
	visionScore: number | null;
	wardsPlaced: number | null;
	wardsKilled: number | null;
	controlWards: number | null;
	heal: number | null;
	shield: number | null;
	largestKillingSpree: number | null;
	multiKills: { double: number; triple: number; quadra: number; penta: number };
	// 빈 칸을 포함한 ITEM0~ITEM6 순서.
	items: (LoadoutIcon | null)[];
	spells: (LoadoutIcon | null)[];
	keystone: LoadoutIcon | null;
	secondaryStyle: LoadoutIcon | null;
	// 임시 성과 점수로 정한 승리 팀 1위(MVP)·패배 팀 1위(ACE).
	badge: 'mvp' | 'ace' | null;
	fearlessViolation: boolean;
};

export type GameSide = {
	side: 'blue' | 'red';
	slot: 'a' | 'b';
	teamName: string;
	win: boolean;
	players: GamePlayer[];
};

export type GameDetail = {
	id: string;
	order: number;
	durationSec: number;
	playedAt: string | null;
	patch: string;
	mmrStatus: 'applied' | 'pending' | 'none';
	splashUrl: string | null;
	sides: GameSide[];
};

export type MatchDetail = {
	id: string;
	scrim: { id: string; title: string };
	teamA: string;
	teamB: string;
	scoreA: number;
	scoreB: number;
	bestOf: number;
	status: MatchStatus;
	hardFearless: boolean;
	games: { id: string; order: number; winner: 'a' | 'b' | null }[];
};
