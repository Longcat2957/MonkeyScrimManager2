import type { getDb } from './index.ts';

/** 실제 연결 함수에서 타입만 추론하며 이 모듈을 읽을 때 DB 연결을 만들지 않는다. */
export type Database = ReturnType<typeof getDb>;

/** 최상위 업무 함수가 연 트랜잭션을 하위 저장 함수에 전달할 때 사용한다. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
