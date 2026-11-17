<script lang="ts">
    import { resolve } from '$app/paths';
    import { asset } from '$app/paths';
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import { overlay } from '#lib/ui/overlay.ts';
    import { currentMode, setMode, type ThemeMode } from '#lib/ui/theme.ts';
    import { desktop } from '#lib/ui/viewport.svelte.ts';
    import ContextNav from './ContextNav.svelte';
    import MenuButton from './MenuButton.svelte';
    import { guildNavItems, type NavItem } from './navigation.ts';

    let mode: ThemeMode = $state('primary');
    let menuOpen = $state(false);

    // 서버 렌더링에서는 기본 라이트를 쓰고, 하이드레이션 뒤 저장된 모드를 읽는다.
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
                      href: `${resolve('/me')}${page.data.mockPreview ? '?mock=1' : ''}`,
                      current: pathname === '/me'
                  },
                  ...(user.isServiceAdmin
                      ? [
                            {
                                label: '백오피스',
                                href: `${resolve('/backoffice')}${page.data.mockPreview ? '?mock=1' : ''}`,
                                current: pathname.startsWith('/backoffice')
                            }
                        ]
                      : []),
                  { label: '로그아웃', href: '', current: false }
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

{#snippet brand(rail: boolean)}
    <a
        href={resolve('/')}
        class="flex shrink-0 items-center gap-2 no-underline"
        aria-label={`${SERVICE_NAME} 홈`}
    >
        <img src={asset('brand/logo.png')} alt="" width="32" height="32" class="size-8" />
        {#if rail || desktop.current}
            <span class="font-brand text-xl leading-none font-bold tracking-wide">{SERVICE_NAME}</span>
        {/if}
    </a>
{/snippet}

{#snippet sessionControl()}
    {#if page.data.authenticated}
        <form id="logout-form" method="POST" action={resolve('/auth/logout')} class="hidden"></form>
    {:else if !user}
        <a
            href={`${resolve('/auth/discord')}?returnTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
            data-sveltekit-reload
            data-sveltekit-preload-data="false"
            class="rounded-(--radius-form) inline-flex min-h-9 items-center justify-center bg-hex px-3 text-sm font-semibold text-hex-ink"
            >로그인</a
        >
    {/if}
{/snippet}

{#snippet guildSwitcher(wide: boolean)}
    {#if user}
        <MenuButton
            label="서버 선택"
            actions={guildActions}
            onselect={selectGuild}
            triggerVariant="secondary"
            triggerClass={wide ? 'w-full justify-between' : 'gap-1.5'}
        >
            <span class="max-w-40 truncate text-sm font-semibold">{guild?.name ?? '서버 선택'}</span>
            <span aria-hidden="true">▾</span>
        </MenuButton>
    {/if}
{/snippet}

{#snippet themeToggle(wide: boolean)}
    <button
        type="button"
        role="switch"
        aria-checked={mode === 'primary'}
        aria-label="라이트 모드"
        class={[
            'inline-flex min-h-9 items-center gap-2 rounded-(--radius-form) border border-brass-line bg-bg-surface px-3 text-xs font-semibold text-text-muted hover:text-text-primary dark:bg-bg-surface-dark dark:hover:text-text-dark',
            wide && 'w-full justify-between'
        ]}
        onclick={toggleMode}
    >
        <span
            class="relative flex h-4 w-7 items-center rounded-full border border-brass-line bg-bg-highlight dark:bg-bg-highlight-dark"
            aria-hidden="true"
        >
            <span
                class={[
                    'size-3 rounded-full bg-hex transition-transform',
                    mode === 'primary' ? 'translate-x-3.5' : 'translate-x-0.5'
                ]}
            ></span>
        </span>
        <span class={wide ? '' : 'hidden sm:inline'} aria-hidden="true">라이트 모드</span>
    </button>
{/snippet}

{#snippet themeInMenu()}
    {@render themeToggle(true)}
{/snippet}

{#snippet accountMenu(wide = false, withTheme = false)}
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
            triggerClass={wide ? 'w-full justify-between' : 'gap-2 px-2'}
            footer={withTheme ? themeInMenu : undefined}
        >
            <span
                class="flex size-7 items-center justify-center rounded-full bg-bg-highlight text-xs font-semibold dark:bg-bg-highlight-dark"
                aria-hidden="true"
            >
                {user.displayName.slice(0, 1)}
            </span>
            <span class="hidden text-sm md:inline">{user.displayName}</span>
        </MenuButton>
    {/if}
{/snippet}

{#if desktop.current}
    <!-- 좌측 서버 레일: 목업의 사이드 내비게이션. 현재 서버·메뉴·계정을 한 곳에 둔다. -->
    <aside
        class="sticky top-0 flex h-dvh w-56 shrink-0 flex-col gap-4 overflow-visible border-r border-brass-line bg-crown px-3 py-4 text-text-primary dark:bg-crown dark:text-text-dark"
    >
        {@render brand(true)}
        {@render guildSwitcher(true)}
        {#if guildItems.length}
            <ContextNav items={guildItems} label="서버 메뉴" vertical tone="rail" />
        {/if}
        <div class="mt-auto flex flex-col gap-2 border-t border-brass-line pt-3">
            {#if user}
                {@render accountMenu(true, true)}
            {:else}
                {@render themeToggle(true)}
            {/if}
            {#if !page.data.authenticated && !user}{@render sessionControl()}{/if}
            {#if page.data.authenticated}
                <button
                    type="button"
                    class="min-h-11 w-full rounded-(--radius-form) border border-brass-line px-3 text-left text-sm font-semibold"
                    onclick={logout}
                >
                    로그아웃
                </button>
            {/if}
        </div>
    </aside>
{:else}
    <header
        class="sticky top-0 z-50 flex h-(--app-header-height) items-center gap-2 border-b border-brass-line bg-crown px-3 text-text-primary dark:bg-crown dark:text-text-dark"
    >
        {@render brand(false)}
        <div class="ml-auto flex items-center gap-1">
            {@render guildSwitcher(false)}
            {#if !page.data.authenticated && !user}{@render sessionControl()}{/if}
            <button
                type="button"
                class="inline-flex min-h-9 min-w-9 items-center justify-center rounded-(--radius-form) text-text-muted hover:bg-bg-highlight hover:text-text-primary dark:hover:bg-bg-highlight-dark dark:hover:text-text-dark"
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
            class="absolute inset-y-0 right-0 flex w-[min(20rem,85%)] flex-col gap-4 overflow-y-auto border-l border-brass-line bg-bg-surface p-4 text-text-primary dark:bg-bg-surface-dark dark:text-text-dark"
        >
            {#if user}
                <p class="px-3 text-xs font-semibold text-text-muted">{user.displayName}</p>
            {/if}
            {#if guildItems.length}
                <ContextNav
                    items={guildItems}
                    label="서버 메뉴"
                    vertical
                    tone="rail"
                    onnavigate={() => (menuOpen = false)}
                />
            {/if}
            {#if user}
                {@render accountMenu(true, true)}
            {:else}
                <button
                    type="button"
                    class="min-h-11 rounded-(--radius-form) border border-brass-line px-3 text-left text-sm font-semibold"
                    onclick={toggleMode}
                >
                    {mode === 'primary' ? '다크 모드로 전환' : '라이트 모드로 전환'}
                </button>
            {/if}
            {#if page.data.authenticated}
                <button
                    type="button"
                    class="min-h-11 rounded-(--radius-form) border border-brass-line px-3 text-left text-sm font-semibold"
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
