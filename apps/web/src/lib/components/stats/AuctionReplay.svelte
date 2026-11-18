<script lang="ts">
    import { page } from '$app/state';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { LedgerAuction } from '#lib/features/stats/auction-ledger.ts';
    import { integer } from '#lib/features/players/format.ts';

    let { auction }: { auction: LedgerAuction } = $props();
    const teams = $derived(
        auction.teams.map((team) => {
            let balance = team.budget;
            const entries = team.signings.map((signing) => {
                balance -= signing.price ?? 0;
                return { signing, balance };
            });
            return { team, entries, balance, spent: team.budget - balance };
        })
    );
</script>

<section aria-label={`${auction.title} 경매 복기`} class="min-w-0">
    <header class="mb-4 border-b border-line-strong pb-3">
        <p class="mb-1 text-xs font-semibold text-muted">경매 복기 · {teams.length}팀</p>
        <h2 class="break-words text-xl font-bold text-ink">{auction.title}</h2>
    </header>
    <div class="grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
        {#each teams as { team, entries, balance, spent } (team.id)}
            <article class="panel min-w-0 overflow-hidden">
                <header class="bg-surface-2 px-4 pt-4 pb-3">
                    <h3 class="break-words text-lg font-bold">{team.name}</h3>
                    <p class="mt-1 flex min-w-0 items-center gap-2 text-ui text-muted">
                        {#if team.captain}
                            <PlayerFace
                                name={team.captain.name}
                                imageUrl={team.captain.avatarUrl}
                                size="xs"
                            />
                        {/if}
                        <span class="min-w-0 wrap-anywhere">팀장 · {team.captain?.name ?? '미지정'}</span>
                    </p>
                    <div class="mt-5 flex flex-wrap items-baseline justify-between gap-1 text-xs text-muted">
                        <span>시작 예산 <b class="tabular-nums text-ink">{integer(team.budget)}P</b></span>
                        <span>지출 <b class="tabular-nums text-ink">{integer(spent)}P</b></span>
                    </div>
                    <div class="my-2 flex h-2 overflow-hidden rounded-small bg-line" aria-hidden="true">
                        {#each entries as { signing } (signing.id)}
                            {#if signing.price && team.budget}
                                <span
                                    class="h-full border-e border-surface-2 bg-nexus"
                                    style:width={`${(signing.price / team.budget) * 100}%`}
                                ></span>
                            {/if}
                        {/each}
                    </div>
                    <p class="text-right text-xs text-muted">
                        최종 잔액 <b class="ms-1 text-base tabular-nums text-ink">{integer(balance)}P</b>
                    </p>
                </header>
                {#if entries.length}
                    <table class="w-full table-fixed text-left text-ui tabular-nums">
                        <caption class="sr-only">{team.name} 영입 순서와 거래 직후 잔액</caption>
                        <thead class="border-y border-line text-xs text-muted"
                            ><tr>
                                <th scope="col" class="w-11 py-2 ps-3 font-medium">순번</th><th
                                    scope="col"
                                    class="py-2 ps-1 font-medium">선수</th
                                >
                                <th scope="col" class="w-[26%] py-2 text-right font-medium">영입가</th><th
                                    scope="col"
                                    class="w-[25%] py-2 pe-3 text-right font-medium">잔액</th
                                >
                            </tr></thead
                        >
                        <tbody
                            >{#each entries as { signing, balance: after } (signing.id)}
                                <tr
                                    id={`signing-${signing.id}`}
                                    aria-current={typeof window !== 'undefined' &&
                                    page.url.hash === `#signing-${signing.id}`
                                        ? 'location'
                                        : undefined}
                                    class="scroll-mt-20 border-b border-line last:border-0 target:bg-selected aria-[current=location]:bg-selected aria-[current=location]:outline-2 aria-[current=location]:-outline-offset-2 aria-[current=location]:outline-nexus"
                                >
                                    <td class="py-3 ps-3 text-xs text-muted"
                                        >{String(signing.order).padStart(2, '0')}</td
                                    >
                                    <th scope="row" class="px-1 py-3 font-semibold">
                                        <span class="flex min-w-0 items-center gap-1.5">
                                            <PlayerFace
                                                name={signing.player.name}
                                                imageUrl={signing.player.avatarUrl}
                                                size="xs"
                                            />
                                            <span class="min-w-0 wrap-anywhere">{signing.player.name}</span>
                                        </span>
                                    </th>
                                    <td class="break-words py-3 text-right" class:text-muted={!signing.price}
                                        >{signing.price === null
                                            ? '수동 배치'
                                            : `${integer(signing.price)}P`}</td
                                    >
                                    <td class="break-words py-3 pe-3 text-right text-muted"
                                        >{integer(after)}P</td
                                    >
                                </tr>
                            {/each}</tbody
                        >
                    </table>
                {:else}
                    <p class="px-4 py-5 text-ui text-muted">영입한 선수가 없어요.</p>
                {/if}
            </article>
        {/each}
    </div>
</section>
