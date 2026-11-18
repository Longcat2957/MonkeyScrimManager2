<script lang="ts" module>
    export type StackPerson = { key: string; name: string; imageUrl: string | null };
</script>

<script lang="ts">
    import PlayerFace from './PlayerFace.svelte';

    type Props = {
        people: StackPerson[];
        // 전체 인원이다. people보다 많으면 남은 수를 +N으로 표시한다.
        total: number;
        max?: number;
        size?: 'xs' | 'sm';
    };

    let { people, total, max = 5, size = 'xs' }: Props = $props();

    const shown = $derived(people.slice(0, max));
    const remaining = $derived(Math.max(0, total - shown.length));
    const label = $derived(
        shown.map((person) => person.name).join(', ') + (remaining ? ` 외 ${remaining}명` : '')
    );
</script>

<!-- 장식 요소로 다룬다. 조작 대상과 보조기기 트리에서 빼고 요약 문구만 읽게 한다. -->
{#if shown.length}
    <span class="inline-flex shrink-0 items-center">
        <span class="sr-only">{label}</span>
        <span inert aria-hidden="true" class="flex items-center -space-x-1">
            {#each shown as person (person.key)}
                <PlayerFace name={person.name} imageUrl={person.imageUrl} {size} />
            {/each}
            {#if remaining}
                <span
                    class={[
                        'flex items-center justify-center rounded-(--radius-form) border border-line-strong bg-surface-2 px-1 font-semibold text-muted tabular-nums',
                        size === 'xs' ? 'h-6 min-w-6 text-micro' : 'h-7 min-w-7 text-xs'
                    ]}
                >
                    +{remaining}
                </span>
            {/if}
        </span>
    </span>
{/if}
