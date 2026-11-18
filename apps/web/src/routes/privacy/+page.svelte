<script lang="ts">
    import { SERVICE_NAME } from '#lib/branding.ts';
    import PolicyNotice from '#lib/components/layout/PolicyNotice.svelte';
</script>

<svelte:head>
    <title>개인정보 처리방침 | {SERVICE_NAME}</title>
</svelte:head>

<PolicyNotice title="개인정보 처리방침" />
