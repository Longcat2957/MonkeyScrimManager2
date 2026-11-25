<script lang="ts">
    import type { LolPosition } from '#lib/features/guild/types.ts';
    import MyRegistrationBar from './MyRegistrationBar.svelte';

    type Props = {
        joined: boolean;
        positions: LolPosition[];
        player: string;
        participantCount: number;
        capacity: number;
    };

    let {
        joined = $bindable(),
        positions = $bindable(),
        player,
        participantCount,
        capacity
    }: Props = $props();

    const actions = {
        register(_accountId: string, selected: LolPosition[]) {
            positions = selected;
            joined = true;
        },
        update(_accountId: string, selected: LolPosition[]) {
            positions = selected;
        },
        withdraw() {
            joined = false;
        }
    };
</script>

<div class="grid min-w-0 gap-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span><strong>{player}</strong> 님으로 참가</span>
        <span role="status" class="font-semibold tabular-nums">참가 {participantCount}/{capacity}명</span>
    </div>
    <MyRegistrationBar
        registration={joined ? { id: player, status: 'selected', riotAccountId: null, positions } : null}
        accounts={[]}
        primaryAccountId={null}
        previousPositions={positions}
        canRegister={!joined && participantCount < capacity}
        canEdit={joined}
        blockedReason={null}
        {actions}
    />
</div>
