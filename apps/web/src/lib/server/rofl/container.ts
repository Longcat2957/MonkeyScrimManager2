import { constants, zstdDecompressSync } from 'node:zlib';
import { readRoflLayout, RoflError, type RoflLayout } from './format.ts';

export const MAX_CHUNK_BYTES = 16 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_CHUNKS = 65_536;

export interface RoflChunk {
	index: number;
	id: number;
	nextChunkId: number;
	stream: number;
	offset: number;
	headerLength: 17 | 18;
	/** Meaning is unverified. Observed as 0x04 in the 16.21 sample, including raw chunks. */
	extensionByte: number | null;
	uncompressedSize: number;
	compressedSize: number;
	bodyOffset: number;
	bodyLength: number;
}

export interface RoflContainer {
	layout: RoflLayout;
	chunkHeaderLength: 17 | 18;
	chunks: RoflChunk[];
	decompressedBytes: number;
}

function invalidContainer(): never {
	throw new RoflError('INVALID_CONTAINER', 'ROFL 청크 경계 또는 압축 형식을 확인할 수 없습니다.');
}

/**
 * Require one complete Zstd frame per compressed chunk, as observed in the replay samples.
 * RFC 8878 sections 3.1.1.1–3.1.1.2: https://www.rfc-editor.org/rfc/rfc8878.html#section-3.1.1
 * Node 22 can return partial output for truncated frames, even with finishFlush set to ZSTD_e_end.
 * This checks framing only; native Zstd still validates compressed data, sizes and checksums.
 */
function validateSingleZstdFrame(body: Uint8Array): void {
	const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
	if (body.byteLength < 5 || view.getUint32(0, true) !== 0xfd2fb528) invalidContainer();
	const descriptor = body[4];
	if (descriptor & 0x08) invalidContainer(); // Reserved bit; the separate unused bit is ignored.
	const singleSegment = (descriptor & 0x20) !== 0;
	const sizeFlag = descriptor >>> 6;
	const contentSizeLength = sizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << sizeFlag;
	const dictionaryIdLength = [0, 1, 2, 4][descriptor & 3];
	let cursor = 5 + (singleSegment ? 0 : 1) + dictionaryIdLength + contentSizeLength;
	if (cursor > body.byteLength) invalidContainer();
	for (;;) {
		if (body.byteLength - cursor < 3) invalidContainer();
		const blockHeader = body[cursor] | (body[cursor + 1] << 8) | (body[cursor + 2] << 16);
		cursor += 3;
		const blockType = (blockHeader >>> 1) & 3;
		if (blockType === 3) invalidContainer();
		const storedLength = blockType === 1 ? 1 : blockHeader >>> 3;
		if (storedLength > body.byteLength - cursor) invalidContainer();
		cursor += storedLength;
		if (blockHeader & 1) break;
	}
	if (descriptor & 0x04) cursor += 4;
	// Reject concatenated/skippable frames and trailing bytes; this is a ROFL chunk policy.
	if (cursor !== body.byteLength) invalidContainer();
}

function readChunks(bytes: Uint8Array, layout: RoflLayout, headerLength: 17 | 18): RoflContainer {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const chunks: RoflChunk[] = [];
	let cursor = layout.headerEnd;
	let decompressedBytes = 0;
	while (cursor < layout.signatureOffset) {
		if (headerLength > layout.signatureOffset - cursor) invalidContainer();
		const uncompressedSize = view.getUint32(cursor + 9, true);
		const compressedSize = view.getUint32(cursor + 13, true);
		const bodyOffset = cursor + headerLength;
		const bodyLength = compressedSize || uncompressedSize;
		if (bodyLength > layout.signatureOffset - bodyOffset) invalidContainer();
		decompressedBytes += uncompressedSize;
		if (chunks.length >= MAX_CHUNKS || uncompressedSize > MAX_CHUNK_BYTES || decompressedBytes > MAX_DECOMPRESSED_BYTES) {
			throw new RoflError('RESOURCE_LIMIT', 'ROFL 청크 수 또는 압축 해제 크기 제한을 초과했습니다.');
		}
		if (compressedSize > 0 && (bodyLength < 4 || view.getUint32(bodyOffset, true) !== 0xfd2fb528)) {
			invalidContainer();
		}
		chunks.push({
			index: chunks.length,
			id: view.getUint32(cursor, true),
			nextChunkId: view.getUint32(cursor + 4, true),
			stream: view.getUint8(cursor + 8),
			offset: cursor, headerLength,
			extensionByte: headerLength === 18 ? view.getUint8(cursor + 17) : null,
			uncompressedSize, compressedSize, bodyOffset, bodyLength
		});
		cursor = bodyOffset + bodyLength;
	}
	if (chunks.length === 0 || cursor !== layout.signatureOffset) invalidContainer();
	return { layout, chunkHeaderLength: headerLength, chunks, decompressedBytes };
}

/** Select only a layout that consumes the complete chunk region; never search past damaged bytes. */
export function readRoflContainer(bytes: Uint8Array): RoflContainer {
	const layout = readRoflLayout(bytes);
	const candidates: RoflContainer[] = [];
	let resourceError: RoflError | undefined;
	for (const headerLength of [17, 18] as const) {
		try { candidates.push(readChunks(bytes, layout, headerLength)); }
		catch (error) {
			if (!(error instanceof RoflError)) throw error;
			if (error.code === 'RESOURCE_LIMIT') resourceError = error;
		}
	}
	if (candidates.length === 0 && resourceError) throw resourceError;
	if (candidates.length !== 1) invalidContainer();
	return candidates[0];
}

/** Decode one validated chunk at a time. Raw payloads and unknown stream IDs remain intact. */
export function decompressRoflChunk(bytes: Uint8Array, chunk: RoflChunk): Uint8Array {
	if (!Number.isSafeInteger(chunk.uncompressedSize) || chunk.uncompressedSize < 0 || chunk.uncompressedSize > MAX_CHUNK_BYTES) {
		throw new RoflError('RESOURCE_LIMIT', 'ROFL 청크 압축 해제 크기 제한을 초과했습니다.');
	}
	if (!Number.isSafeInteger(chunk.bodyOffset) || !Number.isSafeInteger(chunk.bodyLength) ||
		chunk.bodyOffset < 0 || chunk.bodyLength < 0 || chunk.bodyLength > bytes.byteLength - chunk.bodyOffset) invalidContainer();
	const body = bytes.subarray(chunk.bodyOffset, chunk.bodyOffset + chunk.bodyLength);
	if (chunk.compressedSize === 0) {
		if (body.byteLength !== chunk.uncompressedSize) invalidContainer();
		return body;
	}
	validateSingleZstdFrame(body);
	try {
		// Node supports info:true, but the installed Node type declarations only describe its default Buffer return.
		const options = {
			maxOutputLength: Math.max(1, chunk.uncompressedSize), info: true,
			params: { [constants.ZSTD_d_windowLogMax]: 24 }
		};
		const decoded = zstdDecompressSync(body, options) as unknown as {
			buffer: Uint8Array; engine: { bytesWritten: number };
		};
		if (decoded.buffer.byteLength !== chunk.uncompressedSize || decoded.engine.bytesWritten !== body.byteLength) invalidContainer();
		return decoded.buffer;
	} catch (error) {
		if (error instanceof RoflError) throw error;
		throw new RoflError('DECOMPRESSION_FAILED', `ROFL 청크 ${chunk.index}의 압축을 해제하지 못했습니다.`);
	}
}
