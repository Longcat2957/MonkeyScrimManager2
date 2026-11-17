<script lang="ts" module>
    export type StackPerson = { key: string; name: string; imageUrl: string | null };
</script>

<script lang="ts">
    import { avatarColor } from '#lib/ui/avatar.ts';

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
    const PX = { xs: 'size-6 text-[0.625rem]', sm: 'size-10 text-xs' };
</script>

<!-- 장식 요소로 다룬다. 조작 대상과 보조기기 트리에서 빼고 요약 문구만 읽게 한다. -->
{#if shown.length}
    <span class="inline-flex shrink-0 items-center">
        <span class="sr-only">{label}</span>
        <span inert aria-hidden="true" class="flex items-center -space-x-2">
            {#each shown as person (person.key)}
                {#if person.imageUrl}
                    <img
                        src={person.imageUrl}
                        alt=""
                        loading="lazy"
                        class={[
                            'rounded-full object-cover ring-2 ring-bg-surface dark:ring-bg-surface-dark',
                            PX[size]
                        ]}
                    />
                {:else}
                    <span
                        class={[
                            'flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-bg-surface dark:ring-bg-surface-dark',
                            PX[size]
                        ]}
                        style:background-color={avatarColor(person.name)}
                    >
                        {person.name.slice(0, 1)}
                    </span>
                {/if}
            {/each}
            {#if remaining}
                <span
                    class={[
                        'flex items-center justify-center rounded-full bg-bg-highlight font-semibold tabular-nums ring-2 ring-bg-surface dark:bg-bg-highlight-dark dark:ring-bg-surface-dark',
                        PX[size]
                    ]}
                >
                    +{remaining}
                </span>
            {/if}
        </span>
    </span>
{/if}
