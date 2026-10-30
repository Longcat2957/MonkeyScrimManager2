// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { GuildContext, GuildSummary, SessionUser } from '#lib/features/guild/types.ts';
import type { ScrimContext } from '#lib/features/scrims/types.ts';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// 레이아웃이 내려주는 공통 문맥이다. 헤더는 scrim → guild → 없음 순으로 범위를 정한다.
		interface PageData {
			user?: SessionUser | null;
			guilds?: GuildSummary[];
			guild?: GuildContext | null;
			scrim?: ScrimContext | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
