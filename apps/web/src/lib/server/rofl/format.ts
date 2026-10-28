export const MAX_ROFL_FILE_BYTES = 128 * 1024 * 1024;
export const MAX_ROFL_METADATA_BYTES = 2 * 1024 * 1024;

type RoflErrorCode =
	| 'INVALID_FILE' | 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE' | 'METADATA_TOO_LARGE'
	| 'INVALID_METADATA' | 'INVALID_CONTAINER' | 'DECOMPRESSION_FAILED' | 'RESOURCE_LIMIT'
	| 'INVALID_PACKET';

export class RoflError extends Error {
	readonly code: RoflErrorCode;

	constructor(code: RoflErrorCode, message: string) {
		super(message);
		this.name = 'RoflError';
		this.code = code;
	}
}

export interface RoflLayout {
	formatVersion: 2;
	gameVersion: string;
	headerEnd: number;
	signatureOffset: number;
	metadataOffset: number;
	metadataLength: number;
}

export function readRoflLayout(bytes: Uint8Array): RoflLayout {
	if (bytes.byteLength > MAX_ROFL_FILE_BYTES) {
		throw new RoflError('FILE_TOO_LARGE', 'ROFL 파일은 128 MiB 이하여야 합니다.');
	}
	if (bytes.byteLength < 6 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x4f || bytes[3] !== 0x54) {
		throw new RoflError('INVALID_FILE', 'ROFL 파일 헤더가 올바르지 않습니다.');
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint16(4, true) !== 2) {
		throw new RoflError('UNSUPPORTED_FORMAT', '현재 ROFL2 형식만 지원합니다.');
	}
	if (bytes.byteLength < 15 + 256 + 4) {
		throw new RoflError('INVALID_FILE', 'ROFL 파일이 잘렸거나 메타데이터가 없습니다.');
	}
	const headerEnd = 15 + bytes[14];
	const metadataLength = view.getUint32(bytes.byteLength - 4, true);
	if (metadataLength > MAX_ROFL_METADATA_BYTES) {
		throw new RoflError('METADATA_TOO_LARGE', 'ROFL 메타데이터는 2 MiB 이하여야 합니다.');
	}
	const metadataOffset = bytes.byteLength - 4 - metadataLength;
	const signatureOffset = metadataOffset - 256;
	if (bytes[14] === 0 || metadataLength === 0 || signatureOffset < headerEnd) {
		throw new RoflError('INVALID_FILE', 'ROFL 헤더와 메타데이터 범위가 올바르지 않습니다.');
	}
	let gameVersion: string;
	try { gameVersion = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(15, headerEnd)); }
	catch { throw new RoflError('INVALID_FILE', 'ROFL 게임 버전이 올바르지 않습니다.'); }
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(gameVersion)) {
		throw new RoflError('INVALID_FILE', 'ROFL 게임 버전이 올바르지 않습니다.');
	}
	return { formatVersion: 2, gameVersion, headerEnd, signatureOffset, metadataOffset, metadataLength };
}
