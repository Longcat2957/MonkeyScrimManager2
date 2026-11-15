<script lang="ts">
    import { Button } from 'stdf';
    import { untrack } from 'svelte';
    import { invalidateAll } from '$app/navigation';
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import AuctionDraftBoard from '#lib/components/teams/AuctionDraftBoard.svelte';
    import AuctionSetupBoard from '#lib/components/teams/AuctionSetupBoard.svelte';
    import { auctionContextKey, type AuctionLiveSnapshot } from '#lib/features/scrims/auction-live.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    let snapshot = $state<AuctionLiveSnapshot | null>(null);
    let refreshing = $state(false);
    let refreshError = $state('');
    let refresh = async () => {};
    let automatic = $state(true);
    let toggleAutomatic = () => {};
    const auction = $derived(snapshot ? snapshot.auction : data.auction);
    const viewing = $derived(!data.can.manage);

    $effect(() => {
        const initial = data;
        const url = page.url.pathname;
        snapshot = null;
        refreshError = '';
        refreshing = false;
        if (
            initial.can.manage ||
            initial.scrim.status !== 'preparing' ||
            !initial.auction ||
            !['setup', 'in_progress'].includes(initial.auction.status)
        )
            return;

        let stopped = false;
        let request: AbortController | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let failures = 0;
        const visible = () => document.visibilityState === 'visible' && navigator.onLine;
        const schedule = () => {
            clearTimeout(timer);
            if (!stopped && visible() && untrack(() => automatic))
                timer = setTimeout(() => void update(), Math.min(30_000, 5_000 * 2 ** failures));
        };
        async function update(manual = false) {
            if (stopped || request || (!manual && (!visible() || !automatic))) return;
            clearTimeout(timer);
            const controller = new AbortController();
            let timedOut = false;
            const timeout = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, 15_000);
            request = controller;
            if (manual) refreshing = true;
            try {
                const response = await fetch(`${url}/live`, { signal: controller.signal, cache: 'no-store' });
                if (!response.ok) throw new Error('경매 조회 실패');
                const next: AuctionLiveSnapshot = await response.json();
                if (stopped || controller.signal.aborted || page.url.pathname !== url) return;
                if (!next.scrim || next.scrim.id !== initial.scrim.id || !('auction' in next))
                    throw new Error('경매 응답 불일치');
                // 단계·설정·권한이 달라지면 기존 상위 load도 다시 읽는다. 경매 진행만 바뀌면 열린 상세와 초점을 보존한다.
                if (auctionContextKey(next.scrim) !== auctionContextKey(initial.scrim)) {
                    stopped = true;
                    await invalidateAll();
                    return;
                }
                snapshot = next;
                refreshError = '';
                failures = 0;
                if (!next.auction || !['setup', 'in_progress'].includes(next.auction.status)) stopped = true;
            } catch {
                if (!stopped && (!controller.signal.aborted || timedOut)) {
                    failures = Math.min(3, failures + 1);
                    refreshError = '진행 상황을 갱신하지 못했어요. 마지막으로 확인한 내용을 표시하고 있어요.';
                }
            } finally {
                clearTimeout(timeout);
                if (request === controller) {
                    request = null;
                    refreshing = false;
                }
                schedule();
            }
        }
        refresh = () => update(true);
        toggleAutomatic = () => {
            automatic = !automatic;
            clearTimeout(timer);
            if (automatic && visible()) void update();
            else request?.abort();
        };
        function resume() {
            clearTimeout(timer);
            if (!visible()) request?.abort();
            else void update();
        }
        document.addEventListener('visibilitychange', resume);
        window.addEventListener('online', resume);
        window.addEventListener('offline', resume);
        schedule();
        return () => {
            stopped = true;
            clearTimeout(timer);
            request?.abort();
            request = null;
            document.removeEventListener('visibilitychange', resume);
            window.removeEventListener('online', resume);
            window.removeEventListener('offline', resume);
        };
    });
</script>

<svelte:head>
    <title>{data.scrim.title} · 경매 | {SERVICE_NAME}</title>
</svelte:head>

{#snippet refreshAction()}
    {#if viewing && data.scrim.status === 'preparing' && auction && ['setup', 'in_progress'].includes(auction.status)}
        <Button
            fill="text"
            size="auto"
            heightOut="0"
            heightIn="2"
            injClass="min-h-11 px-2 text-sm"
            disabled={refreshing}
            onclick={() => toggleAutomatic()}>{automatic ? '자동 갱신 끄기' : '자동 갱신 켜기'}</Button
        >
        <Button
            fill="text"
            size="auto"
            heightOut="0"
            heightIn="2"
            injClass="min-h-11 px-2 text-sm"
            disabled={refreshing}
            onclick={() => refresh()}>새로고침</Button
        >
    {/if}
{/snippet}

{#if refreshError}<p role="status" class="mb-3 text-sm text-text-muted">{refreshError}</p>{/if}

{#if !auction}
    <section aria-labelledby="auction-board" class="flex flex-col gap-4">
        <h2 id="auction-board" class="text-xl font-semibold">경매</h2>
        <SectionState state="empty" message="모집이 마감되면 선발된 참가자로 경매를 준비할 수 있어요" />
    </section>
{:else if auction.status === 'setup'}
    <AuctionSetupBoard
        contextKey={data.scrim.id}
        teams={auction.teams}
        players={auction.players}
        editable={data.can.manage}
        {refreshAction}
    />
{:else}
    <AuctionDraftBoard {auction} manager={data.can.manage} {refreshAction} {refreshing} />
{/if}
