import { getContext, setContext } from 'svelte';
import { deserialize, type ActionResult } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';

/** form action 이름과 본문을 받아 SvelteKit action 결과를 돌려준다. */
export type ActionSubmitter = (name: string, body: FormData) => Promise<ActionResult>;

const LOCAL_ACTIONS = Symbol('local-actions');

/**
 * 하위 업무 컴포넌트의 form action 호출을 브라우저 안의 처리로 바꾼다.
 * 소개 화면의 체험처럼 서버에 저장하지 않는 화면에서만 사용한다.
 */
export function provideLocalActions(submit: ActionSubmitter) {
    setContext(LOCAL_ACTIONS, submit);
}

/** 컴포넌트 초기화 중에 호출한다. 체험 화면 안이면 브라우저 안 처리 함수를 돌려준다. */
export function localActions(): ActionSubmitter | undefined {
    return getContext<ActionSubmitter | undefined>(LOCAL_ACTIONS);
}

/** 현재 페이지의 form action을 호출한다. 실제 화면은 fetch, 체험 화면은 브라우저 안 처리를 쓴다. */
export function submitAction(
    local: ActionSubmitter | undefined,
    name: string,
    body: FormData,
    path = ''
): Promise<ActionResult> {
    if (local) return local(name, body);
    return fetch(`${path}?/${name}`, {
        method: 'POST',
        body,
        headers: { 'x-sveltekit-action': 'true' }
    }).then(async (response) => deserialize(await response.text()));
}

/** 컴포넌트 초기화 중에 호출해 문맥에 맞는 postAction을 얻는다. */
export function actionPoster() {
    const local = localActions();
    return (name: string, fields: Record<string, string>) => postAction(name, fields, local);
}

/**
 * 폼 요소가 없는 조작(토글·메뉴 항목)에서 현재 페이지의 form action을 호출한다.
 * 성공하면 페이지 데이터를 다시 불러오고 null을, 실패하면 화면에 보여 줄 문구를 돌려준다.
 * 체험 화면의 브라우저 안 처리는 상태를 직접 바꾸므로 다시 불러오지 않는다.
 */
export async function postAction(
    name: string,
    fields: Record<string, string>,
    local?: ActionSubmitter
): Promise<string | null> {
    let saved = false;
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.set(key, value);
    if (!local && !body.has('expectedRevision') && page.data.scrim?.revision !== undefined) {
        body.set('expectedRevision', String(page.data.scrim.revision));
    }
    try {
        const result = await submitAction(local, name, body);
        if (result.type === 'success') {
            saved = true;
            if (local) return null;
            if (typeof result.data?.nextHref === 'string') {
                await goto(result.data.nextHref, { invalidateAll: true });
            } else {
                await invalidateAll();
            }
            return null;
        }
        if (result.type === 'failure') {
            if (result.status === 409 && !local) await invalidateAll();
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
