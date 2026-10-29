import { createHash, randomUUID } from 'node:crypto';
import type {
	NewRoflMetadata, NewRoflParticipant, NewRoflGameDataV1, NewRoflParticipantDataV1,
	RoflStatsV1, RoflLoadoutV1
} from '../db/schema.ts';
import { RoflError } from './format.ts';
import { projectRoflGame, type RoflProjectedParticipant } from './projection.ts';

export interface RoflTeamLink {
	/** 리플레이 내부의 팀 번호이며 서비스 팀 ID와 구분한다. */
	replayTeamId: number;
	teamId: string;
}

export interface RoflParticipantLink {
	participantIndex: number;
	scrimParticipantId: string;
	riotAccountId: string | null;
}

/** 서비스가 제공하는 등록 문맥이다. 리플레이로 서비스 ID나 계정 소유권을 추정하지 않는다. */
export interface RoflImportContext {
	guildId: string;
	scrimId: string;
	matchId: string;
	gameId: string;
	gameNumber: number;
	uploadedByUserId: string;
	uploadedAt: Date;
	teams?: readonly RoflTeamLink[];
	participants?: readonly RoflParticipantLink[];
}

/** DB 삽입 타입과 맞추되, 준비 단계에서 생성하는 ID·기본값·nullable 필드도 명시적으로 채운다. */
export interface RoflImportRowsV1 {
	projectionVersion: 1;
	metadata: Required<NewRoflMetadata> & { projectionVersion: 1 };
	participants: NewRoflParticipant[];
	gameData: Required<NewRoflGameDataV1> & { projectionVersion: 1 };
	participantData: Required<NewRoflParticipantDataV1>[];
}

// 새 저장 규약은 별도 버전으로 추가하며 기존 V1 데이터 형식을 바꾸지 않는다.
export type RoflImportRows = RoflImportRowsV1;

export interface RoflImportData {
	registration: {
		guildId: string; scrimId: string; matchId: string; gameId: string; gameNumber: number;
	};
	rows: RoflImportRows;
	links: {
		teams: { replayTeamId: number; teamId: string | null }[];
		participants: { participantIndex: number; scrimParticipantId: string | null; riotAccountId: string | null }[];
	};
}

function invalidContext(field: string): never {
	throw new RoflError('INVALID_IMPORT_CONTEXT', `ROFL 적재 문맥의 ${field} 값이 올바르지 않습니다.`);
}

function identifier(value: string, field: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) invalidContext(field);
	return value;
}

function uuidIdentifier(value: string, field: string): string {
	identifier(value, field);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalidContext(field);
	return value.toLowerCase();
}

// 최신 projection의 필드가 늘어나도 V1 JSONB에 새 필드를 자동으로 섞지 않는다.
function statsV1(stats: RoflProjectedParticipant['stats']): RoflStatsV1 {
	return {
		kills: stats.kills, deaths: stats.deaths, assists: stats.assists,
		minionsKilled: stats.minionsKilled, neutralMinionsKilled: stats.neutralMinionsKilled,
		damageDealtToChampions: stats.damageDealtToChampions, damageTaken: stats.damageTaken, goldEarned: stats.goldEarned,
		visionScore: stats.visionScore, wardsPlaced: stats.wardsPlaced, wardsKilled: stats.wardsKilled,
		controlWardsBought: stats.controlWardsBought, level: stats.level,
		physicalDamageDealtToChampions: stats.physicalDamageDealtToChampions,
		magicDamageDealtToChampions: stats.magicDamageDealtToChampions,
		trueDamageDealtToChampions: stats.trueDamageDealtToChampions,
		physicalDamageTaken: stats.physicalDamageTaken, magicDamageTaken: stats.magicDamageTaken, trueDamageTaken: stats.trueDamageTaken,
		totalHeal: stats.totalHeal, healOnTeammates: stats.healOnTeammates, damageShieldedOnTeammates: stats.damageShieldedOnTeammates,
		timeCcingOthers: stats.timeCcingOthers, totalTimeCrowdControlDealt: stats.totalTimeCrowdControlDealt,
		totalTimeCrowdControlDealtToChampions: stats.totalTimeCrowdControlDealtToChampions, totalTimeSpentDead: stats.totalTimeSpentDead,
		doubleKills: stats.doubleKills, tripleKills: stats.tripleKills, quadraKills: stats.quadraKills, pentaKills: stats.pentaKills,
		killingSprees: stats.killingSprees, largestKillingSpree: stats.largestKillingSpree, largestMultiKill: stats.largestMultiKill
	};
}

function loadoutV1(loadout: RoflProjectedParticipant['loadout']): RoflLoadoutV1 {
	if (loadout.itemIds.length !== 7 || loadout.summonerSpellIds.length !== 2 ||
		loadout.runeIds.length !== 6 || loadout.statRuneIds.length !== 3) {
		throw new RoflError('UNSUPPORTED_PROJECTION', 'ROFL 최종 세팅의 슬롯 수가 V1 저장 규약과 다릅니다.');
	}
	// 길이를 확인한 배열만 고정 슬롯으로 복사한다. 빈 슬롯과 실제 0을 유지한다.
	return {
		itemIds: [...loadout.itemIds] as RoflLoadoutV1['itemIds'],
		summonerSpellIds: [...loadout.summonerSpellIds] as RoflLoadoutV1['summonerSpellIds'],
		primaryRuneStyleId: loadout.primaryRuneStyleId,
		secondaryRuneStyleId: loadout.secondaryRuneStyleId,
		runeIds: [...loadout.runeIds] as RoflLoadoutV1['runeIds'],
		statRuneIds: [...loadout.statRuneIds] as RoflLoadoutV1['statRuneIds']
	};
}

/** 자동 등록에 쓸 적재 데이터를 준비한다. 등록 권한·연결 대상·중복 검증과 DB 저장은 호출하는 서비스에서 수행한다. */
export function prepareRoflImport(bytes: Uint8Array, context: RoflImportContext): RoflImportData {
	const registration = {
		guildId: identifier(context.guildId, 'guildId'),
		scrimId: uuidIdentifier(context.scrimId, 'scrimId'),
		matchId: uuidIdentifier(context.matchId, 'matchId'),
		gameId: uuidIdentifier(context.gameId, 'gameId'),
		gameNumber: context.gameNumber
	};
	if (!Number.isInteger(context.gameNumber) || context.gameNumber < 1 || context.gameNumber > 2_147_483_647) invalidContext('gameNumber');
	const uploadedByUserId = identifier(context.uploadedByUserId, 'uploadedByUserId');
	if (!(context.uploadedAt instanceof Date) || !Number.isFinite(context.uploadedAt.getTime())) invalidContext('uploadedAt');
	const uploadedAt = new Date(context.uploadedAt.getTime());
	const game = projectRoflGame(bytes);
	if (game.projectionVersion !== 1) {
		throw new RoflError('UNSUPPORTED_PROJECTION', '이 ROFL 선별 데이터 버전의 적재 모델이 아직 없습니다.');
	}
	const teamLinks = new Map<number, string>();
	const participantLinks = new Map<number, RoflParticipantLink>();
	const linkedTeamIds = new Set<string>();
	const linkedParticipantIds = new Set<string>();
	const linkedAccountIds = new Set<string>();
	for (const link of context.teams ?? []) {
		if (!game.teams.some((team) => team.teamId === link.replayTeamId) || teamLinks.has(link.replayTeamId)) {
			invalidContext('teams.replayTeamId');
		}
		const teamId = uuidIdentifier(link.teamId, 'teams.teamId');
		if (linkedTeamIds.has(teamId)) invalidContext('teams.teamId');
		linkedTeamIds.add(teamId);
		teamLinks.set(link.replayTeamId, teamId);
	}
	for (const link of context.participants ?? []) {
		if (!Number.isSafeInteger(link.participantIndex) || link.participantIndex < 0 ||
			link.participantIndex >= game.participants.length || participantLinks.has(link.participantIndex)) {
			invalidContext('participants.participantIndex');
		}
		const scrimParticipantId = uuidIdentifier(link.scrimParticipantId, 'participants.scrimParticipantId');
		const riotAccountId = link.riotAccountId === null ? null : uuidIdentifier(link.riotAccountId, 'participants.riotAccountId');
		if (linkedParticipantIds.has(scrimParticipantId)) invalidContext('participants.scrimParticipantId');
		if (riotAccountId !== null && linkedAccountIds.has(riotAccountId)) invalidContext('participants.riotAccountId');
		linkedParticipantIds.add(scrimParticipantId);
		if (riotAccountId !== null) linkedAccountIds.add(riotAccountId);
		participantLinks.set(link.participantIndex, { participantIndex: link.participantIndex, scrimParticipantId, riotAccountId });
	}

	// 같은 파일을 다시 준비해도 새 메타 ID를 만든다. 기존 지문 재사용과 전체 참조 재매핑은 DB 저장 단계의 책임이다.
	const roflMetadataId = randomUUID();
	return {
		registration,
		rows: {
			projectionVersion: 1,
			metadata: {
				id: roflMetadataId, fileSha256: createHash('sha256').update(bytes).digest('hex'), fileSizeBytes: bytes.byteLength,
				formatVersion: game.formatVersion, gameVersion: game.gameVersion, projectionVersion: 1,
				uploadedByUserId, uploadedAt
			},
			participants: game.participants.map(({ index }) => ({ roflMetadataId, participantIndex: index })),
			gameData: {
				roflMetadataId, projectionVersion: 1, gameLengthMs: game.gameLengthMs,
				resultStatus: game.result.status, winnerReplayTeamId: game.result.winnerTeamId,
				teams: game.teams.map(({ teamId, win }) => ({ teamId, win }))
			},
			participantData: game.participants.map((participant) => ({
				roflMetadataId, participantIndex: participant.index,
				gameName: participant.riotId.gameName, tagLine: participant.riotId.tagLine,
				replayPuuid: participant.replayPuuid, champion: participant.champion, replayTeamId: participant.teamId, win: participant.win,
				stats: statsV1(participant.stats), loadout: loadoutV1(participant.loadout)
			}))
		},
		links: {
			teams: game.teams.map(({ teamId }) => ({ replayTeamId: teamId, teamId: teamLinks.get(teamId) ?? null })),
			participants: game.participants.map(({ index }) => ({
				participantIndex: index,
				scrimParticipantId: participantLinks.get(index)?.scrimParticipantId ?? null,
				riotAccountId: participantLinks.get(index)?.riotAccountId ?? null
			}))
		}
	};
}
