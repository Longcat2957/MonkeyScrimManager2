<script lang="ts">
    import { page } from '$app/state';
    import { SERVICE_NAME } from '#lib/branding.ts';
    import { resolve } from '$app/paths';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { MATCH_STATUS } from '#lib/features/labels.ts';
    import { bestOfLabel, type BracketSide } from '#lib/features/scrims/bracket.ts';
    import ScrimSummary from '#lib/components/scrims/ScrimSummary.svelte';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
    const bracket = $derived(data.bracket);
    const early = $derived(data.scrim.status === 'ended_early');
    const matches = $derived(bracket?.matches ?? []);
    const final = $derived(matches.find((match) => match.stage === 'final'));
    const winnerId = $derived(
        data.scrim.status === 'completed' && final?.status === 'completed' && final.winner
            ? final[final.winner].teamId
            : null
    );
    const champion = $derived(bracket?.teams.find((team) => team.id === winnerId));

    function teamName(side: BracketSide) {
        const source = side.from && bracket?.matches.find((match) => match.key === side.from);
        return (
            bracket?.teams.find((team) => team.id === side.teamId)?.name ??
            (source ? `${source.label} 승자` : '미정')
        );
    }
</script>

<svelte:head>
    <title>{data.scrim.title} · 결과 | {SERVICE_NAME}</title>
</svelte:head>

<ScrimSummary scrim={data.scrim} />

<section aria-labelledby="result-title" class="@container min-w-0">
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong pb-3">
        <h2 id="result-title" class="text-lg font-bold">{early ? '중도 종료 결과' : '대진 결과'}</h2>
        {#if matches.length}<span class="text-ui text-muted tabular-nums">{matches.length}경기</span>{/if}
    </header>
    {#if !matches.length}
        <SectionState
            state="empty"
            message={early ? '대진을 만들기 전에 내전이 중도 종료됐어요.' : '아직 기록된 경기가 없어요'}
        />
    {:else}
        {#if champion}
            <div
                class="flex flex-wrap items-center justify-between gap-4 border-b border-line-strong bg-surface-2 px-4 py-5 sm:px-6 sm:py-7"
            >
                <h3 class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                    <strong class="break-words text-2xl font-bold sm:text-3xl">{champion.name}</strong>
                    <span class="text-base font-semibold text-success">우승</span>
                </h3>
                {#if champion.members.length}
                    <ul aria-label={champion.name} class="flex max-w-full flex-wrap gap-3">
                        {#each champion.members as member (member.id)}
                            <li class="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
                                <PlayerFace name={member.displayName} imageUrl={member.iconUrl} size="sm" />
                                <span class="break-words">{member.displayName}</span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        {/if}
        <ol class="divide-y divide-line border-b border-line">
            {#each matches as match, index (match.key)}
                {@const format = bracket?.bestOf[match.stage]}
                {@const scored = match.status !== 'cancelled' && match.status !== 'pending'}
                {#snippet reportRow()}
                    <span class="flex flex-wrap items-baseline gap-2 text-sm">
                        <span class="font-brand text-muted tabular-nums"
                            >{String(index + 1).padStart(2, '0')}</span
                        >
                        <strong>{match.label}</strong>
                        {#if format}<span class="text-xs text-muted">{bestOfLabel(format)}</span>{/if}
                    </span>
                    <span
                        class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4"
                    >
                        <span class="min-w-0 break-words text-right font-semibold">
                            {teamName(match.a)}
                            {#if match.winner === 'a'}<small class="whitespace-nowrap text-success">승</small
                                >{/if}
                        </span>
                        <strong class="font-brand text-xl whitespace-nowrap tabular-nums sm:text-2xl"
                            >{scored ? `${match.scoreA} : ${match.scoreB}` : '–'}</strong
                        >
                        <span class="min-w-0 break-words font-semibold">
                            {teamName(match.b)}
                            {#if match.winner === 'b'}<small class="whitespace-nowrap text-success">승</small
                                >{/if}
                        </span>
                    </span>
                    <span class="flex items-center justify-end gap-2">
                        <StatusTag {...MATCH_STATUS[match.status]} />
                        {#if match.matchId}
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                class="size-4 text-muted"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"><path d="m9 18 6-6-6-6" /></svg
                            >
                            <span class="sr-only">경기 상세</span>
                        {/if}
                    </span>
                {/snippet}
                {@const row =
                    'report-row grid min-w-0 items-center gap-x-4 gap-y-3 px-3 py-4 text-ui sm:px-5'}
                <li>
                    {#if match.matchId}
                        <a
                            class={[row, 'hover:bg-surface-hover focus-visible:-outline-offset-2']}
                            href={resolve('/g/[guildId]/matches/[matchId]', {
                                guildId: page.params.guildId!,
                                matchId: match.matchId
                            })}>{@render reportRow()}</a
                        >
                    {:else}
                        <div class={row}>{@render reportRow()}</div>
                    {/if}
                </li>
            {/each}
        </ol>
    {/if}
</section>

<style>
    .report-row {
        grid-template-columns: minmax(0, 1fr) auto;
    }
    .report-row > :nth-child(2) {
        grid-area: 2 / 1 / 3 / -1;
    }
    @container (min-width: 40rem) {
        .report-row {
            grid-template-columns: minmax(9rem, 1fr) minmax(0, 2fr) minmax(4rem, 0.5fr);
        }
        .report-row > :nth-child(2) {
            grid-area: auto;
        }
    }
</style>
