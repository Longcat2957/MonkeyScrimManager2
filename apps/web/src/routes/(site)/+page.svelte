<script lang="ts">
    import { resolve } from '$app/paths';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import HeroBoard from '#lib/components/landing/HeroBoard.svelte';
    import RecordPreview from '#lib/components/landing/RecordPreview.svelte';
    import WorkflowSteps from '#lib/components/landing/WorkflowSteps.svelte';
    import { boardSample, recordSample, workflowSteps } from '#lib/content/landing.ts';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const servers = resolve('/(site)/servers');
    const signedIn = $derived(data.authenticated || data.mockPreview);
    const entryHref = $derived(
        signedIn
            ? servers + (data.mockPreview ? '?mock=1' : '')
            : `${resolve('/auth/discord')}?returnTo=${encodeURIComponent(servers)}`
    );
</script>

<svelte:head>
    <title>{SERVICE_NAME} · 리그 오브 레전드 내전</title>
    <meta
        name="description"
        content="Discord 서버에서 리그 오브 레전드 내전을 모집하고, 팀 편성부터 경기 기록까지 관리하세요."
    />
</svelte:head>

<div class="mx-auto max-w-6xl">
    <section
        aria-labelledby="intro-title"
        class="grid items-center gap-10 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-12"
    >
        <div>
            <h1
                id="intro-title"
                class="text-[clamp(2.375rem,1.6rem+3vw,4.25rem)] leading-[1.12] font-bold tracking-[-0.03em] text-balance"
            >
                우리 서버의<br />내전 상황판
            </h1>
            <p class="mt-5 max-w-[26rem] text-base leading-relaxed text-ink-2 sm:text-lg">
                Discord에서 리그 오브 레전드 내전 참가자를 모으고, 팀과 대진을 정하고, 리플레이로 전적을
                남겨요.
            </p>
            <div
                class="mt-8"
                data-sveltekit-reload={!signedIn}
                data-sveltekit-preload-data={signedIn ? 'hover' : 'false'}
            >
                <Button href={entryHref} variant="primary" size="lg">
                    {signedIn ? '내 서버로 이동' : 'Discord로 로그인'}
                    <svg
                        class="size-4"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        aria-hidden="true"
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h13m-5-5 5 5-5 5" />
                    </svg>
                </Button>
            </div>
        </div>
        <HeroBoard sample={boardSample} />
    </section>

    <section aria-labelledby="flow-title" class="mt-14 sm:mt-20">
        <h2 id="flow-title" class="mb-5 text-2xl font-bold tracking-[-0.02em]">모집부터 기록까지</h2>
        <WorkflowSteps steps={workflowSteps} />
    </section>

    <section
        aria-labelledby="records-title"
        class="mt-14 grid items-center gap-8 sm:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
    >
        <div>
            <h2 id="records-title" class="text-2xl font-bold tracking-[-0.02em] text-balance">
                기록은 함께 보고,<br />공개 범위는 직접 정해요
            </h2>
            <p class="mt-4 max-w-[30rem] text-base leading-relaxed text-ink-2">
                내전과 경기 결과, 시즌 순위는 공유 링크로 로그인 없이 볼 수 있어요. 프로필과 Riot ID를
                공개할지는 각자 내 정보에서 정해요.
            </p>
        </div>
        <RecordPreview rows={recordSample} />
    </section>
</div>
