<script lang="ts">
	import TaskDialog from './TaskDialog.svelte';

	/* 확인이 필요한 작업(철회·권한 변경)에만 쓴다. 단순 열람에는 확인 단계를 넣지 않는다. */
	let {
		open = $bindable(false),
		title,
		content,
		confirmLabel = '확인',
		danger = false,
		pending = false,
		onconfirm,
		onclosed
	}: {
		open: boolean;
		title: string;
		content: string;
		confirmLabel?: string;
		danger?: boolean;
		pending?: boolean;
		onconfirm: () => void;
		onclosed?: () => void;
	} = $props();
</script>

<TaskDialog
	bind:open
	{title}
	submitLabel={confirmLabel}
	cancelLabel="취소"
	submitTone={danger ? 'error' : 'theme'}
	{pending}
	onsubmit={onconfirm}
	{onclosed}
>
	<p class="text-body text-muted">{content}</p>
</TaskDialog>
