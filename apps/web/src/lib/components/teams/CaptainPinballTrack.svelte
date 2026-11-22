<script module lang="ts">
    export const colors = ['nexus', 'warning', 'success', 'info', 'error'] as const;
</script>

<script lang="ts">
    import { MediaQuery } from 'svelte/reactivity';
    import { BALL_RADIUS, FINISH_Y, type createCaptainRace } from '#lib/features/scrims/captain-pinball.ts';
    import { PinballCamera, type CameraShot } from '#lib/features/scrims/captain-pinball-camera.ts';
    import { createPinballLabels, LABEL_HEIGHT } from '#lib/features/scrims/captain-pinball-labels.ts';
    import type { FormationPlayer } from '#lib/features/scrims/formation.ts';

    type Race = ReturnType<typeof createCaptainRace>;
    let {
        race,
        phase,
        players
    }: {
        race: Race;
        phase: 'ready' | 'running' | 'result';
        players: FormationPlayer[];
    } = $props();

    const id = $props.id();
    const trayY = FINISH_Y + 18;
    const height = trayY + 15;
    const mapWidth = 62;
    const narrow = new MediaQuery('max-width: 43rem', false);
    const compactMap = $derived(narrow.current);
    const mapScale = $derived(compactMap ? 0.095 : Math.min((mapWidth - 12) / 360, 248 / height));
    const pieces: SVGGElement[] = [];
    const tails: SVGLineElement[] = [];
    const bubbles: SVGGElement[] = [];
    const leaders: SVGLineElement[] = [];
    const arms: SVGGElement[] = [];
    const strikes: SVGCircleElement[] = [];
    const mapDots: SVGCircleElement[] = [];
    let course = $state<SVGGElement>();
    let obstacles = $state<SVGGElement>();
    let reticle = $state<SVGGElement>();
    let mapWindow = $state<SVGRectElement>();
    let mapFocus = $state<SVGCircleElement>();
    const camera = $derived(new PinballCamera(race.balls, height - 300));
    const nameplates = $derived(createPinballLabels(race.balls));
    let shot = $state<CameraShot>('pack');
    let first = $state(-1);
    let second = $state(-1);
    const currentShot = $derived(phase === 'ready' ? 'pack' : phase === 'result' ? 'finish' : shot);
    const captions = { pack: '출발 대열', rear: '후미권', finish: '결승선', follow: '개별 추적' };

    // 물리 스텝은 부모가 소유한다. 장면은 마지막 스텝의 좌표만 그린다.
    export function paint(trailer: number, follow?: number) {
        if (!course || !obstacles || !reticle || !mapWindow || !mapFocus) return;
        const now = performance.now();
        const top = phase === 'result' ? height - 300 : camera.frame(trailer, follow, now);
        shot = camera.shot;
        first = camera.first;
        second = camera.second;
        const { balls, pegs, sweepers, rails } = race;
        const result = phase === 'result';
        const target = result ? trailer : follow;
        course.transform.baseVal.getItem(0).setTranslate(0, -top);
        if (!result) nameplates.place(top, now);
        mapWindow.y.baseVal.value = top;

        obstacles.style.display = pegs.length || sweepers.length || rails.length ? '' : 'none';
        for (let i = 0; i < sweepers.length; i++) {
            arms[i]!.transform.baseVal.getItem(0).setRotate((sweepers[i]!.angle * 180) / Math.PI, 0, 0);
        }
        for (let i = 0; i < pegs.length; i++) {
            const peg = pegs[i]!;
            const strike = strikes[i];
            if (!strike || (!peg.impact && !strike.hasAttribute('opacity'))) continue;
            if (peg.impact) {
                strike.setAttribute('opacity', String(peg.impact));
                strike.r.baseVal.value = peg.r + (1 - peg.impact) * 7;
            } else {
                strike.removeAttribute('opacity');
            }
        }

        reticle.style.display = mapFocus.style.display = target !== undefined && balls[target] ? '' : 'none';
        for (let i = 0; i < balls.length; i++) {
            const ball = balls[i]!;
            const node = pieces[i]!;
            const tail = tails[i]!;
            const x = ball.x;
            // 최종 통과자만 실제 통과 지점 바로 아래 홈에 남겨 뒷구슬을 가리지 않는다.
            const y = ball.finished ? trayY : ball.y;
            const dot = mapDots[i]!;
            node.style.display = dot.style.display =
                ball.finished && !(result && i === trailer) ? 'none' : '';
            dot.cx.baseVal.value = x;
            dot.cy.baseVal.value = y;
            node.transform.baseVal.getItem(0).setTranslate(x, y);
            node.toggleAttribute('data-boosting', !result && !ball.finished && ball.boostRemaining > 0);
            const label = nameplates.labels[i]!;
            const bubble = bubbles[i]!;
            const line = leaders[i]!;
            const alpha = result ? 0 : label.opacity;
            bubble.style.opacity = String(alpha);
            line.style.opacity = String(alpha * 0.5);
            if (alpha > 0) {
                bubble.transform.baseVal.getItem(0).setTranslate(label.x, label.y);
                line.x1.baseVal.value = x;
                line.y1.baseVal.value = y;
                line.x2.baseVal.value = label.x + nameplates.width / 2;
                line.y2.baseVal.value = top + label.y + LABEL_HEIGHT / 2;
            }
            if (i === target) {
                reticle.transform.baseVal.getItem(0).setTranslate(x, y);
                mapFocus.cx.baseVal.value = x;
                mapFocus.cy.baseVal.value = y;
            }
            if (ball.finished || result) {
                tail.style.display = 'none';
            } else if (y + 16 >= top && y - 16 <= top + 300) {
                const scale = Math.min(0.068, (BALL_RADIUS + 9) / Math.max(1, Math.hypot(ball.vx, ball.vy)));
                tail.x1.baseVal.value = x;
                tail.y1.baseVal.value = y;
                tail.x2.baseVal.value = x - ball.vx * scale;
                tail.y2.baseVal.value = y - ball.vy * scale;
            } else {
                tail.x1.baseVal.value = tail.x2.baseVal.value = x;
                tail.y1.baseVal.value = tail.y2.baseVal.value = y;
            }
        }
    }
</script>

<div class="views">
    {#key race}
        <svg
            class="board"
            data-shot={currentShot}
            class:ready={phase === 'ready'}
            class:racing={phase === 'running'}
            viewBox="0 0 360 300"
            aria-hidden="true"
        >
            <defs>
                <clipPath id="{id}-gate"><rect x="8" y="43" width="344" height="5" /></clipPath>
                <pattern id="{id}-ribs" patternUnits="userSpaceOnUse" width="6" height="14">
                    <path
                        d="m-4 14 8-14m-2 14 8-14"
                        stroke="var(--color-nexus-ink)"
                        stroke-width="1.4"
                        opacity=".48"
                    />
                </pattern>
                <pattern id="{id}-check" patternUnits="userSpaceOnUse" width="10" height="10" y={FINISH_Y}>
                    <path d="M0 0h5v5H0zM5 5h5v5H5z" fill="var(--color-ink)" />
                </pattern>
                <pattern id="{id}-ticks" patternUnits="userSpaceOnUse" width="8" height="40">
                    <path
                        d="M1 1h5M3 11h3m-3 10h3m-3 10h3"
                        stroke="var(--color-line-strong)"
                        stroke-width=".9"
                    />
                </pattern>
                <pattern id="{id}-direction" patternUnits="userSpaceOnUse" width="360" height="181">
                    <path
                        d="m13 54 10 7-10 7m334-14-10 7 10 7"
                        fill="none"
                        stroke="var(--color-line)"
                        stroke-width="1.2"
                    />
                </pattern>
                <radialGradient id="{id}-enamel" cx=".36" cy=".26" r=".78">
                    <stop stop-color="var(--color-ink)" stop-opacity=".32" />
                    <stop offset=".55" stop-color="var(--color-ink)" stop-opacity="0" />
                    <stop offset="1" stop-color="var(--color-rail)" stop-opacity=".34" />
                </radialGradient>
            </defs>
            <g bind:this={course} transform="translate(0 0)">
                <rect width="360" {height} fill="var(--color-ground)" />
                <path d={`M8 43h344v5H8zM8 ${FINISH_Y + 9}h344v24H8z`} fill="var(--color-surface-2)" />
                <path
                    d={`M8 ${trayY + BALL_RADIUS + 2}h344`}
                    stroke="var(--color-line-strong)"
                    stroke-width="1.4"
                />
                <rect width="360" {height} fill={`url(#${id}-direction)`} />
                <g bind:this={obstacles} id="{id}-terrain">
                    <g stroke-linecap="round" fill="none">
                        {#each race.rails as rail}
                            {@const line = `M${rail.x1} ${rail.y1}L${rail.x2} ${rail.y2}`}
                            <path d={line} stroke="var(--color-line-strong)" stroke-width={2 * rail.r} />
                            <path d={line} stroke="var(--color-surface-hover)" stroke-width={1.4 * rail.r} />
                            <path d={line} stroke="var(--color-muted)" stroke-width="1" />
                            <circle cx={rail.x1} cy={rail.y1} r={rail.r * 0.32} fill="var(--color-ink-2)" />
                            <circle cx={rail.x2} cy={rail.y2} r={rail.r * 0.32} fill="var(--color-ink-2)" />
                        {/each}
                    </g>
                    {#each race.sweepers as bar}
                        <g transform={`translate(${bar.x} ${bar.y})`} fill="none">
                            <circle
                                r={bar.length}
                                stroke="var(--color-line)"
                                stroke-width="1"
                                stroke-dasharray="17 7 2 7"
                            />
                            <circle r={bar.length * 0.63} stroke="var(--color-surface-2)" stroke-width="4" />
                            <path d="M-5 0H5M0-5V5" stroke="var(--color-muted)" />
                        </g>
                    {/each}
                    {#each race.pegs as peg, i}
                        <g transform={`translate(${peg.x} ${peg.y})`}>
                            {#if peg.r >= 9}
                                <circle
                                    bind:this={strikes[i]}
                                    class="strike"
                                    r={peg.r}
                                    fill="none"
                                    stroke="var(--color-nexus)"
                                    stroke-width="1.7"
                                />
                                <g transform={`scale(${peg.r})`}>
                                    <circle
                                        r=".96"
                                        fill="var(--color-selected)"
                                        stroke="var(--color-nexus)"
                                        stroke-width=".08"
                                    />
                                    <circle
                                        r=".72"
                                        fill="none"
                                        stroke="var(--color-nexus)"
                                        stroke-width=".12"
                                        stroke-dasharray="1.05 .46"
                                    />
                                    <path
                                        d="m.13-.46-.47.54h.28l-.11.38.51-.57H.05z"
                                        fill="var(--color-nexus)"
                                    />
                                </g>
                            {:else}
                                <circle
                                    r={peg.r - 0.45}
                                    fill="var(--color-line-strong)"
                                    stroke="var(--color-ink-2)"
                                    stroke-width=".9"
                                />
                                <circle
                                    cx={-peg.r * 0.22}
                                    cy={-peg.r * 0.25}
                                    r={peg.r * 0.23}
                                    fill="var(--color-ink)"
                                />
                            {/if}
                        </g>
                    {/each}
                    {#each race.sweepers as bar, i}
                        <g transform={`translate(${bar.x} ${bar.y})`}>
                            <g bind:this={arms[i]} transform={`rotate(${(bar.angle * 180) / Math.PI})`}>
                                <rect
                                    x={-bar.length - bar.r}
                                    y={-bar.r}
                                    width={2 * (bar.length + bar.r)}
                                    height={2 * bar.r}
                                    rx={bar.r}
                                    fill="var(--color-role-gold)"
                                />
                                <rect
                                    x={-bar.length}
                                    y={-bar.r * 0.65}
                                    width={2 * bar.length}
                                    height={bar.r * 1.3}
                                    rx={bar.r / 2}
                                    fill={`url(#${id}-ribs)`}
                                />
                                <path
                                    d={`M${-bar.length} ${-bar.r + 0.65}h${2 * bar.length}`}
                                    stroke="var(--color-ink)"
                                    stroke-width=".9"
                                    opacity=".64"
                                />
                                <circle cx={-bar.length} r={bar.r * 0.44} fill="var(--color-nexus-ink)" />
                                <circle cx={bar.length} r={bar.r * 0.44} fill="var(--color-nexus-ink)" />
                                <circle
                                    r={bar.r * 0.94}
                                    fill="var(--color-surface)"
                                    stroke="var(--color-role-gold)"
                                    stroke-width="1.2"
                                />
                                <path
                                    d={`M${-bar.r * 0.4} 0h${bar.r * 0.8}`}
                                    stroke="var(--color-role-gold)"
                                    stroke-width="1.5"
                                />
                            </g>
                        </g>
                    {/each}
                </g>
                <g fill="var(--color-nexus)" clip-path={`url(#${id}-gate)`}>
                    <g class="leaf left">
                        <rect x="8" y="43" width="172" height="5" rx="1" />
                        <rect x="11" y="44" width="166" height="3" fill={`url(#${id}-ribs)`} />
                    </g>
                    <g class="leaf right">
                        <rect x="180" y="43" width="172" height="5" rx="1" />
                        <rect x="183" y="44" width="166" height="3" fill={`url(#${id}-ribs)`} />
                    </g>
                </g>
                <path d={`M8 ${FINISH_Y}h344`} stroke="var(--color-nexus)" stroke-width="2" />
                <rect x="8" y={FINISH_Y + 1} width="344" height="8" fill={`url(#${id}-check)`} />
                <path d={`M0 0h8v${height}H0zM352 0h8v${height}h-8z`} fill="var(--color-surface-2)" />
                <path
                    d={`M8 0v${height}M352 0v${height}`}
                    stroke="var(--color-line-strong)"
                    stroke-width="1.5"
                />
                <rect x="0" width="7" {height} fill={`url(#${id}-ticks)`} />
                <g class="tails" stroke-width="2.8" stroke-linecap="round" opacity=".55">
                    {#each race.balls as ball, i}
                        <line
                            bind:this={tails[i]}
                            x1={ball.x}
                            x2={ball.x}
                            y1={ball.y}
                            y2={ball.y}
                            stroke={`var(--color-${colors[i % colors.length]})`}
                        />
                    {/each}
                </g>
                {#each nameplates.labels as label, i}
                    <line
                        bind:this={leaders[i]}
                        x1={race.balls[i]!.x}
                        y1={race.balls[i]!.y}
                        x2={label.x + nameplates.width / 2}
                        y2={label.y + LABEL_HEIGHT / 2}
                        stroke={`var(--color-${colors[i % colors.length]})`}
                        stroke-width=".85"
                        opacity=".5"
                    />
                {/each}
                <g
                    bind:this={reticle}
                    style="display: none"
                    transform="translate(0 0)"
                    fill="none"
                    stroke="var(--color-nexus)"
                    stroke-width="1.7"
                >
                    <circle
                        r={BALL_RADIUS + 3}
                        pathLength="100"
                        stroke-dasharray="15 10"
                        transform="rotate(-26)"
                    />
                </g>
                {#each race.balls as ball, i}
                    <g
                        bind:this={pieces[i]}
                        data-marble={i + 1}
                        transform={`translate(${ball.x} ${ball.y})`}
                        color={`var(--color-${colors[i % colors.length]})`}
                    >
                        <title>{i + 1}번 · {players[i]?.displayName}</title>
                        <circle
                            class="boost-ring"
                            r={BALL_RADIUS + 2}
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                        />
                        <circle
                            r={BALL_RADIUS - 0.35}
                            fill="currentColor"
                            stroke="var(--color-rail)"
                            stroke-width=".7"
                        />
                        <circle r={BALL_RADIUS - 0.8} fill={`url(#${id}-enamel)`} />
                        <path
                            d={`M${-BALL_RADIUS * 0.67} ${-BALL_RADIUS * 0.34}q${BALL_RADIUS * 0.15} ${-BALL_RADIUS * 0.33} ${BALL_RADIUS * 0.52} ${-BALL_RADIUS * 0.43}`}
                            stroke="var(--color-ink)"
                            opacity=".74"
                            stroke-linecap="round"
                            stroke-width=".85"
                            fill="none"
                        />
                        <text
                            text-anchor="middle"
                            dy=".36em"
                            font-size={BALL_RADIUS * 1.2}
                            fill="var(--color-nexus-ink)">{i + 1}</text
                        >
                    </g>
                {/each}
            </g>
            <g class="callouts" pointer-events="none">
                {#each nameplates.labels as label, i}
                    <g bind:this={bubbles[i]} transform={`translate(${label.x} ${label.y})`}>
                        <foreignObject
                            width={nameplates.width}
                            height={LABEL_HEIGHT}
                            style:--marble={`var(--color-${colors[i % colors.length]})`}
                        >
                            <div class="label-slot">
                                <div class="bubble" data-marble-label={i + 1}>
                                    <span class="bib">{i + 1}</span>
                                    <span data-display-name>{players[i]?.displayName}</span>
                                </div>
                            </div>
                        </foreignObject>
                    </g>
                {/each}
            </g>
        </svg>
        <svg
            class="minimap"
            viewBox={compactMap ? '0 0 360 42' : `0 0 ${mapWidth} 300`}
            role="img"
            aria-label="코스 미니맵"
        >
            <text
                x={compactMap ? 24 : mapWidth / 2}
                y={compactMap ? 17 : 15}
                text-anchor="middle"
                fill="var(--color-ink-2)"
                font-size="11"
                font-weight="700">미니맵</text
            >
            {#if compactMap}
                <g fill="var(--color-ink-2)" font-size="10" text-anchor="middle">
                    <text x="24" y="32">출발</text>
                    <text x="319" y="17">결승</text>
                </g>
            {/if}
            <g
                transform={compactMap
                    ? `translate(49 38) rotate(-90) scale(${mapScale})`
                    : `translate(${(mapWidth - 360 * mapScale) / 2} 25) scale(${mapScale})`}
            >
                <rect
                    width="360"
                    {height}
                    fill="var(--color-ground)"
                    stroke="var(--color-line-strong)"
                    vector-effect="non-scaling-stroke"
                />
                <use href={`#${id}-terrain`} />
                <path
                    d="M8 43h344"
                    fill="none"
                    stroke="var(--color-nexus)"
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
                <path
                    d={`M8 ${FINISH_Y}h344`}
                    fill="none"
                    stroke="var(--color-ink)"
                    stroke-width="15"
                    stroke-dasharray="26 18"
                />
                <rect
                    bind:this={mapWindow}
                    class="map-window"
                    data-map-viewport
                    width="360"
                    height="300"
                    y="0"
                    fill="var(--color-nexus)"
                    fill-opacity=".12"
                    stroke="var(--color-nexus)"
                    stroke-width="1.2"
                    vector-effect="non-scaling-stroke"
                />
                {#each race.balls as ball, i}
                    <circle
                        bind:this={mapDots[i]}
                        data-map-marble={i + 1}
                        cx={ball.x}
                        cy={ball.y}
                        r={1.55 / mapScale}
                        fill={`var(--color-${colors[i % colors.length]})`}
                    />
                {/each}
                <circle
                    bind:this={mapFocus}
                    style="display: none"
                    r={3.65 / mapScale}
                    fill="none"
                    stroke="var(--color-ink)"
                    stroke-width="1.4"
                    vector-effect="non-scaling-stroke"
                />
            </g>
            <text
                x={compactMap ? 319 : mapWidth / 2}
                y={compactMap ? 32 : 291}
                text-anchor="middle"
                fill="var(--color-ink)"
                font-size={compactMap ? 12 : 10}
                font-weight="700"
                >{currentShot === 'battle' ? `${first + 1}·${second + 1} 접전` : captions[currentShot]}</text
            >
        </svg>
    {/key}
</div>

<style>
    .views {
        display: grid;
        grid-template-columns: minmax(0, 360fr) minmax(0, 62fr);
    }
    .minimap {
        display: block;
        width: 100%;
        height: 100%;
        max-height: 54dvh;
        border-inline-start: 1px solid var(--color-line-strong);
        background: var(--color-surface-2);
    }
    @media (max-width: 43rem) {
        .views {
            grid-template-columns: minmax(0, 1fr);
        }
        .minimap {
            grid-row: 1;
            justify-self: end;
            width: min(100%, 21rem);
            height: auto;
            border-inline-start: 0;
            border-block-end: 1px solid var(--color-line-strong);
        }
    }
    .board {
        display: block;
        width: 100%;
        height: auto;
        max-height: 54dvh;
        background: var(--color-ground);
    }
    .board text {
        font-family: var(--font-brand);
        font-weight: 800;
        font-variant-numeric: tabular-nums;
    }
    .boost-ring {
        display: none;
    }
    [data-marble]:global([data-boosting]) .boost-ring {
        display: block;
    }
    .label-slot {
        display: flex;
        justify-content: center;
        height: 100%;
    }
    .bubble {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 3px;
        width: max-content;
        max-width: 100%;
        height: 100%;
        min-width: 0;
        padding: 0 4px;
        border: 1px solid var(--color-line-strong);
        border-radius: 4px;
        background: var(--color-surface);
        color: var(--color-ink);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
    }
    .bib {
        display: grid;
        flex: none;
        place-items: center;
        min-width: 11px;
        color: var(--marble);
        font: 700 11px/1 var(--font-brand);
        font-variant-numeric: tabular-nums;
    }
    [data-display-name] {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .strike:not([opacity]),
    .board:not(.racing) .tails {
        display: none;
    }
    .board:not(.ready) .left {
        transform: translateX(-174px);
    }
    .board:not(.ready) .right {
        transform: translateX(174px);
    }
    @media (prefers-reduced-motion: no-preference) {
        .leaf {
            transition: transform 160ms ease-out;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .tails {
            display: none;
        }
    }
</style>
