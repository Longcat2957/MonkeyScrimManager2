import { resolve } from '$app/paths';

// 로그아웃은 POST만 받는다. 메뉴 항목에서 일회용 폼을 만들어 제출한다.
export function logout() {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = resolve('/auth/logout');
    form.hidden = true;
    document.body.append(form);
    form.submit();
}
