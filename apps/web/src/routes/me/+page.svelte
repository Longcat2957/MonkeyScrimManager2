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

<div class="grid w-full max-w-6xl min-w-0 gap-6">
    <header
        class="grid min-w-0 items-center gap-x-6 gap-y-3 border-b border-line pb-3 md:grid-cols-[minmax(0,1fr)_auto]"
    >
        <div class="flex min-w-0 items-center gap-3">
            <!-- 프로필 수정은 Discord에서 하므로 동작 없는 식별 정보로만 표시한다. -->
            {#if data.me.avatarUrl}
                <img
                    src={data.me.avatarUrl}
                    alt=""
                    width="40"
                    height="40"
                    class="size-12 shrink-0 rounded-box object-cover"
                />
            {:else}
                <span
                    class="flex size-12 shrink-0 items-center justify-center rounded-box border border-line bg-surface-2 text-lg font-bold text-nexus"
                    aria-hidden="true"
                >
                    {data.me.displayName.slice(0, 1)}
                </span>
            {/if}
            <div class="min-w-0">
                <h1 class="text-title font-bold">내 정보</h1>
                <p class="flex flex-wrap items-baseline gap-x-2 text-ui">
                    <strong class="wrap-anywhere">{data.me.displayName}</strong>
                    <span class="text-muted">Discord 계정으로 로그인했어요</span>
                </p>
            </div>
        </div>
        <nav aria-label="내 정보" class="flex flex-wrap gap-x-4 text-ui font-semibold text-ink-2">
            <a href="#riot-accounts" class="inline-flex min-h-11 items-center hover:text-nexus">Riot 계정</a>
            <a href="#privacy" class="inline-flex min-h-11 items-center hover:text-nexus">공개 설정</a>
            <a href="#champion-preferences" class="inline-flex min-h-11 items-center hover:text-nexus"
                >선호 챔피언</a
            >
        </nav>
    </header>

    {#key data.me.userId}
        <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <RiotAccountList groups={data.groups} />
            <div class="grid min-w-0 gap-2">
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
            </div>
        </div>
        <ChampionPreferences
            value={data.championPreferences}
            preview={data.preview}
            initialValues={form && 'action' in form && form.action === 'champions' ? form.values : undefined}
            initialError={form && 'action' in form && form.action === 'champions' ? form.message : ''}
        />
    {/key}
</div>
