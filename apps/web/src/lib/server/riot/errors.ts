const statuses = {
	INVALID_ARGUMENT: 400,
	NOT_FOUND: 404,
	RATE_LIMITED: 429,
	NOT_CONFIGURED: 503,
	INVALID_CONFIGURATION: 503,
	UPSTREAM_AUTH_ERROR: 503,
	BUSY: 503,
	UPSTREAM_ERROR: 502,
	INVALID_RESPONSE: 502,
	NETWORK_ERROR: 502,
	TIMEOUT: 504
} as const;

export type RiotErrorCode = keyof typeof statuses;

export class RiotError extends Error {
	readonly code: RiotErrorCode;
	readonly status: number;
	readonly upstreamStatus?: number;
	readonly retryAfterSeconds?: number;

	constructor(
		code: RiotErrorCode,
		message: string,
		options: { upstreamStatus?: number; retryAfterSeconds?: number } = {}
	) {
		super(message);
		this.name = 'RiotError';
		this.code = code;
		this.status = statuses[code];
		this.upstreamStatus = options.upstreamStatus;
		this.retryAfterSeconds = options.retryAfterSeconds;
	}
}
