<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import TextField from '#lib/components/common/TextField.svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';
    import { goto } from '$app/navigation';
    import { navigating, page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import DiscordSettingRow from '#lib/components/admin/DiscordSettingRow.svelte';
    import GuildAuditHistory from '#lib/components/admin/GuildAuditHistory.svelte';
    import GuildSeasonManagement from '#lib/components/admin/GuildSeasonManagement.svelte';
    import MemberAuctionPriceField from '#lib/components/admin/MemberAuctionPriceField.svelte';
    import MemberRiotAccountsDialog from '#lib/components/admin/MemberRiotAccountsDialog.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { DiscordChannel, GuildDiscordSettingKey } from '#lib/features/guild/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();
    const number = new Intl.NumberFormat('ko-KR');

    let query = $state('');
    // Riot 계정을 관리 중인 멤버. 저장 후 다시 불러온 목록에서 같은 멤버를 찾아 최신 계정을 보여 준다.
    let accountsFor = $state<string | null>(null);
    let accountsOpen = $state(false);
    const accountsMember = $derived(data.members.find((member) => member.userId === accountsFor) ?? null);
    $effect(() => {
        query = data.q;
    });

    const TABS = [
        { key: 'members', text: '멤버' },
        { key: 'discord', text: 'Discord 연동' },
        { key: 'audit', text: '변경 이력' },
        { key: 'seasons', text: '시즌' }
    ] as const;
    const active = $derived(TABS.findIndex((tab) => tab.key === data.tab));

    // 탭을 바꾸면 멤버 검색·페이지는 초기화한다.
    function selectTab(index: number) {
        const url = new URL(page.url.href);
        url.searchParams.delete('q');
        url.searchParams.delete('page');
        url.searchParams.delete('tab');
        const key = TABS[index]!.key;
        if (key !== 'members') url.searchParams.set('tab', key);
        goto(url, { reset: false });
    }

    function navigate(params: { q?: string; page?: number }) {
        const url = new URL(page.url.href);
        if (params.q !== undefined) {
            url.searchParams.delete('page');
            if (params.q.trim()) url.searchParams.set('q', params.q.trim());
            else url.searchParams.delete('q');
        }
        if (params.page !== undefined) {
            if (params.page === 1) url.searchParams.delete('page');
            else url.searchParams.set('page', String(params.page));
        }
        goto(url, { reset: false });
    }

    // 저장 중인 Discord 연동 항목
    let savingKey = $state<GuildDiscordSettingKey | null>(null);

    async function saveDiscord(key: GuildDiscordSettingKey, value: string | null) {
        if (savingKey || !data.discord || data.discord.settings[key] === value) return null;
        savingKey = key;
        try {
            return await postAction('discord', { key, value: value ?? '' });
        } finally {
            savingKey = null;
        }
    }

    const NONE = '설정 안 함';
    const CURRENT = { current: true, desc: '현재 설정', disabled: true } as const;
    const channelName = (channel: DiscordChannel) =>
        `${channel.category ? `${channel.category} / ` : ''}#${channel.name}`;

    // 선택지 맨 앞은 항상 '설정 안 함'이다. 현재 값은 표시만 하고 다시 고를 수 없게 한다.
    function choices<T extends { id: string }>(
        items: T[],
        current: string | null,
        toAction: (item: T) => MenuAction,
        none: Partial<MenuAction> = {}
    ): MenuAction[] {
        return [
            { ...none, content: NONE, ...(current === null ? CURRENT : {}) },
            ...items.map((item) => ({ ...toAction(item), ...(item.id === current ? CURRENT : {}) }))
        ];
    }

    const discord = $derived.by(() => {
        if (!data.discord) return null;
        const { roles, channels, settings, actorRoleIds } = data.discord;
        const channelChoices = (current: string | null) =>
            choices(channels, current, (channel) => ({
                content: channelName(channel),
                desc: channel.botCanPost ? undefined : '봇이 글을 쓸 수 없어요',
                disabled: !channel.botCanPost
            }));
        const roleName = roles.find((role) => role.id === settings.operatorRoleId)?.name;
        const channelLabel = (id: string | null) => {
            const channel = channels.find((item) => item.id === id);
            return channel ? `#${channel.name}` : NONE;
        };
        return [
            {
                key: 'operatorRoleId',
                label: '운영자 역할',
                description: '이 역할이나 Discord 서버 관리 권한이 있는 멤버가 서버 관리자예요',
                value: roleName ? `@${roleName}` : NONE,
                // 바꾼 뒤에도 내가 관리자로 남는 선택지만 고를 수 있다.
                actions: choices(
                    roles,
                    settings.operatorRoleId,
                    (role) => {
                        const locked = actorRoleIds !== null && !actorRoleIds.includes(role.id);
                        return {
                            content: `@${role.name}`,
                            desc: locked ? '내가 가진 역할이 아니에요' : undefined,
                            disabled: locked
                        };
                    },
                    actorRoleIds !== null
                        ? { desc: 'Discord 서버 관리 권한이 있어야 비울 수 있어요', disabled: true }
                        : {}
                ),
                ids: [null, ...roles.map((role) => role.id)]
            },
            {
                key: 'recruitmentChannelId',
                label: '모집 채널',
                description: '내전 모집 글을 올리고 참가 신청을 받아요',
                value: channelLabel(settings.recruitmentChannelId),
                actions: channelChoices(settings.recruitmentChannelId),
                ids: [null, ...channels.map((channel) => channel.id)]
            },
            {
                key: 'entryChannelId',
                label: '엔트리 채널',
                description: '확정된 팀 구성을 올려 밸런스를 확인해요',
                value: channelLabel(settings.entryChannelId),
                actions: channelChoices(settings.entryChannelId),
                ids: [null, ...channels.map((channel) => channel.id)]
            },
            {
                key: 'resultChannelId',
                label: '결과 채널',
                description: '끝난 내전의 결과를 올려요',
                value: channelLabel(settings.resultChannelId),
                actions: channelChoices(settings.resultChannelId),
                ids: [null, ...channels.map((channel) => channel.id)]
            }
        ] satisfies { key: GuildDiscordSettingKey; ids: (string | null)[]; [key: string]: unknown }[];
    });
</script>

<svelte:head>
    <title>서버 관리 | {SERVICE_NAME}</title>
</svelte:head>

<div class="grid w-full max-w-7xl min-w-0 items-start gap-4 xl:grid-cols-[11rem_minmax(0,1fr)] xl:gap-x-6">
    <h1 class="page-head col-span-full text-title font-bold">서버 관리</h1>

    <!-- 탭 묶음에 이름을 붙이고, 선택한 내용은 영역 제목으로 알린다. -->
    <div
        role="group"
        aria-label="관리 항목"
        class="grid min-w-0 grid-cols-2 gap-1 rounded-box border border-line bg-surface p-1 sm:grid-cols-4 xl:sticky xl:top-6 xl:grid-cols-1"
    >
        {#each TABS as tab, index (tab.key)}
            <button
                type="button"
                aria-pressed={active === index}
                class={[
                    'min-h-11 rounded-form border px-3 text-sm font-semibold xl:text-left',
                    active === index
                        ? 'border-nexus bg-selected text-ink'
                        : 'border-transparent text-ink-2 hover:bg-surface-hover hover:text-ink'
                ]}
                onclick={() => selectTab(index)}>{tab.text}</button
            >
        {/each}
    </div>

    {#if data.tab === 'seasons' && data.seasons}
        <GuildSeasonManagement
            overview={data.seasons}
            initialName={form && 'values' in form ? (form.values?.name ?? '') : ''}
            initialError={form && 'action' in form && form.action === 'rotateSeason' ? form.message : ''}
        />
    {:else if data.tab === 'audit' && data.audit}
        <section aria-labelledby="audit" class="panel min-w-0" aria-busy={Boolean(navigating.to)}>
            <h2 id="audit" class="panel-bar font-bold">변경 이력</h2>
            <GuildAuditHistory entries={data.audit.entries} total={data.audit.total} />
            <PageNav
                total={data.audit.total}
                pageSize={data.pageSize}
                current={data.page}
                label="변경 이력 쪽 이동"
                onchange={(current) => navigate({ page: current })}
            />
        </section>
    {:else if data.tab === 'discord'}
        <section aria-labelledby="discord" class="grid min-w-0 gap-3">
            <h2 id="discord" class="text-lg font-bold">Discord 연동</h2>
            {#if discord}
                <ul class="panel divide-y divide-line">
                    {#each discord as item (item.key)}
                        <DiscordSettingRow
                            label={item.label}
                            description={item.description}
                            value={item.value}
                            actions={item.actions}
                            busy={savingKey === item.key}
                            disabled={Boolean(savingKey)}
                            onselect={(index) => saveDiscord(item.key, item.ids[index] ?? null)}
                        />
                    {/each}
                </ul>
            {:else}
                <SectionState state="empty" message="봇이 아직 이 서버의 역할·채널을 가져오지 못했어요" />
            {/if}
        </section>
    {:else}
        <section aria-labelledby="admins" class="min-w-0">
            <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="admins" class="text-lg font-bold">멤버</h2>
                <span class="font-brand text-lg font-semibold tabular-nums">{data.total}명</span>
                <span class="text-ui text-muted">관리자 {data.adminCount}명</span>
            </div>
            <p class="mb-3 max-w-prose text-ui text-muted">
                추첨에는 보정가, 실제 평균 낙찰가, 초기가 순으로 먼저 있는 값을 써요. 평균은 1P 이상 낙찰된
                기록으로 계산해요. 가격 설정은 낙찰 기록이나 통계를 바꾸지 않으며, 다음 경매 시작 또는
                초기화부터 적용돼요. 값을 비우고 저장하면 그 설정만 해제돼요.
            </p>
            <div class="panel [&>nav]:border-t [&>nav]:border-line [&>nav]:pb-2">
                <form
                    role="search"
                    aria-label="멤버 검색"
                    class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-b border-line bg-surface-2 px-4 py-3 sm:grid-cols-[minmax(0,20rem)_auto] sm:justify-start"
                    aria-busy={Boolean(navigating.to)}
                    {@attach preventComposingSubmit}
                    onsubmit={(event) => {
                        event.preventDefault();
                        navigate({ q: query });
                    }}
                >
                    <TextField label="멤버 이름 검색" type="search" bind:value={query} maxlength={50} />
                    <Button type="submit" variant="secondary">검색</Button>
                </form>

                {#if data.members.length === 0}
                    <SectionState
                        state="empty"
                        message={data.q
                            ? `'${data.q}'에 맞는 멤버가 없어요`
                            : '서비스에 연결된 멤버가 없어요'}
                    />
                {:else}
                    <!-- 관리자 여부는 Discord 역할·권한으로 정해지므로 표시만 한다. -->
                    <div
                        aria-hidden="true"
                        class="hidden items-center gap-4 border-b border-line px-4 py-2 text-xs font-semibold text-muted md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.85fr)_5.5rem_minmax(18rem,1.85fr)]"
                    >
                        <span>멤버</span><span>Riot 계정</span>
                        <span class="col-start-4">경매 추첨</span>
                    </div>
                    <ul class="divide-y divide-line">
                        {#each data.members as member (`${page.params.guildId}:${member.userId}`)}
                            {@const primary = member.riotAccounts[0]}
                            {@const basis =
                                member.auctionOverridePrice ??
                                member.auctionAveragePrice ??
                                member.auctionSeedPrice}
                            {@const source =
                                member.auctionOverridePrice !== null
                                    ? '보정가'
                                    : member.auctionAveragePrice !== null
                                      ? '실제 평균'
                                      : '초기가'}
                            <li
                                class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.85fr)_5.5rem_minmax(18rem,1.85fr)] md:gap-x-4"
                            >
                                <!-- 좁은 화면에서는 멤버 식별 정보 아래에 연결 계정을 둔다. -->
                                <span class="flex min-w-0 items-center gap-3">
                                    <PlayerFace name={member.displayName} imageUrl={member.iconUrl} />
                                    <span class="flex min-w-0 flex-col">
                                        <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                            <span class="min-w-0 font-medium wrap-anywhere"
                                                >{member.displayName}</span
                                            >
                                            {#if member.isAdmin}<StatusTag text="관리자" state="theme" />{/if}
                                        </span>
                                        <span class="text-xs text-muted tabular-nums wrap-anywhere"
                                            >{member.userId}</span
                                        >
                                    </span>
                                </span>
                                <span
                                    class="col-start-1 min-w-0 pl-11 text-ui wrap-anywhere md:col-start-auto md:pl-0 {primary
                                        ? 'text-ink-2'
                                        : 'text-muted'}"
                                >
                                    {primary
                                        ? `${primary.gameName}#${primary.tagLine}${member.riotAccounts.length > 1 ? ` 외 ${member.riotAccounts.length - 1}` : ''}`
                                        : 'Riot 계정 없음'}
                                </span>
                                <Button
                                    variant="secondary"
                                    class="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-3 md:row-span-1"
                                    onclick={() => ((accountsFor = member.userId), (accountsOpen = true))}
                                >
                                    Riot 계정<span class="sr-only">
                                        관리, {member.displayName} ({member.userId})</span
                                    >
                                </Button>
                                <details
                                    class="col-span-full mt-2 min-w-0 md:col-span-1 md:col-start-4 md:row-start-1 md:mt-0"
                                >
                                    <summary
                                        class="grid min-h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 rounded-form text-ui tabular-nums [&::-webkit-details-marker]:hidden"
                                    >
                                        <span class="grid min-w-0 gap-0.5">
                                            <span class="text-xs text-muted">실제 평균 낙찰가</span>
                                            <strong class="wrap-anywhere"
                                                >{member.auctionAveragePrice === null
                                                    ? '기록 없음'
                                                    : `${number.format(member.auctionAveragePrice)} P`}</strong
                                            >
                                            <span class="text-xs text-muted"
                                                >낙찰 {number.format(member.auctionPurchaseCount)}건</span
                                            >
                                        </span>
                                        <span class="grid min-w-0 gap-0.5">
                                            <span class="text-xs text-muted">추첨 기준가</span>
                                            <strong class="wrap-anywhere"
                                                >{basis === null
                                                    ? '미정'
                                                    : `${number.format(basis)} P`}</strong
                                            >
                                            {#if basis !== null}<span class="text-xs text-muted"
                                                    >{source}</span
                                                >{/if}
                                        </span>
                                        <span
                                            class="rounded-form border border-line-strong bg-surface-2 px-2.5 py-2 font-semibold text-ink hover:bg-surface-hover"
                                        >
                                            가격 설정<span class="sr-only"
                                                >, {member.displayName} ({member.userId})</span
                                            >
                                        </span>
                                    </summary>
                                    <div class="mt-2 grid gap-2 border-t border-line pt-2">
                                        <MemberAuctionPriceField {member} kind="override" />
                                        <MemberAuctionPriceField {member} kind="seed" />
                                    </div>
                                </details>
                            </li>
                        {/each}
                    </ul>
                {/if}

                <PageNav
                    total={data.total}
                    pageSize={data.pageSize}
                    current={data.page}
                    onchange={(current) => navigate({ page: current })}
                />
            </div>
        </section>
    {/if}
</div>

<MemberRiotAccountsDialog bind:open={accountsOpen} member={accountsMember} />
