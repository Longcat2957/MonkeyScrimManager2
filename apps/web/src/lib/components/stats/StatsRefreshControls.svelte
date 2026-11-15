<script lang="ts">
    import { Button } from 'stdf';
    import type { Attachment } from 'svelte/attachments';
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
    const toggle: Attachment<HTMLSpanElement> = (node) => {
        node.querySelector('button')?.setAttribute('aria-pressed', String(automatic));
    };
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

<div class="flex min-w-0 flex-col gap-2">
    <div role="group" aria-label="통계 갱신" class="flex flex-wrap items-center gap-2">
        <span class="inline-flex" {@attach toggle}>
            <Button
                type="button"
                fill={automatic ? 'base' : 'lineLight'}
                size="auto"
                heightOut="0"
                heightIn="2"
                injClass="min-h-11 gap-2 px-3 text-sm"
                onclick={() => onautomatic(!automatic)}
            >
                자동 갱신<span aria-hidden="true" class="text-xs">{automatic ? '켜짐' : '꺼짐'}</span>
            </Button>
        </span>
        <Button
            type="button"
            fill="lineLight"
            size="auto"
            heightOut="0"
            heightIn="2"
            injClass="min-h-11 px-3 text-sm"
            disabled={state.busy || !online || moving}
            loading={state.busy ? {} : null}
            onclick={() => void onrefresh()}>새로고침</Button
        >
    </div>
    <p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-muted">
        {#if updatedAt !== null}<span
                >화면 갱신 <time datetime={new Date(updatedAt).toISOString()} class="tabular-nums"
                    >{time.format(new Date(updatedAt))}</time
                ></span
            >{/if}
        {#if automatic && online && !state.error}<span>30초 간격</span>{/if}
    </p>
    <p role="status" class={['text-sm', state.error ? 'text-error' : 'text-text-muted']}>{message}</p>
</div>
