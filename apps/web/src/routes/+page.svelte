<script lang="ts">
	import { dev } from '$app/env';
	import { resolve } from '$app/paths';
	import { SERVICE_NAME } from '#lib/branding.ts';
	import { pageTitle } from '#lib/shell/titles.ts';

	// 개발용 표본 ID. 목 데이터(lib/mocks)의 실제 값과 같아야 각 화면을 열 수 있다.
	const guildId = 'monkey-dorm';
	const scrimId = 'scrim-1001';
	const paidScrimId = 'scrim-1003';
	const matchId = 'match-1004-1';
	const playerId = 'user-demo';

	const groups = [
		{
			title: '서버',
			links: [
				{ label: '서버 홈', href: resolve('/g/[guildId]', { guildId }) },
				{ label: '내전 목록', href: resolve('/g/[guildId]/scrims', { guildId }) },
				{ label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId }) },
				{ label: '통계', href: resolve('/g/[guildId]/stats', { guildId }) },
				{ label: '관리', href: resolve('/g/[guildId]/admin', { guildId }) }
			]
		},
		{
			title: '내전',
			links: [
				{ label: '요약 · 모집 중', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }) },
				{
					label: '요약 · 진행 중',
					href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId: paidScrimId })
				},
				{ label: '팀 편성', href: resolve('/g/[guildId]/scrims/[scrimId]/teams', { guildId, scrimId }), note: '준비 중' },
				{
					label: '엔트리 편성',
					href: resolve('/g/[guildId]/scrims/[scrimId]/teams/manual', { guildId, scrimId }),
					note: '준비 중'
				},
				{
					label: '경매 편성',
					href: resolve('/g/[guildId]/scrims/[scrimId]/teams/auction', { guildId, scrimId }),
					note: '준비 중'
				},
				{ label: '대진', href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', { guildId, scrimId }), note: '준비 중' }
			]
		},
		{
			title: '기록',
			links: [
				{ label: '경기 상세 · 종료', href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId }) },
				{
					label: '경기 상세 · 진행 중',
					href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId: 'match-1003-1' })
				},
				{ label: '사용자 전적', href: resolve('/g/[guildId]/players/[playerId]', { guildId, playerId }) }
			]
		},
		{
			title: '전역',
			links: [
				{ label: '내 정보', href: resolve('/me') },
				{ label: '이용 문서', href: resolve('/docs') },
				{ label: '백오피스', href: resolve('/backoffice') }
			]
		}
	];

	const devTools = [
		{ label: '컴포넌트 갤러리', href: resolve('/dev/components') },
		{ label: '오류 404', href: resolve('/dev/error') },
		{ label: '오류 500', href: `${resolve('/dev/error')}?status=500` }
	];
</script>

<svelte:head>
	<title>{pageTitle()}</title>
	<meta name="description" content="리그 오브 레전드 내전 운영과 전적 기록" />
</svelte:head>

<h1 class="font-brand text-[44px] leading-none font-normal [font-synthesis:none]">{SERVICE_NAME}</h1>
<p class="measure mt-2 text-[13px] text-mut">내전 모집부터 팀 편성, 대진, 전적 기록까지 한 곳에서 운영합니다.</p>

{#if dev}
	<div class="mt-10 space-y-8">
		{#each groups as group (group.title)}
			<section aria-labelledby={`group-${group.title}`}>
				<div class="region">
					<span class="lbl" id={`group-${group.title}`}>{group.title}</span>
				</div>
				<div class="panel">
					{#each group.links as link (link.href)}
						<a href={link.href} class="row">
							<span class="row-title">{link.label}</span>
							<span class="row-meta">{link.note ?? ''}</span>
							<span class="row-side text-faint" aria-hidden="true">→</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}

		<section aria-labelledby="devtools">
			<div class="region"><span class="lbl" id="devtools">개발 도구</span></div>
			<div class="panel">
				{#each devTools as tool (tool.href)}
					<a href={tool.href} data-sveltekit-preload-data="off" class="row">
						<span class="row-title">{tool.label}</span>
						<span class="row-meta">{tool.href}</span>
						<span></span>
					</a>
				{/each}
			</div>
		</section>
	</div>
{/if}
