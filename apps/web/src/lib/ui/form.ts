import type { Attachment } from 'svelte/attachments';

/**
 * STDF Checkbox·Radio·Stepper 등의 항목은 type 없는 button이라 form 안에서 누르면 폼이 제출된다.
 * Enter의 암묵적 제출도 첫 번째 submit 버튼(이런 항목)을 눌러 값을 바꾼다.
 * form에 붙여 type이 없는 button을 type="button"으로 바꾸고, 나중에 렌더링되는 항목도 따라간다.
 * 제출 버튼은 STDF Button에 type="submit"을 명시한다.
 */
export const nonSubmitButtons: Attachment<HTMLFormElement> = (form) => {
	const fix = () => {
		for (const button of form.querySelectorAll('button:not([type])')) button.setAttribute('type', 'button');
	};
	fix();
	const observer = new MutationObserver(fix);
	observer.observe(form, { childList: true, subtree: true });
	return () => observer.disconnect();
};
