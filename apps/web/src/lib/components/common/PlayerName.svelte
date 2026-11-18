<script lang="ts">
    import { resolve } from '$app/paths';
    import PlayerFace from './PlayerFace.svelte';

    type Props = {
        guildId: string;
        displayName: string;
        // 사용자 연결이 없거나 link가 false면 이름만 표시한다.
        userId: string | null;
        // 프로필 사진이나 주 챔피언 아이콘. 없으면 이름 첫 글자를 쓴다.
        imageUrl: string | null;
        // 참가에 쓴 Riot ID. 없으면 이름만 표시한다.
        riotId?: string | null;
        link?: boolean;
    };

    let { guildId, displayName, userId, imageUrl, riotId = null, link = true }: Props = $props();

    const href = $derived(
        link && userId ? resolve('/g/[guildId]/players/[userId]', { guildId, userId }) : null
    );
</script>

<!-- 참가 당시 표시 이름과 전적 링크 하나. 사진은 장식이므로 이름을 반복하지 않는다. -->
<span class="flex min-w-0 items-center gap-2.5">
    <PlayerFace name={displayName} {imageUrl} size="sm" />
    <span class="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        {#if href}
            <a
                {href}
                class="max-w-full truncate text-ui font-semibold text-ink underline-offset-2 hover:underline"
                >{displayName}</a
            >
        {:else}
            <span class="max-w-full truncate text-ui font-semibold text-ink">{displayName}</span>
        {/if}
        {#if riotId}
            <span class="max-w-full truncate text-xs text-muted">{riotId}</span>
        {/if}
    </span>
</span>
