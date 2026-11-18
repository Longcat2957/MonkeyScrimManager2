<script lang="ts">
    import { asset } from '$app/paths';
    import type { LolPosition } from '#lib/features/guild/types.ts';

    // 포지션 아이콘(Riot 라인 아이콘). 장식이므로 포지션 이름은 옆 텍스트나 접근 가능한 이름으로 따로 준다.
    let { position, size = 'md' }: { position: LolPosition; size?: 'sm' | 'md' | 'lg' } = $props();

    const FILE = {
        top: 'riot/positions/top.svg',
        jungle: 'riot/positions/jungle.svg',
        mid: 'riot/positions/mid.svg',
        bot: 'riot/positions/bottom.svg',
        support: 'riot/positions/support.svg'
    } as const satisfies Record<LolPosition, string>;
    const SIZE = { sm: 'size-3.5', md: 'size-5.5', lg: 'size-8' };
</script>

<span
    aria-hidden="true"
    class={[
        'inline-block shrink-0 bg-role-gold mask-contain mask-center mask-no-repeat forced-colors:bg-[CanvasText] forced-colors:forced-color-adjust-none',
        SIZE[size]
    ]}
    style:mask-image={`url("${asset(FILE[position])}")`}
></span>
