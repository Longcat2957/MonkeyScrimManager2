<script lang="ts">
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import PositionIcon from '#lib/components/common/PositionIcon.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { BoardSample } from '#lib/content/landing.ts';

    // 실제 공용 컴포넌트로 그린 장식용 상황판. 읽기·조작 대상이 아니므로 보조 기술과 포커스에서 제외한다.
    let { sample }: { sample: BoardSample } = $props();
</script>

<div aria-hidden="true" inert class="panel overflow-hidden shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)]">
    <div class="panel-bar">
        <div class="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <strong class="text-sm font-bold">{sample.title}</strong>
            <StatusTag text="진행 중" state="warning" />
        </div>
        <span class="text-micro text-muted">{sample.meta.join(' · ')}</span>
    </div>
    <div class="grid grid-cols-2 gap-px bg-line">
        {#each sample.teams as team (team.name)}
            <div class="bg-surface">
                <div class="flex items-center gap-2 border-b border-line px-3 py-2">
                    <span
                        class={['size-2 rounded-full', team.side === 'blue' ? 'bg-team-blue' : 'bg-team-red']}
                    ></span>
                    <span class="text-ui font-bold">{team.name}</span>
                    <span
                        class={[
                            'ml-auto text-micro font-semibold',
                            team.side === 'blue' ? 'text-team-blue' : 'text-team-red'
                        ]}>{team.side === 'blue' ? '블루' : '레드'}</span
                    >
                </div>
                <ul class="divide-y divide-line">
                    {#each team.players as player (player.position)}
                        <li class="flex min-w-0 items-center gap-2 px-3 py-1.5">
                            <PositionIcon position={player.position} size="sm" />
                            <PlayerFace name={player.name} imageUrl={null} size="xs" />
                            <span class="min-w-0 truncate text-ui">{player.name}</span>
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    </div>
    <div class="flex items-center gap-2 border-t border-line bg-surface-2 px-3 py-2 text-ui">
        <svg
            viewBox="0 0 16 16"
            class="size-4 shrink-0 text-success"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
        >
            <path d="m3.5 8.5 3 3 6-7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="text-ink-2">{sample.result}</span>
    </div>
</div>
