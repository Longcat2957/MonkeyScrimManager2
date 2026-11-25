<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import { landingMatch as match } from '#lib/mocks/landing.ts';
</script>

<svelte:head>
    <title>내전 운영과 사용법 | {SERVICE_NAME}</title>
    <meta name="robots" content="noindex, nofollow" />
    <meta
        name="description"
        content="Discord에서 참가자를 모으고, 팀을 편성하고, 리플레이로 경기 전적과 MMR을 기록하는 방법."
    />
</svelte:head>

<div class="mx-auto max-w-6xl break-keep">
    <header class="grid items-end gap-6 py-8 sm:py-14 xl:grid-cols-[1fr_auto]">
        <div>
            <h1 class="text-4xl font-bold leading-[1.15] tracking-tight sm:text-6xl">
                모집은 디스코드에서.<br />전적은 <span class="font-brand text-nexus">{SERVICE_NAME}</span>에.
            </h1>
            <p class="mt-5 max-w-prose leading-relaxed text-ink-2">
                함께할 사람을 모으고 팀을 나누세요. 경기가 끝나면 리플레이 파일 하나로 승패와 포지션별 MMR이
                남습니다.
            </p>
        </div>
        <Button href="#first-scrim" variant="primary" size="lg" class="justify-self-start"
            >첫 내전 사용법 보기</Button
        >
    </header>

    <figure class="overflow-hidden rounded-box border border-line-strong bg-surface">
        <figcaption
            class="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-strong px-5 py-3 sm:px-7"
        >
            <strong>{match.title}</strong><span class="text-xs text-muted">가상 내전 예시</span>
        </figcaption>
        <div class="grid divide-y divide-line-strong md:grid-cols-2 md:divide-x md:divide-y-0">
            <section class="p-5 sm:p-7" aria-labelledby="discord-post">
                <h2 id="discord-post" class="text-sm font-semibold text-ink-2">Discord 모집 글</h2>
                <p class="my-5 flex items-baseline gap-3">
                    <strong class="font-brand text-5xl tabular-nums">{match.time}</strong><span
                        class="text-sm text-muted">시작 예정 · 5 대 5</span
                    >
                </p>
                <p class="mb-2 text-xs text-muted">참가 명단 일부</p>
                <ul class="divide-y divide-line border-y border-line">
                    {#each match.players as player (player.name)}
                        <li class="flex items-baseline gap-3 py-2">
                            <span class="min-w-8 text-sm text-role-gold">{player.position}</span><strong
                                >{player.name}</strong
                            ><span class="ml-auto text-sm text-muted">{player.status}</span>
                        </li>
                    {/each}
                </ul>
            </section>
            <section class="bg-surface-2 p-5 sm:p-7" aria-labelledby="web-record">
                <h2 id="web-record" class="text-sm font-semibold text-ink-2">웹 경기 기록</h2>
                <div
                    class="my-5 flex items-center justify-between gap-2 border-b border-line pb-4 text-center"
                >
                    <div>
                        <p class="text-xs text-muted">블루 진영</p>
                        <strong>{match.winner}</strong>
                    </div>
                    <p
                        aria-label="포로팀 1승, 칼날부리팀 0승"
                        class="font-brand text-4xl tabular-nums sm:text-5xl"
                    >
                        1 : 0
                    </p>
                    <div>
                        <p class="text-xs text-muted">레드 진영</p>
                        <strong>{match.opponent}</strong>
                    </div>
                </div>
                <div class="flex items-end justify-between gap-2">
                    <div>
                        <p class="text-xs text-muted">{match.position} MMR</p>
                        <strong>{match.player}</strong>
                    </div>
                    <strong class="font-brand text-3xl tabular-nums text-nexus">{match.mmr}</strong>
                </div>
            </section>
        </div>
    </figure>

    <section
        id="first-scrim"
        tabindex="-1"
        aria-labelledby="guide-title"
        class="mt-14 scroll-mt-24 border-t border-line-strong pt-6 pb-12 sm:mt-20"
    >
        <h2 id="guide-title" class="mb-6 text-3xl font-bold tracking-tight">첫 내전을 여는 순서</h2>
        <ol
            class="list-decimal divide-y divide-line ps-8 marker:font-brand marker:font-bold marker:text-nexus"
        >
            <li class="py-4 ps-2">
                <h3 class="font-semibold">서버 설정</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    봇이 있는 서버에서 관리자가 <strong>/초기설정</strong>을 실행합니다. 웹의 서버 관리에서
                    모집 글, 엔트리, 결과를 게시할 채널을 지정하세요.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">참가자 모집</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    <strong>/내전모집</strong>에서 일정과 인원을 정하세요. 참가자는 모집 글에서 웹 가입 없이
                    신청하거나, 늦게 온다면 도착 시각을 지정해 대기할 수 있습니다.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">팀 편성과 대진</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    선발 인원이 차면 모집을 마감합니다. 웹에서 직접 팀을 나누거나 경매로 편성한 뒤 대진과 출전
                    라인업을 확인하세요. 밴픽은 게임 안에서 진행합니다.
                </p>
            </li>
            <li class="py-4 ps-2">
                <h3 class="font-semibold">결과 기록</h3>
                <p class="mt-1 max-w-prose leading-7 text-ink-2">
                    경기 화면에서 실제 블루 팀을 확인하고 해당 세트의 <strong>.rofl</strong> 파일을 올리세요. 출전자와
                    결과가 검증되면 전적과 MMR에 반영됩니다.
                </p>
            </li>
        </ol>
    </section>
</div>
