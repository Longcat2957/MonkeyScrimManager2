<script lang="ts">
    import Button from '#lib/components/common/Button.svelte';
    import PopoverMenu from '#lib/components/common/PopoverMenu.svelte';
    import type { MenuAction } from '#lib/components/common/menu.ts';

    type Props = {
        label: string;
        description: string;
        // 지금 설정된 값을 사람이 읽을 수 있게 쓴 문구
        value: string;
        actions: MenuAction[];
        busy: boolean;
        disabled: boolean;
        onselect: (index: number) => void;
    };

    let { label, description, value, actions, busy, disabled, onselect }: Props = $props();
    let open = $state(false);
</script>

<!-- 선택지가 많아 Radio 대신 현재 값 버튼으로 메뉴를 연다. -->
<li class="grid min-w-0 items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
    <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-sm font-semibold">{label}</span>
        <span class="text-ui text-muted">{description}</span>
    </span>
    <span class="relative inline-flex w-full min-w-0 max-w-full sm:w-auto sm:justify-self-end">
        <Button
            variant="secondary"
            aria-expanded={open}
            aria-haspopup="menu"
            class="w-full max-w-full justify-between gap-1.5 whitespace-normal"
            loading={busy}
            {disabled}
            onclick={() => {
                if (!disabled) open = !open;
            }}
        >
            <span class="sr-only">{label} 바꾸기, 현재 </span><span class="min-w-0 wrap-anywhere"
                >{value}</span
            >
            <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                class="size-4 opacity-60"
                fill="none"
                stroke="currentColor"
                stroke-width="2"><path d="m6 9 6 6 6-6" /></svg
            >
        </Button>
        <PopoverMenu
            bind:open
            {label}
            {actions}
            align="right"
            onselect={(index) => {
                open = false;
                if (!disabled) onselect(index);
            }}
        />
    </span>
</li>
