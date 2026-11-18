<script lang="ts">
    import type { GuildAuditEntry } from '#lib/features/guild/audit.ts';
    import SectionState from '#lib/components/common/SectionState.svelte';

    let { entries, total }: { entries: GuildAuditEntry[]; total: number } = $props();

    const titles: Record<GuildAuditEntry['kind'], string> = {
        riot_account_linked: 'Riot 계정 연결',
        riot_account_unlinked: 'Riot 계정 연결 해제',
        riot_account_primary_changed: '대표 계정 변경',
        discord_setting_changed: 'Discord 연동 변경',
        auction_seed_price_changed: '경매 초기가 변경',
        auction_override_price_changed: '추첨 보정가 변경'
    };
    const settings = {
        operatorRoleId: '운영자 역할',
        recruitmentChannelId: '모집 채널',
        entryChannelId: '엔트리 채널',
        resultChannelId: '결과 채널'
    };
    const date = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'medium',
        timeStyle: 'short'
    });
    const accountName = (value: GuildAuditEntry['account']) =>
        value?.gameName && value.tagLine
            ? `${value.gameName}#${value.tagLine}`
            : '이름을 확인할 수 없는 계정';
</script>

{#if entries.length === 0}
    <SectionState
        state="empty"
        message={total > 0 ? '이 쪽에는 변경 이력이 없어요' : '아직 기록된 관리 변경이 없어요'}
    />
{:else}
    <ol role="list" class="@container divide-y divide-line">
        {#each entries as entry (entry.id)}
            <li
                class="grid min-w-0 items-start gap-x-4 gap-y-2 px-4 py-3 @2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            >
                <div class="grid min-w-0 gap-1">
                    <h3 class="min-w-0 text-sm font-semibold wrap-anywhere">
                        {entry.target
                            ? `${entry.target.displayName}${entry.target.userId ? ` (${entry.target.userId})` : ''} · `
                            : ''}{titles[entry.kind]}
                    </h3>
                    <time datetime={entry.occurredAt} class="text-xs text-muted tabular-nums"
                        >{date.format(new Date(entry.occurredAt))}</time
                    >
                </div>
                <div class="grid min-w-0 gap-2 @2xl:border-l @2xl:border-line @2xl:pl-4">
                    {#if entry.setting}
                        <dl class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-ui">
                            <dt class="text-muted">항목</dt>
                            <dd>{settings[entry.setting.key]}</dd>
                            <dt class="text-muted">변경 전</dt>
                            <dd class="wrap-anywhere">
                                {entry.setting.before?.name ?? entry.setting.before?.id ?? '설정 안 함'}
                            </dd>
                            <dt class="text-muted">변경 후</dt>
                            <dd class="wrap-anywhere">
                                {entry.setting.after?.name ?? entry.setting.after?.id ?? '설정 안 함'}
                            </dd>
                        </dl>
                    {:else if entry.kind === 'riot_account_primary_changed' && entry.primary}
                        <dl class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-ui">
                            <dt class="text-muted">변경 전</dt>
                            <dd class="wrap-anywhere">{entry.primary.before?.riotId ?? '대표 계정 없음'}</dd>
                            <dt class="text-muted">변경 후</dt>
                            <dd class="wrap-anywhere">{entry.primary.after?.riotId ?? '대표 계정 없음'}</dd>
                        </dl>
                    {:else if entry.kind === 'riot_account_linked' || entry.kind === 'riot_account_unlinked'}
                        <p class="text-ui wrap-anywhere">{accountName(entry.account)}</p>
                        {#if entry.kind === 'riot_account_unlinked' && entry.primary && entry.primary.before?.id !== entry.primary.after?.id}
                            <p class="text-sm text-muted wrap-anywhere">
                                {entry.primary.after
                                    ? `새 대표 계정: ${entry.primary.after.riotId ?? '이름을 확인할 수 없는 계정'}`
                                    : '남은 대표 계정 없음'}
                            </p>
                        {/if}
                    {/if}
                    <p class="text-xs text-muted wrap-anywhere">
                        담당: {entry.actor.displayName}{entry.actor.userId ? ` (${entry.actor.userId})` : ''}
                    </p>
                </div>
            </li>
        {/each}
    </ol>
{/if}
