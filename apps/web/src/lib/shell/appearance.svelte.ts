/*
 * 화면 모드(라이트·다크) 상태.
 * 헤더·개발 화면이 같은 상태를 공유하도록 이 모듈 하나만 document와 저장소를 만진다.
 */

export type ColorMode = 'light' | 'dark';

const STORAGE_KEY = 'theme-mode';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemMode(): ColorMode {
	if (typeof window === 'undefined') return 'light';
	return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function readStored(): ColorMode | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved === 'light' || saved === 'dark' ? saved : null;
	} catch {
		return null;
	}
}

class Appearance {
	mode = $state<ColorMode>('light');
	/** 사용자가 직접 고른 모드인지. 직접 고르지 않았으면 시스템 설정 변경을 따른다. */
	explicit = $state(false);
	#media: MediaQueryList | null = null;

	/** 하이드레이션 후 한 번 호출한다. 첫 페인트는 app.html의 인라인 스크립트가 이미 처리했다. */
	sync(): void {
		const stored = readStored();
		this.mode = stored ?? systemMode();
		this.explicit = stored !== null;
		this.#applyDom();

		if (!this.#media && typeof window !== 'undefined') {
			this.#media = window.matchMedia(DARK_QUERY);
			// 사용자가 고른 값이 없을 때만 시스템 설정을 따른다.
			this.#media.addEventListener('change', () => {
				if (this.explicit) return;
				this.mode = systemMode();
				this.#applyDom();
			});
		}
	}

	set(mode: ColorMode): void {
		this.mode = mode;
		this.explicit = true;
		this.#applyDom();
		try {
			localStorage.setItem(STORAGE_KEY, mode);
		} catch {
			// 저장이 막혀도 현재 화면의 전환은 유지한다.
		}
	}

	toggle(): void {
		this.set(this.mode === 'dark' ? 'light' : 'dark');
	}

	#applyDom(): void {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.mode = this.mode;
	}
}

export const appearance = new Appearance();
