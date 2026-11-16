import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';

/**
 * 폼 요소가 없는 조작(토글·메뉴 항목)에서 현재 페이지의 form action을 호출한다.
 * 성공하면 페이지 데이터를 다시 불러오고 null을, 실패하면 화면에 보여 줄 문구를 돌려준다.
 */
export async function postAction(name: string, fields: Record<string, string>): Promise<string | null> {
    let saved = false;
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
            saved = true;
            if (typeof result.data?.nextHref === 'string') {
                await goto(result.data.nextHref, { invalidateAll: true });
            } else {
                await invalidateAll();
            }
            return null;
        }
        if (result.type === 'failure') {
            if (result.status === 409) await invalidateAll();
            if (typeof result.data?.message === 'string') return result.data.message;
        }
        return '저장하지 못했어요';
    } catch {
        // 통신 실패 뒤 강제 재조회하면 입력 화면까지 오류 페이지로 바뀔 수 있다. 자동 재전송도 하지 않는다.
        return saved
            ? '저장했지만 화면을 갱신하지 못했어요. 새로고침해 현재 상태를 확인해 주세요.'
            : '요청 결과를 확인하지 못했어요. 연결을 확인한 뒤 새로고침해 현재 상태를 확인해 주세요.';
    }
}
