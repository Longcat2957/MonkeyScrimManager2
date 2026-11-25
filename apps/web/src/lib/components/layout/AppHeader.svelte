<script lang="ts">
    import { asset, resolve } from '$app/paths';
    import { page } from '$app/state';
    import { onMount, tick } from 'svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import Dialog from '#lib/components/common/Dialog.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import { overlay } from '#lib/ui/overlay.ts';
    import { currentMode, setMode, type ThemeMode } from '#lib/ui/theme.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';
    import ContextNav from './ContextNav.svelte';
    import MenuButton from './MenuButton.svelte';
    import { guildNavItems, serverHome, type NavItem } from './navigation.ts';

    let { accountHeight = $bindable(0) }: { accountHeight?: number } = $props();
    let mode: ThemeMode = $state('dark');
    let menuOpen = $state(false);
    let gamesOpen = $state(false);
    let railCollapsed = $state(false);
    const railLabel = $derived(railCollapsed ? '사이드바 펼치기' : '사이드바 접기');

    onMount(() => {
        try {
            railCollapsed = localStorage.getItem('rail-collapsed') === 'true';
        } catch {
            // 저장소를 쓸 수 없으면 펼친 상태로 시작한다.
        }
    });

    function toggleRail() {
        railCollapsed = !railCollapsed;
        try {
            localStorage.setItem('rail-collapsed', String(railCollapsed));
        } catch {
            // 저장할 수 없어도 현재 화면에서는 접기와 펼치기가 동작한다.
        }
    }

    // 하이드레이션 뒤 첫 페인트에서 복원한 모드를 스위치에 반영한다.
    $effect(() => {
        mode = currentMode();
    });

    const user = $derived(page.data.user ?? null);
    const guilds = $derived(page.data.guilds ?? []);
    const guild = $derived(page.data.guild ?? null);
    const pathname = $derived(page.url.pathname);
    const guildItems = $derived(guild ? guildNavItems(guild, pathname) : []);

    const accountItems = $derived<NavItem[]>(
        user
            ? [
                  {
                      label: '내 정보',
                      href: `${resolve('/(app)/me')}${page.data.mockPreview ? '?mock=1' : ''}`,
                      current: pathname === '/me'
                  },
                  ...(user.isServiceAdmin
                      ? [
                            {
                                label: '백오피스',
                                href: `${resolve('/(app)/backoffice')}${page.data.mockPreview ? '?mock=1' : ''}`,
                                current: pathname.startsWith('/backoffice')
                            }
                        ]
                      : []),
                  ...(page.data.authenticated ? [{ label: '로그아웃', href: '', current: false }] : [])
              ]
            : []
    );

    const guildActions = $derived(
        guilds.length
            ? guilds.map((item) => ({
                  content: item.name,
                  desc: item.id === guild?.id ? '현재 서버' : undefined,
                  current: item.id === guild?.id,
                  disabled: item.id === guild?.id
              }))
            : [{ content: page.data.guildListError ?? '접근 가능한 서버가 없어요', disabled: true }]
    );

    function selectGuild(index: number) {
        const target = guilds[index];
        if (target) location.assign(resolve('/g/[guildId]', { guildId: target.id }));
    }

    function toggleMode() {
        mode = mode === 'dark' ? 'primary' : 'dark';
        setMode(mode);
    }

    async function openGames() {
        if (menuOpen) {
            menuOpen = false;
            await tick();
        }
        gamesOpen = true;
    }

    function logout() {
        const form = document.getElementById('logout-form');
        if (form instanceof HTMLFormElement) form.requestSubmit();
    }

    function selectAccount(index: number) {
        menuOpen = false;
        const item = accountItems[index];
        if (!item) return;
        if (item.label === '로그아웃') logout();
        else location.assign(item.href);
    }
</script>

{#snippet sessionIcon()}
    <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        class="size-5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
    >
        <path d="M13 4h6v16h-6M3 12h12m-5-5 5 5-5 5" />
    </svg>
{/snippet}

{#snippet brand(rail: boolean)}
    <a
        href={serverHome()}
        class="rail-control flex shrink-0 items-center gap-2.5 px-1 py-0.5 no-underline"
        aria-label={`${SERVICE_NAME} 홈`}
    >
        <img
            src={asset('brand/logo.png')}
            alt=""
            width="34"
            height="34"
            class="size-8.5 rounded-full border border-nexus"
        />
        {#if rail}
            <span class="rail-label font-brand text-[1.3125rem] leading-none font-bold tracking-[-0.02em]"
                >{SERVICE_NAME}</span
            >
        {/if}
    </a>
{/snippet}

{#if page.data.authenticated}
    <form id="logout-form" method="POST" action={resolve('/auth/logout')} class="hidden"></form>
{/if}

{#snippet sessionControl()}
    {#if !page.data.authenticated && !user && pathname !== '/'}
        <a
            href={`${resolve('/auth/discord')}?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
            data-sveltekit-reload
            data-sveltekit-preload-data="false"
            title={desktop.current && railCollapsed ? '로그인' : undefined}
            class="rail-control inline-flex min-h-9 items-center justify-center gap-2 overflow-hidden rounded-form bg-nexus px-3 text-ui font-semibold text-nexus-ink hover:bg-nexus-hover pointer-coarse:min-h-11"
        >
            {#if desktop.current}{@render sessionIcon()}{/if}
            <span class="rail-label">로그인</span>
        </a>
    {/if}
{/snippet}

{#snippet guildSwitcher(wide: boolean)}
    {#if user && pathname !== '/'}
        <MenuButton
            label="서버 선택"
            actions={guildActions}
            onselect={selectGuild}
            align={wide ? 'left' : 'right'}
            triggerVariant="secondary"
            triggerClass={wide
                ? 'rail-control overflow-hidden not-hover:bg-surface'
                : 'max-w-[55vw] not-hover:bg-surface'}
        >
            {#if wide}
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    class="size-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                >
                    <title>서버 선택</title>
                    <path stroke-linejoin="round" d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />
                </svg>
            {/if}
            <span class="rail-label min-w-0 flex-1 truncate text-left">{guild?.name ?? '서버 선택'}</span>
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class="rail-label size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m4 6 4 4 4-4" /></svg
            >
        </MenuButton>
    {/if}
{/snippet}

{#snippet themeToggle()}
    <button
        type="button"
        role="switch"
        aria-checked={mode === 'primary'}
        aria-label="라이트 모드"
        class:rail-control={!user}
        class="inline-flex min-h-9 w-full items-center justify-between gap-2 overflow-hidden rounded-form px-2.5 text-ui text-ink-2 hover:bg-surface-hover pointer-coarse:min-h-11"
        onclick={toggleMode}
    >
        <span
            class="relative flex h-4 w-7 shrink-0 items-center rounded-full border border-line-strong bg-surface"
            aria-hidden="true"
        >
            <span
                class={[
                    'size-3 rounded-full bg-nexus motion-safe:transition-transform',
                    mode === 'primary' ? 'translate-x-3.5' : 'translate-x-0.5'
                ]}
            ></span>
        </span>
        <span aria-hidden="true" class:rail-label={!user}>라이트 모드</span>
    </button>
{/snippet}

{#snippet gameTool()}
    <Button variant="quiet" class="rail-control w-full justify-start overflow-hidden" onclick={openGames}>
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
        >
            {#if desktop.current && railCollapsed}<title>미니게임</title>{/if}
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path stroke-linecap="round" stroke-width="3" d="M8 8h.01M12 12h.01M16 16h.01" />
        </svg>
        <span class="rail-label">미니게임</span>
    </Button>
{/snippet}

{#snippet accountMenu()}
    {#if user}
        <MenuButton
            label="계정 메뉴"
            actions={accountItems.map((item) => ({
                content: item.label,
                current: item.current
            }))}
            align="left"
            side={desktop.current ? 'up' : 'down'}
            onselect={selectAccount}
            triggerVariant="secondary"
            triggerClass="rail-control w-full justify-start gap-2.5 overflow-hidden p-2 not-hover:bg-surface"
            footer={themeToggle}
        >
            <PlayerFace name={user.displayName} imageUrl={user.avatarUrl} size="sm" />
            <span class="rail-label min-w-0 flex-1 truncate text-left text-ui">{user.displayName}</span>
            <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                class={['rail-label size-4 shrink-0 text-muted', !desktop.current && 'rotate-180']}
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"><path d="m4 10 4-4 4 4" /></svg
            >
        </MenuButton>
    {/if}
{/snippet}

{#if desktop.current}
    <!-- 좌측 서버 레일: 목업의 사이드 내비게이션. 현재 서버·메뉴·계정을 한 곳에 둔다. -->
    <aside
        data-rail-collapsed={railCollapsed}
        class={[
            'sticky top-0 z-40 flex h-dvh shrink-0 flex-col gap-4.5 bg-rail pt-4.5 text-ink shadow-[inset_-1px_0_var(--color-line)] motion-safe:transition-[width,padding-inline] motion-safe:duration-250 motion-safe:ease-in-out',
            railCollapsed ? 'w-16 px-2.5' : 'w-56 px-3.5'
        ]}
    >
        <div class="flex items-center overflow-hidden">
            {@render brand(true)}
        </div>
        <div id="desktop-rail-content" class="contents">
            {@render guildSwitcher(true)}
            {#if guildItems.length}
                <ContextNav items={guildItems} label="서버 메뉴" compact={railCollapsed} />
                {@render gameTool()}
            {/if}
            <button
                type="button"
                aria-label={railLabel}
                title={railLabel}
                aria-expanded={!railCollapsed}
                aria-controls="desktop-rail-content"
                class="rail-control mt-auto shrink-0 overflow-hidden whitespace-nowrap rounded-form text-ui font-medium text-muted hover:bg-surface-hover hover:text-ink"
                onclick={toggleRail}
            >
                <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    class={[
                        'size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-250',
                        railCollapsed && 'rotate-180'
                    ]}
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path d="m12 6-6 6 6 6m6-12-6 6 6 6" />
                </svg>
                <span class="rail-label">사이드바 접기</span>
            </button>
            <div
                bind:offsetHeight={accountHeight}
                class={[
                    'flex min-h-16 shrink-0 flex-col justify-center gap-2 border-t border-line py-2',
                    railCollapsed ? '-mx-2.5 px-2.5' : '-mx-3.5 px-3.5'
                ]}
            >
                {#if user}
                    {@render accountMenu()}
                {:else}
                    {@render themeToggle()}
                    {@render sessionControl()}
                {/if}
                {#if page.data.authenticated && !user}
                    <button
                        type="button"
                        title={railCollapsed ? '로그아웃' : undefined}
                        class="rail-control overflow-hidden rounded-form border border-line-strong bg-surface text-ui font-semibold hover:bg-surface-hover"
                        onclick={logout}
                    >
                        {@render sessionIcon()}<span class="rail-label">로그아웃</span>
                    </button>
                {/if}
            </div>
        </div>
    </aside>
{:else}
    <header
        class="sticky top-0 z-50 flex h-(--app-header-height) items-center gap-2 border-b border-line bg-rail px-3 text-ink"
    >
        {@render brand(false)}
        <div class="ml-auto flex min-w-0 items-center gap-1">
            {@render guildSwitcher(false)}
            {@render sessionControl()}
            <button
                type="button"
                class="inline-flex size-9 shrink-0 items-center justify-center rounded-form text-ink-2 hover:bg-surface-hover pointer-coarse:size-11"
                onclick={() => (menuOpen = true)}
            >
                <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span class="sr-only">메뉴</span>
            </button>
        </div>
    </header>
{/if}

{#if !desktop.current && menuOpen}
    <div
        class="fixed inset-0 z-[1500]"
        {@attach overlay({ open: true, label: '메뉴', onclose: () => (menuOpen = false) })}
    >
        <div class="absolute inset-0 bg-black/60" onclick={() => (menuOpen = false)} aria-hidden="true"></div>
        <aside
            class="absolute inset-y-0 right-0 flex w-[min(20rem,85%)] flex-col gap-4 overflow-y-auto border-l border-line bg-rail p-3.5 text-ink"
        >
            <button
                type="button"
                class="min-h-9 self-end rounded-form px-3 text-ui text-ink-2 hover:bg-surface-hover pointer-coarse:min-h-11"
                onclick={() => (menuOpen = false)}>닫기</button
            >
            {#if guildItems.length}
                <ContextNav items={guildItems} label="서버 메뉴" onnavigate={() => (menuOpen = false)} />
                {@render gameTool()}
            {/if}
            {#if user}
                {@render accountMenu()}
            {:else}
                <button
                    type="button"
                    class="min-h-11 rounded-form border border-line-strong bg-surface px-2.5 text-left text-ui font-semibold hover:bg-surface-hover"
                    onclick={toggleMode}
                >
                    {mode === 'primary' ? '다크 모드로 전환' : '라이트 모드로 전환'}
                </button>
            {/if}
            {#if page.data.authenticated && !user}
                <button
                    type="button"
                    class="min-h-11 rounded-form border border-line-strong bg-surface px-2.5 text-left text-ui font-semibold hover:bg-surface-hover"
                    onclick={() => {
                        menuOpen = false;
                        logout();
                    }}
                >
                    로그아웃
                </button>
            {/if}
        </aside>
    </div>
{/if}

{#if guild}
    <Dialog title="미니게임" bind:open={gamesOpen}>
        {#if gamesOpen}
            {#await import('#lib/components/minigames/MiniGames.svelte')}
                <p role="status" class="text-sm text-muted">미니게임을 불러오는 중이에요.</p>
            {:then module}
                <module.default />
            {:catch}
                <p role="alert" class="text-sm text-error">
                    미니게임을 불러오지 못했어요. 창을 닫고 다시 열어 주세요.
                </p>
            {/await}
        {/if}
    </Dialog>
{/if}
