<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import type { NextScrim } from '#lib/features/guild/types.ts';
    import {
        MY_REGISTRATION,
        SCRIM_STATUS,
        formatSchedule,
        formationMethodLabel
    } from '#lib/features/labels.ts';
    import StatusTag from '#lib/components/common/StatusTag.svelte';

    let { next, href }: { next: NextScrim | null; href: string | null } = $props();

    // 남은 시간은 브라우저에서만 계산하고 내전·일정이 바뀌면 현재 시각에서 다시 센다.
    let now = $state<number | null>(null);

    const scrim = $derived(next?.scrim);
    $effect(() => {
        void scrim?.id;
        void scrim?.scheduledAt;
        now = Date.now();
    });
    const live = $derived(scrim?.status === 'in_progress');
    const remaining = $derived(
        now !== null && scrim?.scheduledAt ? Math.max(0, Date.parse(scrim.scheduledAt) - now) : null
    );
    const meta = $derived(
        scrim
            ? [
                  scrim.formationMethod && formationMethodLabel(scrim.formationMethod),
                  `${scrim.teamCount}팀`,
                  next?.hardFearless && '하드 피어리스'
              ]
                  .filter(Boolean)
                  .join(' · ')
            : ''
    );
    const mine = $derived(
        next?.kind === 'mine' && scrim?.myRegistration ? MY_REGISTRATION[scrim.myRegistration] : null
    );
    const cta = $derived(live ? '진행 상황 보기' : next?.kind === 'open' ? '신청하러 가기' : '내전 보기');
    const pad = (value: number) => String(value).padStart(2, '0');
    const countdown = $derived.by(() => {
        if (remaining === null) return null;
        const total = Math.floor(remaining / 1000);
        return {
            days: String(Math.floor(total / 86400)),
            hours: pad(Math.floor((total % 86400) / 3600)),
            minutes: pad(Math.floor((total % 3600) / 60)),
            seconds: pad(total % 60)
        };
    });
    // 카운트다운은 1초마다 현재 시각에서 다시 계산하고, 예정 시각이 지나면 멈춘다.
    $effect(() => {
        if (!scrim?.scheduledAt || live) return;
        const deadline = Date.parse(scrim.scheduledAt);
        if (deadline <= Date.now()) return;
        const timer = setInterval(() => {
            now = Date.now();
            if (Date.now() >= deadline) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    });
</script>

<section
    aria-labelledby="next-scrim"
    class="panel grid min-w-0 items-center gap-3 px-4 py-3 @min-[46rem]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
>
    {#if next && scrim && href}
        <div class="flex min-w-0 items-center gap-3">
            {#if next.artUrl}
                <img
                    src={next.artUrl}
                    alt=""
                    width="48"
                    height="48"
                    class="size-12 shrink-0 rounded-small object-cover object-[64%_20%]"
                />
            {/if}
            <div class="min-w-0">
                <h2 id="next-scrim" class="text-xl font-bold wrap-anywhere">{scrim.title}</h2>
                <p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                    {next.kind === 'mine' ? '내 다음 내전' : '지금 신청할 수 있는 모집'}
                    <StatusTag
                        text={SCRIM_STATUS[scrim.status].text}
                        state={SCRIM_STATUS[scrim.status].state}
                    />
                </p>
            </div>
        </div>
        <div class="min-w-0">
            <p class="text-ui font-semibold tabular-nums">
                {#if scrim.scheduledAt}
                    <time datetime={scrim.scheduledAt}>{formatSchedule(scrim.scheduledAt)}</time>
                {:else}
                    일정이 정해지지 않았어요
                {/if}
            </p>
            <p class="mt-1 text-ui text-muted">{meta}</p>
            {#if live}
                <p class="mt-2 text-ui font-medium">지금 진행 중</p>
            {:else if remaining === 0}
                <p class="mt-2 text-ui text-muted">예정 시각이 지났어요</p>
            {:else if countdown}
                <!-- 시작 시각은 위 문구가 전달하므로 매초 바뀌는 카운트다운은 보조기기에 읽히지 않게 한다. -->
                <p aria-hidden="true" class="mt-2 text-ui tabular-nums text-ink-2">
                    시작까지 <b>{countdown.days}</b>일 <b>{countdown.hours}</b>시간
                    <b>{countdown.minutes}</b>분 <b>{countdown.seconds}</b>초
                </p>
            {/if}
        </div>
        <div class="flex flex-wrap items-center gap-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <Button {href} variant="primary">{cta}</Button>
                {#if mine}
                    <span
                        class={[
                            'text-ui font-medium',
                            scrim.myRegistration === 'selected' && 'text-success',
                            scrim.myRegistration === 'standby' && 'text-info'
                        ]}>{mine}</span
                    >
                {/if}
            </div>
            {#if scrim.status === 'recruit'}
                <div>
                    <div class="flex flex-wrap items-baseline justify-between gap-1 text-ui">
                        <span class="text-muted">신청 현황</span>
                        <span class="font-semibold tabular-nums">{scrim.registered}/{scrim.capacity}명</span>
                    </div>
                    <progress
                        value={scrim.registered}
                        max={scrim.capacity}
                        aria-label="신청 인원"
                        class="mt-2 block h-1 w-full overflow-hidden rounded-full bg-line accent-nexus [&::-moz-progress-bar]:bg-nexus [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-nexus"
                    ></progress>
                </div>
            {/if}
        </div>
    {:else}
        <div class="col-span-full">
            <h2 id="next-scrim" class="font-semibold">지금 참가할 내전이 없어요</h2>
            <p class="mt-2 text-sm text-muted">새 모집이 열리면 여기에 가장 먼저 보여요.</p>
        </div>
    {/if}
</section>
