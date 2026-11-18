<script lang="ts">
    import { onDestroy } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import { POSITIONS } from '#lib/features/labels.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';
    import { animateDraw, drawIndex, MAX_OPTIONS, pointerRotation } from './spin.ts';

    let options = $state(POSITIONS.map((position) => position.text));
    let draft = $state('');
    let result = $state<string | null>(null);
    let count = $state(0);
    let rotation = $state(0);
    let wheel: SVGSVGElement;
    let pointer = $state<SVGSVGElement>();
    let ratchet: Animation | undefined;
    let form: HTMLFormElement;
    let motion = $state<Animation>();
    const label = $derived(draft.trim());
    const duplicate = $derived(options.some((option) => option.toLowerCase() === label.toLowerCase()));
    const full = $derived(options.length >= MAX_OPTIONS);
    const step = $derived(360 / Math.max(options.length, 1));
    const radians = $derived((step * Math.PI) / 180);
    const sector = $derived(
        `M50,50 V2 A48,48 0 0,1 ${50 + 48 * Math.sin(radians)},${50 - 48 * Math.cos(radians)} Z`
    );

    onDestroy(() => {
        motion?.cancel();
        ratchet?.cancel();
    });

    function updateOptions(next: string[]) {
        options = next;
        const index = result !== null && next.length >= 2 ? next.indexOf(result) : -1;
        if (index === -1) result = null;
        rotation = index === -1 ? 0 : pointerRotation(index, next.length);
    }

    function add(event: SubmitEvent) {
        event.preventDefault();
        if (motion || full || !label || duplicate) return;
        updateOptions([...options, label]);
        draft = '';
    }

    function remove(event: MouseEvent, option: string) {
        if (motion) return;
        const row = (event.currentTarget as HTMLButtonElement).closest('li');
        const nextRow = row?.nextElementSibling ?? row?.previousElementSibling;
        (nextRow?.querySelector('button') ?? form.querySelector('input'))?.focus();
        updateOptions(options.filter((value) => value !== option));
    }

    function spin() {
        if (motion || options.length < 2) return;
        const index = drawIndex(options.length);
        const winner = options[index];
        const from = rotation;
        rotation = pointerRotation(index, options.length);
        const turns = 4 + (count % 2);
        const to = rotation + turns * 360;
        const duration = 1550;
        count += 1;
        result = null;
        motion = animateDraw(
            wheel,
            [
                { transform: `rotate(${from}deg)`, easing: 'cubic-bezier(0.333333, 1, 0.666667, 1)' },
                { transform: `rotate(${to}deg)` }
            ],
            duration,
            () => {
                result = winner;
                motion = undefined;
            }
        );
        if (!motion) return;
        const taps: Keyframe[] = [{ offset: 0, transform: 'rotate(0deg)' }];
        let previous = 0;
        // 바퀴의 3차 감속 곡선을 역산해 핀이 지침을 지날 때만 튕긴다.
        for (let peg = Math.floor(from / step) + 1; peg * step < to; peg++) {
            const contact = 1 - Math.cbrt(1 - (peg * step - from) / (to - from));
            const lead = Math.min((contact - previous) / 2, 0.024);
            taps.push(
                { offset: contact - lead, transform: 'rotate(0deg)' },
                { offset: contact, transform: 'rotate(-18deg)' },
                { offset: contact + lead / 2, transform: 'rotate(0deg)' }
            );
            previous = contact;
        }
        ratchet = pointer?.animate(taps, duration);
    }
</script>

<div class="grid min-w-0 gap-4">
    <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold text-ink">룰렛</h3>
        <span class="text-xs text-muted">돌린 횟수 {count}회</span>
    </div>
    <div class="grid justify-items-center gap-2">
        <div class="relative w-48 max-w-full" aria-hidden="true">
            <svg
                bind:this={wheel}
                class="block w-full"
                viewBox="0 0 100 100"
                style:transform={`rotate(${rotation}deg)`}
            >
                <circle cx="50" cy="50" r="48" class="fill-surface-2 stroke-line-strong" />
                {#each options as option, index (option)}
                    <g transform={`rotate(${index * step} 50 50)`}>
                        {#if options.length > 1}
                            <path
                                d={sector}
                                class={[
                                    'stroke-line-strong',
                                    result === option
                                        ? 'fill-nexus'
                                        : index % 2
                                          ? 'fill-selected'
                                          : 'fill-surface-2'
                                ]}
                                stroke-width="0.7"
                            />
                        {/if}
                        <circle cx="50" cy="3" r="1.2" class="fill-ink-2" />
                        <text
                            x="50"
                            y="18"
                            text-anchor="middle"
                            dominant-baseline="central"
                            transform={`rotate(${step / 2} 50 50)`}
                            class={[
                                'font-brand text-[9px] font-bold',
                                result === option && options.length > 1 ? 'fill-nexus-ink' : 'fill-ink'
                            ]}>{index + 1}</text
                        >
                    </g>
                {/each}
                <circle cx="50" cy="50" r="4" class="fill-surface stroke-line-strong" />
            </svg>
            {#if options.length >= 2}
                <svg
                    bind:this={pointer}
                    class="absolute -top-2 left-1/2 h-5 w-5 origin-top -translate-x-1/2 fill-nexus stroke-surface"
                    viewBox="0 0 16 16"><path d="M1 1h14L8 15z" /></svg
                >
            {/if}
        </div>
        <p role="status" class="max-w-full text-center text-sm font-semibold text-ink">
            {#if motion}돌리는 중
            {:else if result}<span class="sr-only">{count}번째 </span>결과: {result}
            {:else if options.length < 2}선택지를 2개 이상 추가하세요.
            {:else}대기{/if}
        </p>
    </div>
    {#if options.length}
        <ul class="grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="룰렛 선택지">
            {#each options as option, index (option)}
                <li class="min-w-0">
                    <Button
                        size="sm"
                        class="w-full justify-start whitespace-normal text-left"
                        disabled={!!motion}
                        ariaLabel={`${option} 제거`}
                        onclick={(event) => remove(event, option)}
                    >
                        <span class="font-brand text-muted" aria-hidden="true">{index + 1}</span>
                        <span class="min-w-0 flex-1 whitespace-normal">{option}</span>
                        <svg
                            aria-hidden="true"
                            class="size-3 shrink-0 stroke-muted"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke-width="1.5"><path d="m2 2 8 8m0-8-8 8" /></svg
                        >
                    </Button>
                </li>
            {/each}
        </ul>
    {/if}
    <form
        bind:this={form}
        {@attach preventComposingSubmit}
        onsubmit={add}
        class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2"
    >
        <TextField
            label={`선택지 추가 (${options.length}/${MAX_OPTIONS})`}
            bind:value={draft}
            disabled={!!motion || full}
            placeholder={full ? '선택지를 제거하면 추가할 수 있어요' : '선택지 이름'}
            autocomplete="off"
        />
        <Button type="submit" disabled={!!motion || full || !label || duplicate}>추가</Button>
        {#if duplicate}<p role="status" class="col-span-full mt-1 text-xs text-error">
                이미 있는 선택지입니다. 다른 이름을 입력하세요.
            </p>{/if}
    </form>
    <Button variant="primary" onclick={spin} disabled={!!motion || options.length < 2}>
        {motion ? '돌리는 중' : result ? '다시 돌리기' : '돌리기'}
    </Button>
</div>
