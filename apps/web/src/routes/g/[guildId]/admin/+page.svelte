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
    import MemberRiotAccountsDialog from '#lib/components/admin/MemberRiotAccountsDialog.svelte';
    import PageNav from '#lib/components/common/PageNav.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import SelectionTabs from '#lib/components/common/SelectionTabs.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { DiscordChannel, GuildDiscordSettingKey } from '#lib/features/guild/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { preventComposingSubmit } from '#lib/ui/form.ts';
    import { toast } from '#lib/ui/toast.ts';
    import type { PageProps } from './$types';

    let { data, form }: PageProps = $props();

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
        url.search = '';
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
        if (savingKey || !data.discord || data.discord.settings[key] === value) return;
        savingKey = key;
        try {
            const message = await postAction('discord', { key, value: value ?? '' });
            if (message) toast.error(message);
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

<div class="flex w-full max-w-5xl min-w-0 flex-col gap-4">
    <h1 class="page-head text-title font-bold">서버 관리</h1>

    <!-- 탭 묶음에 이름을 붙이고, 선택한 내용은 영역 제목으로 알린다. -->
    <div role="group" aria-label="관리 항목" class="border-b border-line">
        <SelectionTabs labels={TABS.map(({ text }) => text)} {active} onchange={selectTab} />
    </div>

    {#if data.tab === 'seasons' && data.seasons}
        <GuildSeasonManagement
            overview={data.seasons}
            initialName={form && 'values' in form ? (form.values?.name ?? '') : ''}
            initialError={form && 'action' in form && form.action === 'rotateSeason' ? form.message : ''}
        />
    {:else if data.tab === 'audit' && data.audit}
        <section aria-labelledby="audit" class="panel" aria-busy={Boolean(navigating.to)}>
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
        <section aria-labelledby="discord" class="flex flex-col gap-3">
            <h2 id="discord" class="sr-only">Discord 연동</h2>
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
        <section aria-labelledby="admins" class="panel [&>nav]:border-t [&>nav]:border-line [&>nav]:pb-2">
            <h2 id="admins" class="sr-only">멤버</h2>
            <form
                role="search"
                aria-label="멤버 검색"
                class="panel-bar"
                aria-busy={Boolean(navigating.to)}
                {@attach preventComposingSubmit}
                onsubmit={(event) => {
                    event.preventDefault();
                    navigate({ q: query });
                }}
            >
                <div class="w-72 max-w-full">
                    <TextField label="멤버 이름 검색" type="search" bind:value={query} maxlength={50} />
                </div>
                <span class="text-ui text-muted">관리자 {data.adminCount}명</span>
            </form>

            {#if data.members.length === 0}
                <SectionState
                    state="empty"
                    message={data.q ? `'${data.q}'에 맞는 멤버가 없어요` : '서비스에 연결된 멤버가 없어요'}
                />
            {:else}
                <!-- 관리자 여부는 Discord 역할·권한으로 정해지므로 표시만 하고, 행의 조작은 Riot 계정 관리 하나다. -->
                <ul class="divide-y divide-line">
                    {#each data.members as member (member.userId)}
                        {@const primary = member.riotAccounts[0]}
                        <li
                            class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto]"
                        >
                            <!-- 좁은 화면에서는 이름을 줄이지 않고 조작을 다음 줄로 내린다. -->
                            <span class="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
                                <PlayerFace name={member.displayName} imageUrl={null} />
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
                            <span class="text-ui text-ink-2 wrap-anywhere">
                                {primary
                                    ? `${primary.gameName}#${primary.tagLine}${member.riotAccounts.length > 1 ? ` 외 ${member.riotAccounts.length - 1}` : ''}`
                                    : 'Riot 계정 없음'}
                            </span>
                            <Button
                                variant="secondary"
                                class="ml-auto"
                                onclick={() => ((accountsFor = member.userId), (accountsOpen = true))}
                            >
                                Riot 계정<span class="sr-only">
                                    관리, {member.displayName} ({member.userId})</span
                                >
                            </Button>
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
        </section>
    {/if}
</div>

<MemberRiotAccountsDialog bind:open={accountsOpen} member={accountsMember} />
