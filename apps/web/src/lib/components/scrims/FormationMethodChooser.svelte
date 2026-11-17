<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import Button from '#lib/components/common/Button.svelte';
    import StatusTag from '#lib/components/common/StatusTag.svelte';
    import { formationPath } from '#lib/features/scrims/paths.ts';
    import type { FormationMethod, ScrimStatus } from '#lib/features/scrims/types.ts';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';
    import { toast } from '#lib/ui/toast.ts';

    // 운영자가 모집 중·편성 중에 편성 방식을 고르거나 바꾼다.
    let { method, status }: { method: FormationMethod | null; status: ScrimStatus } = $props();

    const METHODS: { name: FormationMethod; title: string; description: string }[] = [
        { name: 'manual', title: '수동 편성', description: '운영자가 참가자를 팀 자리에 직접 배치해요' },
        { name: 'auction', title: '경매', description: '팀장을 정하고 포인트로 입찰해 팀원을 데려가요' }
    ];

    let pending = $state<FormationMethod | null>(null);

    async function choose(next: FormationMethod) {
        if (next === method) return;
        // 편성을 시작한 뒤 바꾸면 지금까지의 배치·경매 기록이 지워진다.
        if (
            status === 'preparing' &&
            method &&
            !(await confirm('지금까지의 편성을 지우고 편성 방식을 바꿀까요?', '편성 방식 바꾸기'))
        )
            return;
        pending = next;
        const message = await postAction('chooseMethod', { method: next });
        if (message) toast.error(message);
        else if (status === 'preparing')
            await goto(
                formationPath({ guildId: page.params.guildId!, scrimId: page.params.scrimId! }, next)!
            );
        pending = null;
    }
</script>

<section
    class="hex-panel flex flex-col gap-3 p-3.5"
    aria-labelledby="formation-method"
    aria-busy={Boolean(pending)}
>
    <h2 id="formation-method" class="text-[0.9375rem] font-semibold">편성 방식</h2>
    <div class="flex flex-col gap-2">
        {#each METHODS as item (item.name)}
            {@const selected = item.name === method}
            <button
                type="button"
                aria-pressed={selected}
                disabled={Boolean(pending)}
                class={[
                    'flex flex-col items-start gap-1 rounded-(--radius-form) border px-3 py-3 text-left transition-colors disabled:cursor-wait',
                    selected
                        ? 'border-hex bg-hex/10 text-hex'
                        : 'border-brass-line bg-bg-surface hover:border-hex dark:bg-bg-surface-dark'
                ]}
                onclick={() => choose(item.name)}
            >
                <span class="flex items-center gap-2 text-sm font-semibold">
                    {item.title}
                    {#if selected}<StatusTag text="선택됨" state="theme" />{/if}
                    {#if pending === item.name}<span
                            class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                            aria-hidden="true"
                        ></span>{/if}
                </span>
                <span class="text-xs text-text-muted">{item.description}</span>
            </button>
        {/each}
    </div>
</section>
