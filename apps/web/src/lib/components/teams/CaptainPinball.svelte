<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import Button from '#lib/components/common/Button.svelte';
    import CheckboxField from '#lib/components/common/CheckboxField.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import SelectField from '#lib/components/common/SelectField.svelte';
    import { createCaptainRace } from '#lib/features/scrims/captain-pinball.ts';
    import CaptainPinballTrack, { colors } from './CaptainPinballTrack.svelte';
    import type { AuctionTeamView, FormationPlayer } from '#lib/features/scrims/formation.ts';

    let {
        players: candidates,
        slots,
        redraw,
        disabled,
        onassign
    }: {
        players: FormationPlayer[];
        slots: AuctionTeamView[];
        redraw: boolean;
        disabled: boolean;
        onassign: (ids: string[]) => void;
    } = $props();

    let excluded = $state<string[]>([]);
    const players = $derived(candidates.filter((player) => !excluded.includes(player.participantId)));
    const available = $derived(!disabled && slots.length > 0 && candidates.length >= slots.length);
    const canStart = $derived(available && players.length >= slots.length);
    const firstPlace = $derived(players.length - slots.length + 1);
    const lineup = $derived(
        JSON.stringify([slots.map((team) => team.id), candidates.map((p) => p.participantId)])
    );
    let entered = '';
    let open = $state(false);
    let phase = $state<'select' | 'ready' | 'running' | 'result'>('select');
    let race = $state.raw<ReturnType<typeof createCaptainRace> | null>(null);
    let arrived = $state(0);
    let standings = $state<number[]>([]);
    const active: number[] = [];
    let track = $state<CaptainPinballTrack>();
    let follow = $state('');
    let fast = $state(false);
    let stageHeading = $state<HTMLElement>();
    const cameraOptions = $derived([
        { value: '', label: '자동 중계' },
        ...players.map((player, i) => ({
            value: player.participantId,
            label: `${String(i + 1).padStart(2, '0')} · ${player.displayName}`
        }))
    ]);
    const target = $derived(players.findIndex((player) => player.participantId === follow));
    let frame = 0;

    function prepare() {
        if (!available) return;
        if (!open) excluded = [];
        stop();
        entered = lineup;
        race = null;
        phase = 'select';
        open = true;
        void tick().then(() => stageHeading?.focus({ preventScroll: true }));
    }

    function start() {
        if (!open || phase !== 'select' || !canStart || entered !== lineup) return;
        race = createCaptainRace(players.length);
        arrived = 0;
        standings = [];
        phase = 'ready';
        follow = '';
        fast = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        void tick().then(() => stageHeading?.focus({ preventScroll: true }));
        const releaseAt = performance.now() + 950;
        let previous = releaseAt;
        let remainder = 0;
        function animate(now: number) {
            if (!open || !available || entered !== lineup || phase === 'result') return;
            if (fast || now >= releaseAt) {
                phase = 'running';
                remainder += Math.max(0, Math.min(now - previous, 100));
                previous = now;
                const steps = Math.floor((remainder * 60) / 1000);
                remainder -= (steps * 1000) / 60;
                if (advance(fast ? 240 : steps)) return;
            }
            frame = requestAnimationFrame(animate);
        }
        frame = requestAnimationFrame(animate);
    }

    // 갱신 중 추첨 대상 팀이나 후보가 달라지면 예전 결과를 새 명단에 적용하지 않는다.
    $effect(() => {
        if (open && (!available || lineup !== entered)) open = false;
    });
    function stop() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
    }
    onDestroy(stop);

    function advance(steps: number) {
        if (!race || !open || !available || entered !== lineup) return;
        const { balls, finishOrder } = race;
        for (let i = 0; i < steps && finishOrder.length < balls.length; i++) race.step();
        arrived = finishOrder.length;
        active.length = 0;
        for (let i = 0; i < balls.length; i++) if (!balls[i]!.finished) active.push(i);
        active.sort((a, b) => balls[b]!.y - balls[a]!.y);
        for (let i = 0; i < slots.length; i++) {
            const position = firstPlace - 1 + i;
            standings[i] = position < arrived ? finishOrder[position]! : active[position - arrived]!;
        }
        if (arrived === balls.length) {
            phase = 'result';
            const last = finishOrder[arrived - 1]!;
            void tick().then(() => track?.paint(last));
            return true;
        }
        if (fast) return false;
        if (target >= 0 && balls[target]?.finished) follow = '';
        track?.paint(
            active[active.length - 1]!,
            target >= 0 && !balls[target]?.finished ? target : undefined
        );
        return false;
    }

    function assign() {
        if (!available || lineup !== entered || phase !== 'result') return;
        open = false;
        onassign(standings.map((i) => players[i]!.participantId));
    }
</script>

<Button size="sm" variant="primary" disabled={!available} onclick={prepare}>
    <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
    >
        <path d="M3.5 17V3.5h12v8h-12" stroke-linejoin="round" />
        <path d="M4 4h4v4H4zm4 4h4v3H8zm4-4h3v4h-3z" fill="currentColor" stroke="none" />
    </svg>
    {redraw ? '다시 추첨' : '핀볼 추첨'}
</Button>

<Dialog bind:open title="팀장 핀볼 추첨" wide={phase !== 'select'} onclose={stop}>
    {#if open && phase === 'select'}
        <fieldset>
            <legend class="mb-3">
                <span class="block text-xs font-semibold tabular-nums text-nexus">1 / 2</span>
                <span bind:this={stageHeading} tabindex="-1" class="mt-1 block text-lg font-bold"
                    >추첨에서 제외할 참가자</span
                >
            </legend>
            <div
                class="exclusions grid grid-cols-2 gap-px overflow-hidden rounded-form border border-line bg-line"
            >
                {#each candidates as player (player.participantId)}
                    <div class="min-w-0 bg-surface has-checked:bg-selected hover:bg-surface-hover">
                        <CheckboxField
                            label={player.displayName}
                            checked={excluded.includes(player.participantId)}
                            onchange={(checked) => {
                                excluded = checked
                                    ? [...excluded, player.participantId]
                                    : excluded.filter((id) => id !== player.participantId);
                            }}
                        />
                    </div>
                {/each}
            </div>
        </fieldset>
    {:else if open && phase !== 'select' && race}
        <div class="arena" class:result={phase === 'result'}>
            <section class="course" aria-label="경기장">
                <div class="race-bar">
                    <span class="inline-flex items-center gap-2 font-semibold">
                        <span class="text-xs font-semibold tabular-nums text-nexus">2 / 2</span>
                        <span class="signal" class:live={phase === 'running'}></span>
                        <span
                            >{phase === 'ready'
                                ? '출발선'
                                : phase === 'result'
                                  ? '결승선'
                                  : '레이스 중'}</span
                        >
                    </span>
                    {#if phase === 'ready' && !fast}
                        <span class="start-lights" aria-hidden="true"><i></i><i></i><i></i></span>
                    {/if}
                    <span class="text-muted">참가자 {players.length}명</span>
                </div>
                <CaptainPinballTrack bind:this={track} {race} {phase} {players} />
            </section>
            <section aria-labelledby="pinball-order" class="timing">
                <header class="timing-head" aria-live="polite" aria-atomic="true">
                    <h3 id="pinball-order" bind:this={stageHeading} tabindex="-1">
                        {phase === 'result' ? `팀장 ${slots.length}명 선발` : `마지막 ${slots.length}명 선발`}
                    </h3>
                    <span>{arrived} / {players.length}명 도착</span>
                </header>
                <ol
                    start={firstPlace}
                    aria-label={phase === 'result' ? '도착 순서' : '현재 선발권 순위'}
                    class="places"
                >
                    {#each slots as team, place (team.id)}
                        {@const rank = firstPlace + place}
                        {@const finished = rank <= arrived}
                        {@const index = standings[place]}
                        {@const player = index === undefined ? null : players[index]}
                        <li>
                            <span class="place">{String(rank).padStart(2, '0')}</span>
                            <div class="runner">
                                {#if player && index !== undefined}
                                    <strong>{player.displayName}</strong>
                                    {#if !finished}
                                        <span
                                            class="ball-ref"
                                            style:--ball={`var(--color-${colors[index % colors.length]})`}
                                        >
                                            구슬 #{String(index + 1).padStart(2, '0')}
                                        </span>
                                    {/if}
                                {:else}
                                    <span>{place === 0 ? '출발 대기' : '—'}</span>
                                {/if}
                            </div>
                            {#if finished}<span class="team">{team.name}</span>{/if}
                        </li>
                    {/each}
                </ol>
                {#if phase !== 'result'}
                    <div class="camera">
                        <SelectField label="중계 카메라" bind:value={follow} options={cameraOptions} />
                        <p class="mt-2 text-ui text-muted">
                            색 고리는 부스트 표시예요. 구슬마다 한 번씩 가속해요.
                        </p>
                    </div>
                {/if}
            </section>
        </div>
    {/if}
    {#snippet footer()}
        <div class="flex flex-wrap items-center justify-between gap-2">
            <p aria-live="polite" class="min-w-0 flex-[1_1_13rem] text-ui text-ink-2">
                {#if phase === 'select'}
                    {#if players.length < slots.length}
                        팀장 {slots.length}명을 뽑으려면 {slots.length - players.length}명이 더 필요해요.
                    {:else}
                        {players.length}명 출전 · 마지막 {slots.length}명 선발
                    {/if}
                {:else if phase === 'result'}
                    배정 후 설정을 저장하면 확정돼요.
                {:else}
                    닫으면 이번 추첨은 반영되지 않아요.
                {/if}
            </p>
            <div class="ml-auto flex flex-wrap justify-end gap-2">
                {#if phase === 'select'}
                    <Button variant="primary" disabled={!canStart} onclick={start}>추첨 시작</Button>
                {:else if phase === 'result'}
                    <Button variant="secondary" onclick={prepare}>다시 추첨</Button>
                    <Button variant="primary" onclick={assign}>팀장 배정</Button>
                {:else}
                    <Button variant="secondary" disabled={fast} onclick={() => (fast = true)}>
                        결과 바로 보기
                    </Button>
                {/if}
            </div>
        </div>
    {/snippet}
</Dialog>

<style>
    .exclusions :global(label) {
        width: 100%;
        min-height: 2.75rem;
        padding: 0.5rem 0.75rem;
        overflow-wrap: anywhere;
        cursor: pointer;
    }
    .arena {
        display: grid;
        grid-template-columns: minmax(0, 1.8fr) minmax(15rem, 1fr);
        align-items: stretch;
        gap: clamp(1rem, 2vw, 1.5rem);
    }
    .course {
        position: relative;
        min-width: 0;
        align-self: start;
        overflow: hidden;
        border: 1px solid var(--color-line-strong);
        border-radius: var(--radius-form);
        background: var(--color-ground);
    }
    .race-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--color-line);
        font-size: var(--text-ui);
    }
    .signal {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--color-muted);
    }
    .signal.live {
        background: var(--color-nexus);
    }
    .timing {
        min-width: 0;
        padding-top: 0.25rem;
    }
    .timing-head {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.25rem 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--color-line-strong);
    }
    .timing-head h3,
    .runner strong {
        color: var(--color-ink);
        font-weight: 700;
        line-height: 1.25;
    }
    .timing-head h3 {
        font-size: var(--text-title);
    }
    .timing-head > span,
    .runner > span {
        color: var(--color-muted);
        font-size: var(--text-ui);
        font-variant-numeric: tabular-nums;
    }
    .ball-ref {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
    }
    .ball-ref::before {
        content: '';
        width: 0.5rem;
        aspect-ratio: 1;
        border-radius: 50%;
        background: var(--ball);
    }
    .places li {
        display: grid;
        grid-template-columns: 2.75rem minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        min-height: 3.5rem;
        padding-block: 0.5rem;
        border-bottom: 1px solid var(--color-line);
    }
    .arena:not(.result) .places li:last-child {
        min-height: 5rem;
    }
    .place {
        font: 600 var(--text-title)/1 var(--font-brand);
        font-variant-numeric: tabular-nums;
        color: var(--color-muted);
    }
    .arena:not(.result) li:last-child .place {
        font-size: 2.25rem;
        color: var(--color-nexus);
    }
    .runner {
        display: grid;
        gap: 0.125rem;
        overflow-wrap: anywhere;
    }
    .arena:not(.result) li:last-child .runner strong {
        font-size: var(--text-title);
    }
    .result .runner strong {
        font-size: var(--text-title);
    }
    .result .place {
        color: var(--color-nexus);
    }
    .team {
        max-width: 6rem;
        text-align: end;
        overflow-wrap: anywhere;
        font-size: var(--text-ui);
        color: var(--color-ink-2);
    }
    .camera {
        padding-top: 1.25rem;
    }
    .start-lights {
        display: flex;
        gap: 0.375rem;
    }
    .start-lights i {
        width: 0.8rem;
        aspect-ratio: 1;
        border-radius: 50%;
        background: var(--color-line-strong);
        animation: ignite 0.18s both;
    }
    .start-lights i:nth-child(2) {
        animation-delay: 0.27s;
    }
    .start-lights i:nth-child(3) {
        animation-delay: 0.54s;
    }
    @keyframes ignite {
        to {
            background: var(--color-warning);
        }
    }
    @media (max-width: 43rem) {
        .arena {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.75rem;
        }
        .timing {
            padding: 0;
        }
        .timing-head {
            padding-bottom: 0.375rem;
        }
        .places li,
        .arena:not(.result) .places li:last-child {
            min-height: 2.5rem;
            grid-template-columns: 2rem minmax(0, 1fr) auto;
            gap: 0.5rem;
            padding-block: 0.375rem;
        }
        .runner {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: 0.125rem 0.5rem;
        }
        .arena:not(.result) li:last-child .place {
            font-size: 1.5rem;
        }
        .camera {
            padding-top: 0.75rem;
        }
        .result .course {
            display: none;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .start-lights {
            display: none;
        }
    }
</style>
