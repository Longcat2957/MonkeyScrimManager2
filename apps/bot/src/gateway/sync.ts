import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import type { BotGuildSyncInput } from '../../../../shared/bot-api.js';
import type { BotApi } from '../api/client.js';
import { errorCode } from '../api/client.js';

/** 같은 길드·멤버의 연속 이벤트는 합치고 실행 중에는 다음 변경을 한 번 더 확인한다. */
export class GuildSynchronizer {
    private readonly pending = new Map<
        string,
        { guildId: string; input: BotGuildSyncInput; attempts: number }
    >();
    private readonly running = new Set<Promise<void>>();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;
    private reconciliation: Promise<void> | null = null;
    constructor(private readonly api: Pick<BotApi, 'sync' | 'knownMembers' | 'reconcile'>) {}

    reconcile(guildIds: readonly string[]): Promise<void> {
        if (this.stopped) return Promise.resolve();
        if (this.reconciliation) return this.reconciliation;
        return (this.reconciliation = (async () => {
            try {
                await this.api.reconcile();
                for (const guildId of guildIds) this.schedule(guildId, { state: 'available' });
            } catch (error) {
                console.error('Discord 재연결 상태 확인 실패:', errorCode(error));
            } finally {
                this.reconciliation = null;
            }
        })());
    }

    private async queueKnownMembers(guildId: string) {
        let after: string | undefined;
        const seen = new Set<string>();
        while (!this.stopped) {
            const page = await this.api.knownMembers(guildId, after);
            for (const memberId of page.memberIds) this.schedule(guildId, { state: 'available', memberId });
            if (!page.nextCursor) return;
            if (seen.has(page.nextCursor)) throw new Error('멤버 동기화 페이지가 반복됩니다.');
            seen.add(page.nextCursor);
            after = page.nextCursor;
        }
    }

    schedule(guildId: string, input: BotGuildSyncInput) {
        if (this.stopped) return;
        const key = guildId + ':' + (input.memberId ?? 'guild');
        this.pending.set(key, { guildId, input, attempts: 0 });
        this.arm(500);
    }

    private arm(delay: number) {
        if (this.timer || this.stopped) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, delay);
    }

    private async flush() {
        if (this.running.size || this.stopped) {
            this.arm(1000);
            return;
        }
        const work = (async () => {
            // 짧은 동기화 묶음으로 제한해 권한 확인 REST 요청이 한꺼번에 몰리지 않게 한다.
            for (const [key, entry] of [...this.pending].slice(0, 10)) {
                if (this.stopped) break;
                this.pending.delete(key);
                try {
                    await this.api.sync(entry.guildId, entry.input);
                    if (!entry.input.memberId && entry.input.state === 'available')
                        await this.queueKnownMembers(entry.guildId);
                } catch (error) {
                    console.error('Discord 상태 동기화 실패:', errorCode(error));
                    if (entry.attempts < 3 && !this.pending.has(key))
                        this.pending.set(key, { ...entry, attempts: entry.attempts + 1 });
                }
            }
        })();
        this.running.add(work);
        try {
            await work;
        } finally {
            this.running.delete(work);
            if (this.pending.size) this.arm(5000);
        }
    }

    async stop() {
        this.stopped = true;
        if (this.timer) clearTimeout(this.timer);
        this.pending.clear();
        await Promise.allSettled([...this.running, ...(this.reconciliation ? [this.reconciliation] : [])]);
    }
}

export function attachGuildSynchronization(client: Client, synchronizer: GuildSynchronizer) {
    client.on(Events.GuildCreate, (guild) => synchronizer.schedule(guild.id, { state: 'available' }));
    client.on(Events.GuildAvailable, (guild) => synchronizer.schedule(guild.id, { state: 'available' }));
    client.on(Events.GuildUnavailable, (guild) => synchronizer.schedule(guild.id, { state: 'unavailable' }));
    // discord.js는 일시 장애를 GuildUnavailable로 분리한다. 이전에 unavailable이었던 길드도 실제 퇴장 시 제거한다.
    client.on(Events.GuildDelete, (guild) => synchronizer.schedule(guild.id, { state: 'removed' }));
    client.on(Events.GuildUpdate, (_old, guild) => synchronizer.schedule(guild.id, { state: 'available' }));
    client.on(Events.GuildRoleCreate, (role) => synchronizer.schedule(role.guild.id, { state: 'available' }));
    client.on(Events.GuildRoleUpdate, (_old, role) =>
        synchronizer.schedule(role.guild.id, { state: 'available' })
    );
    client.on(Events.GuildRoleDelete, (role) => synchronizer.schedule(role.guild.id, { state: 'available' }));
    for (const event of [Events.ChannelCreate, Events.ChannelDelete] as const)
        client.on(event, (channel) => {
            if ('guild' in channel) synchronizer.schedule(channel.guild.id, { state: 'available' });
        });
    client.on(Events.ChannelUpdate, (_old, channel) => {
        if ('guild' in channel) synchronizer.schedule(channel.guild.id, { state: 'available' });
    });
    client.on(Events.GuildMemberAdd, (member) =>
        synchronizer.schedule(member.guild.id, { state: 'available', memberId: member.id })
    );
    client.on(Events.GuildMemberUpdate, (_old, member) =>
        synchronizer.schedule(member.guild.id, { state: 'available', memberId: member.id })
    );
    client.on(Events.GuildMemberRemove, (member) =>
        synchronizer.schedule(member.guild.id, {
            state: 'available',
            memberId: member.id,
            memberRemoved: true
        })
    );
}
