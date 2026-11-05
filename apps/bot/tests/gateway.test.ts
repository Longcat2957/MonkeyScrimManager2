import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import type { BotGuildSyncInput } from '../../../shared/bot-api.js';
import { attachGuildSynchronization, GuildSynchronizer } from '../src/gateway/sync.ts';
import { GUILD, USER } from './fixtures.ts';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('역할·채널의 연속 변경은 합치고 알려진 멤버만 페이지별로 재확인한다', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls: BotGuildSyncInput[] = [];
    const cursors: (string | undefined)[] = [];
    const synchronizer = new GuildSynchronizer({
        sync: async (_guild, input) => {
            calls.push(input);
            return { ok: true };
        },
        knownMembers: async (_guild, after) => {
            cursors.push(after);
            return after
                ? { memberIds: ['970000000000000012'], nextCursor: null }
                : { memberIds: [USER], nextCursor: USER };
        },
        reconcile: async () => ({ ok: true })
    });
    t.after(() => synchronizer.stop());
    synchronizer.schedule(GUILD, { state: 'available' });
    synchronizer.schedule(GUILD, { state: 'available' });
    t.mock.timers.tick(500);
    await settle();
    assert.deepEqual(cursors, [undefined, USER]);
    assert.equal(calls.length, 1);
    t.mock.timers.tick(500);
    await settle();
    assert.deepEqual(
        calls.map((call) => call.memberId ?? 'guild'),
        ['guild', USER, '970000000000000012']
    );
});

test('실제 퇴장은 이전 available 값과 무관하게 removed로 동기화한다', () => {
    const client = new EventEmitter();
    const calls: BotGuildSyncInput[] = [];
    const synchronizer = {
        schedule: (_guild: string, input: BotGuildSyncInput) => calls.push(input)
    } as unknown as GuildSynchronizer;
    attachGuildSynchronization(client as unknown as Client, synchronizer);
    client.emit(Events.GuildUnavailable, { id: GUILD, available: false });
    client.emit(Events.GuildDelete, { id: GUILD, available: false });
    assert.deepEqual(calls, [{ state: 'unavailable' }, { state: 'removed' }]);
});

test('재연결 대조를 마친 뒤 현재 길드 동기화를 예약한다', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const calls: string[] = [];
    const synchronizer = new GuildSynchronizer({
        reconcile: async () => {
            calls.push('reconcile');
            return { ok: true };
        },
        sync: async () => {
            calls.push('sync');
            return { ok: true };
        },
        knownMembers: async () => ({ memberIds: [], nextCursor: null })
    });
    t.after(() => synchronizer.stop());
    await synchronizer.reconcile([GUILD]);
    assert.deepEqual(calls, ['reconcile']);
    t.mock.timers.tick(500);
    await settle();
    assert.deepEqual(calls, ['reconcile', 'sync']);
});
