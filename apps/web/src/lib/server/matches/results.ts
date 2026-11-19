import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { RoflPreview } from '../../features/matches/rofl-preview.ts';
import { lockUserLifecycleChanges } from '../accounts/lifecycle.ts';
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
    matchSetSides,
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
import { readLiveGuildMembership, requireGuildAdmin, requireGuildMember } from '../guild/access.ts';
import { writeGuildAudit } from '../guild/audit.ts';
import { applyGameMmr, reverseGameMmr } from '../mmr/service.ts';
import type { RoflImportData } from '../rofl/import-model.ts';
import { RoflError } from '../rofl/format.ts';
import type { RoflIdentity } from '../rofl/identity.ts';
import { RiotError } from '../riot/errors.ts';
import { createResolvedMatches } from '../scrims/bracket.ts';
import { assertRecoverableParticipants } from '../scrims/recovery.ts';
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
    blueTeamConfirmed: boolean;
    bytes: Uint8Array;
    previewDigest?: string;
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

type StoredImport = {
    metadata: typeof roflMetadata.$inferSelect;
    receipt: typeof matchRoflImports.$inferSelect;
    game: typeof games.$inferSelect;
};
type ExistingImport = { kind: 'replay'; result: MatchResult } | { kind: 'cancelled'; source: StoredImport };

async function existingImport(
    db: Database | Transaction,
    matchId: string,
    input: MatchRoflInput,
    fileSha256: string
): Promise<ExistingImport | null> {
    const stored = await db
        .select({ metadata: roflMetadata, receipt: matchRoflImports, game: games })
        .from(roflMetadata)
        .leftJoin(matchRoflImports, eq(matchRoflImports.roflMetadataId, roflMetadata.id))
        .leftJoin(games, eq(games.id, matchRoflImports.gameId))
        .where(eq(roflMetadata.fileSha256, fileSha256))
        .orderBy(desc(matchRoflImports.submittedRevision));
    if (!stored.length) return null;
    // 취소로 세트 번호는 정정할 수 있지만 출전자 귀속은 같은 경기·라인업 안에서만 재사용한다.
    const receipts: StoredImport[] = stored.map(({ metadata, receipt, game }) => {
        if (
            !receipt ||
            !game ||
            receipt.matchId !== matchId ||
            receipt.lineupId !== input.lineupId ||
            game.roflMetadataId !== metadata.id
        )
            conflict('이미 등록된 ROFL은 같은 경기와 확정 라인업에서만 복구할 수 있어요');
        return { metadata, receipt, game };
    });
    const replay = receipts.find(
        ({ receipt, game }) =>
            receipt.submittedRevision === input.expectedRevision &&
            game.gameNumber === input.nextGameNumber &&
            game.blueTeamSlot === input.blueTeamSlot &&
            receipt.cancelledAt === null &&
            game.status === 'completed'
    );
    if (replay) return { kind: 'replay', result: { order: replay.game.gameNumber, gameId: replay.game.id } };
    if (receipts.some(({ receipt, game }) => receipt.cancelledAt === null || game.status !== 'cancelled'))
        conflict('이미 등록된 ROFL이에요. 현재 결과를 먼저 확인해 주세요');
    // 복구 가능 여부는 경기 잠금 뒤 최신 revision·다음 슬롯을 다시 검사한다.
    return { kind: 'cancelled', source: receipts[0]! };
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
            !player.gameName?.trim() ||
            !player.tagLine?.trim() ||
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

type ResolvedAccounts = { index: number; puuid: string; gameName: string; tagLine: string }[];

async function resolveReplayAccounts(prepared: RoflImportData, dependencies: MatchDependencies) {
    const riot = dependencies.riot ?? (await import('../riot/account.ts'));
    const accounts: ResolvedAccounts = [];
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
                    const gameName = account.gameName?.trim() || player.gameName!;
                    const tagLine = account.tagLine?.trim() || player.tagLine!;
                    return { index: player.participantIndex, puuid: account.puuid, gameName, tagLine };
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
function resultFingerprint(prepared: RoflImportData, resolved: ResolvedAccounts) {
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

/** 사용자 → 계정 키 → 연결 순서로 잠근다. 다른 서버의 표시정보 변경과 계정 키 읽기는 함께 진행한다. */
async function lockResultUsers(
    tx: Transaction,
    actor: Actor,
    guildId: string,
    match: typeof matches.$inferSelect,
    resolved: ResolvedAccounts
) {
    const roster = await readRoster(tx, match);
    const owners = resolved.length
        ? await tx
              .select({ userId: guildRiotAccounts.userId })
              .from(guildRiotAccounts)
              .innerJoin(riotAccounts, eq(riotAccounts.id, guildRiotAccounts.riotAccountId))
              .where(
                  and(
                      eq(guildRiotAccounts.guildId, guildId),
                      inArray(
                          riotAccounts.puuid,
                          resolved.map((row) => row.puuid)
                      )
                  )
              )
        : [];
    const userIds = new Set([actor.userId, ...owners.map((row) => row.userId)]);
    for (const { participant } of roster) if (participant.userId) userIds.add(participant.userId);
    await tx
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, [...userIds].sort()))
        .orderBy(asc(users.id))
        .for('no key update');
}

async function readReplayAccounts(
    tx: Transaction,
    guildId: string,
    resolved: ResolvedAccounts,
    lock: boolean
) {
    const lookup = tx
        .select()
        .from(riotAccounts)
        .where(
            inArray(
                riotAccounts.puuid,
                resolved.map((row) => row.puuid)
            )
        )
        .orderBy(asc(riotAccounts.id));
    const identities = lock ? await lookup.for('key share') : await lookup;
    const connections = tx
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
        .orderBy(asc(guildRiotAccounts.riotAccountId));
    const links = lock ? await connections.for('share') : await connections;
    return resolved.map((account) => {
        const identity = identities.find((row) => row.puuid === account.puuid);
        return {
            ...account,
            accountId: identity?.id ?? null,
            userId: links.find((link) => link.riotAccountId === identity?.id)?.userId ?? null
        };
    });
}

/** 표준 진영·업로드 선택 또는 기존 계정 연결로 팀을 확인하고 실제 포지션을 확정 라인업과 대조한다. */
function freshCandidate(
    prepared: RoflImportData,
    identity: RoflIdentity[],
    accounts: Awaited<ReturnType<typeof readReplayAccounts>>,
    players: Awaited<ReturnType<typeof validateLineupRoster>>,
    match: typeof matches.$inferSelect,
    blueTeamSlot: 'a' | 'b',
    fingerprint: string
): ResultCandidate {
    const teamLinks = new Map<number, string>();
    const replayTeams = prepared.rows.gameData.teams.map((team) => team.teamId);
    if (replayTeams.includes(100) && replayTeams.includes(200)) {
        // 표준 팀 코드 100은 블루, 200은 레드다. 참가자 배열 순서로 진영을 만들지 않는다.
        teamLinks.set(100, blueTeamSlot === 'a' ? match.teamAId : match.teamBId);
        teamLinks.set(200, blueTeamSlot === 'a' ? match.teamBId : match.teamAId);
    }
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
    if (!teamLinks.size)
        conflict('표준 블루·레드 팀 코드가 없는 ROFL은 팀을 확인할 기존 연결 계정이 필요해요');
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
        if (!account.userId && !position)
            conflict('계정이 연결되지 않은 출전자는 ROFL에 실제 포지션이 있어야 해요');
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
    const blueTeamId = blueTeamSlot === 'a' ? match.teamAId : match.teamBId;
    return {
        metadataId: prepared.rows.metadata.id,
        fingerprint,
        winnerSide: winnerSideFor(
            linked.map(({ player, assigned }) => ({
                teamId: assigned.teamId,
                replayTeamId: player.replayTeamId
            })),
            blueTeamId,
            prepared.rows.gameData.winnerReplayTeamId
        ),
        players: linked.map(({ player, account, assigned }) => ({
            played: {
                scrimParticipantId: assigned.participantId,
                riotAccountId: account.accountId,
                displayName: assigned.member.displayName,
                riotGameName: player.gameName,
                riotTagLine: player.tagLine,
                side: assigned.teamId === blueTeamId ? 'blue' : 'red',
                position: assigned.position,
                championId: null,
                roflMetadataId: prepared.rows.metadata.id,
                roflParticipantIndex: player.participantIndex
            },
            data: player,
            userId: assigned.member.userId!,
            accountKey: account.puuid,
            newConnection: !account.userId
        }))
    };
}

/** 첫 정상 결과에서 확인한 서버별 계정 연결을 다음 경기에도 재사용한다. 기존 대표와 신청 선택은 보존한다. */
async function persistReplayAccounts(
    tx: Transaction,
    guildId: string,
    actor: Actor,
    players: CandidatePlayer[],
    resolved: ResolvedAccounts
) {
    const missing = resolved
        .filter(
            (account) => !players.find(({ accountKey }) => accountKey === account.puuid)!.played.riotAccountId
        )
        .sort((left, right) => (left.puuid < right.puuid ? -1 : left.puuid > right.puuid ? 1 : 0));
    if (missing.length) {
        // 비교를 통과한 뒤에만 전역 계정을 만들고, 경합 시 먼저 생성된 계정의 실제 키를 사용한다.
        await tx
            .insert(riotAccounts)
            .values(missing.map(({ puuid, gameName, tagLine }) => ({ puuid, gameName, tagLine })))
            .onConflictDoNothing({ target: riotAccounts.puuid });
        const identities = await tx
            .select({ id: riotAccounts.id, puuid: riotAccounts.puuid })
            .from(riotAccounts)
            .where(
                inArray(
                    riotAccounts.puuid,
                    missing.map((account) => account.puuid)
                )
            )
            .orderBy(asc(riotAccounts.id))
            .for('key share');
        for (const player of players)
            if (!player.played.riotAccountId)
                player.played.riotAccountId = identities.find((row) => row.puuid === player.accountKey)!.id;
    }
    // 다른 서버가 편집 중인 표시정보는 기다리지 않는다. 현재 실사용 이름은 경기 출전에 따로 보존한다.
    const refreshable = await tx
        .select({ id: riotAccounts.id })
        .from(riotAccounts)
        .where(
            inArray(
                riotAccounts.id,
                players.map(({ played }) => played.riotAccountId!)
            )
        )
        .orderBy(asc(riotAccounts.id))
        .for('no key update', { skipLocked: true });
    const refreshableIds = new Set(refreshable.map((row) => row.id));
    const ownLinks = await tx
        .select()
        .from(guildRiotAccounts)
        .where(
            and(
                eq(guildRiotAccounts.guildId, guildId),
                inArray(
                    guildRiotAccounts.userId,
                    players.map(({ userId }) => userId)
                )
            )
        )
        .orderBy(asc(guildRiotAccounts.riotAccountId))
        .for('share');
    for (const { played, userId, accountKey, newConnection } of players) {
        const accountId = played.riotAccountId!;
        const current = resolved.find((row) => row.puuid === accountKey)!;
        if (refreshableIds.has(accountId))
            await tx
                .update(riotAccounts)
                .set({ gameName: current.gameName, tagLine: current.tagLine })
                .where(eq(riotAccounts.id, accountId));
        if (newConnection) {
            const previousPrimary = ownLinks.find((link) => link.userId === userId && link.isPrimary);
            await tx.insert(guildRiotAccounts).values({
                guildId,
                riotAccountId: accountId,
                userId,
                isPrimary: !previousPrimary,
                linkedByUserId: actor.userId
            });
            await writeGuildAudit(tx, {
                kind: 'riot_account_linked',
                guildId,
                actorUserId: actor.userId,
                targetUserId: userId,
                riotAccountId: accountId,
                previousPrimaryAccountId: previousPrimary?.riotAccountId ?? null,
                nextPrimaryAccountId: previousPrimary?.riotAccountId ?? accountId
            });
        }
        await tx
            .update(scrimParticipants)
            .set({ riotAccountId: accountId })
            .where(
                and(
                    eq(scrimParticipants.id, played.scrimParticipantId),
                    isNull(scrimParticipants.riotAccountId)
                )
            );
    }
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

function winnerSideFor(
    players: { teamId: string; replayTeamId: number | null }[],
    blueTeamId: string,
    winnerReplayTeamId: number | null
) {
    const blue = new Set(
        players.filter((player) => player.teamId === blueTeamId).map((player) => player.replayTeamId)
    );
    const red = new Set(
        players.filter((player) => player.teamId !== blueTeamId).map((player) => player.replayTeamId)
    );
    const blueTeam = [...blue][0];
    const redTeam = [...red][0];
    if (
        blue.size !== 1 ||
        red.size !== 1 ||
        blueTeam == null ||
        redTeam == null ||
        blueTeam === redTeam ||
        (winnerReplayTeamId !== blueTeam && winnerReplayTeamId !== redTeam)
    )
        conflict('ROFL의 양 팀 구성과 확정한 출전 팀이 일치하지 않아요');
    return winnerReplayTeamId === blueTeam ? ('blue' as const) : ('red' as const);
}

type CandidatePlayer = {
    played: Omit<typeof gameParticipants.$inferSelect, 'scrimId' | 'gameId' | 'createdAt' | 'updatedAt'>;
    data: Pick<typeof roflParticipantDataV1.$inferSelect, 'champion' | 'stats'>;
    userId: string;
    accountKey: string;
    newConnection: boolean;
};

type ResultCandidate = {
    metadataId: string;
    fingerprint: string;
    winnerSide: 'blue' | 'red';
    players: CandidatePlayer[];
};

function previewResult(
    context: Awaited<ReturnType<typeof lockMatch>>,
    input: MatchRoflInput,
    fileSha256: string,
    candidate: ResultCandidate
): RoflPreview {
    const players = candidate.players.map(({ played, data, newConnection }) => ({
        side: played.side,
        displayName: played.displayName,
        riotId:
            played.riotGameName && played.riotTagLine ? `${played.riotGameName}#${played.riotTagLine}` : '—',
        position: played.position,
        champion: data.champion ?? '미확인',
        kills: data.stats.kills,
        deaths: data.stats.deaths,
        assists: data.stats.assists,
        newConnection
    }));
    const preview = {
        order: input.nextGameNumber,
        blueTeamSlot: input.blueTeamSlot,
        winner: candidate.winnerSide,
        players
    };
    // 새 메타·계정 UUID가 아닌 실제 계정과 출전자 귀속을 검증한다. 내부 키는 브라우저로 보내지 않는다.
    const digest = createHash('sha256')
        .update(
            JSON.stringify({
                fileSha256,
                guild: context.scrim.guildId,
                scrim: context.scrim.id,
                match: context.match.id,
                teams: [context.match.teamAId, context.match.teamBId],
                revision: input.expectedRevision,
                lineup: input.lineupId,
                fingerprint: candidate.fingerprint,
                links: candidate.players.map(({ played, userId, accountKey }) => [
                    played.roflParticipantIndex,
                    played.scrimParticipantId,
                    userId,
                    accountKey
                ]),
                preview
            })
        )
        .digest('hex');
    return { ...preview, digest };
}

async function saveGameResult(
    tx: Transaction,
    user: Actor,
    guildId: string,
    context: Awaited<ReturnType<typeof lockMatch>>,
    input: MatchRoflInput,
    result: ResultCandidate
): Promise<MatchResult> {
    const [game] = await tx
        .insert(games)
        .values({
            scrimId: context.scrim.id,
            matchId: context.match.id,
            gameNumber: input.nextGameNumber,
            blueTeamSlot: input.blueTeamSlot,
            status: 'completed',
            winnerSide: result.winnerSide,
            roflMetadataId: result.metadataId
        })
        .returning();
    await tx.insert(gameParticipants).values(
        result.players.map(({ played }) => ({
            ...played,
            scrimId: context.scrim.id,
            gameId: game!.id
        }))
    );
    await tx.insert(matchRoflImports).values({
        roflMetadataId: result.metadataId,
        resultFingerprint: result.fingerprint,
        matchId: context.match.id,
        gameId: game!.id,
        lineupId: input.lineupId,
        submittedRevision: input.expectedRevision
    });
    await applyGameMmr(tx, guildId, game!.id, user.userId);
    await finishSeries(tx, context);
    await bumpMatchRevision(tx, context.match.id, context.scrim.id);
    return { order: game!.gameNumber, gameId: game!.id };
}

/** 같은 파일의 복구는 과거에 검증한 귀속을 사용한다. 현재 Riot ID·서버 계정 소유자로 다시 해석하지 않는다. */
async function restoredCandidate(
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockMatch>>,
    input: MatchRoflInput,
    source: StoredImport,
    players: Awaited<ReturnType<typeof validateLineupRoster>>
): Promise<ResultCandidate> {
    if (source.game.blueTeamSlot !== input.blueTeamSlot)
        conflict('취소한 ROFL은 등록 당시의 블루 팀으로만 복구할 수 있어요');
    const [result] = await tx
        .select()
        .from(roflGameDataV1)
        .where(eq(roflGameDataV1.roflMetadataId, source.metadata.id));
    const previous = await tx
        .select({ played: gameParticipants, data: roflParticipantDataV1 })
        .from(gameParticipants)
        .innerJoin(
            roflParticipantDataV1,
            and(
                eq(roflParticipantDataV1.roflMetadataId, gameParticipants.roflMetadataId),
                eq(roflParticipantDataV1.participantIndex, gameParticipants.roflParticipantIndex)
            )
        )
        .where(eq(gameParticipants.gameId, source.game.id))
        .orderBy(asc(gameParticipants.roflParticipantIndex));
    if (
        !result ||
        result.resultStatus !== 'consistent' ||
        previous.length !== 10 ||
        source.metadata.fileSizeBytes !== input.bytes.byteLength
    )
        conflict('이전 결과의 ROFL 근거와 출전을 확인해야 해요');
    const originalBlueTeam = source.game.blueTeamSlot === 'a' ? context.match.teamAId : context.match.teamBId;
    const blueTeamId = input.blueTeamSlot === 'a' ? context.match.teamAId : context.match.teamBId;
    const linked = previous.map(({ played, data }) => {
        const assigned = players.find((player) => player.participantId === played.scrimParticipantId);
        if (
            !assigned ||
            played.roflMetadataId !== source.metadata.id ||
            !played.riotAccountId ||
            played.position !== assigned.position ||
            (played.side === 'blue') !== (assigned.teamId === originalBlueTeam)
        )
            conflict('이전 결과의 확정 출전과 현재 라인업이 일치하지 않아요');
        return { played, data, assigned };
    });
    if (new Set(linked.map((row) => row.assigned.participantId)).size !== 10)
        conflict('이전 결과의 출전자 열 명을 확인해야 해요');
    return {
        metadataId: source.metadata.id,
        fingerprint: source.receipt.resultFingerprint,
        winnerSide: winnerSideFor(
            linked.map(({ data, assigned }) => ({
                teamId: assigned.teamId,
                replayTeamId: data.replayTeamId
            })),
            blueTeamId,
            result.winnerReplayTeamId
        ),
        players: linked.map(({ played, data, assigned }) => ({
            played: {
                scrimParticipantId: played.scrimParticipantId,
                riotAccountId: played.riotAccountId,
                displayName: played.displayName,
                riotGameName: played.riotGameName,
                riotTagLine: played.riotTagLine,
                side: assigned.teamId === blueTeamId ? 'blue' : 'red',
                position: played.position,
                championId: played.championId,
                roflMetadataId: source.metadata.id,
                roflParticipantIndex: played.roflParticipantIndex
            },
            data,
            userId: assigned.member.userId!,
            accountKey: played.riotAccountId!,
            newConnection: false
        }))
    };
}

async function prepareFreshImport(
    user: Actor,
    guildId: string,
    scrimId: string,
    matchId: string,
    input: MatchRoflInput,
    dependencies: MatchDependencies
) {
    let prepared: RoflImportData;
    let identity: RoflIdentity[];
    try {
        const { prepareRoflInWorker } = await import('../rofl/processing-worker.ts');
        ({ identity, prepared } = await prepareRoflInWorker(
            input.bytes,
            {
                guildId,
                scrimId,
                matchId,
                gameId: randomUUID(),
                gameNumber: input.nextGameNumber,
                uploadedByUserId: user.userId,
                uploadedAt: new Date()
            },
            dependencies.roflProcessing
        ));
    } catch (error) {
        if (error instanceof RoflError) throw new DomainError('INVALID_INPUT', error.message);
        throw error;
    }
    validateProjection(prepared);
    const resolved = await resolveReplayAccounts(prepared, dependencies);
    return { prepared, identity, resolved, fingerprint: resultFingerprint(prepared, resolved) };
}

type RoflRequest = [
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchRoflInput,
    dependencies?: MatchDependencies
];

export function previewMatchRofl(...request: RoflRequest): Promise<RoflPreview> {
    return processMatchRofl('preview', ...request);
}

export function importMatchRofl(...request: RoflRequest): Promise<MatchResult> {
    return processMatchRofl('submit', ...request);
}

function processMatchRofl(mode: 'preview', ...request: RoflRequest): Promise<RoflPreview>;
function processMatchRofl(mode: 'submit', ...request: RoflRequest): Promise<MatchResult>;
async function processMatchRofl(
    mode: 'preview' | 'submit',
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string,
    input: MatchRoflInput,
    dependencies: MatchDependencies = {}
): Promise<MatchResult | RoflPreview> {
    const user = requireUser(actor);
    requireRevision(input.expectedRevision);
    requireGameNumber(input.nextGameNumber);
    requireUuid(input.lineupId, '라인업');
    if (!['a', 'b'].includes(input.blueTeamSlot))
        throw new DomainError('INVALID_INPUT', '이번 게임의 블루 팀을 선택해 주세요');
    if (input.blueTeamConfirmed !== true)
        throw new DomainError('INVALID_INPUT', '블루·레드 팀이 실제 진영과 맞는지 확인해 주세요');
    if (!(input.bytes instanceof Uint8Array))
        throw new DomainError('INVALID_INPUT', 'ROFL 파일을 선택해 주세요');
    if (input.previewDigest !== undefined && !/^[a-f0-9]{64}$/.test(input.previewDigest))
        throw new DomainError('INVALID_INPUT', '등록값 미리보기를 다시 확인해 주세요');
    const access = { db, discord: dependencies.discord };
    const live = mode === 'preview' ? await readLiveGuildMembership(user, guildId, access) : null;
    const guild = live ? await live(db) : await requireGuildMember(user, guildId, access);
    const before = await findMatch(db, guildId, matchId);
    await requireUploader(db, user, guild.isAdmin, matchId, input);
    const fileSha256 = createHash('sha256').update(input.bytes).digest('hex');
    const existing = await existingImport(db, matchId, input, fileSha256);
    const replayResult = (result: MatchResult) => {
        if (mode === 'preview') conflict('이미 등록된 ROFL이에요. 현재 결과를 먼저 확인해 주세요');
        return result;
    };
    if (existing?.kind === 'replay') return replayResult(existing.result);
    const fresh = existing
        ? null
        : await prepareFreshImport(user, guildId, before.scrim.id, matchId, input, dependencies);
    try {
        return await db.transaction(
            async (tx) => {
                if (!live) await lockResultUsers(tx, user, guildId, before.match, fresh?.resolved ?? []);
                const accounts = fresh ? await readReplayAccounts(tx, guildId, fresh.resolved, !live) : [];
                const context = live
                    ? { ...(await findMatch(tx, guildId, matchId)), guild: await live(tx) }
                    : await lockMatch(tx, user, guildId, matchId, false, true);
                const lineup = await requireUploader(tx, user, context.guild.isAdmin, matchId, input);
                const replay = await existingImport(tx, matchId, input, fileSha256);
                if (replay?.kind === 'replay') return replayResult(replay.result);
                await requireCurrentSlot(tx, context, input);
                if (!context.scrim.mmrSeasonId) conflict('내전에 고정된 MMR 시즌이 없어요');
                if (!lineup.confirmedAt) conflict('먼저 경기 출전 라인업을 확정해 주세요');
                const players = await validateLineupRoster(tx, context.match, lineup.players, true);
                let candidate: ResultCandidate;
                if (replay?.kind === 'cancelled') {
                    candidate = await restoredCandidate(tx, context, input, replay.source, players);
                } else {
                    if (!fresh) conflict('복구할 결과와 확정 라인업을 다시 확인해 주세요');
                    const { prepared, identity, fingerprint } = fresh;
                    const [duplicate] = await tx
                        .select({ id: matchRoflImports.roflMetadataId })
                        .from(matchRoflImports)
                        .where(eq(matchRoflImports.resultFingerprint, fingerprint))
                        .limit(1);
                    if (duplicate) conflict('같은 게임의 결과가 이미 등록되어 있어요');
                    candidate = freshCandidate(
                        prepared,
                        identity,
                        accounts,
                        players,
                        context.match,
                        input.blueTeamSlot,
                        fingerprint
                    );
                }
                if (mode === 'preview' || input.previewDigest !== undefined) {
                    const preview = previewResult(context, input, fileSha256, candidate);
                    if (mode === 'preview') return preview;
                    if (preview.digest !== input.previewDigest)
                        conflict('등록값이 변경됐어요. 미리보기를 다시 확인해 주세요');
                }
                if (fresh && !replay) {
                    await persistReplayAccounts(tx, guildId, user, candidate.players, fresh.resolved);
                    const { rows } = fresh.prepared;
                    await tx.insert(roflMetadata).values(rows.metadata);
                    await tx.insert(roflParticipants).values(rows.participants);
                    await tx.insert(roflGameDataV1).values(rows.gameData);
                    await tx.insert(roflParticipantDataV1).values(rows.participantData);
                }
                return saveGameResult(tx, user, guildId, context, input, candidate);
            },
            live ? { accessMode: 'read only', isolationLevel: 'repeatable read' } : undefined
        );
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
        await lockUserLifecycleChanges(tx);
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
        if (context.scrim.status === 'completed')
            await assertRecoverableParticipants(tx, context.scrim, { matchId });
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
        await tx
            .delete(matchSetSides)
            .where(and(eq(matchSetSides.matchId, matchId), gt(matchSetSides.gameNumber, game.gameNumber)));
        await tx.update(games).set({ status: 'cancelled', winnerSide: null }).where(eq(games.id, game.id));
        await tx
            .update(matchRoflImports)
            .set({ cancelledAt: new Date() })
            .where(eq(matchRoflImports.gameId, game.id));
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
