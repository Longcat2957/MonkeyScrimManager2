const statuses = {
	INVALID_INPUT: 400,
	UNAUTHENTICATED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
	SERVICE_UNAVAILABLE: 503
} as const;

export type DomainErrorCode = keyof typeof statuses;
export type FieldErrors = Readonly<Record<string, string>>;

/** 서비스가 예상한 실패다. 메시지와 필드 오류에는 사용자에게 보여 줄 내용만 넣는다. */
export class DomainError extends Error {
	readonly code: DomainErrorCode;
	readonly status: (typeof statuses)[DomainErrorCode];
	readonly errors?: FieldErrors;

	constructor(code: DomainErrorCode, message: string, errors?: FieldErrors) {
		super(message);
		this.name = 'DomainError';
		this.code = code;
		this.status = statuses[code];
		this.errors = errors;
	}
}
