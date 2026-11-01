<script lang="ts">
	import PlayerFace from '#lib/components/common/PlayerFace.svelte';
	import type { BracketTeam } from '#lib/features/scrims/bracket.ts';

	// 팀 풀과 대진 자리가 같이 쓰는 팀 표시: 이름, 인원, 팀원 얼굴. 팀원 이름은 얼굴 옆이 좁아 보조기기용으로만 읽힌다.
	let { team }: { team: BracketTeam } = $props();
</script>

<span class="flex min-w-0 flex-1 items-center gap-3 text-left">
	<span class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-base font-semibold">{team.name}</span>
		<span class="truncate text-xs opacity-60">{team.members.map((member) => member.displayName).join(' · ')}</span>
	</span>
	<span aria-hidden="true" class="hidden shrink-0 -space-x-2 sm:flex">
		{#each team.members as member (member.id)}
			<PlayerFace name={member.displayName} imageUrl={member.iconUrl} size="sm" />
		{/each}
	</span>
</span>
