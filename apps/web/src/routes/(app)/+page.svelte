<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import { dev } from '$app/env';
    import { page } from '$app/state';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const loginHref = $derived(
        `${resolve('/auth/discord')}?returnTo=${encodeURIComponent(page.url.pathname + (dev ? page.url.search : ''))}`
    );
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<div
    class="mx-auto grid w-full max-w-6xl items-start gap-y-8 pt-4 sm:pt-10 xl:grid-cols-[minmax(0,4fr)_minmax(0,5fr)] xl:gap-x-16 xl:pt-[8vh]"
>
    <header class="min-w-0">
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">서버 선택</h1>
        <p class="mt-4 max-w-sm text-base leading-relaxed text-ink-2">
            리그 오브 레전드 내전을 운영할 Discord 서버를 선택하세요.
        </p>
    </header>
    <section aria-labelledby="servers" class="min-w-0 border-y border-line-strong">
        <header class="flex min-h-12 items-center justify-between border-b border-line px-1">
            <h2 id="servers" class="font-semibold">내 Discord 서버</h2>
            {#if data.guilds.length && !data.guildListError}
                <span class="font-brand font-semibold text-nexus">{data.guilds.length}개</span>
            {/if}
        </header>
        {#if data.guildListError}
            <div class="space-y-3 p-5">
                <p role="alert" class="text-sm text-error">서버 목록을 불러오지 못했어요.</p>
                <Button onclick={() => window.location.reload()}>다시 시도</Button>
            </div>
        {:else if data.guilds.length}
            <ul class="divide-y divide-line bg-surface">
                {#each data.guilds as guild (guild.id)}
                    <li>
                        <a
                            href={resolve('/g/[guildId]', { guildId: guild.id })}
                            class="group flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-hover focus-visible:outline-offset-[-2px]"
                        >
                            <span
                                aria-hidden="true"
                                class="grid size-8 shrink-0 place-items-center rounded-form border border-line bg-surface-2 text-sm font-semibold"
                                >{guild.name.match(/^./u)?.[0]}</span
                            >
                            <span class="min-w-0 flex-1 font-semibold group-hover:text-nexus"
                                >{guild.name}</span
                            >
                            <svg
                                class="size-4 shrink-0 text-muted"
                                viewBox="0 0 20 20"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg
                            >
                        </a>
                    </li>
                {/each}
            </ul>
        {:else if !data.authenticated}
            <div
                class="space-y-4 bg-surface px-4 py-8"
                data-sveltekit-reload
                data-sveltekit-preload-data="false"
            >
                <p class="text-sm leading-6 text-ink-2">Discord 계정으로 로그인해 소속 서버를 불러오세요.</p>
                <Button href={loginHref} variant="primary">Discord로 로그인</Button>
            </div>
        {:else}
            <p class="max-w-prose p-5 text-sm leading-6 text-ink-2">
                봇이 참여 중이고 내가 소속된 Discord 서버가 없어요. 서버 운영자에게 이용할 서버를 확인해
                주세요.
            </p>
        {/if}
        {#if !data.guilds.length && !data.guildListError}
            <p class="border-t border-line py-3 text-ui leading-6 text-muted">
                공유받은 공개 주소가 있다면 로그인 없이 내전과 기록을 볼 수 있어요.
            </p>
        {/if}
    </section>
</div>
