import { getMode, switchMode } from 'stdf/theme';

export type ThemeMode = 'primary' | 'dark';

// app.html의 첫 페인트 복원 스크립트와 같은 키를 사용한다.
const STORAGE_KEY = 'theme-mode';

export function currentMode(): ThemeMode {
	return getMode() === 'dark' ? 'dark' : 'primary';
}

export function setMode(mode: ThemeMode) {
	switchMode(mode);
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// 저장이 불가능해도 현재 화면의 모드 전환은 유지한다.
	}
}
