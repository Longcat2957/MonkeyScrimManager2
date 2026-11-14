<script lang="ts">
    import { Button, Skeleton } from 'stdf';

    type Props =
        | { state: 'loading'; lines?: number }
        | { state: 'empty'; message: string }
        | { state: 'error'; message: string; onretry: () => void | Promise<void> };

    let props: Props = $props();
    let retrying = $state(false);
    let retryError = $state('');

    async function retry() {
        if (props.state !== 'error' || retrying) return;
        retrying = true;
        retryError = '';
        try {
            await props.onretry();
        } catch {
            retryError = '다시 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
        } finally {
            retrying = false;
        }
    }
</script>

<!-- 영역 하나의 로딩·빈 데이터·조회 실패를 목록 자리에 같은 크기의 상자로 표현한다. 정상 상태에서는 렌더링하지 않는다. -->
{#if props.state === 'loading'}
    <div aria-busy="true">
        <span class="sr-only">불러오는 중</span>
        <Skeleton type="p" lines={props.lines ?? 3} />
    </div>
{:else if props.state === 'empty'}
    <p
        class="rounded-(--radius-box) border border-dashed border-border px-4 py-8 text-center text-sm opacity-70"
    >
        {props.message}
    </p>
{:else}
    <div
        role="alert"
        class="flex flex-col items-center gap-3 rounded-(--radius-box) border border-dashed border-border px-4 py-6 text-center"
    >
        <p class="text-sm text-error">{retryError || props.message}</p>
        <Button
            fill="lineLight"
            size="auto"
            heightOut="0"
            heightIn="2"
            injClass="min-h-11 px-3 text-sm"
            loading={retrying ? {} : null}
            onclick={retry}
        >
            다시 시도
        </Button>
    </div>
{/if}
