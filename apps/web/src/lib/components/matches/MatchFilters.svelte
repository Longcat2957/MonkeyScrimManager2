<script lang="ts">
    import { tick, untrack } from 'svelte';
    import { page } from '$app/state';
    import Button from '#lib/components/common/Button.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import { parseMatchDateFilters } from '#lib/features/matches/filters.ts';
    import { BEST_OF } from '#lib/features/scrims/bracket.ts';
    import type { RecordSeasonSelection } from '#lib/features/seasons.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';

    type Props = RecordSeasonSelection & {
        q: string;
        player: string;
        champion: string;
        championSuggestions: string[];
        bestOf: number | null;
        from: string;
        to: string;
        filterError: string | null;
        disabled: boolean;
    };
    let {
        player,
        champion,
        championSuggestions,
        q,
        bestOf,
        from,
        to,
        seasons,
        selectedSeasonId,
        filterError,
        disabled
    }: Props = $props();

    const id = $props.id();
    const formats = [
        { value: '', label: '전체 형식' },
        ...BEST_OF.map((n) => ({ value: `${n}`, label: `BO${n}` }))
    ];
    const seasonOptions = $derived([
        { value: '', label: '전체 시즌' },
        ...seasons.map((s) => ({ value: s.id, label: s.name + (s.endedAt ? ' (종료)' : '') }))
    ]);
    const archiveKeys = ['player', 'champion', 'q', 'bo', 'from', 'to', 'season', 'page', 'field', 'status'];
    const otherParams = $derived([...page.url.searchParams].filter(([key]) => !archiveKeys.includes(key)));
    const clearHref = $derived(
        page.url.pathname + (otherParams.length ? `?${new URLSearchParams(otherParams)}` : '')
    );
    let expanded = $state(
        untrack(() => Boolean(q || from || to || selectedSeasonId || bestOf || filterError))
    );
    let error = $state(untrack(() => filterError));

    async function validate(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
        if (disabled) {
            event.preventDefault();
            return;
        }
        const form = event.currentTarget;
        const start = form.elements.namedItem('from') as HTMLInputElement;
        const end = form.elements.namedItem('to') as HTMLInputElement;
        error = parseMatchDateFilters({ from: start.value, to: end.value }).error;
        if (!error) return;
        event.preventDefault();
        expanded = true;
        const invalid = error.startsWith('시작일') ? start : end;
        await tick();
        invalid.focus();
    }
</script>

<search aria-label="경기 기록 필터" class="panel @container min-w-0">
    <form
        method="GET"
        action={page.url.pathname}
        aria-label="경기 조회"
        aria-busy={disabled}
        {@attach preventComposingSubmit}
        onsubmit={validate}
        class="grid min-w-0 gap-2 p-3 sm:p-4"
    >
        {#each otherParams as [name, value], index (index)}
            <input type="hidden" {name} {value} />
        {/each}
        <div class="grid min-w-0 gap-3 @min-[30rem]:grid-cols-2">
            <TextField
                label="출전 선수"
                name="player"
                type="search"
                value={player}
                placeholder="선수 이름 입력"
                maxlength={50}
                {disabled}
            />
            <TextField
                label="픽한 챔피언"
                name="champion"
                type="search"
                value={champion}
                list={`${id}-champions`}
                placeholder="예: 아리"
                maxlength={50}
                error={error?.startsWith('챔피언') ? error : ''}
                hint="선수도 입력하면 그 선수가 이 챔피언을 픽한 경기만 찾아요."
                {disabled}
            />
            <datalist id={`${id}-champions`}>
                {#each championSuggestions as name (name)}
                    <option value={name}></option>
                {/each}
            </datalist>
        </div>
        <div class="flex flex-wrap items-start justify-between gap-x-3">
            <details bind:open={expanded} class="group min-w-0 open:w-full">
                <summary
                    class="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-form text-ui font-semibold text-ink-2 hover:text-ink"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        class="size-4 text-muted group-open:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                    >
                        <path d="m6 3 5 5-5 5" />
                    </svg>
                    상세 필터
                    <span
                        aria-hidden="true"
                        class="ml-1 hidden text-xs font-normal text-muted @min-[32rem]:inline"
                    >
                        내전명 · 기간 · {seasons.length ? '시즌 · ' : ''}경기 형식
                    </span>
                </summary>
                <div class="mb-2 grid min-w-0 gap-3 border-y border-line py-3 @min-[32rem]:grid-cols-2">
                    <div class="grid min-w-0 content-start gap-3">
                        <TextField
                            label="내전명"
                            name="q"
                            type="search"
                            value={q}
                            maxlength={50}
                            {disabled}
                        />
                        <div class="grid min-w-0 grid-cols-2 gap-2">
                            {#if seasons.length}
                                <SelectField
                                    label="조회할 시즌"
                                    name="season"
                                    value={selectedSeasonId ?? ''}
                                    options={seasonOptions}
                                    {disabled}
                                />
                            {/if}
                            <SelectField
                                label="경기 형식"
                                name="bo"
                                value={bestOf?.toString() ?? ''}
                                options={formats}
                                {disabled}
                            />
                        </div>
                    </div>
                    <fieldset class="grid min-w-0 grid-cols-2 content-start gap-2">
                        <legend class="mb-1 text-xs font-semibold text-muted">경기일 (한국 시간)</legend>
                        <TextField
                            label="시작일"
                            name="from"
                            type={parseMatchDateFilters({ from }).error ? 'text' : 'date'}
                            value={from}
                            error={error?.startsWith('시작일') ? error : ''}
                            {disabled}
                        />
                        <TextField
                            label="종료일"
                            name="to"
                            type={parseMatchDateFilters({ to }).error ? 'text' : 'date'}
                            value={to}
                            error={error?.startsWith('종료일') ? error : ''}
                            {disabled}
                        />
                        <p class="col-span-2 text-xs text-muted">
                            기간을 지정하면 날짜가 확인된 경기만 보여요.
                        </p>
                    </fieldset>
                </div>
            </details>
            <div class="ml-auto flex items-center gap-1">
                <a
                    href={clearHref}
                    data-sveltekit-reload
                    class="inline-flex min-h-11 items-center rounded-form px-3 text-ui font-semibold text-ink-2 hover:bg-surface-hover hover:text-ink"
                    >초기화</a
                >
                <Button type="submit" variant="primary" class="min-h-11 px-5" {disabled}>조회</Button>
            </div>
        </div>
    </form>
</search>
