<script lang="ts">
    import { SERVICE_NAME } from '#lib/branding.ts';
    import Button from '#lib/components/common/Button.svelte';
    import PlayerFace from '#lib/components/common/PlayerFace.svelte';
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import { formatSchedule, POSITIONS } from '#lib/features/labels.ts';

    // 봇이 채팅 채널에 올리는 모집 글. 실제 모집 글과 같은 정보·순서로 보여 주며 참가하기만 조작할 수 있다.
    type Props = {
        title: string;
        scheduledAt: string | null;
        teamCount: number;
        roster: { id: string; name: string; positions: LolPosition[] }[];
        capacity: number;
        joined: boolean;
        onjoin: () => void;
    };

    let { title, scheduledAt, teamCount, roster, capacity, joined, onjoin }: Props = $props();

    const label = (positions: LolPosition[]) =>
        positions.length === POSITIONS.length
            ? '포지션 무관'
            : positions.map((key) => POSITIONS.find((item) => item.key === key)?.text ?? key).join(' / ');
</script>

<article aria-labelledby="recruit-post" class="panel flex h-full min-w-0 flex-col overflow-hidden bg-rail">
    <p class="border-b border-line px-4 py-2.5 text-ui font-semibold text-muted"># 내전-모집</p>
    <div class="flex min-w-0 gap-3 p-4">
        <PlayerFace name={SERVICE_NAME} imageUrl={null} />
        <div class="min-w-0 flex-1">
            <p class="text-ui">
                <strong class="font-brand text-ink">{SERVICE_NAME}</strong>
                <span class="ml-1.5 rounded-small bg-nexus px-1 text-micro font-bold text-nexus-ink">BOT</span
                >
            </p>
            <div class="mt-2 rounded-box border border-line bg-surface p-3.5">
                <h3 id="recruit-post" class="text-base font-bold text-balance">{title}</h3>
                <p class="mt-0.5 text-ui text-ink-2">{formatSchedule(scheduledAt)}</p>
                <p class="mt-0.5 text-ui"><strong>모집 중</strong> · {teamCount}팀</p>
                <h4 class="mt-3 text-sm font-bold tabular-nums">선발 {roster.length}/{capacity}</h4>
                <ol class="mt-1 grid gap-0.5 text-ui text-ink-2">
                    {#each roster as player, index (player.id)}
                        <li class="flex min-w-0 gap-1.5">
                            <span class="shrink-0 text-muted tabular-nums"
                                >{String(index + 1).padStart(2, '0')}.</span
                            >
                            <span class="min-w-0 wrap-anywhere"
                                ><strong class="text-ink">{player.name}</strong> · {label(
                                    player.positions
                                )}</span
                            >
                        </li>
                    {/each}
                </ol>
                <h4 class="mt-3 text-sm font-bold">대기 0명</h4>
                <p class="text-ui text-muted">없음</p>
            </div>
            <div class="mt-2">
                <Button variant="primary" disabled={joined} onclick={onjoin}>
                    {joined ? '신청했어요' : '참가하기'}
                </Button>
            </div>
        </div>
    </div>
</article>
