<script lang="ts">
	import type { ScrimSummary } from '#lib/data/types.ts';
	import { formatDateTime } from '#lib/format.ts';
	import StatusState from '#lib/components/ui/StatusState.svelte';
	import { FORMATION_LABEL, SCRIM_STATUS } from '#lib/components/ui/status.ts';

	let { scrim, href }: { scrim: ScrimSummary; href: string } = $props();
</script>

<a {href} class="row">
	<div class="min-w-0">
		<p class="row-title">{scrim.title}</p>
		<p class="row-meta">
			{formatDateTime(scrim.expectedStartAt)}
			<span aria-hidden="true"> · </span>
			{scrim.formationMethod ? FORMATION_LABEL[scrim.formationMethod] : '편성 방식 미정'}
		</p>
	</div>
	<p class="row-num">{scrim.selectedCount} / {scrim.playingCapacity}</p>
	<div class="row-side"><StatusState status={SCRIM_STATUS[scrim.status]} /></div>
</a>
