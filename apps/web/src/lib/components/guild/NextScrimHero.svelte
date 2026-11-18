<script lang="ts">
    import type { NextScrim } from '#lib/features/guild/types.ts';
    import { MY_REGISTRATION, formatSchedule, formationMethodLabel } from '#lib/features/labels.ts';

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
                  formatSchedule(scrim.scheduledAt),
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
    const fill = $derived(scrim ? Math.round((scrim.registered / scrim.capacity) * 100) : 0);
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

<!--
	서버 홈의 첫 화면. 페이지 화면 모드와 관계없이 어두운 바탕을 쓰는 게임 대시보드 영역이다.
	배경 아트는 장식이므로 대체 텍스트를 두지 않는다.
-->
<section
    aria-labelledby="next-scrim"
    class="inverse-surface relative isolate overflow-hidden rounded-(--radius-box) border border-line bg-ground text-ink"
>
    {#if next?.artUrl}
        <img
            src={next.artUrl}
            alt=""
            class="absolute inset-0 -z-10 size-full object-cover object-[75%_20%] opacity-80"
        />
        <div
            class="absolute inset-0 -z-10 bg-linear-to-r from-ground from-10% via-ground/85 to-ground/40"
        ></div>
    {/if}

    {#if next && scrim && href}
        <div class="flex flex-col">
            <div class="flex min-w-0 flex-col gap-2 px-4 py-5 sm:px-6 sm:py-6">
                <h2 id="next-scrim" class="max-w-3xl text-2xl font-bold text-balance">{scrim.title}</h2>
                <p class="flex flex-wrap items-center gap-2 text-ui font-medium text-ink/85">
                    {#if live}
                        <span
                            class="inline-flex items-center gap-1.5 rounded-(--radius-small) bg-error/90 px-2 py-0.5 text-nexus-ink"
                        >
                            <span
                                class="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none"
                            ></span>
                            LIVE
                        </span>
                    {/if}
                    {next.kind === 'mine' ? '내 다음 내전' : '지금 신청할 수 있는 모집'}
                    {#if mine}
                        <span
                            class={[
                                'rounded-(--radius-small) bg-ground/90 px-2 py-0.5',
                                scrim.myRegistration === 'selected' && 'text-success',
                                scrim.myRegistration === 'standby' && 'text-info'
                            ]}
                        >
                            {mine}
                        </span>
                    {/if}
                </p>
                <p class="text-sm text-ink/75">{meta}</p>
            </div>
            <div
                class="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-white/15 bg-ground/90 px-4 py-3 sm:px-6"
            >
                <!-- 시작 시각은 위 문구가 전달하므로 매초 바뀌는 카운트다운은 보조기기에 읽히지 않게 한다. -->
                {#if live}
                    <p class="text-lg font-bold">지금 진행 중</p>
                {:else if remaining === 0}
                    <p class="text-lg font-semibold">예정 시각이 지났어요</p>
                {:else if scrim.scheduledAt}
                    <div aria-hidden="true" class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span class="text-xs text-ink/75">시작까지</span>
                        {#snippet clock(days: string, hours: string, minutes: string, seconds: string)}
                            <span class="flex flex-wrap items-baseline gap-x-2">
                                {#each [[days, '일'], [hours, '시간'], [minutes, '분'], [seconds, '초']] as [value, unit] (unit)}
                                    <span class="inline-flex items-baseline gap-0.5">
                                        <span class="text-xl font-bold tabular-nums">{value}</span>
                                        <span class="text-micro text-ink/75">{unit}</span>
                                    </span>
                                {/each}
                            </span>
                        {/snippet}
                        {#if countdown}
                            {@render clock(
                                countdown.days,
                                countdown.hours,
                                countdown.minutes,
                                countdown.seconds
                            )}
                        {:else}
                            {@render clock('-', '--', '--', '--')}
                        {/if}
                    </div>
                {:else}
                    <p class="text-base font-semibold">일정이 정해지지 않았어요</p>
                {/if}

                {#if scrim.status === 'recruit'}
                    <div class="flex w-44 max-w-full flex-col gap-1.5">
                        <div class="flex justify-between text-xs text-ink/75">
                            <span>신청 현황</span>
                            <span class="tabular-nums">{scrim.registered}/{scrim.capacity}명</span>
                        </div>
                        <div
                            role="progressbar"
                            aria-label="신청 인원"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={fill}
                            class="h-0.5 w-full overflow-hidden rounded-full bg-white/15"
                        >
                            <div class="h-full bg-nexus" style:width={`${fill}%`}></div>
                        </div>
                    </div>
                {/if}

                <div class="sm:ms-auto">
                    <a
                        {href}
                        class="inline-flex min-h-9 items-center gap-2 rounded-(--radius-form) bg-nexus px-4 text-ui font-semibold text-nexus-ink no-underline hover:bg-nexus-hover focus-visible:outline-ink pointer-coarse:min-h-11"
                    >
                        {cta}
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            aria-hidden="true"
                        >
                            <path d="M5 12h14m-6-6 6 6-6 6" />
                        </svg>
                    </a>
                </div>
            </div>
        </div>
    {:else}
        <div class="flex flex-col gap-1 p-5">
            <h2 id="next-scrim" class="text-base font-semibold">지금 참가할 내전이 없어요</h2>
            <p class="text-sm text-ink/70">새 모집이 열리면 여기에 가장 먼저 보여요.</p>
        </div>
    {/if}
</section>
