import type { TestContext } from 'node:test';
import { mockLatency } from '../../src/lib/mocks/latency.ts';
import { createMockScrim, findMockScrimRecord } from '../../src/lib/mocks/scrims.ts';

export const guildId = 'devGuild001';

let previewTime = Date.now();

export function skipPreviewDelay(t: TestContext) {
    // 미리보기의 시각 기반 ID와 신청 순서를 보존하되 실제 시간은 기다리지 않는다.
    t.mock.timers.enable({ apis: ['Date'], now: previewTime });
    t.mock.method(mockLatency, 'wait', async (ms: number) => t.mock.timers.setTime((previewTime += ms)));
}

export async function mockScrim({
    teamCount = 2,
    selected = teamCount * 5,
    reserveCapacity = 0
}: { teamCount?: 2 | 4; selected?: number; reserveCapacity?: number } = {}) {
    const id = await createMockScrim(guildId, {
        title: '편성 테스트',
        scheduledAt: null,
        teamCount,
        reserveCapacity,
        hardFearless: false
    });
    const scrim = findMockScrimRecord(guildId, id)!;
    scrim.participants = findMockScrimRecord(guildId, 'devScrim008')!
        .participants.slice(0, selected)
        .map((player, index) => ({
            ...player,
            registrationId: `${id}-r${index}`,
            userId: `${id}-u${index}`,
            riotAccountId: `${id}-a${index}`,
            status: 'selected' as const
        }));
    return scrim;
}
