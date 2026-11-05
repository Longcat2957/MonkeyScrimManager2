import { asc, eq, inArray } from 'drizzle-orm';
import type { MatchOperationContext } from '../../features/matches/types.ts';
import type { Actor } from '../auth/types.ts';
import type { Database } from '../db/types.ts';
import { games, riotAccounts, scrimTeams } from '../db/schema.ts';
import { assertGuildView } from '../guild/access.ts';
import { completedGames, findMatch, readLineup, readRoster } from './state.ts';
import { resultReversalBlock } from './reversal.ts';

export async function getMatchOperationContext(
    db: Database,
    actor: Actor | null,
    guildId: string,
    matchId: string
): Promise<MatchOperationContext> {
    // 공개 화면은 외부 Discord·Riot 호출 없이 같은 DB 스냅샷을 읽는다.
    return db.transaction(
        async (tx) => {
            const guild = await assertGuildView(tx, actor, guildId);
            const { match, scrim } = await findMatch(tx, guildId, matchId);
            const completed = await completedGames(tx, matchId);
            const nextGameNumber = completed.length + 1;
            const lineup = await readLineup(tx, matchId);
            const roster = await readRoster(tx, match);
            const teams = await tx
                .select()
                .from(scrimTeams)
                .where(inArray(scrimTeams.id, [match.teamAId, match.teamBId]))
                .orderBy(asc(scrimTeams.ordinal));
            const accountIds = roster.flatMap(({ participant }) =>
                participant.riotAccountId ? [participant.riotAccountId] : []
            );
            const accounts = accountIds.length
                ? await tx.select().from(riotAccounts).where(inArray(riotAccounts.id, accountIds))
                : [];
            const operating =
                scrim.status === 'in_progress' &&
                match.status === 'in_progress' &&
                nextGameNumber <= match.bestOf;
            const [artifact] = await tx
                .select({ id: games.id })
                .from(games)
                .where(eq(games.matchId, matchId))
                .limit(1);
            const participant = Boolean(
                actor &&
                lineup?.players.some(
                    (player) =>
                        roster.find((row) => row.participant.id === player.participantId)?.participant
                            .userId === actor.userId
                )
            );
            const latest = completed.at(-1);
            const blockedReason =
                guild.isAdmin && latest ? await resultReversalBlock(tx, scrim, match, latest) : null;
            return {
                revision: match.revision,
                nextGameNumber,
                lineup: lineup
                    ? {
                          id: lineup.id,
                          status: lineup.confirmedAt ? 'confirmed' : 'draft',
                          players: lineup.players.map((player) => ({
                              participantId: player.participantId,
                              position: player.position
                          }))
                      }
                    : null,
                teams: [match.teamAId, match.teamBId].map((teamId, index) => ({
                    id: teamId,
                    slot: index === 0 ? ('a' as const) : ('b' as const),
                    name: teams.find((team) => team.id === teamId)?.name ?? '팀',
                    players: roster
                        .filter(({ participant }) => participant.teamId === teamId)
                        .map(({ participant }) => {
                            const account = accounts.find((row) => row.id === participant.riotAccountId);
                            return {
                                participantId: participant.id,
                                userId: participant.userId,
                                displayName: participant.displayName,
                                riotId:
                                    account?.gameName && account.tagLine
                                        ? `${account.gameName}#${account.tagLine}`
                                        : null,
                                position: participant.position
                            };
                        })
                })),
                can: {
                    editLineup: operating && guild.isAdmin && !artifact && !lineup?.confirmedAt,
                    confirmLineup: operating && guild.isAdmin && !artifact && !lineup?.confirmedAt,
                    releaseLineup: operating && guild.isAdmin && !artifact && Boolean(lineup?.confirmedAt),
                    upload: operating && Boolean(lineup?.confirmedAt) && (guild.isAdmin || participant),
                    revertResult: guild.isAdmin && Boolean(latest) && !blockedReason
                },
                latestGameId: latest?.id ?? null,
                ...(blockedReason ? { blockedReason } : {})
            };
        },
        { isolationLevel: 'repeatable read', accessMode: 'read only' }
    );
}
