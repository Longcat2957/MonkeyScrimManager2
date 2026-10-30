import { dialog } from 'stdf';

/**
 * STDF dialog.confirm에 Escape 닫기와 포커스 복귀를 더한다.
 * Feedback의 내부 상태는 공개되지 않아 overlay attachment 대신 호출 단위로 처리한다.
 */
export async function confirm(content: string, title?: string): Promise<boolean> {
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const onkeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') dialog.close();
	};
	document.addEventListener('keydown', onkeydown);
	try {
		return await dialog.confirm(content, title);
	} finally {
		document.removeEventListener('keydown', onkeydown);
		if (previousFocus?.isConnected) previousFocus.focus();
	}
}
