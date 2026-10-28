import { readRoflLayout, RoflError } from './format.ts';
export { MAX_ROFL_FILE_BYTES, MAX_ROFL_METADATA_BYTES, RoflError } from './format.ts';

export interface RoflParticipant {
	index: number;
	riotId: { gameName: string | null; tagLine: string | null };
	// A replay-native identifier; do not assume it is an encrypted Riot API PUUID.
	replayPuuid: string | null;
	champion: string | null;
	teamId: number | null;
	win: boolean | null;
	kills: number | null;
	deaths: number | null;
	assists: number | null;
	minionsKilled: number | null;
	neutralMinionsKilled: number | null;
	creepScore: number | null;
}

export interface RoflMetadata {
	formatVersion: 2;
	gameVersion: string;
	gameLengthMs: number;
	participants: RoflParticipant[];
	/** Parsed metadata, including the untouched statsJson string and unknown fields. JSON numbers use JS precision. */
	metadata: Record<string, unknown>;
}

export interface RoflRawMetadata {
	formatVersion: 2;
	gameVersion: string;
	metadata: Record<string, unknown>;
	/** All parsed fields, without coercing strings. Numeric JSON literals use JS precision; retain source bytes. */
	playerStats: Record<string, unknown>[];
}

function invalidMetadata(): never {
	throw new RoflError('INVALID_METADATA', 'ROFL 경기 메타데이터 형식이 올바르지 않습니다.');
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) invalidMetadata();
	return value as Record<string, unknown>;
}

function parseJson(value: string): unknown {
	try { return JSON.parse(value); }
	catch { return invalidMetadata(); }
}

function textStat(stats: Record<string, unknown>, key: string): string | null {
	const value = stats[key];
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string') invalidMetadata();
	return value;
}

function numberStat(stats: Record<string, unknown>, key: string): number | null {
	const value = stats[key];
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) invalidMetadata();
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < 0) invalidMetadata();
	return number;
}

function participant(value: unknown, index: number): RoflParticipant {
	const stats = record(value);
	const minionsKilled = numberStat(stats, 'MINIONS_KILLED');
	const neutralMinionsKilled = numberStat(stats, 'NEUTRAL_MINIONS_KILLED');
	const creepScore = minionsKilled === null || neutralMinionsKilled === null
		? null : minionsKilled + neutralMinionsKilled;
	if (creepScore !== null && !Number.isSafeInteger(creepScore)) invalidMetadata();
	const win = textStat(stats, 'WIN');
	return {
		index,
		riotId: { gameName: textStat(stats, 'RIOT_ID_GAME_NAME'), tagLine: textStat(stats, 'RIOT_ID_TAG_LINE') },
		replayPuuid: textStat(stats, 'PUUID'),
		champion: textStat(stats, 'SKIN'),
		teamId: numberStat(stats, 'TEAM'),
		win: win === 'Win' ? true : win === 'Fail' ? false : null,
		kills: numberStat(stats, 'CHAMPIONS_KILLED'),
		deaths: numberStat(stats, 'NUM_DEATHS'),
		assists: numberStat(stats, 'ASSISTS'),
		minionsKilled,
		neutralMinionsKilled,
		creepScore
	};
}

/** Reads all metadata before applying the narrower, typed participant projection. */
export function readRoflMetadata(bytes: Uint8Array): RoflRawMetadata {
	const layout = readRoflLayout(bytes);
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let json: string;
	try {
		json = decoder.decode(bytes.subarray(layout.metadataOffset, layout.metadataOffset + layout.metadataLength));
	} catch { return invalidMetadata(); }
	const metadata = record(parseJson(json));
	if (typeof metadata.statsJson !== 'string') invalidMetadata();
	const stats = parseJson(metadata.statsJson);
	if (!Array.isArray(stats) || stats.length === 0) invalidMetadata();
	return { formatVersion: 2, gameVersion: layout.gameVersion, metadata, playerStats: stats.map(record) };
}

/** Reads ROFL2 summary metadata only; does not authenticate the signature or decode payload packets. */
export function parseRoflMetadata(bytes: Uint8Array): RoflMetadata {
	const { metadata, playerStats, gameVersion } = readRoflMetadata(bytes);
	if (typeof metadata.gameLength !== 'number' || !Number.isSafeInteger(metadata.gameLength) || metadata.gameLength < 0) invalidMetadata();
	return {
		formatVersion: 2,
		gameVersion,
		gameLengthMs: metadata.gameLength,
		participants: playerStats.map(participant),
		metadata
	};
}
