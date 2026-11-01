<script lang="ts">
	import { dev } from '$app/env';
	import { resolve } from '$app/paths';
	import { Steps } from 'stdf';
	import type { StepsItemProps } from 'stdf';
	import { SERVICE_NAME } from '#lib/branding.ts';

	// 진행 상태가 아니라 흐름 설명이다. 회색 '예정' 모양은 읽기 어려워 모든 단계를 완료 모양(테마색)으로 그린다.
	const FLOW: StepsItemProps[] = [
		['모집', '디스코드 서버 멤버가 Riot 계정과 희망 포지션으로 신청해요'],
		['팀 편성', '운영자가 직접 나누거나 경매로 팀을 꾸려요'],
		['대진', '팀을 준결승·결승 자리에 배치하고 경기 방식을 정해요'],
		['ROFL 기록', '리플레이 파일을 올리면 결과와 전적이 바로 쌓여요']
	].map(([title, desc], index) => {
		const step = { title, desc, bar: { type: 'string' as const, content: String(index + 1) } };
		return { step, finishStep: step };
	});

	// 개발 화면으로 이동하기 위한 임시 경로 값이다.
	const guildId = 'devGuild001';
	const scrimId = 'devScrim001';
	// 편성 화면은 편성 방식이 맞는 준비 단계 내전으로 연결한다.
	const manualScrimId = 'devScrim007';
	const auctionScrimId = 'devScrim002';
	// 대진 운영은 팀 편성이 끝난 내전에서 팀을 대진 자리에 직접 배치한다.
	const bracketScrimId = 'devScrim008';
	const completedBracketScrimId = 'devScrim005';
	const matchId = 'devMatch001';
	const userId = 'devUser001';
	const devTools = [
		{ label: '컴포넌트 테스트', href: resolve('/dev/components') },
		{ label: '에러 페이지', href: resolve('/dev/error') }
	];
	const shortcuts = [
		{ label: '내 정보', href: resolve('/me') },
		{ label: '백오피스', href: resolve('/backoffice') },
		{ label: '서버 홈', href: resolve('/g/[guildId]', { guildId }) },
		{ label: '내전 목록', href: resolve('/g/[guildId]/scrims', { guildId }) },
		{ label: '내전 상세', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }) },
		{ label: '팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams', { guildId, scrimId }) },
		{ label: '수동 팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams/manual', { guildId, scrimId: manualScrimId }) },
		{ label: '경매', href: resolve('/g/[guildId]/scrims/[scrimId]/teams/auction', { guildId, scrimId: auctionScrimId }) },
		{ label: '대진 운영', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId: bracketScrimId }) },
		{ label: '대진 결과', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId: completedBracketScrimId }) },
		{ label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId }) },
		{ label: '경기 상세', href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId }) },
		{ label: '참가자 전적', href: resolve('/g/[guildId]/players/[userId]', { guildId, userId }) },
		{ label: '서버 통계', href: resolve('/g/[guildId]/stats', { guildId }) },
		{ label: '서버 관리', href: resolve('/g/[guildId]/admin', { guildId }) }
	];
</script>

<svelte:head>
	<title>{SERVICE_NAME}</title>
	<meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<!-- 워드마크는 헤더에 있으므로 본문에서 다시 크게 쓰지 않는다. 시작(로그인·서버 선택)도 헤더가 맡는다. -->
<section aria-labelledby="intro" class="flex max-w-3xl flex-col gap-4">
	<h1 id="intro" class="text-3xl font-bold text-balance md:text-4xl">디스코드 내전, 모집부터 전적까지</h1>
	<p class="text-lg opacity-80">
		{SERVICE_NAME}는 리그 오브 레전드 내전의 모집·팀 편성·대진을 한곳에서 운영하고, 리플레이 파일로 결과와 전적을 자동으로 기록해요.
	</p>
</section>
<!-- STDF 가로 Steps는 설명(desc)을 그리지 않으므로 화면 폭과 관계없이 세로로 둔다. -->
<section aria-label="이용 흐름" class="mt-10 max-w-xl">
	<Steps steps={FLOW} current={FLOW.length + 1} radius="full" vertical />
</section>

{#if dev}
	<nav aria-labelledby="dev-shortcuts" class="mt-12 border-t border-border pt-6">
		<h2 id="dev-shortcuts" class="text-lg font-semibold">개발 바로가기</h2>
		<ul class="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each shortcuts as shortcut (shortcut.href)}
				<li class="min-w-0">
					<a
						href={shortcut.href}
						class="flex flex-col items-start gap-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4"
					>
						<span class="underline underline-offset-4">{shortcut.label}</span>
						<code class="max-w-full text-sm break-all opacity-70">{shortcut.href}</code>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<nav aria-label="개발 도구" class="mt-12 border-t border-border pt-6">
		<ul class="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each devTools as tool (tool.href)}
				<li>
					<a
						href={tool.href}
						data-sveltekit-preload-data="off"
						class="inline-flex flex-col items-start gap-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-4"
					>
						<span class="underline underline-offset-4">{tool.label}</span>
						<code class="text-sm opacity-70">{tool.href}</code>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}
