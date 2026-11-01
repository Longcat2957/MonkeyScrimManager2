import type { LolPosition } from '#lib/features/guild/types.ts';
import type { ChampionRef } from '#lib/features/scrims/formation.ts';

export type { ChampionRef };

/** 사용자 전적의 게임 한 줄. 사용자 기준으로 여러 Riot 계정의 게임을 합친다. */
export type PlayerGame = {
	matchId: string;
	gameId: string;
	scrimTitle: string;
	playedAt: string;
	win: boolean;
	champion: ChampionRef;
	position: LolPosition;
	kills: number;
	deaths: number;
	assists: number;
	cs: number;
	damage: number;
	damageTaken: number;
	gold: number;
	visionScore: number;
	teamKills: number;
	durationSec: number;
	teammates: { userId: string; displayName: string }[];
};

export type PlayerSummary = {
	games: number;
	wins: number;
	kills: number;
	deaths: number;
	assists: number;
	kda: number;
	csPerMin: number;
	damagePerMin: number;
	goldPerMin: number;
	damageTakenPerMin: number;
	visionPerGame: number;
	killParticipation: number;
	/** 플레이한 챔피언 수. */
	champions: number;
	/** 한 게임 최다 킬. */
	maxKills: number;
	/** 가장 긴 연승·연패. */
	winStreak: number;
	lossStreak: number;
	mainPosition: LolPosition | null;
};

export type ChampionRecord = { champion: ChampionRef; games: number; wins: number; kda: number };
export type DuoRecord = { userId: string; displayName: string; games: number; wins: number };
