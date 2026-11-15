<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { Button, Input } from 'stdf';
    import { page } from '$app/state';
    import SeasonSelector from '#lib/components/common/SeasonSelector.svelte';
    import type { RecordSeasonSelection } from '#lib/features/seasons.ts';
    import { parseMatchDateFilters } from '#lib/features/matches/filters.ts';
    import { inputLabel, nonSubmitButtons } from '#lib/ui/form.ts';

    type Values = { q: string; from: string; to: string; seasonId: string | null };
    type Props = RecordSeasonSelection & {
        q: string;
        from: string;
        to: string;
        filterError: string | null;
        disabled?: boolean;
        onapply: (values: Values) => Promise<void>;
    };
    let { q, from, to, seasons, selectedSeasonId, filterError, disabled = false, onapply }: Props = $props();
    const id = $props.id();
    let query = $state(untrack(() => q));
    let start = $state(untrack(() => from));
    let end = $state(untrack(() => to));
    let season = $state(untrack(() => selectedSeasonId));
    let error = $state(untrack(() => filterError ?? ''));
    let busy = $state(false);
    let startInput: HTMLInputElement;
    let endInput: HTMLInputElement;
    const locked = $derived(disabled || busy);
    const hasFilters = $derived(Boolean(query || start || end || season));
    const appliedKey = $derived(JSON.stringify([q, from, to, selectedSeasonId, filterError]));
    let syncedKey = $state(untrack(() => appliedKey));

    // 조회 조건이 실제로 바뀔 때만 입력을 동기화하고 단순 쪽 이동에서는 초안을 보존한다.
    $effect(() => {
        const current = appliedKey;
        if (current === syncedKey) return;
        syncedKey = current;
        query = q;
        start = from;
        end = to;
        season = selectedSeasonId;
        error = filterError ?? '';
    });

    async function apply(values: Values) {
        if (locked) return;
        const dates = parseMatchDateFilters(values);
        error = dates.error ?? '';
        if (error) {
            await tick();
            (error.startsWith('시작일') ? startInput : endInput)?.focus();
            return;
        }
        busy = true;
        try {
            await onapply({ ...values, q: values.q.trim(), from: dates.from, to: dates.to });
        } catch {
            error = '기록을 불러오지 못했어요. 연결을 확인한 뒤 다시 조회해 주세요.';
        } finally {
            busy = false;
        }
    }

    function reset() {
        if (locked) return;
        query = '';
        start = '';
        end = '';
        season = null;
        void apply({ q: '', from: '', to: '', seasonId: null });
    }
</script>

<search aria-label="경기 기록 필터">
    <form
        method="GET"
        action={page.url.pathname}
        {@attach nonSubmitButtons}
        aria-label="경기 조회"
        aria-busy={busy}
        class="flex flex-col gap-3"
        onsubmit={(event) => {
            event.preventDefault();
            void apply({ q: query, from: start, to: end, seasonId: season });
        }}
    >
        <input type="hidden" name="q" value={query} />
        {#if season}<input type="hidden" name="season" value={season} />{/if}
        <fieldset disabled={locked} class="min-w-0">
            <legend class="sr-only">조회 조건</legend>
            <div
                class="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,1.4fr)_minmax(0,1fr)_auto] xl:items-end"
            >
                <div class="-mx-2 -my-1 min-w-0" {@attach inputLabel('내전·팀 이름 검색', '검색 지우기')}>
                    <Input
                        title="내전·팀 이름 검색"
                        titlePosition="out"
                        type="search"
                        placeholder="예: 포로팀"
                        bind:value={query}
                        clear
                        disabled={locked}
                        maxlength={50}
                    />
                </div>
                <fieldset class="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                    <legend class="mb-2 text-sm font-medium">경기일 (한국 시간)</legend>
                    <label class="flex min-w-0 flex-col gap-1.5 text-sm">
                        시작일
                        <input
                            type="date"
                            name="from"
                            bind:this={startInput}
                            bind:value={start}
                            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                            aria-invalid={error ? 'true' : undefined}
                            class="min-h-12 w-full min-w-0 rounded-(--radius-form) border border-border bg-bg-surface px-3 text-base text-text-primary dark:bg-bg-surface-dark dark:text-text-dark"
                        />
                    </label>
                    <label class="flex min-w-0 flex-col gap-1.5 text-sm">
                        종료일
                        <input
                            type="date"
                            name="to"
                            bind:this={endInput}
                            bind:value={end}
                            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
                            aria-invalid={error ? 'true' : undefined}
                            class="min-h-12 w-full min-w-0 rounded-(--radius-form) border border-border bg-bg-surface px-3 text-base text-text-primary dark:bg-bg-surface-dark dark:text-text-dark"
                        />
                    </label>
                </fieldset>
                {#if seasons.length}
                    <SeasonSelector
                        {seasons}
                        selectedSeasonId={season}
                        allowAll
                        disabled={locked}
                        onselect={(value) => (season = value)}
                    />
                {/if}
                <div class="flex items-center justify-end gap-2 md:self-end">
                    <Button
                        type="submit"
                        size="auto"
                        heightOut="0"
                        heightIn="2"
                        injClass="min-h-12 px-4 text-base"
                        disabled={locked}>조회</Button
                    >
                    {#if hasFilters}
                        <Button
                            type="button"
                            fill="text"
                            size="auto"
                            heightOut="0"
                            heightIn="2"
                            injClass="min-h-12 px-3 text-base"
                            disabled={locked}
                            onclick={reset}>초기화</Button
                        >
                    {/if}
                </div>
            </div>
        </fieldset>
        <p id={`${id}-hint`} class="text-sm text-text-muted">기간을 지정하면 날짜가 확인된 경기만 보여요.</p>
        {#if error}<p id={`${id}-error`} role="alert" class="text-sm text-error">{error}</p>{/if}
    </form>
</search>
