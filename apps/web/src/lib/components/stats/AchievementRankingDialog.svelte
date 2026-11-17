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
        current = $bindable(0)
    }: { open: boolean; items: AchievementRanking[]; guildId: string; current: number } = $props();

    const item = $derived(items[current]);
</script>

<Dialog bind:open title="업적별 순위">
    <div class="flex flex-col gap-4">
        <ul aria-label="업적 선택" class="flex flex-wrap gap-1.5">
            {#each items as achievement, index (achievement.id)}
                <li>
                    <button
                        type="button"
                        aria-pressed={index === current}
                        onclick={() => (current = index)}
                        class={[
                            'min-h-11 rounded-(--radius-small) border px-3 py-1.5 text-sm',
                            index === current
                                ? 'border-hex bg-hex/10 font-semibold text-hex'
                                : 'border-brass-line text-text-muted hover:bg-bg-highlight dark:hover:bg-bg-highlight-dark'
                        ]}
                    >
                        <span aria-hidden="true">{achievement.emoji}</span>
                        {achievement.title}
                    </button>
                </li>
            {/each}
        </ul>
        {#if item}
            <section aria-labelledby="ranking-title" class="flex flex-col gap-2">
                <h3 id="ranking-title" class="text-sm text-text-muted">{item.description}</h3>
                <ol class="flex flex-col divide-y divide-brass-line">
                    {#each item.entries as entry, index (entry.userId)}
                        <li class="flex items-center gap-3 py-2.5">
                            <span
                                class={[
                                    'w-6 text-right font-bold tabular-nums',
                                    index === 0 && 'text-warning'
                                ]}>{index + 1}</span
                            >
                            <PlayerFace name={entry.displayName} imageUrl={entry.iconUrl} />
                            <a
                                href={resolve('/g/[guildId]/players/[userId]', {
                                    guildId,
                                    userId: entry.userId
                                })}
                                class="min-w-0 flex-1 truncate font-semibold hover:underline"
                                >{entry.displayName}</a
                            >
                            <span class="flex flex-col items-end text-sm tabular-nums">
                                <span class="font-bold">{entry.value}</span>
                                <span class="text-xs text-text-muted">{entry.games}게임</span>
                            </span>
                        </li>
                    {/each}
                </ol>
            </section>
        {/if}
    </div>
</Dialog>
