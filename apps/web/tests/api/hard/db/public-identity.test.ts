import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';
import type { GameResolvers } from '../../../../src/lib/features/matches/types.ts';
import { setMyPrivacy, withdrawAccount } from '../../../../src/lib/server/accounts/privacy.ts';
import { readPublicIdentities } from '../../../../src/lib/server/accounts/public-identity.ts';
import * as schema from '../../../../src/lib/server/db/schema.ts';
import {
    publicationData,
    matchPublicationData
} from '../../../../src/lib/server/discord/publication-data.ts';
import { queryRankingPage } from '../../../../src/lib/server/guild/ranking-queries.ts';
import { getMatchOperationContext } from '../../../../src/lib/server/matches/operation-context.ts';
import { getMatch } from '../../../../src/lib/server/matches/queries.ts';
import { importMatchRofl } from '../../../../src/lib/server/matches/service.ts';
import { getGuildRecords, getPlayerRecords } from '../../../../src/lib/server/records/queries.ts';
import {
    awardAuctionLot,
    drawAuctionLot,
    getAuction,
    saveAuctionSetup,
    startAuction
} from '../../../../src/lib/server/scrims/auction.ts';
import { getBracket } from '../../../../src/lib/server/scrims/bracket.ts';
import { getManualFormation } from '../../../../src/lib/server/scrims/manual.ts';
import { getScrimDetail, listScrims } from '../../../../src/lib/server/scrims/queries.ts';
import { endScrimEarly } from '../../../../src/lib/server/scrims/workflow.ts';
import { champion, createGameFixture, errorCode } from '../../support/domain-fixtures.ts';
import { createMatchResultFixture, replayBytes } from '../../support/match-fixtures.ts';

const resolvers: GameResolvers = {
    champion,
    item: () => null,
    spell: () => null,
    rune: () => null,
    splash: () => null
};
function hidden(value: unknown, values: string[]) {
    const serialized = JSON.stringify(value);
    for (const raw of values)
        assert.equal(serialized.includes(raw), false, `공개 자료에 개인정보가 남았습니다: ${raw}`);
}

test('공개 기본 ID를 보존하고 두 공개 설정을 독립 적용하며 순위의 안정 키·MMR은 바꾸지 않는다', async (t) => {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1);
    await f.apply(game.id);
    await f.db
        .update(schema.users)
        .set({ avatarHash: 'a'.repeat(32) })
        .where(eq(schema.users.id, f.manager.userId));
    const before = await getPlayerRecords(f.db, null, f.guildId, f.manager.userId, champion);
    const ranking = () =>
        queryRankingPage(f.db, null, f.guildId, 'top', { offset: 0, limit: 10, userId: f.manager.userId });
    const initialRank = (await ranking())!.page.entries[0]!;
    const ratings = await f.ratings();
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, f.manager.userId));
    assert.equal(before.player.userId, f.manager.userId);
    assert.ok(before.player.iconUrl?.includes(f.manager.userId));
    assert.equal(initialRank.identityKey, user!.publicId);
    await setMyPrivacy(f.db, f.manager, { publicProfile: false, publicRiotIds: true });
    const privateProfile = await getPlayerRecords(f.db, null, f.guildId, user!.publicId, champion);
    assert.equal(privateProfile.player.userId, user!.publicId);
    assert.equal(privateProfile.player.displayName, '비공개 사용자');
    assert.equal(privateProfile.player.iconUrl, null);
    assert.deepEqual(privateProfile.player.riotIds, before.player.riotIds);
    const privateRank = (await ranking())!.page.entries[0]!;
    assert.equal(privateRank.userId, user!.publicId);
    assert.equal(privateRank.identityKey, initialRank.identityKey);
    assert.equal(privateRank.isMe, true);
    assert.equal(privateRank.rank, initialRank.rank);
    assert.equal(privateRank.mmr, initialRank.mmr);
    await setMyPrivacy(f.db, f.manager, { publicProfile: true, publicRiotIds: false });
    const hiddenRiot = await getPlayerRecords(f.db, null, f.guildId, user!.publicId, champion);
    assert.equal(hiddenRiot.player.userId, f.manager.userId);
    assert.deepEqual(hiddenRiot.player.riotIds, []);
    assert.equal((await ranking())!.page.entries[0]!.identityKey, initialRank.identityKey);
    assert.deepEqual(await f.ratings(), ratings);
});

test('공개 참가자·편성·대진·경기 운영 DTO와 Discord 게시에서 과거 스냅샷을 명시적으로 가린다', async (t) => {
    const f = await createMatchResultFixture(t, { keepAutomaticLineup: true });
    const result = await importMatchRofl(
        f.db,
        f.manager,
        f.guildId,
        f.match.id,
        { ...(await f.slot()), bytes: replayBytes(f.players()) },
        f.dependencies
    );
    const target = f.users[2]!;
    const beforePairs = (await getManualFormation(f.db, null, f.guildId, f.scrimId))!.pairs;
    const beforeScores = await f.db.select().from(schema.userPositionMmr);
    const beforeGame = await f.db.select().from(schema.games);
    const [user] = await f.db.select().from(schema.users).where(eq(schema.users.id, target.id));
    await setMyPrivacy(f.db, f.actors[2]!, { publicProfile: false, publicRiotIds: false });
    const detail = await getScrimDetail(f.db, null, f.guildId, f.scrimId);
    const list = await listScrims(f.db, null, f.guildId, { status: 'all', page: 1, pageSize: 20 });
    const manual = await getManualFormation(f.db, null, f.guildId, f.scrimId);
    const bracket = await getBracket(f.db, null, f.guildId, f.scrimId);
    const game = await getMatch(f.db, null, f.guildId, f.match.id, result.gameId, resolvers);
    const operation = await getMatchOperationContext(f.db, null, f.guildId, f.match.id);
    const records = await getGuildRecords(f.db, null, f.guildId, champion);
    const profile = await getPlayerRecords(f.db, null, f.guildId, user!.publicId, champion);
    const teammate = await getPlayerRecords(f.db, null, f.guildId, f.manager.userId, champion);
    const notices = await f.db.transaction(async (tx) => {
        const jobs = await tx
            .select()
            .from(schema.discordPublicationJobs)
            .where(eq(schema.discordPublicationJobs.scrimId, f.scrimId));
        return {
            recruitment: await publicationData(tx, f.scrimId),
            matches: await Promise.all(
                jobs
                    .filter((job) => job.kind === 'lineup' || job.kind === 'result')
                    .map((job) => matchPublicationData(tx, job))
            )
        };
    });
    const views = { detail, list, manual, bracket, game, operation, records, profile, teammate, notices };
    hidden(views, [target.id, target.username, f.accounts[2]!.gameName!]);
    assert.equal(
        detail!.participants.find((person) => person.userId === user!.publicId)!.displayName,
        '비공개 사용자'
    );
    assert.equal(
        game!.game!.sides.flatMap((side) => side.players).find((person) => person.userId === user!.publicId)!
            .riotId,
        null
    );
    assert.equal(
        operation.teams.flatMap((team) => team.players).find((person) => person.userId === user!.publicId)!
            .displayName,
        '비공개 사용자'
    );
    assert.ok(teammate.games[0]!.teammates.some((person) => person.userId === user!.publicId));
    assert.deepEqual(manual!.pairs, beforePairs);
    assert.equal(profile.games.length, 1);
    assert.equal(records.players.length, 10);
    assert.deepEqual(await f.db.select().from(schema.userPositionMmr), beforeScores);
    assert.deepEqual(await f.db.select().from(schema.games), beforeGame);
    assert.equal(
        (
            await f.db
                .select()
                .from(schema.scrimParticipants)
                .where(eq(schema.scrimParticipants.id, f.participants[2]!.id))
        )[0]!.userId,
        target.id
    );
});

test('비공개 경매 후보도 내부 사용자로 과거 전적을 읽고 낙찰 이력만 공개 표현으로 반환한다', async (t) => {
    const f = await createGameFixture(t);
    await f.createGame(f.db, 1);
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: f.guildId,
            mmrSeasonId: f.season.id,
            title: '공개 경매',
            formationMethod: 'auction',
            status: 'preparing'
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values([1, 2].map((ordinal) => ({ scrimId: scrim!.id, ordinal, name: ordinal + '팀' })))
        .returning();
    const participants = await f.db
        .insert(schema.scrimParticipants)
        .values(
            f.users.slice(0, 10).map((user, index) => ({
                scrimId: scrim!.id,
                userId: user.id,
                displayName: user.username,
                riotAccountId: f.accounts[index]!.id
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(
            participants.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const }))
        );
    const revision = async () => ({
        expectedRevision: (await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!
            .revision
    });
    await saveAuctionSetup(
        f.db,
        f.manager,
        f.guildId,
        scrim!.id,
        {
            ...(await revision()),
            teams: teams.map((_, index) => ({ captainId: participants[index * 5]!.id, startPoints: 100 }))
        },
        f.access
    );
    await startAuction(f.db, f.manager, f.guildId, scrim!.id, await revision(), f.access);
    await drawAuctionLot(f.db, f.manager, f.guildId, scrim!.id, await revision(), f.access);
    const read = () => getAuction(f.db, null, f.guildId, scrim!.id, undefined, champion);
    const before = (await read())!;
    const targetId = before.openLot!.userId!;
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, targetId));
    await setMyPrivacy(
        f.db,
        { userId: targetId, isServiceAdmin: false },
        { publicProfile: false, publicRiotIds: false }
    );
    const after = (await read())!;
    assert.equal(after.openLot!.userId, target!.publicId);
    assert.equal(after.openLot!.displayName, '비공개 사용자');
    assert.deepEqual(after.openProfile, before.openProfile);
    assert.equal(after.openProfile!.summary.games, 1);
    await awardAuctionLot(
        f.db,
        f.manager,
        f.guildId,
        scrim!.id,
        { ...(await revision()), lotId: after.openLotId!, teamId: teams[0]!.id, price: 1 },
        f.access
    );
    const recorded = (await read())!;
    hidden(recorded, [targetId, target!.username]);
    assert.equal(recorded.history.at(-1)!.displayName, '비공개 사용자');
});

test('비공개 Discord 경로는 익명404·본인허용·실효 관리자만 허용하며 UUID와 서버 경계를 구분한다', async (t) => {
    const f = await createGameFixture(t);
    const targetId = f.users[2]!.id;
    await setMyPrivacy(f.db, f.actors[2]!, { publicProfile: false, publicRiotIds: false });
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, targetId));
    await assert.rejects(getPlayerRecords(f.db, null, f.guildId, targetId, champion), errorCode('NOT_FOUND'));
    assert.equal(
        (await getPlayerRecords(f.db, f.actors[2]!, f.guildId, targetId, champion)).player.userId,
        target!.publicId
    );
    assert.equal(
        (await getPlayerRecords(f.db, f.manager, f.guildId, targetId, champion, undefined, f.access)).player
            .userId,
        target!.publicId
    );
    // UI의 오래된 관리자 표시와 서비스 운영자 boolean은 비공개 경로 허용 근거가 아니다.
    await f.db
        .update(schema.guildMembers)
        .set({ isAdmin: true, manageGuild: true })
        .where(
            and(eq(schema.guildMembers.guildId, f.guildId), eq(schema.guildMembers.userId, f.viewer.userId))
        );
    await assert.rejects(
        getPlayerRecords(f.db, f.viewer, f.guildId, targetId, champion, undefined, f.access),
        errorCode('NOT_FOUND')
    );
    assert.equal(
        (await getPlayerRecords(f.db, null, f.guildId, target!.publicId, champion)).player.userId,
        target!.publicId
    );
    await assert.rejects(
        getPlayerRecords(f.db, null, f.otherGuildId, target!.publicId, champion),
        errorCode('NOT_FOUND')
    );
});

test('탈퇴 뒤 소속·연결이 없어도 UUID로 과거 전적·MMR을 읽고 당시 원자료는 변경하지 않는다', async (t) => {
    const f = await createGameFixture(t);
    const game = await f.createGame(f.db, 1);
    await f.apply(game.id);
    await endScrimEarly(f.db, f.manager, f.guildId, f.scrimId, await f.revision(), f.access);
    const targetId = f.users[5]!.id;
    const [target] = await f.db.select().from(schema.users).where(eq(schema.users.id, targetId));
    const ratings = await f.ratings();
    const games = await f.db.select().from(schema.games);
    const participants = await f.db.select().from(schema.gameParticipants);
    await withdrawAccount(f.db, f.actors[5]!, { confirm: true });
    const profile = await getPlayerRecords(f.db, null, f.guildId, target!.publicId, champion);
    assert.equal(profile.player.displayName, '탈퇴한 사용자');
    assert.deepEqual(profile.player.riotIds, []);
    assert.equal(profile.games.length, 1);
    assert.equal(
        profile.mmr.find((entry) => entry.position === 'top')!.rating,
        ratings.find((row) => row.userId === targetId)!.mmr
    );
    hidden(profile, [targetId, target!.username, '당시 이름 5', '기록5']);
    await assert.rejects(getPlayerRecords(f.db, null, f.guildId, targetId, champion), errorCode('NOT_FOUND'));
    assert.deepEqual(await f.ratings(), ratings);
    assert.deepEqual(await f.db.select().from(schema.games), games);
    assert.deepEqual(await f.db.select().from(schema.gameParticipants), participants);
    const onlyMmr = f.users[11]!;
    await f.db
        .insert(schema.userPositionMmr)
        .values({ userId: onlyMmr.id, seasonId: f.season.id, position: 'top', mmr: 1501 });
    const [other] = await f.db.select().from(schema.users).where(eq(schema.users.id, onlyMmr.id));
    await withdrawAccount(f.db, f.actors[11]!, { confirm: true });
    const historical = await getPlayerRecords(f.db, null, f.guildId, other!.publicId, champion);
    assert.equal(historical.games.length, 0);
    assert.equal(historical.mmr[0]!.rating, 1501);
    const identities = await f.db.transaction((tx) => readPublicIdentities(tx, [targetId, onlyMmr.id]));
    assert.equal(identities.get(targetId)!.showRiotIds, false);
});
