import { eq } from 'drizzle-orm';
import { TEAM_SIZE } from '../../../src/lib/features/scrims/formation.ts';
import * as schema from '../../../src/lib/server/db/schema.ts';
import { createHttpFixture, HTTP_IDS } from './http.ts';

/** 기존 격리 앱에 경매만 준비한다. 진행은 실제 운영 action으로 실행한다. */
export async function prepareHttpAuctionFixture(
    f: Awaited<ReturnType<typeof createHttpFixture>>,
    teamCount: 2 | 4 = 2
) {
    const [scrim] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: 'HTTP 경매 취소',
            status: 'preparing',
            formationMethod: 'auction',
            teamCount,
            mmrSeasonId: f.season.id
        })
        .returning();
    const teams = await f.db
        .insert(schema.scrimTeams)
        .values(
            Array.from({ length: teamCount }, (_, index) => ({
                scrimId: scrim!.id,
                ordinal: index + 1,
                name: `${index + 1}팀`
            }))
        )
        .returning();
    const people = await f.db
        .insert(schema.scrimParticipants)
        .values(
            Array.from({ length: teamCount * TEAM_SIZE }, (_, index) => ({
                scrimId: scrim!.id,
                displayName: 'HTTP 후보 ' + index
            }))
        )
        .returning();
    await f.db
        .insert(schema.scrimParticipantRegistrations)
        .values(people.map((person) => ({ scrimParticipantId: person.id, status: 'selected' as const })));
    const path = '/g/' + HTTP_IDS.guild + '/scrims/' + scrim!.id + '/auction';
    const manager = await f.session(HTTP_IDS.manager);
    const member = await f.session(HTTP_IDS.member);
    const revision = async () =>
        String((await f.db.select().from(schema.scrims).where(eq(schema.scrims.id, scrim!.id)))[0]!.revision);
    const action = async (name: string, fields: Record<string, string> = {}) =>
        f.action(path, name, { expectedRevision: await revision(), ...fields }, manager.cookie);
    const setup = () =>
        action('setup', {
            teams: JSON.stringify(
                people.slice(0, teamCount).map((person) => ({ captainId: person.id, startPoints: 100 }))
            )
        });
    return { scrim: scrim!, people, teams, path, manager, member, revision, action, setup };
}
