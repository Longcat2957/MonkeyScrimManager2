<script lang="ts">
    import { onDestroy } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import { animateDraw, drawIndex } from './spin.ts';

    let coin: HTMLDivElement;
    let motion = $state<Animation>();
    let result = $state<'앞면' | '뒷면' | null>(null);
    let count = $state(0);
    let angle = $state(0);

    onDestroy(() => motion?.cancel());

    function toss() {
        if (motion) return;
        const side = drawIndex(2) === 0 ? '앞면' : '뒷면';
        const from = angle;
        angle = side === '앞면' ? 0 : 180;
        const travel = 1080 + ((angle - from + 360) % 360);
        count += 1;
        result = null;
        motion = animateDraw(
            coin,
            [
                { transform: `translateY(0) rotateX(${from}deg)`, easing: 'ease-out' },
                { offset: 0.42, transform: `translateY(-2.75rem) rotateX(${from + travel * 0.52}deg)` },
                {
                    offset: 0.65,
                    transform: `translateY(-2.25rem) rotateX(${from + travel * 0.77}deg)`,
                    easing: 'ease-in'
                },
                {
                    offset: 0.9,
                    transform: `translateY(0.15rem) rotateX(${from + travel - 12}deg)`,
                    easing: 'ease-out'
                },
                { transform: `translateY(0) rotateX(${from + travel}deg)` }
            ],
            920,
            () => {
                result = side;
                motion = undefined;
            }
        );
    }
</script>

<div class="grid gap-4">
    <div class="flex items-center justify-between gap-2">
        <h3 class="font-semibold text-ink">코인토스</h3>
        <span class="text-xs text-muted">던진 횟수 {count}회</span>
    </div>
    <div class="grid justify-items-center gap-3">
        <div class="coin-stage" class:flying={!!motion} aria-hidden="true">
            <div class="cast-shadow"></div>
            <div bind:this={coin} class="coin" style:transform={`rotateX(${angle}deg)`}>
                <span class="face heads">H</span>
                <span class="face tails">T</span>
            </div>
        </div>
        <p role="status" class="text-sm font-semibold text-ink">
            {#if result}<span class="sr-only">{count}번째 결과: </span>{result}
            {:else}{motion ? '던지는 중' : '대기'}{/if}
        </p>
    </div>
    <Button variant="primary" onclick={toss} disabled={!!motion}>
        {motion ? '던지는 중' : result ? '다시 던지기' : '던지기'}
    </Button>
</div>

<style>
    .coin-stage {
        position: relative;
        display: grid;
        width: 100%;
        height: 11rem;
        padding-bottom: 1rem;
        place-items: end center;
        perspective: 32rem;
    }
    .coin {
        position: relative;
        width: 6rem;
        aspect-ratio: 1;
        transform-style: preserve-3d;
    }
    .face {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        border: 4px double currentColor;
        border-radius: 50%;
        font: bold 3rem / 1 var(--font-brand);
        backface-visibility: hidden;
    }
    .face::before {
        content: '';
        position: absolute;
        inset: 0.35rem;
        border: 1px solid currentColor;
        border-radius: inherit;
        opacity: 0.45;
    }
    .heads {
        color: var(--color-nexus);
        background: var(--color-selected);
        transform: translateZ(1.5px);
    }
    .tails {
        color: var(--color-ink-2);
        background: var(--color-surface-2);
        transform: rotateX(180deg) translateZ(1.5px);
    }
    .cast-shadow {
        position: absolute;
        bottom: 0.45rem;
        width: 4.5rem;
        height: 0.45rem;
        border-radius: 50%;
        background: var(--color-muted);
        opacity: 0.32;
        filter: blur(2px);
    }
    @media (prefers-reduced-motion: no-preference) {
        .flying .cast-shadow {
            animation: shadow-flight 920ms ease-out;
        }
        @keyframes shadow-flight {
            42%,
            65% {
                transform: scaleX(0.55);
                opacity: 0.12;
            }
            90% {
                transform: scaleX(1.08);
            }
        }
    }
</style>
