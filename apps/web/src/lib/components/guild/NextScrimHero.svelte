<script lang="ts">
	import { onMount } from 'svelte';
	import { CountDown, Progress } from 'stdf';
	import type { NextScrim } from '#lib/features/guild/types.ts';
	import { MY_REGISTRATION, formatSchedule, formationMethodLabel } from '#lib/features/labels.ts';

	let { next, href }: { next: NextScrim | null; href: string | null } = $props();

	// 남은 시간은 브라우저 시각 기준이라 SSR과 맞지 않으므로 마운트 후에만 센다.
	let now = $state<number | null>(null);
	onMount(() => {
		now = Date.now();
	});

	const scrim = $derived(next?.scrim);
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
	const mine = $derived(next?.kind === 'mine' && scrim?.myRegistration ? MY_REGISTRATION[scrim.myRegistration] : null);
	const cta = $derived(live ? '진행 상황 보기' : next?.kind === 'open' ? '신청하러 가기' : '내전 보기');
	const fill = $derived(scrim ? Math.round((scrim.registered / scrim.capacity) * 100) : 0);
	const pad = (value: number) => String(value).padStart(2, '0');
</script>

<!--
	서버 홈의 첫 화면. 페이지 화면 모드와 관계없이 어두운 바탕을 쓰는 게임 대시보드 영역이다.
	배경 아트는 장식이므로 대체 텍스트를 두지 않는다.
-->
<section
	aria-labelledby="next-scrim"
	class="relative isolate overflow-hidden rounded-(--radius-box) bg-bg-base-dark text-text-dark ring-1 ring-white/10"
>
	{#if next?.artUrl}
		<img
			src={next.artUrl}
			alt=""
			class="absolute inset-0 -z-10 size-full object-cover object-[75%_20%] opacity-80"
		/>
		<div
			class="absolute inset-0 -z-10 bg-linear-to-t from-bg-base-dark from-40% via-bg-base-dark/85 to-bg-base-dark/55 md:bg-linear-to-r md:from-35% md:via-bg-base-dark/80 md:to-bg-base-dark/10"
		></div>
	{/if}

	{#if next && scrim && href}
		<div class="flex flex-col gap-6 p-6 md:p-8 lg:max-w-[38rem]">
			<div class="flex flex-col gap-3">
				<p class="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wider text-text-dark/70">
					{#if live}
						<span class="inline-flex items-center gap-1.5 rounded-full bg-error/90 px-2 py-0.5 text-white">
							<span class="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none"></span>
							LIVE
						</span>
					{/if}
					{next.kind === 'mine' ? '내 다음 내전' : '지금 신청할 수 있는 모집'}
					{#if mine}
						<span
							class={[
								'rounded-full px-2 py-0.5',
								scrim.myRegistration === 'selected' && 'bg-success/20 text-success',
								scrim.myRegistration === 'standby' && 'bg-info/20 text-info',
								scrim.myRegistration === 'pending' && 'bg-white/10 text-text-dark'
							]}
						>
							{mine}
						</span>
					{/if}
				</p>
				<h2 id="next-scrim" class="text-2xl font-bold text-balance md:text-3xl">{scrim.title}</h2>
				<p class="text-sm text-text-dark/75">{meta}</p>
			</div>

			<!-- 시작 시각은 위 문구가 전달하므로 매초 바뀌는 카운트다운은 보조기기에 읽히지 않게 한다. -->
			{#if live}
				<p class="text-3xl font-bold md:text-4xl">지금 진행 중</p>
			{:else if scrim.scheduledAt}
				<div aria-hidden="true" class="flex flex-col gap-2">
					<span class="text-xs font-semibold tracking-wider text-text-dark/60">시작까지</span>
					{#snippet clock(days: string, hours: string, minutes: string, seconds: string)}
						<span class="flex items-end gap-2">
							{#each [[days, '일'], [hours, '시간'], [minutes, '분'], [seconds, '초']] as [value, unit] (unit)}
								<span class="flex min-w-14 flex-col items-center rounded-(--radius-form) bg-white/10 px-2 py-2 backdrop-blur-sm">
									<span class="text-2xl font-bold tabular-nums md:text-3xl">{value}</span>
									<span class="text-[0.6875rem] text-text-dark/60">{unit}</span>
								</span>
							{/each}
						</span>
					{/snippet}
					{#if remaining !== null}
						<CountDown time={remaining}>
							{#snippet children({ days, hours, minutes, seconds })}
								{@render clock(String(days), pad(hours), pad(minutes), pad(seconds))}
							{/snippet}
						</CountDown>
					{:else}
						{@render clock('-', '--', '--', '--')}
					{/if}
				</div>
			{:else}
				<p class="text-xl font-bold">일정이 정해지지 않았어요</p>
			{/if}

			{#if scrim.status === 'recruit'}
				<div class="flex max-w-sm flex-col gap-2">
					<div class="flex justify-between text-xs text-text-dark/75">
						<span>신청 현황</span>
						<span class="tabular-nums">{scrim.registered}/{scrim.capacity}명</span>
					</div>
					<Progress percent={fill} percentPosition={null} height="2" injClass="bg-text-dark!" trackInjClass="bg-white/15!" />
				</div>
			{/if}

			<div>
				<a
					{href}
					class="inline-flex items-center gap-2 rounded-(--radius-form) bg-text-dark px-5 py-3 text-sm font-semibold text-bg-base-dark no-underline hover:bg-white focus-visible:outline-text-dark"
				>
					{cta}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path d="M5 12h14m-6-6 6 6-6 6" />
					</svg>
				</a>
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-1 p-6 md:p-8">
			<h2 id="next-scrim" class="text-xl font-bold">지금 참가할 내전이 없어요</h2>
			<p class="text-sm text-text-dark/70">새 모집이 열리면 여기에 가장 먼저 보여요.</p>
		</div>
	{/if}
</section>
