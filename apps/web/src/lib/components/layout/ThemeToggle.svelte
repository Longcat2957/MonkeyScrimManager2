<script lang="ts">
    import { currentMode, setMode, type ThemeMode } from '#lib/ui/theme.ts';

    // switch는 라벨 있는 스위치, icon은 상단 바의 아이콘 버튼이다. 접근 가능한 이름은 같다.
    // rail은 레일에 직접 놓일 때만 켠다. 레일 안 팝업 메뉴의 라벨은 레일을 접어도 보여야 한다.
    let { variant = 'switch', rail = false }: { variant?: 'switch' | 'icon'; rail?: boolean } = $props();
    let mode: ThemeMode = $state('dark');

    // 하이드레이션 뒤 첫 페인트에서 복원한 모드를 스위치에 반영한다.
    $effect(() => {
        mode = currentMode();
    });

    function toggle() {
        mode = mode === 'dark' ? 'primary' : 'dark';
        setMode(mode);
    }
</script>

{#if variant === 'icon'}
    <button
        type="button"
        role="switch"
        aria-checked={mode === 'primary'}
        aria-label="라이트 모드"
        title="라이트 모드"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-form text-ink-2 hover:bg-surface-hover hover:text-ink pointer-coarse:size-11"
        onclick={toggle}
    >
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
        >
            {#if mode === 'primary'}
                <circle cx="12" cy="12" r="4" />
                <path
                    d="M12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.3 5.3l1.4 1.4m10.6 10.6 1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"
                />
            {:else}
                <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" stroke-linejoin="round" />
            {/if}
        </svg>
    </button>
{:else}
    <button
        type="button"
        role="switch"
        aria-checked={mode === 'primary'}
        aria-label="라이트 모드"
        class:rail-control={rail}
        class="inline-flex min-h-9 w-full items-center justify-between gap-2 overflow-hidden rounded-form px-2.5 text-ui text-ink-2 hover:bg-surface-hover pointer-coarse:min-h-11"
        onclick={toggle}
    >
        <span
            class="relative flex h-4 w-7 shrink-0 items-center rounded-full border border-line-strong bg-surface"
            aria-hidden="true"
        >
            <span
                class={[
                    'size-3 rounded-full bg-nexus motion-safe:transition-transform',
                    mode === 'primary' ? 'translate-x-3.5' : 'translate-x-0.5'
                ]}
            ></span>
        </span>
        <span aria-hidden="true" class:rail-label={rail}>라이트 모드</span>
    </button>
{/if}
