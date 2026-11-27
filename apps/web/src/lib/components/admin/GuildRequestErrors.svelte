<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import SectionState from '#lib/components/common/SectionState.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import type { listGuildRequestErrors } from '#lib/server/guild/request-errors.ts';
    import { toast } from '#lib/ui/toast.ts';

    let { entries, total }: NonNullable<Awaited<ReturnType<typeof listGuildRequestErrors>>> = $props();
    const date = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'medium',
        timeStyle: 'medium'
    });
    const kinds = {
        app: '애플리케이션 오류',
        framework: '프레임워크 오류',
        validation: '인자 검증 오류',
        unknown: '예기치 않은 오류'
    };

    async function copyId(id: string) {
        try {
            await navigator.clipboard.writeText(id);
            toast.success('요청 ID를 복사했어요');
        } catch {
            toast.error('복사할 수 없어요. 요청 ID를 선택해 복사해 주세요.');
        }
    }
</script>

{#if !entries.length}
    <SectionState
        state="empty"
        message={total ? '이 쪽에는 오류 로그가 없어요' : '최근 30일간 기록된 요청 오류가 없어요'}
    />
{:else}
    <ol role="list" class="divide-y divide-line">
        {#each entries as entry (entry.requestId)}
            <li>
                <details>
                    <summary class="cursor-pointer px-4 py-3 text-sm hover:bg-surface-hover">
                        <StatusTag
                            state={entry.status >= 500 ? 'error' : 'warning'}
                            text={`HTTP ${entry.status}`}
                        />
                        <span class="ml-1 font-semibold wrap-anywhere"
                            >{entry.method} {entry.route ?? '알 수 없는 경로'}</span
                        >
                        <time
                            class="mt-1 block text-xs text-muted tabular-nums"
                            datetime={entry.occurredAt.toISOString()}
                        >
                            {date.format(entry.occurredAt)}
                        </time>
                    </summary>
                    <div class="grid gap-2 bg-surface-2 px-4 py-3 text-ui">
                        {#if entry.kind}<p>{kinds[entry.kind]}</p>{/if}
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-muted">요청 ID</span>
                            <code class="select-all wrap-anywhere">{entry.requestId}</code>
                            <Button variant="secondary" size="sm" onclick={() => copyId(entry.requestId)}
                                >요청 ID 복사</Button
                            >
                        </div>
                    </div>
                </details>
            </li>
        {/each}
    </ol>
{/if}
