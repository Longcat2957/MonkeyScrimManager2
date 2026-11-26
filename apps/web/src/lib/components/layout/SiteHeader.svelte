<script lang="ts">
    import { browser } from '$app/env';
    import { resolve } from '$app/paths';
    import { page } from '$app/state';
    import { MediaQuery } from 'svelte/reactivity';
    import { BOT_INVITE_URL } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import { overlay } from '#lib/ui/overlay.ts';
    import AccountMenu from './AccountMenu.svelte';
    import BrandLink from './BrandLink.svelte';
    import ThemeToggle from './ThemeToggle.svelte';
    import { logout } from './logout.ts';
    import { siteNavItems } from './navigation.ts';

    // 서버 문맥이 없는 사이트 화면의 상단 바. 768px 미만에서는 메뉴와 계정을 오른쪽 시트로 옮긴다.
    // 두 배치는 CSS display로 서로 배타적이다. 숨은 쪽은 보이지도, 키보드로 닿지도 않는다.
    const wide = new MediaQuery('min-width: 768px', false);
    let menuOpen = $state(false);

    const user = $derived(page.data.user ?? null);
    const pathname = $derived(page.url.pathname);
    const landing = $derived(page.route.id === '/(site)');
    // 비로그인 홈은 본문의 시작 버튼이 봇 설치 안내로 가므로 상단 바의 같은 링크를 숨긴다.
    const items = $derived(
        siteNavItems(pathname).filter(
            (item) => !(landing && !user && !BOT_INVITE_URL && item.href === resolve('/(site)/discord'))
        )
    );
    // 홈의 로그인은 본문 시작 버튼과 같이 서버 진입으로 돌아온다.
    const returnTo = $derived(
        landing ? resolve('/(site)/servers') : pathname + page.url.search + (browser ? page.url.hash : '')
    );
    const entry = $derived(
        user
            ? {
                  label: '내 서버',
                  href: resolve('/(site)/servers') + (page.data.mockPreview ? '?mock=1' : ''),
                  reload: false
              }
            : page.data.authenticated
              ? null
              : {
                    label: '로그인',
                    href: `${resolve('/auth/discord')}?returnTo=${encodeURIComponent(returnTo)}`,
                    reload: true
                }
    );
    // 홈의 내 서버 이동은 본문 시작 버튼만 맡는다. 비로그인 홈의 로그인은 상단 바만 맡는다.
    const showEntry = $derived(Boolean(entry) && (!landing || !user));
    const staleSession = $derived(page.data.authenticated && !user);

    // 넓은 화면으로 바뀌면 상단 바가 같은 메뉴를 보여 주므로 시트를 닫는다.
    $effect(() => {
        if (wide.current) menuOpen = false;
    });
</script>

{#snippet navLinks(sheet: boolean)}
    <ul class={sheet ? 'flex flex-col gap-1' : 'flex items-stretch'}>
        {#each items as item (item.href)}
            <li class="flex">
                <a
                    href={item.href}
                    aria-current={item.current ? 'page' : undefined}
                    onclick={() => (menuOpen = false)}
                    class={sheet
                        ? 'flex min-h-11 w-full items-center rounded-form border border-transparent px-3 text-sm font-medium text-ink-2 no-underline hover:bg-surface-hover hover:text-ink aria-[current=page]:border-nexus aria-[current=page]:bg-selected aria-[current=page]:font-bold aria-[current=page]:text-ink'
                        : 'site-link relative flex items-center px-3 text-ui font-semibold text-ink-2 no-underline hover:text-ink focus-visible:-outline-offset-2 aria-[current=page]:text-ink'}
                >
                    {item.label}
                </a>
            </li>
        {/each}
    </ul>
{/snippet}

{#snippet entryButton(sheet: boolean)}
    {#if entry}
        <span
            class="contents"
            data-sveltekit-reload={entry.reload || undefined}
            data-sveltekit-preload-data={entry.reload ? 'false' : 'hover'}
        >
            <Button
                href={entry.href}
                variant="primary"
                size={sheet ? 'lg' : 'md'}
                class={sheet ? 'w-full' : ''}
            >
                {entry.label}
            </Button>
        </span>
    {/if}
{/snippet}

<header class="site-header sticky top-0 z-50 text-ink" data-over-glow={landing || undefined}>
    <div class="mx-auto flex h-(--app-header-height) max-w-6xl items-stretch gap-4 px-4 md:gap-6 md:px-6">
        <div class="flex items-center">
            <BrandLink />
        </div>
        <nav aria-label="사이트 메뉴" class="hidden md:flex">
            {@render navLinks(false)}
        </nav>
        <div class="ml-auto flex min-w-0 items-center gap-1.5">
            <ThemeToggle variant="icon" />
            <div class="hidden items-center gap-1.5 md:flex">
                {#if showEntry}{@render entryButton(false)}{/if}
                {#if user}
                    <AccountMenu align="right" />
                {:else if staleSession}
                    <Button variant="quiet" onclick={logout}>로그아웃</Button>
                {/if}
            </div>
            <button
                type="button"
                aria-expanded={menuOpen}
                class="inline-flex size-9 shrink-0 items-center justify-center rounded-form text-ink-2 hover:bg-surface-hover md:hidden pointer-coarse:size-11"
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
    </div>
</header>

{#if menuOpen}
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
                class="min-h-11 self-end rounded-form px-3 text-ui text-ink-2 hover:bg-surface-hover"
                onclick={() => (menuOpen = false)}>닫기</button
            >
            <nav aria-label="사이트 메뉴">
                {@render navLinks(true)}
            </nav>
            <div class="mt-auto flex flex-col gap-2 border-t border-line pt-4">
                {#if showEntry}{@render entryButton(true)}{/if}
                {#if user}
                    <AccountMenu
                        side="up"
                        triggerClass="w-full justify-start"
                        onselect={() => (menuOpen = false)}
                    />
                {:else if staleSession}
                    <Button variant="secondary" size="lg" onclick={logout}>로그아웃</Button>
                {/if}
            </div>
        </aside>
    </div>
{/if}

<style>
    /* 문서 위에서는 옅게 비치다가 스크롤을 시작하면 레일 색 바닥과 구분선이 나타난다. */
    .site-header {
        background: color-mix(in oklab, var(--color-ground) 82%, transparent);
        backdrop-filter: blur(12px);
        box-shadow: inset 0 -1px var(--color-line);
    }

    @supports (animation-timeline: scroll()) {
        .site-header {
            box-shadow: inset 0 -1px transparent;
            animation: site-header-solid linear both;
            animation-timeline: scroll(root);
            animation-range: 0 4rem;
        }
    }

    /* 소개 화면의 맨 위에서는 바닥 없이 배경광 위에 놓여 빛이 상단 바 경계에서 잘리지 않는다.
       스크롤 연동을 지원하지 않으면 기본 반투명 바닥을 유지해 겹친 본문을 가리지 않는다. */
    @supports (animation-timeline: scroll()) {
        .site-header[data-over-glow] {
            background: transparent;
            backdrop-filter: none;
            animation-name: site-header-reveal;
        }
    }

    @keyframes site-header-reveal {
        to {
            background: var(--color-rail);
            box-shadow: inset 0 -1px var(--color-line);
            backdrop-filter: blur(12px);
        }
    }

    @keyframes site-header-solid {
        to {
            background: var(--color-rail);
            box-shadow: inset 0 -1px var(--color-line);
        }
    }

    /* 현재 메뉴는 내전 단계 바와 같은 시안 밑줄로 표시한다. */
    .site-link::after {
        content: '';
        position: absolute;
        inset: auto 0.75rem 0;
        height: 2px;
        background: var(--color-nexus);
        transform: scaleX(0);
    }

    .site-link[aria-current='page']::after {
        transform: scaleX(1);
    }

    @media (prefers-reduced-motion: no-preference) {
        .site-link::after {
            transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
    }
</style>
