<script lang="ts">
    import { resolve } from '$app/paths';
    import { BOT_INVITE_URL, SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import TryScrim from '#lib/components/landing/TryScrim.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const signedIn = $derived(data.authenticated || data.mockPreview);
    // 로그인한 사용자는 자기 서버로, 처음 온 운영자는 봇 추가로 시작한다. 초대 링크 공개 전에는 설치 안내로 보낸다.
    const entry = $derived(
        signedIn
            ? {
                  label: '내 서버로 이동',
                  href: resolve('/(site)/servers') + (data.mockPreview ? '?mock=1' : '')
              }
            : { label: '서버에 봇 추가', href: BOT_INVITE_URL ?? resolve('/(site)/discord') }
    );
</script>

<svelte:head>
    <title>{SERVICE_NAME} · 리그 오브 레전드 내전</title>
    <meta
        name="description"
        content="Discord 서버에서 리그 오브 레전드 내전을 모집하고, 팀장 경매로 팀을 나누고, 리플레이로 전적을 기록하세요."
    />
</svelte:head>

<div class="mx-auto grid max-w-6xl gap-10 sm:gap-14">
    <section
        aria-labelledby="intro-title"
        class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-6"
    >
        <div>
            <h1
                id="intro-title"
                class="text-[clamp(2.25rem,1.6rem+2.6vw,3.75rem)] leading-[1.12] font-bold tracking-[-0.03em] text-balance"
            >
                우리 서버의 내전 상황판
            </h1>
            <p class="mt-4 max-w-[34rem] text-base leading-relaxed text-ink-2 sm:text-lg">
                Discord 모집 글의 버튼으로 모이고, 팀장 경매로 팀을 나누고, 리플레이 한 장으로 전적을 남겨요.
            </p>
        </div>
        <div data-sveltekit-preload-data={signedIn ? 'hover' : 'false'}>
            <Button href={entry.href} variant="primary" size="lg">
                {entry.label}
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
    </section>

    <section aria-labelledby="try-title" class="grid min-w-0 gap-4">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="try-title" class="text-2xl font-bold tracking-[-0.02em]">한 판 진행해 보기</h2>
            <p class="text-ui text-muted">연습용 가상 내전이에요. 새로고침하면 처음부터 다시 해요.</p>
        </div>
        <TryScrim template={data.demoGame} />
    </section>
</div>
