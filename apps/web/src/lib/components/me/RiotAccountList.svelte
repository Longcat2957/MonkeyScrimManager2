<script lang="ts">
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { GuildRiotAccounts } from '#lib/features/me/types.ts';

    // 나에게 연결된 Riot 계정 보기. 연결·해제·대표 지정은 서버 운영자가 서버 관리에서 한다.
    let { groups }: { groups: GuildRiotAccounts[] } = $props();
</script>

<section aria-labelledby="riot-accounts">
    <div class="px-4 py-3">
        <h2 id="riot-accounts" class="font-bold">Riot 계정</h2>
        {#if groups.length}
            <p class="mt-1 text-ui text-muted">
                서버별로 연결된 계정이에요. 계정 수정이나 대표 계정 변경은 해당 서버 운영자에게 요청해 주세요.
            </p>
        {/if}
    </div>

    {#if groups.length}
        {#each groups as group (group.guildId)}
            <div class="min-w-0">
                <h3 class="border-y border-line bg-surface-2 px-4 py-1.5 text-ui font-semibold wrap-anywhere">
                    {group.guildName}
                </h3>
                <!-- 동작이 없는 목록이라 Cell(버튼) 대신 같은 모양의 목록으로 둔다. -->
                <ul class="divide-y divide-line">
                    {#each group.riotAccounts as account (account.id)}
                        <li class="flex min-h-11 items-center justify-between gap-2 px-4 py-2">
                            <span class="min-w-0 text-sm font-medium wrap-anywhere">
                                {account.gameName}<span class="font-normal text-muted"
                                    >#{account.tagLine}</span
                                >
                                <span class="block text-xs font-normal text-muted">{account.region} 서버</span
                                >
                            </span>
                            {#if account.isPrimary}<StatusTag text="대표" state="theme" />{/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    {:else}
        <SectionState
            state="empty"
            message="연결된 Riot 계정이 없어요. 계정 연결 없이도 내전에 신청할 수 있어요."
        />
    {/if}
</section>
