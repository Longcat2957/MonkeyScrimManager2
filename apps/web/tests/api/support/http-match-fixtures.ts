import type { TestContext } from 'node:test';
import { eq } from 'drizzle-orm';
import * as schema from '../../../src/lib/server/db/schema.ts';
import { MMR_POSITIONS } from '../../../src/lib/server/mmr/rules.ts';
import { assertAction, createHttpFixture, HTTP_IDS, type UpstreamRule } from './http.ts';
import { replayBytes, replayPlayer } from './match-fixtures.ts';

export async function createHttpMatchResultFixture(t: TestContext, overrides: UpstreamRule[] = []) {
    const userIds = [
        HTTP_IDS.member,
        ...Array.from({ length: 9 }, (_, index) => String(970000000000001000n + BigInt(index)))
    ];
    const identities = userIds.map((userId, index) => ({
        userId,
        puuid: 'fixture-http-replay-' + index,
        gameName: 'ReplayPlayer' + index,
        tagLine: 'KR1'
    }));
    const upstreams: UpstreamRule[] = identities.flatMap((person) => [
        {
            method: 'GET',
            url: `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${person.gameName}/${person.tagLine}`,
            body: { puuid: person.puuid, gameName: person.gameName, tagLine: person.tagLine }
        },
        {
            method: 'GET',
            url: `https://asia.api.riotgames.com/riot/account/v1/accounts/by-puuid/${person.puuid}`,
            body: { puuid: person.puuid, gameName: person.gameName, tagLine: person.tagLine }
        },
        {
            method: 'GET',
            url: `https://discord.com/api/v10/guilds/${HTTP_IDS.guild}/members/${person.userId}`,
            body: {
                user: { id: person.userId, username: person.gameName, global_name: null, avatar: null },
                roles: []
            }
        }
    ]);
    const f = await createHttpFixture(t, [...overrides, ...upstreams]);
    await f.db
        .insert(schema.users)
        .values(identities.slice(1).map((person) => ({ id: person.userId, username: person.gameName })));
    await f.db
        .insert(schema.guildMembers)
        .values(
            identities
                .slice(1)
                .map((person) => ({ guildId: HTTP_IDS.guild, userId: person.userId, syncedAt: new Date() }))
        );
    const accounts = await f.db
        .insert(schema.riotAccounts)
        .values(identities.map(({ puuid, gameName, tagLine }) => ({ puuid, gameName, tagLine })))
        .returning();
    await f.db.insert(schema.guildRiotAccounts).values(
        accounts.map((account, index) => ({
            guildId: HTTP_IDS.guild,
            userId: identities[index]!.userId,
            riotAccountId: account.id,
            isPrimary: true
        }))
    );
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: 'HTTP 결과 내전',
            status: 'preparing',
            formationMethod: 'manual',
            mmrSeasonId: f.season.id,
            isHardFearless: true
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, name: ordinal + '팀', ordinal })))
        .returning();
    const people = await f.db
        .insert(schema.scrimParticipants)
        .values(
            identities.map((person, index) => ({
                scrimId: scrim!.id,
                userId: person.userId,
                riotAccountId: accounts[index]!.id,
                displayName: person.gameName,
                teamId: teams[Math.floor(index / 5)]!.id,
                position: MMR_POSITIONS[index % 5]
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(people.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const })));
    const manager = await f.session(HTTP_IDS.manager);
    const participant = await f.session(HTTP_IDS.member);
    const scrimPath = '/g/' + HTTP_IDS.guild + '/scrims/' + scrim!.id;
    const scrimRevision = async () =>
        String((await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!.revision);
    assertAction(
        await f.action(
            scrimPath + '/manual',
            'confirm',
            { expectedRevision: await scrimRevision() },
            manager.cookie
        ),
        204
    );
    for (const [index, team] of teams.entries())
        assertAction(
            await f.action(
                scrimPath + '/bracket',
                'place',
                {
                    seat: index === 0 ? 'final-a' : 'final-b',
                    teamId: team.id,
                    expectedRevision: await scrimRevision()
                },
                manager.cookie
            ),
            204
        );
    assertAction(
        await f.action(
            scrimPath + '/bracket',
            'confirm',
            { expectedRevision: await scrimRevision() },
            manager.cookie
        ),
        204
    );
    assertAction(
        await f.action(
            scrimPath,
            'advance',
            { key: 'start', expectedRevision: await scrimRevision() },
            manager.cookie
        ),
        200
    );
    const [match] = await f.db.select().from(schema.matches).where(eq(schema.matches.scrimId, scrim!.id));
    const path = '/g/' + HTTP_IDS.guild + '/matches/' + match!.id;
    const matchRow = async () =>
        (await f.db.select().from(schema.matches).where(eq(schema.matches.id, match!.id)))[0]!;
    const lineupFields = async () => ({
        expectedRevision: String((await matchRow()).revision),
        players: JSON.stringify(
            people.map((person) => ({ participantId: person.id, position: person.position }))
        )
    });
    const confirm = async (gameNumber = 1) => {
        const [before] = await f.db
            .select()
            .from(schema.matchLineups)
            .where(eq(schema.matchLineups.matchId, match!.id));
        if (!before?.confirmedAt)
            assertAction(await f.action(path, 'confirmLineup', await lineupFields(), manager.cookie), 200);
        const [lineup] = await f.db
            .select()
            .from(schema.matchLineups)
            .where(eq(schema.matchLineups.matchId, match!.id));
        return {
            expectedRevision: String((await matchRow()).revision),
            expectedGameNumber: String(gameNumber),
            lineupId: lineup!.id,
            blueTeamSlot: 'a'
        };
    };
    const file = (gameLengthMs = 1_800_125, bodyByte = 0x42, bodyBytes = 32) =>
        new File(
            [
                Uint8Array.from(
                    replayBytes(
                        identities.map((person, index) =>
                            replayPlayer(person.gameName, person.tagLine, index)
                        ),
                        { gameLengthMs, bodyByte, bodyBytes }
                    )
                )
            ],
            'fixture.rofl',
            { type: 'application/octet-stream' }
        );
    return {
        ...f,
        identities,
        accounts,
        people,
        scrim: scrim!,
        match: match!,
        path,
        manager,
        participant,
        matchRow,
        lineupFields,
        confirm,
        file
    };
}
