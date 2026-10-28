import { createHash } from 'node:crypto';
import { readRoflLayout, RoflError } from './format.ts';
import { projectRoflGame, type RoflGameProjection } from './projection.ts';

export interface RoflTeamLink {
	/** The numeric team value in this replay, not a service team ID. */
	replayTeamId: number;
	teamId: string;
}

export interface RoflParticipantLink {
	participantIndex: number;
	playerId: string;
	riotAccountId: string | null;
}

/** Supplied by the service. Replay bytes cannot establish these IDs, ownership or storage locations. */
export interface RoflImportContext {
	guildId: string;
	scrimId: string;
	matchId: string;
	gameId: string;
	gameNumber: number;
	uploadedByUserId: string;
	uploadedAt: Date;
	replayStorageKey: string;
	metadataStorageKey: string;
	teams?: readonly RoflTeamLink[];
	participants?: readonly RoflParticipantLink[];
}

export interface RoflImportDraft {
	/** Local consistency and supplied links do not confirm a result or prove account ownership. */
	status: 'pending_review';
	registration: {
		guildId: string; scrimId: string; matchId: string; gameId: string; gameNumber: number;
	};
	upload: { uploadedByUserId: string; uploadedAt: string };
	source: {
		replayStorageKey: string; replaySha256: string; replayBytes: number;
		metadataStorageKey: string; metadataSha256: string; metadataBytes: number;
	};
	game: RoflGameProjection;
	links: {
		teams: { replayTeamId: number; teamId: string | null }[];
		participants: { participantIndex: number; playerId: string | null; riotAccountId: string | null }[];
	};
}

function invalidContext(field: string): never {
	throw new RoflError('INVALID_IMPORT_CONTEXT', `ROFL 적재 문맥의 ${field} 값이 올바르지 않습니다.`);
}

function identifier(value: string, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) invalidContext(field);
	return value;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

/** Builds an in-memory draft only. Does not write files, contact a database, match accounts or confirm results. */
export function createRoflImportDraft(bytes: Uint8Array, context: RoflImportContext): RoflImportDraft {
	const registration = {
		guildId: identifier(context.guildId, 'guildId'),
		scrimId: identifier(context.scrimId, 'scrimId'),
		matchId: identifier(context.matchId, 'matchId'),
		gameId: identifier(context.gameId, 'gameId'),
		gameNumber: context.gameNumber
	};
	if (!Number.isSafeInteger(context.gameNumber) || context.gameNumber < 1) invalidContext('gameNumber');
	const uploadedByUserId = identifier(context.uploadedByUserId, 'uploadedByUserId');
	if (!(context.uploadedAt instanceof Date) || !Number.isFinite(context.uploadedAt.getTime())) invalidContext('uploadedAt');
	const replayStorageKey = identifier(context.replayStorageKey, 'replayStorageKey');
	const metadataStorageKey = identifier(context.metadataStorageKey, 'metadataStorageKey');
	const game = projectRoflGame(bytes);
	const { metadataOffset, metadataLength } = readRoflLayout(bytes);
	const teamLinks = new Map<number, string>();
	const participantLinks = new Map<number, RoflParticipantLink>();
	for (const link of context.teams ?? []) {
		if (!game.teams.some((team) => team.teamId === link.replayTeamId) || teamLinks.has(link.replayTeamId)) {
			invalidContext('teams.replayTeamId');
		}
		teamLinks.set(link.replayTeamId, identifier(link.teamId, 'teams.teamId'));
	}
	for (const link of context.participants ?? []) {
		if (!Number.isSafeInteger(link.participantIndex) || link.participantIndex < 0 ||
			link.participantIndex >= game.participants.length || participantLinks.has(link.participantIndex)) {
			invalidContext('participants.participantIndex');
		}
		participantLinks.set(link.participantIndex, {
			participantIndex: link.participantIndex,
			playerId: identifier(link.playerId, 'participants.playerId'),
			riotAccountId: link.riotAccountId === null ? null : identifier(link.riotAccountId, 'participants.riotAccountId')
		});
	}
	return {
		status: 'pending_review', registration,
		upload: { uploadedByUserId, uploadedAt: context.uploadedAt.toISOString() },
		source: {
			replayStorageKey, replaySha256: sha256(bytes), replayBytes: bytes.byteLength,
			metadataStorageKey, metadataSha256: sha256(bytes.subarray(metadataOffset, metadataOffset + metadataLength)),
			metadataBytes: metadataLength
		},
		game,
		links: {
			teams: game.teams.map(({ teamId }) => ({ replayTeamId: teamId, teamId: teamLinks.get(teamId) ?? null })),
			participants: game.participants.map(({ index }) => ({
				participantIndex: index,
				playerId: participantLinks.get(index)?.playerId ?? null,
				riotAccountId: participantLinks.get(index)?.riotAccountId ?? null
			}))
		}
	};
}
