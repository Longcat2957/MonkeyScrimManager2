<script lang="ts">
    import { dev } from '$app/env';
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    // 개발 화면으로 이동하기 위한 임시 경로 값이다.
    const guildId = 'devGuild001';
    const scrimId = 'devScrim001';
    // 편성 화면은 편성 방식이 맞는 준비 단계 내전으로 연결한다.
    const manualScrimId = 'devScrim007';
    const auctionScrimId = 'devScrim002';
    // 대진 운영은 팀 편성이 끝난 내전에서 팀을 대진 자리에 직접 배치한다.
    const bracketScrimId = 'devScrim008';
    const completedBracketScrimId = 'devScrim005';
    const matchId = 'devMatch001';
    const userId = 'devUser001';
    const devTools = [
        { label: '컴포넌트 테스트', href: resolve('/dev/components') },
        { label: '에러 페이지', href: resolve('/dev/error') }
    ];
    const shortcutGroups = [
        {
            title: '모집·참가',
            links: [
                { label: '서버 홈', href: resolve('/g/[guildId]', { guildId }) },
                { label: '내전 목록', href: resolve('/g/[guildId]/scrims', { guildId }) },
                { label: '내전 상세', href: resolve('/g/[guildId]/scrims/[scrimId]', { guildId, scrimId }) }
            ]
        },
        {
            title: '팀·대진 운영',
            links: [
                {
                    label: '수동 팀 편성',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/manual', { guildId, scrimId: manualScrimId })
                },
                {
                    label: '경매',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/auction', {
                        guildId,
                        scrimId: auctionScrimId
                    })
                },
                {
                    label: '대진 운영',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/bracket', {
                        guildId,
                        scrimId: bracketScrimId
                    })
                },
                {
                    label: '대진 결과',
                    href: resolve('/g/[guildId]/scrims/[scrimId]/result', {
                        guildId,
                        scrimId: completedBracketScrimId
                    })
                }
            ]
        },
        {
            title: '기록·통계',
            links: [
                { label: '경기 기록', href: resolve('/g/[guildId]/matches', { guildId }) },
                { label: '경기 상세', href: resolve('/g/[guildId]/matches/[matchId]', { guildId, matchId }) },
                { label: '참가자 전적', href: resolve('/g/[guildId]/players/[userId]', { guildId, userId }) },
                { label: '서버 통계', href: resolve('/g/[guildId]/stats', { guildId }) }
            ]
        },
        {
            title: '계정·관리',
            links: [
                { label: '내 정보', href: `${resolve('/me')}?mock=1` },
                { label: '백오피스', href: `${resolve('/backoffice')}?mock=1` },
                { label: '서버 관리', href: resolve('/g/[guildId]/admin', { guildId }) }
            ]
        }
    ];
    const firstGuild = $derived(data.guilds[0]);
    const loginHref = `${resolve('/auth/discord')}?returnTo=${encodeURIComponent('/')}`;
    const CTA_CLASS =
        'rounded-(--radius-form) inline-flex min-h-12 items-center bg-hex px-6 text-base font-semibold text-hex-ink hover:bg-hex-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hex';
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-10">
    <section aria-labelledby="intro" class="border-y border-brass-line py-10 md:py-14">
        <h1 id="intro" class="font-brand text-4xl font-bold tracking-wide text-balance md:text-6xl">
            {SERVICE_NAME}
        </h1>
        <p class="mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-text-muted">
            리그 오브 레전드 내전의 모집·팀 편성·대진·기록을 Discord 서버에서 관리하는 도구예요.
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-4">
            {#if !data.authenticated}
                <a
                    href={loginHref}
                    data-sveltekit-reload
                    data-sveltekit-preload-data="false"
                    class={CTA_CLASS}>Discord로 로그인</a
                >
            {:else if firstGuild}
                <a href={resolve('/g/[guildId]', { guildId: firstGuild.id })} class={CTA_CLASS}>서버로 이동</a
                >
            {/if}
        </div>

        {#if data.guildListError}
            <p class="mt-4 max-w-prose text-sm leading-6 text-pretty text-error">
                서버 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
        {:else if data.authenticated && !firstGuild}
            <p class="mt-4 max-w-prose text-sm leading-6 text-pretty text-text-muted">
                봇이 참여 중이고 내가 소속된 Discord 서버가 없어요. 서버 운영자에게 이용할 서버를 확인해
                주세요.
            </p>
        {/if}
    </section>

    {#if dev}
        <nav aria-labelledby="dev-shortcuts">
            <h2 id="dev-shortcuts" class="text-lg font-semibold">개발 바로가기</h2>
            <div class="mt-6 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
                {#each shortcutGroups as group (group.title)}
                    <section class="min-w-0">
                        <h3 class="font-semibold">{group.title}</h3>
                        <ul class="mt-2 flex flex-col gap-1">
                            {#each group.links as shortcut (shortcut.href)}
                                <li class="min-w-0">
                                    <a
                                        href={shortcut.href}
                                        class="flex min-h-11 flex-col items-start gap-1 rounded-(--radius-small) py-2 focus-visible:outline-2 focus-visible:outline-offset-4"
                                    >
                                        <span class="underline underline-offset-4">{shortcut.label}</span>
                                        <code
                                            class="max-w-full text-xs leading-5 wrap-anywhere text-text-muted"
                                            >{#each shortcut.href.split('/') as segment, index (index)}{#if index > 0}/<wbr
                                                    />{/if}{segment}{/each}</code
                                        >
                                    </a>
                                </li>
                            {/each}
                        </ul>
                    </section>
                {/each}
            </div>
        </nav>

        <nav aria-label="개발 도구" class="border-t border-brass-line pt-6">
            <ul class="flex flex-wrap gap-x-8 gap-y-2">
                {#each devTools as tool (tool.href)}
                    <li>
                        <a
                            href={tool.href}
                            data-sveltekit-preload-data="false"
                            class="inline-flex min-h-11 flex-col items-start gap-1 rounded-(--radius-small) py-2 focus-visible:outline-2 focus-visible:outline-offset-4"
                        >
                            <span class="underline underline-offset-4">{tool.label}</span>
                            <code class="text-xs leading-5 text-text-muted">{tool.href}</code>
                        </a>
                    </li>
                {/each}
            </ul>
        </nav>
    {/if}
</div>
