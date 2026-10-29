import { RoflError } from './format.ts';
import { readRoflMetadata, summarizeRoflMetadata } from './parser.ts';

export const ROFL_PROJECTION_VERSION = 1;

/** 합의한 P0~P2 필드만 선별한다. 알 수 없는 원본 필드는 서비스 저장 대상에 포함하지 않는다. */
export const ROFL_STAT_FIELDS = {
	kills: { source: 'CHAMPIONS_KILLED', priority: 0, unit: 'count' },
	deaths: { source: 'NUM_DEATHS', priority: 0, unit: 'count' },
	assists: { source: 'ASSISTS', priority: 0, unit: 'count' },
	minionsKilled: { source: 'MINIONS_KILLED', priority: 0, unit: 'count' },
	neutralMinionsKilled: { source: 'NEUTRAL_MINIONS_KILLED', priority: 0, unit: 'count' },
	damageDealtToChampions: { source: 'TOTAL_DAMAGE_DEALT_TO_CHAMPIONS', priority: 1, unit: 'damage' },
	damageTaken: { source: 'TOTAL_DAMAGE_TAKEN', priority: 1, unit: 'damage' },
	goldEarned: { source: 'GOLD_EARNED', priority: 1, unit: 'gold' },
	visionScore: { source: 'VISION_SCORE', priority: 1, unit: 'score' },
	wardsPlaced: { source: 'WARD_PLACED', priority: 1, unit: 'count' },
	wardsKilled: { source: 'WARD_KILLED', priority: 1, unit: 'count' },
	controlWardsBought: { source: 'VISION_WARDS_BOUGHT_IN_GAME', priority: 1, unit: 'count' },
	level: { source: 'LEVEL', priority: 1, unit: 'count' },
	physicalDamageDealtToChampions: { source: 'PHYSICAL_DAMAGE_DEALT_TO_CHAMPIONS', priority: 2, unit: 'damage' },
	magicDamageDealtToChampions: { source: 'MAGIC_DAMAGE_DEALT_TO_CHAMPIONS', priority: 2, unit: 'damage' },
	trueDamageDealtToChampions: { source: 'TRUE_DAMAGE_DEALT_TO_CHAMPIONS', priority: 2, unit: 'damage' },
	physicalDamageTaken: { source: 'PHYSICAL_DAMAGE_TAKEN', priority: 2, unit: 'damage' },
	magicDamageTaken: { source: 'MAGIC_DAMAGE_TAKEN', priority: 2, unit: 'damage' },
	trueDamageTaken: { source: 'TRUE_DAMAGE_TAKEN', priority: 2, unit: 'damage' },
	totalHeal: { source: 'TOTAL_HEAL', priority: 2, unit: 'healing' },
	healOnTeammates: { source: 'TOTAL_HEAL_ON_TEAMMATES', priority: 2, unit: 'healing' },
	damageShieldedOnTeammates: { source: 'TOTAL_DAMAGE_SHIELDED_ON_TEAMMATES', priority: 2, unit: 'shielding' },
	// 리플레이의 단위를 독립적으로 검증하기 전까지 선별한 원값을 유지한다.
	timeCcingOthers: { source: 'TIME_CCING_OTHERS', priority: 2, unit: 'unverified' },
	totalTimeCrowdControlDealt: { source: 'TOTAL_TIME_CROWD_CONTROL_DEALT', priority: 2, unit: 'unverified' },
	totalTimeCrowdControlDealtToChampions: { source: 'TOTAL_TIME_CROWD_CONTROL_DEALT_TO_CHAMPIONS', priority: 2, unit: 'unverified' },
	totalTimeSpentDead: { source: 'TOTAL_TIME_SPENT_DEAD', priority: 2, unit: 'unverified' },
	doubleKills: { source: 'DOUBLE_KILLS', priority: 2, unit: 'count' },
	tripleKills: { source: 'TRIPLE_KILLS', priority: 2, unit: 'count' },
	quadraKills: { source: 'QUADRA_KILLS', priority: 2, unit: 'count' },
	pentaKills: { source: 'PENTA_KILLS', priority: 2, unit: 'count' },
	killingSprees: { source: 'KILLING_SPREES', priority: 2, unit: 'count' },
	largestKillingSpree: { source: 'LARGEST_KILLING_SPREE', priority: 2, unit: 'count' },
	largestMultiKill: { source: 'LARGEST_MULTI_KILL', priority: 2, unit: 'count' }
} as const satisfies Record<string, {
	source: string;
	priority: 0 | 1 | 2;
	unit: 'count' | 'id' | 'gold' | 'damage' | 'healing' | 'shielding' | 'score' | 'unverified';
}>;

export interface RoflProjectedParticipant {
	index: number;
	riotId: { gameName: string | null; tagLine: string | null };
	replayPuuid: string | null;
	champion: string | null;
	teamId: number | null;
	win: boolean | null;
	stats: Record<keyof typeof ROFL_STAT_FIELDS, number | null>;
	loadout: {
		/** 빈 슬롯을 포함해 원래 ITEM0~ITEM6 순서의 일곱 칸을 유지한다. */
		itemIds: (number | null)[];
		/** 원래 SUMMONER_SPELL_1~2 순서의 두 칸을 유지한다. */
		summonerSpellIds: (number | null)[];
		primaryRuneStyleId: number | null;
		secondaryRuneStyleId: number | null;
		/** 원래 PERK0~PERK5 순서의 여섯 칸을 유지한다. */
		runeIds: (number | null)[];
		/** 원래 STAT_PERK_0~2 순서의 세 칸을 유지한다. */
		statRuneIds: (number | null)[];
	};
}

export interface RoflGameProjection {
	projectionVersion: typeof ROFL_PROJECTION_VERSION;
	formatVersion: 2;
	gameVersion: string;
	gameLengthMs: number;
	participants: RoflProjectedParticipant[];
	teams: { teamId: number; win: boolean | null }[];
	/** 메타데이터의 일관성만 나타내며 진위·등록 권한·계정 소유권을 증명하지 않는다. */
	result: { status: 'consistent' | 'incomplete' | 'conflicting'; winnerTeamId: number | null };
}

function numberStat(stats: Record<string, unknown>, source: string, index: number): number | null {
	const value = stats[source];
	if (value === undefined || value === null || value === '') return null;
	const invalid = () => new RoflError('INVALID_METADATA', `ROFL 참가자 ${index}의 ${source} 필드가 올바르지 않습니다.`);
	if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw invalid();
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < 0) throw invalid();
	return number;
}

function teamResults(participants: RoflProjectedParticipant[]): Pick<RoflGameProjection, 'teams' | 'result'> {
	const groups = new Map<number, { wins: Set<boolean>; incomplete: boolean }>();
	let incomplete = false;
	for (const participant of participants) {
		if (participant.teamId === null) {
			incomplete = true;
			continue;
		}
		const group = groups.get(participant.teamId) ?? { wins: new Set<boolean>(), incomplete: false };
		groups.set(participant.teamId, group);
		if (participant.win === null) {
			group.incomplete = true;
			incomplete = true;
		} else group.wins.add(participant.win);
	}
	const knownWinners = [...groups].filter(([, group]) => group.wins.has(true)).map(([teamId]) => teamId);
	const conflicting = [...groups.values()].some((group) => group.wins.size > 1)
		|| knownWinners.length > 1
		|| (!incomplete && groups.size >= 2 && knownWinners.length === 0);
	const status = conflicting ? 'conflicting' : incomplete || groups.size < 2 ? 'incomplete' : 'consistent';
	return {
		teams: [...groups].sort(([a], [b]) => a - b).map(([teamId, group]) => ({
			teamId,
			win: !group.incomplete && group.wins.size === 1 ? group.wins.has(true) : null
		})),
		result: { status, winnerTeamId: status === 'consistent' ? knownWinners[0] : null }
	};
}

/** 메타데이터에서 서비스용 데이터만 선별한다. 원본 보관이나 서비스 객체 연결은 수행하지 않는다. */
export function projectRoflGame(bytes: Uint8Array): RoflGameProjection {
	const raw = readRoflMetadata(bytes);
	const summary = summarizeRoflMetadata(raw);
	const participants = summary.participants.map((participant): RoflProjectedParticipant => {
		const source = raw.playerStats[participant.index];
		const read = (key: string) => numberStat(source, key, participant.index);
		const stats = {} as RoflProjectedParticipant['stats'];
		for (const field of Object.keys(ROFL_STAT_FIELDS) as (keyof typeof ROFL_STAT_FIELDS)[]) {
			stats[field] = read(ROFL_STAT_FIELDS[field].source);
		}
		return {
			index: participant.index,
			riotId: participant.riotId,
			replayPuuid: participant.replayPuuid,
			champion: participant.champion,
			teamId: participant.teamId,
			win: participant.win,
			stats,
			loadout: {
				itemIds: Array.from({ length: 7 }, (_, index) => read(`ITEM${index}`)),
				summonerSpellIds: [read('SUMMONER_SPELL_1'), read('SUMMONER_SPELL_2')],
				primaryRuneStyleId: read('PERK_PRIMARY_STYLE'),
				secondaryRuneStyleId: read('PERK_SUB_STYLE'),
				runeIds: Array.from({ length: 6 }, (_, index) => read(`PERK${index}`)),
				statRuneIds: Array.from({ length: 3 }, (_, index) => read(`STAT_PERK_${index}`))
			}
		};
	});
	return {
		projectionVersion: ROFL_PROJECTION_VERSION,
		formatVersion: summary.formatVersion,
		gameVersion: summary.gameVersion,
		gameLengthMs: summary.gameLengthMs,
		participants,
		...teamResults(participants)
	};
}
