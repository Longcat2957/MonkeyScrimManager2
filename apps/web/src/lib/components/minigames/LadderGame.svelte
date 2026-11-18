<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';
    import { createLadder, laneX, rungY, type Ladder } from '#lib/features/minigames/ladder.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';

    const sizes = [2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}명` }));
    const fields = $state([Array<string>(6).fill(''), Array<string>(6).fill('')]);
    const colors = ['nexus', 'warning', 'info', 'success', 'error', 'ink-2'];
    const duration = 700;
    let size = $state('3');
    const columns = $derived(Number(size));
    let ladder = $state.raw<Ladder | null>(null);
    let selected = $state(-1);
    let arrived = $state(false);
    let replay = $state(0);
    let notice = $state('');
    let timer: number | undefined;
    let root: HTMLDivElement;
    const trace = $derived(ladder?.traces[selected]);
    const fallback = (side: number, i: number) => (side === 0 ? `${i + 1}번` : i === 0 ? '당첨' : '꽝');
    const label = (side: number, i: number) => fields[side][i].trim() || fallback(side, i);

    onDestroy(() => clearTimeout(timer));

    async function changeStage(event?: SubmitEvent) {
        event?.preventDefault();
        if (event && ladder) return;
        clearTimeout(timer);
        selected = -1;
        arrived = false;
        notice = '';
        ladder = ladder ? null : createLadder(columns);
        await tick();
        root.querySelector<HTMLElement>(ladder ? '.departure button' : 'input')?.focus();
    }

    function follow(i: number) {
        clearTimeout(timer);
        selected = i;
        replay++;
        arrived = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!arrived) timer = window.setTimeout(() => (arrived = true), duration);
    }

    function advanceField(event: KeyboardEvent) {
        if (
            event.key !== 'Enter' ||
            event.isComposing ||
            event.keyCode === 229 ||
            !(event.target instanceof HTMLInputElement)
        )
            return;
        const inputs = [...root.querySelectorAll('input')];
        const next = inputs[inputs.indexOf(event.target) + 1];
        if (!next) return;
        event.preventDefault();
        next.focus();
        next.select();
    }

    async function pasteFields(event: ClipboardEvent) {
        if (!(event.target instanceof HTMLInputElement)) return;
        const values = event.clipboardData
            ?.getData('text/plain')
            .trimEnd()
            .split(/\r\n|[\n\r\t]/);
        if (!values || values.length < 2) return;
        event.preventDefault();
        const [side, start] = event.target.name.split('-').map(Number);
        const end = start + values.length;
        if (end > fields[side].length) {
            notice = `이 칸부터는 최대 ${fields[side].length - start}개까지 붙여넣을 수 있어요.`;
            return;
        }
        notice = '';
        fields[side].splice(start, values.length, ...values.map((value) => value.trim()));
        size = String(Math.max(columns, end));
        await tick();
        root.querySelector<HTMLInputElement>(`[name="${side}-${end - 1}"]`)?.focus();
    }
</script>

<div
    bind:this={root}
    class="ladder-game grid min-w-0 gap-4"
    style={`--columns:${columns}; --duration:${duration}ms`}
>
    <form {@attach preventComposingSubmit} onsubmit={changeStage} onpaste={pasteFields}>
        <header class="game-head">
            <div class="min-w-0">
                <h3 class="font-semibold text-ink">사다리타기</h3>
                <p role="status" class="mt-1 text-sm text-ink-2">
                    {#if trace && arrived}<strong>{label(0, selected)}</strong>의 결과:
                        <strong class="arrival-text">{label(1, trace.output)}</strong>
                    {:else if trace}{label(0, selected)}의 경로를 따라가는 중…
                    {:else if ladder}출발할 이름을 선택하세요.
                    {:else}위에는 이름, 아래에는 결과를 적으세요.{/if}
                </p>
            </div>
            {#if ladder}
                <Button size="sm" onclick={() => changeStage()}>다시 편집</Button>
            {:else}
                <SelectField label="참가 인원" options={sizes} bind:value={size} />
            {/if}
        </header>

        <div class="playing-field" style={`--signal:var(--color-${colors[selected] ?? 'nexus'})`}>
            {#snippet field(side: number, i: number)}
                <div class="socket">
                    <TextField
                        label={`${side === 0 ? '참가자' : '결과'} ${i + 1}`}
                        name={`${side}-${i}`}
                        bind:value={fields[side][i]}
                        placeholder={fallback(side, i)}
                        autocomplete="off"
                        onkeydown={advanceField}
                    />
                </div>
            {/snippet}
            <div class="text-xs font-semibold text-muted">출발</div>
            <div class="endpoints departure">
                {#each Array(columns) as _, i (i)}
                    <div class="terminal" class:active-port={selected === i}>
                        {#if ladder}
                            <button
                                class="nameplate text-sm font-semibold"
                                type="button"
                                aria-pressed={selected === i}
                                onclick={() => follow(i)}>{label(0, i)}</button
                            >
                        {:else}
                            {@render field(0, i)}
                        {/if}
                        <span class="pin" aria-hidden="true"></span>
                    </div>
                {/each}
            </div>
            <div class="track-bed">
                <svg
                    class="board"
                    viewBox="0 0 600 220"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={ladder ? '참가자와 결과를 잇는 사다리' : '추첨 전 사다리판'}
                >
                    {#each Array(columns) as _, i (i)}
                        <path class="rail" d={`M ${laneX(i, columns)} 0 V 220`} />
                    {/each}
                    {#if ladder}
                        {#each ladder.rungs as left, row (row)}
                            <path
                                class="rung"
                                d={`M ${laneX(left, columns)} ${rungY(row, ladder.rungs.length)} H ${laneX(left + 1, columns)}`}
                            />
                        {/each}
                    {:else}
                        {#each Array(columns - 1) as _, i (i)}
                            <path
                                class="guide-rung"
                                d={`M ${laneX(i, columns)} ${rungY(i, columns - 1)} H ${laneX(i + 1, columns)}`}
                            />
                        {/each}
                    {/if}
                    {#if trace}
                        {#key replay}
                            <g stroke="var(--signal)">
                                <path class="highlight" d={trace.path} pathLength="100" />
                                <path class="runner" d={trace.path} pathLength="100" />
                            </g>
                        {/key}
                    {/if}
                </svg>
            </div>
            <div class="endpoints destination">
                {#each Array(columns) as _, i (i)}
                    <div class="terminal" class:active-port={arrived && trace?.output === i}>
                        <span class="pin" aria-hidden="true"></span>
                        {#if ladder}
                            <span class="outcome text-sm font-semibold">{label(1, i)}</span>
                        {:else}
                            {@render field(1, i)}
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="zone-title text-xs font-semibold text-muted">도착</div>
            {#if !ladder}
                <div class="launch">
                    <Button type="submit" variant="primary">
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"
                            ><path d="m4 2 9 6-9 6z" /></svg
                        >
                        사다리 시작
                    </Button>
                </div>
            {/if}
        </div>
        {#if notice}
            <p role="alert" class="mt-3 text-sm text-error">{notice}</p>
        {/if}
    </form>
    {#if !ladder}
        <p class="text-xs text-muted">명단은 한 칸에 줄바꿈으로 붙여넣을 수 있어요.</p>
    {:else}
        <details class="results text-sm">
            <summary class="font-semibold">전체 결과 보기</summary>
            <dl>
                {#each ladder.traces as path, i (i)}
                    <div class="result-line">
                        <dt><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{label(0, i)}</dt>
                        <dd>{label(1, path.output)}</dd>
                    </div>
                {/each}
            </dl>
        </details>
    {/if}
</div>

<style>
    .ladder-game {
        container-type: inline-size;
        overflow-wrap: anywhere;
    }
    .game-head {
        display: flex;
        min-height: 3.75rem;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-block: 0.5rem 1.25rem;
    }
    .arrival-text {
        color: var(--color-nexus);
    }
    .playing-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        padding: 0.75rem clamp(0.375rem, 2cqi, 1rem);
        border-block: 1px solid var(--color-line-strong);
        background-color: var(--color-surface-2);
    }
    .departure {
        grid-area: 2 / 1;
    }
    .destination {
        grid-area: 4 / 1;
    }
    .destination + .zone-title {
        grid-area: 5 / 1;
        text-align: right;
    }
    .terminal {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        justify-items: stretch;
        align-content: end;
        text-align: center;
    }
    .destination .terminal {
        align-content: start;
    }
    .socket,
    .nameplate,
    .outcome {
        margin-inline: clamp(1px, 0.6cqi, 0.3rem);
    }
    .socket :global(label) {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
    }
    .socket :global(input),
    .nameplate,
    .outcome {
        width: auto;
        min-width: 0;
        min-height: 2.75rem;
        padding-inline: 0.125rem;
        text-align: center;
    }
    .socket :global(input) {
        width: 100%;
        background: var(--color-surface);
        border: 0;
        border-bottom: 1px dashed var(--color-line-strong);
        border-radius: 0;
    }
    .socket :global(input:focus-visible) {
        border-bottom-color: var(--color-nexus);
    }
    .nameplate {
        cursor: pointer;
        border-radius: var(--radius-form);
        color: var(--color-ink);
    }
    .nameplate:hover {
        background: var(--color-surface-hover);
    }
    .active-port .nameplate,
    .active-port .outcome {
        background: var(--color-surface);
        color: var(--signal);
    }
    .outcome {
        display: grid;
        place-items: center;
        color: var(--color-ink-2);
    }
    .pin {
        position: relative;
        justify-self: center;
        width: 0.75rem;
        height: 0.75rem;
        background: var(--color-surface);
        border: 2px solid var(--color-line-strong);
        border-radius: 50%;
        z-index: 1;
    }
    .departure .pin {
        margin-top: 0.375rem;
        margin-bottom: -0.375rem;
    }
    .destination .pin {
        margin-top: -0.375rem;
        margin-bottom: 0.375rem;
        border-radius: 1px;
        transform: rotate(45deg);
    }
    .active-port .pin {
        background: var(--signal);
        border-color: var(--signal);
    }
    .track-bed {
        grid-area: 3 / 1;
        position: relative;
        background-image: radial-gradient(var(--color-line) 0.8px, transparent 1px);
        background-size: 12px 12px;
    }
    .launch {
        grid-area: 3 / 1;
        place-self: center;
        z-index: 1;
        white-space: nowrap;
    }
    .launch :global(button) {
        min-height: 2.875rem;
        padding-inline: 1.25rem;
    }
    .results {
        border-block-end: 1px solid var(--color-line);
    }
    .results summary {
        padding-block: 0.625rem;
        cursor: pointer;
    }
    .results dl {
        margin-bottom: 0.75rem;
    }
    .result-line {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding-block: 0.375rem;
        border-top: 1px solid var(--color-line);
    }
    .result-line dt span {
        margin-right: 0.75rem;
        color: var(--color-muted);
        font-variant-numeric: tabular-nums;
    }
    .result-line dd {
        font-weight: 700;
        text-align: right;
    }
    .endpoints {
        display: grid;
        grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    }
    .guide-rung {
        stroke: var(--color-line-strong);
        stroke-dasharray: 3 6;
    }
    .board {
        display: block;
        width: 100%;
        height: clamp(10rem, 30vh, 15rem);
    }
    .board path {
        fill: none;
        vector-effect: non-scaling-stroke;
    }
    .rail,
    .rung {
        stroke: var(--color-line-strong);
        stroke-width: 2;
    }
    .rung {
        animation: reveal-rung 320ms ease-out;
    }
    .highlight {
        stroke-width: 4;
        stroke-linejoin: round;
        stroke-linecap: round;
        stroke-dasharray: 100;
    }
    @keyframes reveal-rung {
        from {
            opacity: 0;
        }
    }
    @keyframes trace {
        from {
            stroke-dashoffset: 100;
        }
        to {
            stroke-dashoffset: 0;
        }
    }
    .runner {
        stroke-width: 9;
        stroke-linecap: round;
        stroke-dasharray: 0.01 200;
        opacity: 0;
    }
    @media (prefers-reduced-motion: no-preference) {
        .highlight {
            animation: trace var(--duration) ease-in-out both;
        }
        .runner {
            animation: replay-trace var(--duration) ease-in-out;
        }
        @keyframes replay-trace {
            from {
                opacity: 1;
                stroke-dashoffset: 0;
            }
            92% {
                opacity: 1;
            }
            to {
                opacity: 0;
                stroke-dashoffset: -100;
            }
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .rung {
            animation: none;
        }
    }
</style>
