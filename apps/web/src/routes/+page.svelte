<script lang="ts">
	import { dev } from '$app/env';
	import { resolve } from '$app/paths';
	import { SERVICE_NAME } from '#lib/branding.ts';

	// 빈 상세 페이지로 이동하기 위한 임시 경로 값이다.
	const guildId = 'devGuild001';
	const scrimId = 'devScrim001';
	const matchId = 'devMatch001';
	const playerId = 'devPlayer001';
	const shortcuts = [
		{ label: '내 정보', href: resolve('/me') },
		{ label: '백오피스', href: resolve('/backoffice') },
		{ label: '길드 홈', href: resolve('/g/[guildId]', { guildId }) },
		{ label: '내전 목록', href: resolve('/g/[guildId]/scrims', { guildId }) },
		{ label: '내전 상세', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }) },
		{ label: '팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams', { guildId, scrimId }) },
		{ label: '대진', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId }) },
		{ label: '매치 목록', href: resolve('/g/[guildId]/matches', { guildId }) },
		{ label: '매치 상세', href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId }) },
		{ label: '참가자 전적', href: resolve('/g/[guildId]/players/[playerId]', { guildId, playerId }) },
		{ label: '서버 통계', href: resolve('/g/[guildId]/stats', { guildId }) },
		{ label: '서버 관리', href: resolve('/g/[guildId]/admin', { guildId }) }
	];
</script>

<svelte:head>
	<meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<h1 class="font-brand text-4xl font-normal [font-synthesis:none]">{SERVICE_NAME}</h1>

{#if dev}
	<nav aria-labelledby="dev-shortcuts" class="mt-8">
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
{/if}
