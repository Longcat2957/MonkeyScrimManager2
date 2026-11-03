import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { page } from '$app/state';

/**
 * 폼 요소가 없는 조작(토글·메뉴 항목)에서 현재 페이지의 form action을 호출한다.
 * 성공하면 페이지 데이터를 다시 불러오고 null을, 실패하면 화면에 보여 줄 문구를 돌려준다.
 */
export async function postAction(name: string, fields: Record<string, string>): Promise<string | null> {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	if (!body.has('expectedRevision') && page.data.scrim?.revision !== undefined) {
		body.set('expectedRevision', String(page.data.scrim.revision));
	}
	try {
		const response = await fetch(`?/${name}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'success') {
			await invalidateAll();
			return null;
		}
		if (result.type === 'failure') {
			if (result.status === 409) await invalidateAll();
			if (typeof result.data?.message === 'string') return result.data.message;
		}
		return '저장하지 못했어요';
	} catch {
		// 응답을 받지 못하면 저장 여부를 단정하지 않고 현재 상태를 다시 확인한다.
		await invalidateAll();
		return '연결이 끊겼어요. 현재 상태를 다시 불러왔어요';
	}
}
