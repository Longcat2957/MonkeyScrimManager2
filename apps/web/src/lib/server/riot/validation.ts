import { RiotError } from './errors.ts';

export function pathSegment(value: string, name: string): string {
	if (typeof value !== 'string') throw new RiotError('INVALID_ARGUMENT', `${name} must be a string.`);
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 256 || trimmed === '.' || trimmed === '..' || /[\x00-\x1f\x7f]/.test(trimmed)) {
		throw new RiotError('INVALID_ARGUMENT', `${name} is invalid.`);
	}
	try { return encodeURIComponent(trimmed); }
	catch { throw new RiotError('INVALID_ARGUMENT', `${name} contains invalid characters.`); }
}

export function invalidResponse(): never {
	throw new RiotError('INVALID_RESPONSE', 'Riot returned an unexpected response structure.');
}

export function objectResponse(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidResponse();
	return value as Record<string, unknown>;
}

export function arrayResponse(value: unknown): unknown[] {
	if (!Array.isArray(value)) return invalidResponse();
	return value;
}
