<script lang="ts">
    import { resolve } from '$app/paths';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { DuoRecord } from '#lib/features/players/types.ts';

    // 같은 팀으로 함께한 사람과의 승률. 베스트·워스트가 같은 모양을 쓴다.
    let {
        title,
        records,
        guildId,
        tone,
        seasonId = null
    }: {
        title: string;
        records: (DuoRecord & { iconUrl: string | null })[];
        guildId: string;
        tone: 'success' | 'error';
        seasonId?: string | null;
    } = $props();
</script>

<section>
    <div class="panel-bar"><h2 class="text-base font-semibold">{title}</h2></div>
    {#if records.length}
        <ul class="divide-y divide-line">
            {#each records as record (record.userId)}
                <li>
                    <a
                        href={`${resolve('/g/[guildId]/players/[userId]', { guildId, userId: record.userId })}${seasonId ? `?season=${seasonId}` : ''}`}
                        class="flex min-h-11 items-center justify-between gap-3 px-4 py-2 hover:bg-surface-hover"
                    >
                        <PlayerFace name={record.displayName} imageUrl={record.iconUrl} size="sm" />
                        <span class="flex min-w-0 flex-1 flex-col">
                            <span class="text-ui font-semibold wrap-anywhere">{record.displayName}</span>
                            <span class="text-xs text-muted">{record.games}게임 함께</span>
                        </span>
                        <span
                            class={[
                                'text-base font-bold tabular-nums',
                                tone === 'success' ? 'text-success' : 'text-error'
                            ]}>{Math.round((record.wins / record.games) * 100)}%</span
                        >
                    </a>
                </li>
            {/each}
        </ul>
    {:else}
        <p class="px-4 py-3 text-ui text-muted">세 게임 이상 함께한 사람이 없어요</p>
    {/if}
</section>
