import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	// TODO: 인증 방식을 정한 뒤 요청의 인증 정보를 확인하고 event.locals에 설정한다.
	// TODO: 권한 정책을 정한 뒤 페이지와 API의 접근 권한을 검사한다.
	return resolve(event);
};
