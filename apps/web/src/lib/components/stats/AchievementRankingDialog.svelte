<script lang="ts">
    import { resolve } from '$app/paths';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { AchievementRanking } from '#lib/features/players/achievements.ts';

    // 업적 하나를 골라 1위 아래 순위까지 보여 준다. 고른 업적은 캐러셀과 함께 움직인다.
    let {
        open = $bindable(false),
        items,
        guildId,
        seasonId,
        current = $bindable(0)
    }: {
        open: boolean;
        items: AchievementRanking[];
        guildId: string;
        seasonId: string | null;
        current: number;
    } = $props();
    const item = $derived(items[current]);
</script>

<Dialog bind:open title="업적별 순위">
    <div class="flex flex-col gap-4">
        <ul aria-label="업적 선택" class="flex flex-wrap gap-1">
            {#each items as achievement, index (achievement.id)}
                <li>
                    <button
                        type="button"
                        aria-pressed={index === current}
                        onclick={() => (current = index)}
                        class={[
                            'min-h-9 rounded-(--radius-small) border px-2.5 py-1 text-ui pointer-coarse:min-h-11',
                            index === current
                                ? 'border-nexus bg-nexus/10 font-semibold text-nexus'
                                : 'border-line text-muted hover:bg-surface-hover'
                        ]}
                    >
                        {achievement.title}
                    </button>
                </li>
            {/each}
        </ul>
        {#if item}
            <section aria-labelledby="ranking-title" class="flex flex-col gap-2">
                <h3 id="ranking-title" class="text-sm text-muted">{item.description}</h3>
                <ol class="flex flex-col divide-y divide-line">
                    {#each item.entries as entry, index (entry.userId)}
                        <li class="flex min-h-11 items-center gap-2 py-1.5">
                            <span
                                class={[
                                    'w-6 text-right font-bold tabular-nums',
                                    index === 0 && 'text-role-gold'
                                ]}>{index + 1}</span
                            >
                            <PlayerFace name={entry.displayName} imageUrl={entry.iconUrl} />
                            <a
                                href={`${resolve('/g/[guildId]/players/[userId]', { guildId, userId: entry.userId })}${seasonId ? `?season=${seasonId}` : ''}`}
                                class="flex min-h-9 min-w-0 flex-1 items-center text-ui font-semibold wrap-anywhere hover:text-nexus hover:underline pointer-coarse:min-h-11"
                                >{entry.displayName}</a
                            >
                            <span class="flex flex-col items-end text-sm tabular-nums">
                                <span class="font-bold">{entry.value}</span>
                                <span class="text-xs text-muted">{entry.games}게임</span>
                            </span>
                        </li>
                    {/each}
                </ol>
            </section>
        {/if}
    </div>
</Dialog>
