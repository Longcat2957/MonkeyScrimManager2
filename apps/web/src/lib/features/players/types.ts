import type { LolPosition } from '#lib/features/guild/types.ts';
import type { ChampionRef } from '#lib/features/scrims/formation.ts';

export type { ChampionRef };

/** 사용자 전적의 게임 한 줄. 사용자 기준으로 여러 Riot 계정의 게임을 합친다. */
export type PlayerGame = {
    matchId: string;
    gameId: string;
    scrimTitle: string;
    playedAt: string | null;
    win: boolean;
    champion: ChampionRef;
    position: LolPosition | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    cs: number | null;
    damage: number | null;
    damageTaken: number | null;
    gold: number | null;
    visionScore: number | null;
    teamKills: number | null;
    durationSec: number | null;
    teammates: { userId: string; displayName: string }[];
};

export type PlayerSummary = {
    games: number;
    wins: number;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    kda: number | null;
    csPerMin: number | null;
    damagePerMin: number | null;
    goldPerMin: number | null;
    damageTakenPerMin: number | null;
    visionPerGame: number | null;
    killParticipation: number | null;
    /** 플레이한 챔피언 수. */
    champions: number | null;
    /** 한 게임 최다 킬. */
    maxKills: number | null;
    /** 가장 긴 연승·연패. */
    winStreak: number | null;
    lossStreak: number | null;
    mainPosition: LolPosition | null;
};

export type ChampionRecord = { champion: ChampionRef; games: number; wins: number; kda: number | null };
export type DuoRecord = { userId: string; displayName: string; games: number; wins: number };
