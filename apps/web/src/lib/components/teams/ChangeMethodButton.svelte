<script lang="ts">
    import { Button, toast } from 'stdf';
    import { postAction } from '#lib/ui/actions.ts';
    import { confirm } from '#lib/ui/confirm.ts';

    // 수동 편성·경매 작업판에서 편성 방식 선택으로 되돌린다. 성공하면 다시 불러온 load가 방식을 고르는 요약으로 보낸다.
    let { disabled = false }: { disabled?: boolean } = $props();

    let pending = $state(false);

    async function change() {
        if (
            !(await confirm(
                '지금까지의 편성을 지우고 수동 편성·경매 선택으로 돌아갈까요?',
                '방식 다시 고르기'
            ))
        )
            return;
        pending = true;
        const message = await postAction('changeMethod', {});
        pending = false;
        if (message) toast.error(message);
    }
</script>

<Button
    fill="text"
    size="auto"
    heightOut="0"
    heightIn="2"
    injClass="px-3 text-sm"
    disabled={disabled || pending}
    onclick={change}>방식 다시 고르기</Button
>
