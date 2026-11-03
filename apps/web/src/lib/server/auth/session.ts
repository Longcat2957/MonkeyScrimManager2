import { getDb } from '../db/index.ts';
import { createSessionStore } from './session-store.ts';

// 기존 웹 진입점은 런타임 DB를 사용하고 저장 규칙은 별도 모듈에 모은다.
export const { createSession, getUser, validateSession, deleteSession } = createSessionStore(getDb);
