<script lang="ts">
    import { SERVICE_NAME } from '#lib/branding.ts';
    import RiotAccountList from '#lib/components/me/RiotAccountList.svelte';
    import PrivacySettings from '#lib/components/me/PrivacySettings.svelte';
    import ChampionPreferences from '#lib/components/me/ChampionPreferences.svelte';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();
</script>

<svelte:head>
    <title>내 정보 | {SERVICE_NAME}</title>
</svelte:head>

<div class="flex w-full max-w-6xl min-w-0 flex-col gap-4">
    <h1 class="page-head text-title font-bold">내 정보</h1>
    <div class="grid min-w-0 items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <div class="panel min-w-0">
            <!-- 프로필 수정은 Discord에서 하므로 동작 없는 식별 정보로만 표시한다. -->
            <div class="flex items-center gap-3 border-b border-line px-4 py-3">
                {#if data.me.avatarUrl}
                    <img
                        src={data.me.avatarUrl}
                        alt=""
                        width="40"
                        height="40"
                        class="size-10 shrink-0 rounded-full object-cover"
                    />
                {:else}
                    <span
                        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-bold"
                        aria-hidden="true"
                    >
                        {data.me.displayName.slice(0, 1)}
                    </span>
                {/if}
                <div class="flex min-w-0 flex-col">
                    <span class="font-bold wrap-anywhere">{data.me.displayName}</span>
                    <span class="text-xs text-muted">Discord 계정으로 로그인했어요</span>
                </div>
            </div>
            <RiotAccountList groups={data.groups} />
        </div>

        <div class="flex min-w-0 flex-col gap-4">
            {#key data.me.userId}
                <ChampionPreferences
                    value={data.championPreferences}
                    preview={data.preview}
                    initialValues={form && 'action' in form && form.action === 'champions'
                        ? form.values
                        : undefined}
                    initialError={form && 'action' in form && form.action === 'champions' ? form.message : ''}
                />
                <PrivacySettings
                    privacy={data.privacy}
                    preview={data.preview}
                    initialValues={form && 'action' in form && form.action === 'privacy'
                        ? form.values
                        : undefined}
                    initialError={form && 'action' in form && form.action === 'privacy' ? form.message : ''}
                    initialWithdrawError={form && 'action' in form && form.action === 'withdraw'
                        ? form.message
                        : ''}
                />
            {/key}
        </div>
    </div>
</div>
