<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const loginHref = `${resolve('/auth/discord')}?returnTo=${encodeURIComponent('/')}`;
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<div class="max-w-3xl">
    <header class="mb-5">
        <h1 class="text-title font-bold">서버 선택</h1>
        <p class="mt-1 text-sm leading-6 text-ink-2">
            리그 오브 레전드 내전의 모집·팀 편성·대진·기록을 Discord 서버에서 관리해요.
        </p>
    </header>
    <section class="panel" aria-labelledby="servers">
        <div class="panel-bar">
            <h2 id="servers" class="font-semibold">내 Discord 서버</h2>
            {#if data.guilds.length && !data.guildListError}
                <span class="text-ui text-muted">{data.guilds.length}개</span>
            {/if}
        </div>
        {#if data.guildListError}
            <div class="space-y-3 p-5">
                <p role="alert" class="text-sm text-error">서버 목록을 불러오지 못했어요.</p>
                <Button onclick={() => window.location.reload()}>다시 시도</Button>
            </div>
        {:else if data.guilds.length}
            <ul class="divide-y divide-line">
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
            <div class="space-y-4 p-5" data-sveltekit-reload data-sveltekit-preload-data="false">
                <p class="text-sm leading-6 text-ink-2">
                    Discord로 로그인하면 내전을 진행하는 내 서버를 선택할 수 있어요.
                </p>
                <Button href={loginHref} variant="primary">Discord로 로그인</Button>
            </div>
        {:else}
            <p class="max-w-prose p-5 text-sm leading-6 text-ink-2">
                봇이 참여 중이고 내가 소속된 Discord 서버가 없어요. 서버 운영자에게 이용할 서버를 확인해
                주세요.
            </p>
        {/if}
    </section>
    {#if !data.guilds.length && !data.guildListError}
        <p class="mt-4 text-ui leading-6 text-muted">
            공유받은 공개 주소가 있다면 로그인 없이 내전과 기록을 볼 수 있어요.
        </p>
    {/if}
</div>
