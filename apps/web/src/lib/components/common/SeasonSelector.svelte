<script lang="ts">
    import { goto } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import { Button } from 'stdf';
    import type { Attachment } from 'svelte/attachments';
    import type { RecordSeasonSelection } from '#lib/features/seasons.ts';
    import ActionMenu from './ActionMenu.svelte';

    let { seasons, selectedSeasonId }: RecordSeasonSelection = $props();

    let open = $state(false);
    let trigger = $state<HTMLElement | null>(null);
    const changing = $derived(navigating.to?.route.id === page.route.id);
    const selected = $derived(seasons.find((season) => season.id === selectedSeasonId));
    const actions = $derived(
        seasons.map((season) => ({
            content: season.name,
            desc: `${season.endedAt ? '종료된 시즌' : '진행 중인 시즌'}${season.id === selectedSeasonId ? ' · 조회 중' : ''}`,
            disabled: season.id === selectedSeasonId
        }))
    );

    // STDF Button은 임의 ARIA 속성을 전달하지 않으므로 실제 버튼에 열린 상태를 연결한다.
    const disclosure: Attachment<HTMLSpanElement> = (node) => {
        const expanded = open;
        const button = node.querySelector('button');
        button?.setAttribute('aria-haspopup', 'dialog');
        button?.setAttribute('aria-expanded', String(expanded));
    };

    function select(index: number) {
        open = false;
        const season = seasons[index];
        if (!season || changing || season.id === selectedSeasonId) return;
        const url = new URL(page.url.href);
        url.searchParams.set('season', season.id);
        // 다른 조회 조건은 유지하고 이전 시즌의 쪽 위치만 초기화한다.
        url.searchParams.delete('page');
        url.searchParams.delete('offset');
        goto(url, { reset: false });
    }
</script>

{#if seasons.length > 1 || (seasons.length === 1 && !selected)}
    <div class="min-w-0 max-w-full">
        <span bind:this={trigger} class="inline-flex max-w-full" {@attach disclosure}>
            <Button
                fill="lineLight"
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="min-h-12 max-w-full gap-2 px-3 text-base text-left whitespace-normal"
                disabled={changing}
                onclick={() => (open = true)}
            >
                <span class="min-w-0 [overflow-wrap:anywhere]">시즌: {selected?.name ?? '선택'}</span>
                <svg
                    aria-hidden="true"
                    class="shrink-0"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"><path d="m6 9 6 6 6-6" /></svg
                >
            </Button>
        </span>
        <ActionMenu bind:open label="조회할 시즌" {actions} {trigger} onselect={select} wrapContent />
    </div>
{:else if selected}
    <p class="text-sm text-text-muted [overflow-wrap:anywhere]">시즌: {selected.name}</p>
{/if}
