<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import type { RecordSeasonSelection } from '#lib/features/seasons.ts';

    type Props = RecordSeasonSelection & {
        allowAll?: boolean;
        disabled?: boolean;
        onselect?: (seasonId: string | null) => void;
    };

    let { seasons, selectedSeasonId, allowAll = false, disabled = false, onselect }: Props = $props();

    const changing = $derived(navigating.to?.route.id === page.route.id);
    const selected = $derived(seasons.find((season) => season.id === selectedSeasonId));
    const value = $derived(selectedSeasonId ?? '');

    function change(event: Event) {
        const value = (event.currentTarget as HTMLSelectElement).value;
        const id = value || null;
        if (changing || disabled || id === selectedSeasonId) return;
        if (onselect) {
            onselect(id);
            return;
        }
        const url = new URL(page.url.href);
        if (id) url.searchParams.set('season', id);
        else url.searchParams.delete('season');
        // 다른 조회 조건은 유지하고 이전 시즌의 쪽 위치만 초기화한다.
        url.searchParams.delete('page');
        url.searchParams.delete('offset');
        void goto(url, { reset: false });
    }

    const show = $derived(
        (allowAll && seasons.length > 0) || seasons.length > 1 || (seasons.length === 1 && !selected)
    );
</script>

{#if show}
    <label class="flex min-w-0 max-w-full flex-col gap-1">
        <span class="sr-only">조회할 시즌</span>
        <select
            class="min-h-9 min-w-0 max-w-full rounded-form border border-line-strong bg-surface-2 px-2.5 text-ui font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
            {value}
            disabled={disabled || changing}
            onchange={change}
        >
            {#if allowAll}<option value="">전체 시즌</option>{/if}
            {#each seasons as season (season.id)}
                <option value={season.id}>{season.name}{season.endedAt ? ' (종료)' : ''}</option>
            {/each}
        </select>
    </label>
{:else if selected}
    <p class="text-ui text-muted [overflow-wrap:anywhere]">시즌: {selected.name}</p>
{/if}
