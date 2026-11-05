<script lang="ts">
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { GuildRiotAccounts } from '#lib/features/me/types.ts';

    // 나에게 연결된 Riot 계정 보기. 연결·해제·대표 지정은 서버 운영자가 서버 관리에서 한다.
    let { groups }: { groups: GuildRiotAccounts[] } = $props();
</script>

<section aria-labelledby="riot-accounts" class="flex flex-col gap-3">
    <div class="flex flex-col gap-1">
        <h2 id="riot-accounts" class="text-lg font-semibold">Riot 계정</h2>
        <p class="text-sm opacity-70">
            연결과 대표 계정 지정은 서버별로 운영자가 관리해요. 해당 서버의 내전에 신청할 때 계정을 골라요.
        </p>
    </div>

    {#if groups.length}
        {#each groups as group (group.guildId)}
            <div class="flex flex-col gap-2">
                <h3 class="font-semibold">{group.guildName}</h3>
                <!-- 동작이 없는 목록이라 Cell(버튼) 대신 같은 모양의 목록으로 둔다. -->
                <ul
                    class="divide-y divide-text-primary/5 rounded-(--radius-box) bg-bg-surface dark:divide-text-dark/5 dark:bg-bg-surface-dark"
                >
                    {#each group.riotAccounts as account (account.id)}
                        <li class="flex items-center justify-between gap-4 px-3 py-4">
                            <span class="flex min-w-0 flex-col">
                                <span class="truncate font-medium">{account.gameName}</span>
                                <span class="text-xs opacity-60"
                                    >#{account.tagLine} · {account.region} 서버</span
                                >
                            </span>
                            {#if account.isPrimary}<StatusTag text="대표" state="theme" />{/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/each}
    {:else}
        <SectionState state="empty" message="연결된 Riot 계정이 없어요" />
    {/if}
</section>
