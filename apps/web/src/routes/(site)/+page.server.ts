import { demoGameTemplate } from '#lib/server/landing/demo-game.ts';
import type { PageServerLoad } from './$types';

// 체험의 마지막 단계에서만 쓰는 샘플 세트는 첫 화면을 막지 않도록 스트리밍한다.
export const load: PageServerLoad = () => ({ demoGame: demoGameTemplate() });
