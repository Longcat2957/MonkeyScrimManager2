<script lang="ts">
    // 내전 진행 순서. 내전 단계 바와 같은 번호 칸 문법을 쓰되 이동 링크가 아닌 설명 목록이다.
    let { steps }: { steps: { title: string; text: string }[] } = $props();
</script>

<ol class="grid gap-px overflow-hidden rounded-box border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
    {#each steps as step, index (step.title)}
        <li class="flex flex-col gap-3 bg-surface p-5">
            <span class="flex items-center gap-2.5">
                <span
                    class="grid size-[26px] shrink-0 place-items-center rounded-[5px] border border-line-strong font-brand text-base font-bold text-nexus"
                    >{index + 1}</span
                >
                <strong class="text-base">{step.title}</strong>
            </span>
            <p class="text-sm leading-relaxed text-ink-2">{step.text}</p>
        </li>
    {/each}
</ol>
