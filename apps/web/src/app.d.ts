// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Error {
			/** 사용자에게 보여 줄 한 문장. 없으면 상태 코드 기본 문구를 쓴다. */
			message: string;
		}
		interface Locals {
			viewer: import('#lib/shell/context.ts').ViewerContext | null;
		}
		/**
		 * 셸이 읽는 문맥. 하위 레이아웃이 검증한 뒤에만 값이 있으며,
		 * 아직 그 레이아웃이 없는 라우트에서는 undefined다.
		 */
		interface PageData {
			viewer?: import('#lib/shell/context.ts').ViewerContext | null;
			guild?: import('#lib/shell/context.ts').GuildContext | null;
			scrim?: import('#lib/shell/context.ts').ScrimContext | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
