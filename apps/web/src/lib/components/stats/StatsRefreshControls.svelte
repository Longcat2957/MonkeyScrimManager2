<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import type { StatsLiveState } from '#lib/ui/stats-live.ts';

    type Props = {
        state: StatsLiveState;
        automatic: boolean;
        online: boolean;
        moving: boolean;
        receivedAt: number | null;
        notice: string;
        onautomatic: (enabled: boolean) => void;
        onrefresh: () => Promise<void>;
    };
    let { state, automatic, online, moving, receivedAt, notice, onautomatic, onrefresh }: Props = $props();
    const message = $derived(!online ? '인터넷 연결을 확인해 주세요.' : (state.error ?? notice));
    const updatedAt = $derived(state.lastSuccessAt ?? receivedAt);
    const time = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
</script>

<div class="grid min-w-0 gap-1 @min-[40rem]:justify-items-end">
    <div role="group" aria-label="통계 갱신" class="flex flex-wrap items-center gap-2">
        <button
            type="button"
            aria-pressed={automatic}
            class="inline-flex min-h-9 items-center gap-2 rounded-(--radius-form) border border-line bg-surface px-3 text-ui font-semibold hover:bg-surface-hover pointer-coarse:min-h-11"
            onclick={() => onautomatic(!automatic)}
        >
            자동 갱신<span aria-hidden="true" class="text-xs text-muted">{automatic ? '켜짐' : '꺼짐'}</span>
        </button>
        <Button
            variant="secondary"
            class="px-3 text-ui"
            disabled={state.busy || !online || moving}
            loading={state.busy}
            onclick={() => void onrefresh()}>새로고침</Button
        >
    </div>
    <p class="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted">
        {#if updatedAt !== null}<span
                >화면 갱신 <time datetime={new Date(updatedAt).toISOString()} class="tabular-nums"
                    >{time.format(new Date(updatedAt))}</time
                ></span
            >{/if}
        {#if automatic && online && !state.error}<span>30초 간격</span>{/if}
    </p>
    <p role="status" class={['text-ui', !message && 'sr-only', state.error ? 'text-error' : 'text-muted']}>
        {message}
    </p>
</div>
