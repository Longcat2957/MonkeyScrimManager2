<script lang="ts">
    import { dev } from '$app/env';
    import { resolve } from '$app/paths';
    import { Steps } from 'stdf';
    import type { StepsItemProps } from 'stdf';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    // 진행 상태가 아니라 흐름 설명이다. 회색 '예정' 모양은 읽기 어려워 모든 단계를 완료 모양(테마색)으로 그린다.
    const FLOW: StepsItemProps[] = [
        ['모집', 'Riot 계정과 희망 포지션으로 참가 인원을 모아요'],
        ['팀 편성', '운영자가 직접 나누거나 경매로 팀을 꾸려요'],
        ['대진', '팀을 준결승·결승 자리에 배치하고 경기 방식을 정해요'],
        ['ROFL 기록', '리플레이 파일을 올리면 결과와 전적이 바로 쌓여요']
    ].map(([title, desc], index) => {
        const step = { title, desc, bar: { type: 'string' as const, content: String(index + 1) } };
        return { step, finishStep: step };
    });

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
</script>

<svelte:head>
    <title>{SERVICE_NAME}</title>
    <meta name="description" content="리그 오브 레전드 내전 기록 관리" />
</svelte:head>

<!-- 로그인·서버 선택은 헤더의 한 조작으로 유지하고, 본문에서는 현재 상태에 맞는 진입 순서를 안내한다. -->
<div class="grid max-w-6xl gap-10 lg:grid-cols-5 lg:gap-16">
    <section aria-labelledby="intro" class="min-w-0 lg:col-span-3">
        <h1 id="intro" class="max-w-3xl text-3xl font-bold text-balance md:text-4xl">
            디스코드 내전, 모집부터 전적까지
        </h1>
        <p class="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-text-muted">
            {SERVICE_NAME}은 디스코드 서버에서 함께하는 리그 오브 레전드 내전을 위한 운영 도구예요.
        </p>

        <div class="mt-8 border-t border-border pt-6">
            <h2 class="text-xl font-semibold">내전이 있는 서버에서 시작해요</h2>
            <p class="mt-3 max-w-prose leading-7 text-pretty">
                {#if !data.authenticated}
                    화면 위 <strong>로그인</strong>으로 Discord 계정에 로그인한 뒤,
                    <strong>서버 선택</strong>에서 함께할 서버를 골라요.
                {:else if data.guildListError}
                    화면을 새로고친 뒤 상단 <strong>서버 선택</strong>을 다시 열어 주세요.
                {:else if !data.guilds.length}
                    서버 선택에는 봇이 참여 중이고 내가 소속된 Discord 서버가 보여요. 함께할 서버의 운영자에게
                    이용할 서버를 확인해 주세요.
                {:else}
                    상단 <strong>서버 선택</strong>에서 서버를 연 뒤, <strong>내전</strong> 메뉴에서 참가할 모집을
                    찾아요. 서버 운영자는 같은 목록에서 모집을 만들 수 있어요.
                {/if}
            </p>
            <p class="mt-4 max-w-prose text-sm leading-6 text-pretty text-text-muted">
                공유받은 서버·내전 주소는 로그인 없이 열어 진행 상황과 전적을 볼 수 있어요.
            </p>
        </div>
    </section>

    <!-- STDF의 세로 Steps로 실제 진행 순서를 유지하고 시작 안내와 운영 흐름을 구분한다. -->
    <section class="home-flow min-w-0 lg:col-span-2" aria-labelledby="flow-title">
        <h2 id="flow-title" class="text-lg font-semibold">내전은 이렇게 이어져요</h2>
        <div class="mt-3">
            <Steps steps={FLOW} current={FLOW.length + 1} radius="full" vertical />
        </div>
    </section>
</div>

{#if dev}
    <nav aria-labelledby="dev-shortcuts" class="mt-12 border-t border-border pt-6">
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
                                    <code class="max-w-full text-xs leading-5 wrap-anywhere text-text-muted"
                                        >{#each shortcut.href.split('/') as segment, index}{#if index > 0}/<wbr
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

    <nav aria-label="개발 도구" class="mt-8 border-t border-border pt-6">
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

<style>
    /* Steps의 설명은 고정 text-xs라 홈의 흐름 안내에서만 기존 보조 글자 크기로 높인다. */
    .home-flow :global(.text-xs) {
        font-size: var(--text-sm);
        line-height: var(--text-sm--line-height);
    }
</style>
