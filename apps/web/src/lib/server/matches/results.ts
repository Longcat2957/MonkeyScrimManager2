import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { parseRiotId } from '../../features/me/riot-id.ts';
import { requireUser } from '../auth/guards.ts';
import type { Actor } from '../auth/types.ts';
import type { Database, Transaction } from '../db/types.ts';
import {
    gameMmrApplications,
    gameParticipants,
    games,
    guildRiotAccounts,
    matches,
    matchLineups,
    matchRoflImports,
    riotAccounts,
    roflMetadata,
    roflParticipants,
    roflGameDataV1,
    roflParticipantDataV1,
    scrimBracketNodes,
    scrimParticipants,
    scrims,
    users
} from '../db/schema.ts';
import { DomainError } from '../errors.ts';
import { requireGuildAdmin, requireGuildMember } from '../guild/access.ts';
import { applyGameMmr, reverseGameMmr } from '../mmr/service.ts';
import { prepareRoflImport, type RoflImportData } from '../rofl/import-model.ts';
import { RoflError } from '../rofl/format.ts';
import { readRoflIdentity } from '../rofl/identity.ts';
import { RiotError } from '../riot/errors.ts';
import { createResolvedMatches } from '../scrims/bracket.ts';
import { assertRevision, requireRevision, requireUuid } from '../scrims/validation.ts';
import type { MatchDependencies, MatchSlotInput } from './service.ts';
import { validateLineupRoster } from './service.ts';
import {
    bumpMatchRevision,
    completedGames,
    conflict,
    findMatch,
    lockMatch,
    readLineup,
    readRoster,
    requireCurrentSlot,
    requireGameNumber
} from './state.ts';
import { downstreamMatches, resultReversalBlock } from './reversal.ts';

export type MatchRoflInput = MatchSlotInput & {
    lineupId: string;
    blueTeamSlot: 'a' | 'b';
    bytes: Uint8Array;
};
export type MatchResult = { order: number; gameId: string };

async function requireUploader(
    db: Database | Transaction,
    user: Actor,
    isAdmin: boolean,
    matchId: string,
    input: Pick<MatchRoflInput, 'lineupId' | 'nextGameNumber'>
) {
    const lineup = await readLineup(db, matchId);
    if (!lineup || lineup.id !== input.lineupId) conflict('업로드 대상 라인업이 변경됐어요');
    if (!isAdmin) {
        const ids = lineup.players.map((player) => player.participantId);
        const [participant] = ids.length
            ? await db
                  .select({ id: scrimParticipants.id })
                  .from(scrimParticipants)
                  .where(and(inArray(scrimParticipants.id, ids), eq(scrimParticipants.userId, user.userId)))
                  .limit(1)
            : [];
        if (!participant || !lineup.confirmedAt)
            throw new DomainError('FORBIDDEN', '서버 관리자 또는 확정된 경기 출전자만 업로드할 수 있어요');
    }
    return lineup;
}

async function existingImport(
    db: Database | Transaction,
    matchId: string,
    input: MatchRoflInput,
    fileSha256: string
): Promise<MatchResult | null> {
    const [stored] = await db
        .select({ metadata: roflMetadata, receipt: matchRoflImports, game: games })
        .from(roflMetadata)
        .leftJoin(matchRoflImports, eq(matchRoflImports.roflMetadataId, roflMetadata.id))
        .leftJoin(games, eq(games.id, matchRoflImports.gameId))
        .where(eq(roflMetadata.fileSha256, fileSha256))
        .limit(1);
    if (!stored) return null;
    if (
        stored.receipt?.matchId === matchId &&
        stored.receipt.lineupId === input.lineupId &&
        stored.receipt.submittedRevision === input.expectedRevision &&
        stored.game?.gameNumber === input.nextGameNumber &&
        stored.game.blueTeamSlot === input.blueTeamSlot &&
        stored.game.status === 'completed' &&
        stored.game.roflMetadataId === stored.metadata.id
    ) {
        return { order: stored.game.gameNumber, gameId: stored.game.id };
    }
    conflict('이미 등록되었거나 취소된 ROFL이에요. 다른 결과로 재사용할 수 없어요');
}

function validateProjection(prepared: RoflImportData) {
    const { gameData, participantData } = prepared.rows;
    if (
        participantData.length !== 10 ||
        gameData.resultStatus !== 'consistent' ||
        gameData.winnerReplayTeamId === null ||
        gameData.teams.length !== 2 ||
        gameData.gameLengthMs <= 0
    ) {
        throw new DomainError('INVALID_INPUT', '출전자 열 명과 일관된 최종 승패가 있는 ROFL이 필요해요');
    }
    for (const team of gameData.teams) {
        if (participantData.filter((player) => player.replayTeamId === team.teamId).length !== 5)
            throw new DomainError('INVALID_INPUT', 'ROFL 양 팀이 각각 다섯 명이어야 해요');
    }
    for (const player of participantData) {
        if (
            !player.gameName ||
            !player.tagLine ||
            !parseRiotId(`${player.gameName}#${player.tagLine}`) ||
            !player.champion ||
            player.champion.length > 128 ||
            [
                player.stats.kills,
                player.stats.deaths,
                player.stats.assists,
                player.stats.minionsKilled,
                player.stats.neutralMinionsKilled
            ].some((value) => value === null)
        ) {
            throw new DomainError('INVALID_INPUT', 'ROFL 참가자의 계정·챔피언·최종 기록을 확인할 수 없어요');
        }
    }
}

async function resolveReplayAccounts(prepared: RoflImportData, dependencies: MatchDependencies) {
    const riot = dependencies.riot ?? (await import('../riot/account.ts'));
    const accounts: { index: number; puuid: string }[] = [];
    // 공용 Riot 전송기의 동시 요청 상한보다 작게 나누며 실패한 묶음도 모두 정리한 뒤 반환한다.
    for (let offset = 0; offset < prepared.rows.participantData.length; offset += 4) {
        const batch = await Promise.allSettled(
            prepared.rows.participantData.slice(offset, offset + 4).map(async (player) => {
                try {
                    const account = await riot.getAccountByRiotId({
                        gameName: player.gameName!,
                        tagLine: player.tagLine!
                    });
                    if (!/^[A-Za-z0-9_-]{1,128}$/.test(account.puuid))
                        throw new DomainError('SERVICE_UNAVAILABLE', 'Riot 계정 식별자를 확인할 수 없어요');
                    return { index: player.participantIndex, puuid: account.puuid };
                } catch (error) {
                    if (error instanceof RiotError && error.code === 'NOT_FOUND')
                        throw new DomainError('CONFLICT', 'ROFL의 Riot ID를 현재 계정으로 확인할 수 없어요');
                    throw error;
                }
            })
        );
        for (const result of batch) {
            if (result.status === 'rejected') throw result.reason;
            accounts.push(result.value);
        }
    }
    if (new Set(accounts.map((account) => account.puuid)).size !== 10)
        conflict('ROFL 참가자의 실제 Riot 계정이 서로 중복돼요');
    return accounts;
}

/** 파일 압축·배열 순서가 달라도 동일한 선별 결과를 다시 채택하지 않는다. 외부 계정 PUUID만 정렬 키로 쓴다. */
function resultFingerprint(
    prepared: RoflImportData,
    resolved: Awaited<ReturnType<typeof resolveReplayAccounts>>
) {
    const players = prepared.rows.participantData
        .map((player) => ({
            puuid: resolved.find((account) => account.index === player.participantIndex)!.puuid,
            team: player.replayTeamId,
            win: player.win,
            champion: player.champion,
            stats: player.stats,
            loadout: player.loadout
        }))
        .sort((left, right) => (left.puuid < right.puuid ? -1 : left.puuid > right.puuid ? 1 : 0));
    return createHash('sha256')
        .update(
            JSON.stringify({
                version: 1,
                gameVersion: prepared.rows.metadata.gameVersion,
                gameLengthMs: prepared.rows.gameData.gameLengthMs,
                players
            })
        )
        .digest('hex');
}

/** 사용자 → 계정 키 → 연결 순서를 시즌·내전보다 먼저 잡는다. 읽기만 하는 계정 키는 표시정보 수정 잠금과 충돌하지 않는다. */
async function lockReplayAccounts(
    tx: Transaction,
    guildId: string,
    actor: Actor,
    resolved: Awaited<ReturnType<typeof resolveReplayAccounts>>,
    lineupUserIds: string[]
) {
    const puuids = resolved.map((row) => row.puuid);
    const owners = await tx
        .select({ userId: guildRiotAccounts.userId })
        .from(guildRiotAccounts)
        .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
        .where(and(eq(guildRiotAccounts.guildId, guildId), inArray(riotAccounts.puuid, puuids)));
    await tx
        .select({ id: users.id })
        .from(users)
        .where(
            inArray(
                users.id,
                [...new Set([actor.userId, ...lineupUserIds, ...owners.map((row) => row.userId)])].sort()
            )
        )
        .orderBy(asc(users.id))
        .for('no key update');
    let identities = await tx
        .select()
        .from(riotAccounts)
        .where(inArray(riotAccounts.puuid, puuids))
        .orderBy(asc(riotAccounts.id))
        .for('key share');
    const missing = resolved
        .filter((account) => !identities.some((identity) => identity.puuid === account.puuid))
        .sort((left, right) => (left.puuid < right.puuid ? -1 : left.puuid > right.puuid ? 1 : 0));
    if (missing.length) {
        // 자동 확인된 부계정은 실사용 기록의 외래키만 만든다. 서버 연결·대표 계정은 바꾸지 않는다.
        await tx
            .insert(riotAccounts)
            .values(missing.map((account) => ({ puuid: account.puuid })))
            .onConflictDoNothing({ target: riotAccounts.puuid });
        identities = await tx
            .select()
            .from(riotAccounts)
            .where(inArray(riotAccounts.puuid, puuids))
            .orderBy(asc(riotAccounts.id))
            .for('key share');
    }
    const links = await tx
        .select()
        .from(guildRiotAccounts)
        .where(
            and(
                eq(guildRiotAccounts.guildId, guildId),
                inArray(
                    guildRiotAccounts.riotAccountId,
                    identities.map((row) => row.id)
                )
            )
        )
        .orderBy(asc(guildRiotAccounts.riotAccountId))
        .for('share');
    return resolved.map((account) => {
        const identity = identities.find((row) => row.puuid === account.puuid)!;
        return {
            index: account.index,
            accountId: identity.id,
            userId: links.find((link) => link.riotAccountId === identity.id)?.userId ?? null
        };
    });
}

/** 기존 서버 계정으로 팀을 확인한 뒤 파일의 명시적 포지션과 확정 라인업을 대조한다. */
function linkReplayParticipants(
    prepared: RoflImportData,
    identity: ReturnType<typeof readRoflIdentity>,
    accounts: Awaited<ReturnType<typeof lockReplayAccounts>>,
    players: Awaited<ReturnType<typeof validateLineupRoster>>,
    match: typeof matches.$inferSelect
) {
    const teamLinks = new Map<number, string>();
    for (const player of prepared.rows.participantData) {
        const account = accounts.find((row) => row.index === player.participantIndex)!;
        if (!account.userId) continue;
        const assigned = players.find((row) => row.member.userId === account.userId);
        if (!assigned) conflict('이 서버에서 다른 사용자에게 연결된 계정이 ROFL에 포함되어 있어요');
        const position = identity.find((row) => row.participantIndex === player.participantIndex)?.position;
        if (position && position !== assigned.position)
            conflict('ROFL의 실제 포지션과 확정한 출전 포지션이 일치하지 않아요');
        const replayTeam = player.replayTeamId!;
        if (teamLinks.has(replayTeam) && teamLinks.get(replayTeam) !== assigned.teamId)
            conflict('ROFL의 양 팀 구성과 확정한 출전 팀이 일치하지 않아요');
        teamLinks.set(replayTeam, assigned.teamId);
    }
    if (!teamLinks.size) conflict('ROFL의 팀을 확인할 기존 연결 계정이 필요해요');
    if (teamLinks.size === 1) {
        const known = [...teamLinks][0]!;
        const otherTeam = prepared.rows.gameData.teams.find((team) => team.teamId !== known[0])!;
        teamLinks.set(otherTeam.teamId, known[1] === match.teamAId ? match.teamBId : match.teamAId);
    }
    if (teamLinks.size !== 2 || new Set(teamLinks.values()).size !== 2)
        conflict('ROFL의 양 팀 구성과 확정한 출전 팀이 일치하지 않아요');
    const linked = prepared.rows.participantData.map((player) => {
        const account = accounts.find((row) => row.index === player.participantIndex)!;
        const position = identity.find((row) => row.participantIndex === player.participantIndex)?.position;
        const teamId = teamLinks.get(player.replayTeamId!);
        const assigned = account.userId
            ? players.find((row) => row.member.userId === account.userId)
            : position
              ? players.find((row) => row.teamId === teamId && row.position === position)
              : undefined;
        if (!assigned || assigned.teamId !== teamId || (position && position !== assigned.position))
            conflict('ROFL의 계정과 명시된 포지션으로 출전자를 확인할 수 없어요');
        return { player, account, assigned };
    });
    if (new Set(linked.map((row) => row.assigned.participantId)).size !== 10)
        conflict('ROFL 출전자와 확정한 라인업이 일치하지 않아요');
    return linked;
}

async function finishSeries(tx: Transaction, context: Awaited<ReturnType<typeof lockMatch>>) {
    const completed = await completedGames(tx, context.match.id);
    const scores = { a: 0, b: 0 };
    for (const game of completed)
        scores[game.winnerSide === 'blue' ? game.blueTeamSlot : game.blueTeamSlot === 'a' ? 'b' : 'a'] += 1;
    const needed = Math.floor(context.match.bestOf / 2) + 1;
    const winner =
        scores.a >= needed ? context.match.teamAId : scores.b >= needed ? context.match.teamBId : null;
    if (!winner) return;
    // 종료 시각은 서비스의 운영 종료 시각이다. Game의 실제 시각은 계속 null로 둔다.
    await tx
        .update(matches)
        .set({ status: 'completed', winnerTeamId: winner, endedAt: new Date() })
        .where(eq(matches.id, context.match.id));
    await createResolvedMatches(tx, context.scrim);
    const nodes = await tx
        .select({ status: matches.status })
        .from(scrimBracketNodes)
        .leftJoin(matches, eq(matches.id, scrimBracketNodes.matchId))
        .where(eq(scrimBracketNodes.scrimId, context.scrim.id));
    if (nodes.length && nodes.every((node) => node.status === 'completed'))
        await tx.update(scrims).set({ status: 'completed' }).where(eq(scrims.id, context.scrim.id));
}

export async function importMatchRofl(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchRoflInput,
    dependencies: MatchDependencies = {}
): Promise<MatchResult> {
    const user = requireUser(actor);
    requireRevision(input.expectedRevision);
    requireGameNumber(input.nextGameNumber);
    requireUuid(input.lineupId, '라인업');
    if (!['a', 'b'].includes(input.blueTeamSlot))
        throw new DomainError('INVALID_INPUT', '이번 게임의 블루 팀을 선택해 주세요');
    if (!(input.bytes instanceof Uint8Array))
        throw new DomainError('INVALID_INPUT', 'ROFL 파일을 선택해 주세요');
    const guild = await requireGuildMember(user, guildId, { db, discord: dependencies.discord });
    const before = await findMatch(db, guildId, matchId);
    await requireUploader(db, user, guild.isAdmin, matchId, input);
    const fileSha256 = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await existingImport(db, matchId, input, fileSha256);
    if (existing) return existing;
    let prepared: RoflImportData;
    let identity: ReturnType<typeof readRoflIdentity>;
    try {
        identity = readRoflIdentity(input.bytes);
        prepared = prepareRoflImport(input.bytes, {
            guildId,
            scrimId: before.scrim.id,
            matchId,
            gameId: randomUUID(),
            gameNumber: input.nextGameNumber,
            uploadedByUserId: user.userId,
            uploadedAt: new Date()
        });
    } catch (error) {
        if (error instanceof RoflError) throw new DomainError('INVALID_INPUT', error.message);
        throw error;
    }
    validateProjection(prepared);
    const resolved = await resolveReplayAccounts(prepared, dependencies);
    const fingerprint = resultFingerprint(prepared, resolved);
    const lineupUserIds = (await readRoster(db, before.match)).flatMap(({ participant }) =>
        participant.userId ? [participant.userId] : []
    );
    try {
        return await db.transaction(async (tx) => {
            const accounts = await lockReplayAccounts(tx, guildId, user, resolved, lineupUserIds);
            const context = await lockMatch(tx, user, guildId, matchId, false, true);
            const lineup = await requireUploader(tx, user, context.guild.isAdmin, matchId, input);
            const replay = await existingImport(tx, matchId, input, fileSha256);
            if (replay) return replay;
            await requireCurrentSlot(tx, context, input);
            if (!lineup.confirmedAt) conflict('먼저 경기 출전 라인업을 확정해 주세요');
            const players = await validateLineupRoster(tx, context.match, lineup.players, true);
            const linked = linkReplayParticipants(prepared, identity, accounts, players, context.match);
            const blueTeamId = input.blueTeamSlot === 'a' ? context.match.teamAId : context.match.teamBId;
            const replayBlueTeams = new Set(
                linked
                    .filter((row) => row.assigned.teamId === blueTeamId)
                    .map((row) => row.player.replayTeamId)
            );
            const replayRedTeams = new Set(
                linked
                    .filter((row) => row.assigned.teamId !== blueTeamId)
                    .map((row) => row.player.replayTeamId)
            );
            if (
                replayBlueTeams.size !== 1 ||
                replayRedTeams.size !== 1 ||
                [...replayBlueTeams][0] === [...replayRedTeams][0]
            )
                conflict('ROFL의 양 팀 구성과 확정한 출전 팀이 일치하지 않아요');
            const blueReplayTeam = [...replayBlueTeams][0]!;
            const winnerSide =
                prepared.rows.gameData.winnerReplayTeamId === blueReplayTeam
                    ? ('blue' as const)
                    : ('red' as const);
            const [duplicate] = await tx
                .select({ id: matchRoflImports.roflMetadataId })
                .from(matchRoflImports)
                .where(eq(matchRoflImports.resultFingerprint, fingerprint))
                .limit(1);
            if (duplicate) conflict('같은 게임의 결과가 이미 등록되어 있어요');
            await tx.insert(roflMetadata).values(prepared.rows.metadata);
            await tx.insert(roflParticipants).values(prepared.rows.participants);
            await tx.insert(roflGameDataV1).values(prepared.rows.gameData);
            await tx.insert(roflParticipantDataV1).values(prepared.rows.participantData);
            const [game] = await tx
                .insert(games)
                .values({
                    scrimId: context.scrim.id,
                    matchId,
                    gameNumber: input.nextGameNumber,
                    blueTeamSlot: input.blueTeamSlot,
                    status: 'completed',
                    winnerSide,
                    roflMetadataId: prepared.rows.metadata.id
                })
                .returning();
            await tx.insert(gameParticipants).values(
                linked.map(({ player, account, assigned }) => ({
                    scrimId: context.scrim.id,
                    gameId: game!.id,
                    scrimParticipantId: assigned.participantId,
                    riotAccountId: account.accountId,
                    displayName: assigned.member.displayName,
                    riotGameName: player.gameName,
                    riotTagLine: player.tagLine,
                    side: assigned.teamId === blueTeamId ? ('blue' as const) : ('red' as const),
                    position: assigned.position,
                    roflMetadataId: prepared.rows.metadata.id,
                    roflParticipantIndex: player.participantIndex
                }))
            );
            await tx.insert(matchRoflImports).values({
                roflMetadataId: prepared.rows.metadata.id,
                resultFingerprint: fingerprint,
                matchId,
                gameId: game!.id,
                lineupId: lineup.id,
                submittedRevision: input.expectedRevision
            });
            await applyGameMmr(tx, guildId, game!.id, user.userId);
            await finishSeries(tx, context);
            await bumpMatchRevision(tx, matchId, context.scrim.id);
            return { order: game!.gameNumber, gameId: game!.id };
        });
    } catch (error) {
        const cause = error instanceof Error && 'cause' in error ? error.cause : error;
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505')
            conflict('같은 결과나 게임이 먼저 등록됐어요. 새로고침 후 확인해 주세요');
        throw error;
    }
}

export async function revertLastMatchGame(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: { expectedRevision: number; gameId: string; reason: string },
    dependencies: MatchDependencies = {}
): Promise<MatchResult> {
    const user = requireUser(actor);
    requireRevision(input.expectedRevision);
    requireUuid(input.gameId, '게임');
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason || reason.length > 500)
        throw new DomainError('INVALID_INPUT', '결과 취소 사유를 500자 이내로 입력해 주세요');
    await requireGuildAdmin(user, guildId, { db, discord: dependencies.discord });
    return db.transaction(async (tx) => {
        const context = await lockMatch(tx, user, guildId, matchId, true, true);
        assertRevision(context.match.revision, input.expectedRevision);
        const [game] = await tx
            .select()
            .from(games)
            .where(and(eq(games.id, input.gameId), eq(games.matchId, matchId)))
            .for('update');
        if (!game) throw new DomainError('NOT_FOUND', '이 경기의 게임을 찾을 수 없어요');
        const blocked = await resultReversalBlock(tx, context.scrim, context.match, game);
        if (blocked) conflict(blocked);
        const [application] = await tx
            .select()
            .from(gameMmrApplications)
            .where(and(eq(gameMmrApplications.gameId, game.id), isNull(gameMmrApplications.reversedAt)))
            .limit(1);
        if (!application) conflict('현재 결과의 MMR 반영을 확인해야 해요');
        await reverseGameMmr(tx, guildId, game.id, {
            applicationId: application.id,
            actorUserId: user.userId,
            reason
        });
        for (const next of await downstreamMatches(tx, matchId)) {
            await tx
                .update(scrimBracketNodes)
                .set({ matchId: null })
                .where(eq(scrimBracketNodes.id, next.node.id));
            await tx.delete(matchLineups).where(eq(matchLineups.matchId, next.match.id));
            await tx.delete(matches).where(eq(matches.id, next.match.id));
        }
        await tx.update(games).set({ status: 'cancelled', winnerSide: null }).where(eq(games.id, game.id));
        await tx
            .update(matches)
            .set({ status: 'in_progress', winnerTeamId: null, endedAt: null, endReason: null })
            .where(eq(matches.id, matchId));
        if (context.scrim.status === 'completed')
            await tx.update(scrims).set({ status: 'in_progress' }).where(eq(scrims.id, context.scrim.id));
        await bumpMatchRevision(tx, matchId, context.scrim.id);
        return { order: game.gameNumber, gameId: game.id };
    });
}
