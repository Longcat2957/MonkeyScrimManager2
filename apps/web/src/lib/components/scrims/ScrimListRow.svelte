<script lang="ts">
	import DateBadge from '#lib/components/common/DateBadge.svelte';
	import LinkCell from '#lib/components/common/LinkCell.svelte';
	import StatusTag from '#lib/components/common/StatusTag.svelte';
	import { MY_REGISTRATION, SCRIM_STATUS, formationMethodLabel, scheduleParts } from '#lib/features/labels.ts';
	import type { ScrimListItem } from '#lib/features/scrims/types.ts';

	let { scrim, href, line = false }: { scrim: ScrimListItem; href: string; line?: boolean } = $props();

	const status = $derived(SCRIM_STATUS[scrim.status]);
	const schedule = $derived(scrim.scheduledAt ? scheduleParts(scrim.scheduledAt) : null);
	const mine = $derived(scrim.myRegistration ? MY_REGISTRATION[scrim.myRegistration] : undefined);
	// 날짜는 왼쪽 배지가 보여 준다. 모집 중에는 신청 현황이, 그 뒤에는 팀 구성이 판단에 필요하다. 미정인 편성 방식은 생략한다.
	const meta = $derived(
		[
			schedule && `${schedule.weekday} ${schedule.time}`,
			scrim.formationMethod && formationMethodLabel(scrim.formationMethod),
			scrim.status === 'recruit' ? `신청 ${scrim.registered}/${scrim.capacity}명` : `${scrim.teamCount}팀`
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<LinkCell {href} {line} title={scrim.title} subTitle={meta}>
	{#snippet leftChild()}
		<DateBadge iso={scrim.scheduledAt} emptyText="미정" />
	{/snippet}
	{#snippet detailChild()}
		<StatusTag text={status.text} state={status.state} />
	{/snippet}
	{#snippet infoChild()}
		{#if mine}
			<span
				class={[
					'text-xs',
					scrim.myRegistration === 'selected' && 'font-medium text-success',
					scrim.myRegistration === 'standby' && 'text-info',
					scrim.myRegistration === 'pending' && 'text-gray-500 dark:text-gray-400'
				]}
			>
				{mine}
			</span>
		{/if}
	{/snippet}
</LinkCell>
