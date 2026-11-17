// 테마 모드는 app.html의 첫 페인트 복원 스크립트와 같은 키·속성을 쓴다.
export type ThemeMode = 'primary' | 'dark';

const STORAGE_KEY = 'theme-mode';

export function currentMode(): ThemeMode {
    return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'primary';
}

// html[data-mode]만 바꾼다. 색은 layout.css의 토큰이 mode에 맞춰 다시 계산된다.
export function setMode(mode: ThemeMode) {
    document.documentElement.dataset.mode = mode;
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // 저장이 불가능해도 현재 화면의 모드 전환은 유지한다.
    }
}
