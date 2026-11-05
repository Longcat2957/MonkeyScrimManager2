import type { TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../src/lib/server/db/schema.ts';
import { confirmManualFormation } from '../../../src/lib/server/scrims/manual.ts';
import {
    confirmBracket,
    placeBracketTeam,
    setBracketBestOf
} from '../../../src/lib/server/scrims/bracket.ts';
import { advanceScrim } from '../../../src/lib/server/scrims/workflow.ts';
import { createFormationFixture } from './domain-fixtures.ts';
import { confirmMatchLineup, releaseMatchLineup } from '../../../src/lib/server/matches/service.ts';
import {
    awardAuctionLot,
    drawAuctionLot,
    getAuction,
    saveAuctionSetup,
    startAuction
} from '../../../src/lib/server/scrims/auction.ts';
import { MMR_POSITIONS } from '../../../src/lib/server/mmr/rules.ts';

import { replayPlayer } from './rofl-fixtures.ts';
export { replayBytes, replayPlayer } from './rofl-fixtures.ts';

/** 편성·대진 확정·시작은 실제 서비스를 사용해 결과 저장 전 운영 문맥을 준비한다. */
export async function createMatchResultFixture(
    t: TestContext,
    options: {
        teams?: 2 | 4;
        bestOf?: 1 | 3 | 5;
        keepAutomaticLineup?: boolean;
        method?: 'manual' | 'auction';
    } = {}
) {
    const teamCount = options.teams ?? 2;
    const f = await createFormationFixture(t, teamCount, options.method ?? 'manual');
    if (options.method === 'auction') {
        await saveAuctionSetup(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            {
                ...(await f.revision()),
                teams: f.teams.map((_, index) => ({
                    captainId: f.participants[index * 5]!.id,
                    startPoints: 100
                }))
            },
            f.access
        );
        await startAuction(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
        for (let index = 0; index < teamCount * 4; index++) {
            await drawAuctionLot(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
            const view = (await getAuction(f.db, f.manager, f.guildId, f.scrimId, f.access))!;
            const playerIndex = f.participants.findIndex(
                (person) => person.id === view.openLot!.participantId
            );
            await awardAuctionLot(
                f.db,
                f.manager,
                f.guildId,
                f.scrimId,
                {
                    ...(await f.revision()),
                    lotId: view.openLotId!,
                    teamId: f.teams[Math.floor(playerIndex / 5)]!.id,
                    price: 0
                },
                f.access
            );
        }
    } else {
        await f.fill();
        await confirmManualFormation(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    }
    const seats = teamCount === 2 ? ['final-a', 'final-b'] : ['semi-1-a', 'semi-1-b', 'semi-2-a', 'semi-2-b'];
    for (const [index, team] of f.teams.entries()) {
        await placeBracketTeam(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            {
                ...(await f.revision()),
                seat: seats[index]!,
                teamId: team.id
            },
            f.access
        );
    }
    for (const stage of teamCount === 2 ? ['final'] : ['semi', 'final']) {
        await setBracketBestOf(
            f.db,
            f.manager,
            f.guildId,
            f.scrimId,
            {
                ...(await f.revision()),
                stage,
                bestOf: options.bestOf ?? 3
            },
            f.access
        );
    }
    await confirmBracket(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    await advanceScrim(
        f.db,
        f.manager,
        f.guildId,
        f.scrimId,
        { ...(await f.revision()), key: 'start' },
        f.access
    );
    const matches = await f.db.select().from(schema.matches).where(eq(schema.matches.scrimId, f.scrimId));
    const match = matches.find((row) => row.teamAId === f.teams[0]!.id)!;
    // 라인업 편집 회귀는 결과 전 허용된 확정 해제에서 시작한다. 자동 확정 자체도 별도로 검증한다.
    if (!options.keepAutomaticLineup)
        for (const row of matches) {
            const [lineup] = await f.db
                .select()
                .from(schema.matchLineups)
                .where(eq(schema.matchLineups.matchId, row.id));
            if (lineup?.confirmedAt)
                await releaseMatchLineup(
                    f.db,
                    f.manager,
                    f.guildId,
                    row.id,
                    { expectedRevision: row.revision, lineupId: lineup.id },
                    f.access
                );
        }
    const players = (winning = true, offset = 0) =>
        f.accounts
            .slice(offset, offset + 10)
            .map((account, index) => replayPlayer(account.gameName!, account.tagLine!, index, winning));
    const matchRow = async (id = match.id) =>
        (await f.db.select().from(schema.matches).where(eq(schema.matches.id, id)))[0]!;
    const dependencies = {
        ...f.access,
        riot: {
            getAccountByRiotId: async ({ gameName, tagLine }: { gameName: string; tagLine: string }) => {
                const account = f.accounts.find(
                    (row) => row.gameName === gameName && row.tagLine === tagLine
                );
                if (!account) throw new Error('알려지지 않은 fixture 계정 조회');
                return { puuid: account.puuid, gameName, tagLine };
            }
        }
    };
    const lineupInput = async (matchId = match.id) => {
        const row = await matchRow(matchId);
        const people = await f.db
            .select()
            .from(schema.scrimParticipants)
            .where(eq(schema.scrimParticipants.scrimId, f.scrimId));
        return {
            expectedRevision: row.revision,
            players: people
                .filter(
                    (person) => person.teamId !== null && [row.teamAId, row.teamBId].includes(person.teamId)
                )
                .map((person) => ({
                    participantId: person.id,
                    position:
                        person.position ??
                        MMR_POSITIONS[f.participants.findIndex((row) => row.id === person.id) % 5]!
                }))
        };
    };
    const slot = async (nextGameNumber = 1, matchId = match.id) => {
        const [lineup] = await f.db
            .select()
            .from(schema.matchLineups)
            .where(eq(schema.matchLineups.matchId, matchId));
        return {
            expectedRevision: (await matchRow(matchId)).revision,
            nextGameNumber,
            lineupId: lineup!.id,
            blueTeamSlot: 'a' as const
        };
    };
    const confirm = async (matchId = match.id) => {
        await confirmMatchLineup(
            f.db,
            f.manager,
            f.guildId,
            matchId,
            await lineupInput(matchId),
            dependencies
        );
        return slot(1, matchId);
    };
    return { ...f, matches, match, matchRow, players, dependencies, lineupInput, confirm, slot };
}
