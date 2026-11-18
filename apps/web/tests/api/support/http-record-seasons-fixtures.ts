import type { TestContext } from 'node:test';
import type { BotSeasonSnapshot } from '../../../../../shared/bot-api.js';
import * as schema from '../../../src/lib/server/db/schema.ts';
import { assertAction, HTTP_BOT_TOKEN, HTTP_IDS, type UpstreamRule } from './http.ts';
import { createHttpMatchResultFixture } from './http-match-fixtures.ts';
import { replayBytes, replayPlayer } from './rofl-fixtures.ts';

/** 실제 정상 ROFL 결과와 시즌 전환 action으로 공개 전적의 두 시즌을 준비한다. */
export async function createHttpRecordSeasonsFixture(
    t: TestContext,
    options: { games?: 1 | 3; upstreams?: UpstreamRule[] } = {}
) {
    const f = await createHttpMatchResultFixture(t, options.upstreams);
    assertAction(
        await f.action(f.path, 'upload', { ...(await f.confirm()), file: f.file() }, f.participant.cookie),
        200
    );
    if (options.games === 3) {
        // 듀오의 기존 3게임 기준도 실제 2:1 시리즈 결과로 충족한다.
        const second = new File(
            [
                Uint8Array.from(
                    replayBytes(
                        f.identities.map((person, index) =>
                            replayPlayer(person.gameName, person.tagLine, index, false)
                        ),
                        { gameLengthMs: 1_900_125 }
                    )
                )
            ],
            'fixture-season-2.rofl',
            { type: 'application/octet-stream' }
        );
        assertAction(
            await f.action(f.path, 'upload', { ...(await f.confirm(2)), file: second }, f.participant.cookie),
            200
        );
        assertAction(
            await f.action(
                f.path,
                'upload',
                { ...(await f.confirm(3)), file: f.file(2_000_125) },
                f.participant.cookie
            ),
            200
        );
    }
    const response = await f.request('/internal/bot/guilds/' + HTTP_IDS.guild + '/seasons', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + HTTP_BOT_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({
            actorId: HTTP_IDS.manager,
            interactionId: '997000000000000001',
            expectedCurrentSeasonId: f.season.id,
            name: '현재 조회 시즌 · ' + '긴 시즌 이름 확인 '.repeat(5).trim(),
            confirm: true
        })
    });
    if (response.status !== 200) throw new Error('격리 시즌 전환 fixture를 준비하지 못했습니다.');
    const seasons = (await response.json()) as BotSeasonSnapshot;
    const [currentRecruit] = await f.db
        .insert(schema.scrims)
        .values({
            guildId: HTTP_IDS.guild,
            title: '현재 모집 유지',
            status: 'recruit',
            mmrSeasonId: seasons.current!.id
        })
        .returning();
    const home = '/g/' + HTTP_IDS.guild;
    return {
        ...f,
        previousSeason: f.season,
        currentSeason: seasons.current!,
        currentRecruit: currentRecruit!,
        paths: {
            home,
            player: home + '/players/' + HTTP_IDS.member,
            stats: home + '/stats',
            ranking: home + '/ranking'
        }
    };
}
