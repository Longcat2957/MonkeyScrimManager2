<script lang="ts">
    import RecordTabs from '#lib/components/stats/RecordTabs.svelte';
    let { children } = $props();
</script>

<RecordTabs />
{@render children()}
