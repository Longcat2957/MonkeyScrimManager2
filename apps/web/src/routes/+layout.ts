import { getViewer } from '#lib/data/index.ts';
import type { LayoutLoad } from './$types';

// 로그인 사용자. 인증 구현 전에는 개발 모드에서만 목 사용자를 돌려준다.
export const load: LayoutLoad = async () => {
	return { viewer: await getViewer() };
};
