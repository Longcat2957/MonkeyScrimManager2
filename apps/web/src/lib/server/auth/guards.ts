import { DomainError } from '../errors.ts';
import type { Actor } from './types.ts';

export function requireUser(actor: Actor | null): Actor {
	if (!actor) throw new DomainError('UNAUTHENTICATED', '로그인이 필요해요');
	return actor;
}

/** 백오피스용 서비스 운영자 검사다. 길드나 내전의 관리 권한을 부여하지 않는다. */
export function requireServiceAdmin(actor: Actor | null): Actor {
	const user = requireUser(actor);
	if (!user.isServiceAdmin) throw new DomainError('FORBIDDEN', '서비스를 관리할 권한이 없어요');
	return user;
}
