<script lang="ts">
    import SelectField from '#lib/components/common/SelectField.svelte';

    type Team = { id: string; name: string };
    let {
        label = '1세트 진영',
        teamA,
        teamB,
        value = $bindable(''),
        disabled = false
    }: { label?: string; teamA: Team; teamB: Team; value?: string; disabled?: boolean } = $props();
</script>

<SelectField
    {label}
    bind:value
    {disabled}
    options={[
        { value: '', label: '블루 팀 선택' },
        { value: teamA.id, label: `블루 ${teamA.name} · 레드 ${teamB.name}` },
        { value: teamB.id, label: `블루 ${teamB.name} · 레드 ${teamA.name}` }
    ]}
/>
