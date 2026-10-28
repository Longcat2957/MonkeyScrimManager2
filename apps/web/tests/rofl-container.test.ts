import assert from 'node:assert/strict';
import test from 'node:test';
import { constants, zstdCompressSync, zstdDecompressSync } from 'node:zlib';
import { decompressRoflChunk, MAX_CHUNK_BYTES, MAX_DECOMPRESSED_BYTES, readRoflContainer } from '../src/lib/server/rofl/container.ts';
import { readRoflMetadata } from '../src/lib/server/rofl/parser.ts';

interface ChunkOptions {
	id?: number;
	nextChunkId?: number;
	stream?: number;
	extension?: number;
	raw?: boolean;
	uncompressedSize?: number;
	stored?: Buffer;
}

function chunk(headerLength: 17 | 18, payload: Buffer, options: ChunkOptions = {}): Buffer {
	const stored = options.stored ?? (options.raw ? payload : zstdCompressSync(payload));
	const header = Buffer.alloc(headerLength);
	header.writeUInt32LE(options.id ?? 1, 0);
	header.writeUInt32LE(options.nextChunkId ?? 2, 4);
	header[8] = options.stream ?? 1;
	header.writeUInt32LE(options.uncompressedSize ?? payload.length, 9);
	header.writeUInt32LE(options.raw ? 0 : stored.length, 13);
	if (headerLength === 18) header[17] = options.extension ?? 4;
	return Buffer.concat([header, stored]);
}

// Synthetic replay only; neither the opaque signature nor the payload is game data.
function replay(region: Buffer, metadata: Record<string, unknown> = { statsJson: '[{}]' }): Buffer {
	const version = Buffer.from('16.21.829.8620');
	const header = Buffer.alloc(15 + version.length);
	header.write('RIOT');
	header.writeUInt16LE(2, 4);
	header[14] = version.length;
	version.copy(header, 15);
	const json = Buffer.from(JSON.stringify(metadata));
	const length = Buffer.alloc(4);
	length.writeUInt32LE(json.length);
	return Buffer.concat([header, region, Buffer.alloc(256, 0x7f), json, length]);
}

test('both descriptor sizes consume the complete region and preserve full-width next chunk IDs', () => {
	const payloads = [Buffer.from('first compressed payload'), Buffer.from([0, 1, 254, 255])];
	for (const headerLength of [17, 18] as const) {
		const bytes = replay(Buffer.concat([
			chunk(headerLength, payloads[0], { id: 255, nextChunkId: 256 }),
			chunk(headerLength, payloads[1], { id: 256, nextChunkId: 0x12345678, stream: 2 })
		]));
		const container = readRoflContainer(bytes);
		assert.equal(container.chunkHeaderLength, headerLength);
		assert.equal(container.decompressedBytes, payloads[0].length + payloads[1].length);
		assert.deepEqual(container.chunks.map(({ id, nextChunkId, stream, extensionByte }) => ({ id, nextChunkId, stream, extensionByte })), [
			{ id: 255, nextChunkId: 256, stream: 1, extensionByte: headerLength === 18 ? 4 : null },
			{ id: 256, nextChunkId: 0x12345678, stream: 2, extensionByte: headerLength === 18 ? 4 : null }
		]);
		const [first, last] = container.chunks;
		assert.equal(first.offset, container.layout.headerEnd);
		assert.equal(first.bodyOffset + first.bodyLength, last.offset);
		assert.equal(last.bodyOffset + last.bodyLength, container.layout.signatureOffset);
		assert.deepEqual(container.chunks.map((entry) => Buffer.from(decompressRoflChunk(bytes, entry))), payloads);
	}
});

test('unknown stream and extension bytes and raw payloads survive subarray input unchanged', () => {
	const payload = Buffer.from([0xff, 0x00, 0x28, 0xb5, 0x2f, 0xfd, 0x04]);
	const bytes = replay(chunk(18, payload, { stream: 0xe7, extension: 0xa5, raw: true }));
	const padded = Buffer.concat([Buffer.alloc(9, 0x81), bytes, Buffer.alloc(11, 0x82)]);
	const before = Buffer.from(padded);
	const view = new Uint8Array(padded.buffer, padded.byteOffset + 9, bytes.length);
	const container = readRoflContainer(view);
	const [entry] = container.chunks;
	assert.equal(container.chunkHeaderLength, 18);
	assert.equal(entry.stream, 0xe7);
	assert.equal(entry.extensionByte, 0xa5);
	assert.equal(entry.compressedSize, 0);
	assert.equal(entry.bodyLength, payload.length);
	assert.equal(entry.bodyOffset, container.layout.headerEnd + 18);
	assert.deepEqual(Buffer.from(decompressRoflChunk(view, entry)), payload);
	assert.deepEqual(padded, before);
});

test('empty regions, truncated headers or bodies and gaps between chunks are rejected', () => {
	const valid = chunk(18, Buffer.from('complete compressed body'));
	for (const region of [
		Buffer.alloc(0), valid.subarray(0, 10), valid.subarray(0, valid.length - 1),
		Buffer.concat([valid, Buffer.from([0])]),
		Buffer.concat([valid, Buffer.from([0]), valid])
	]) {
		assert.throws(() => readRoflContainer(replay(region)), { code: 'INVALID_CONTAINER' });
	}
});

test('declared chunk and cumulative output sizes are bounded before decompression', () => {
	const payload = Buffer.from('small stored frame');
	assert.throws(() => readRoflContainer(replay(chunk(17, payload, { uncompressedSize: MAX_CHUNK_BYTES + 1 }))), { code: 'RESOURCE_LIMIT' });
	const atLimit = chunk(17, payload, { uncompressedSize: MAX_CHUNK_BYTES });
	const count = MAX_DECOMPRESSED_BYTES / MAX_CHUNK_BYTES;
	const bytes = replay(Buffer.concat(Array.from({ length: count }, () => atLimit)));
	assert.equal(readRoflContainer(bytes).decompressedBytes, MAX_DECOMPRESSED_BYTES);
	assert.throws(() => readRoflContainer(replay(Buffer.concat(Array.from({ length: count + 1 }, () => atLimit)))), { code: 'RESOURCE_LIMIT' });
});

test('malformed zstd and output sizes on either side of the declaration are rejected', () => {
	const payload = Buffer.alloc(4096, 0x41);
	const encoded = zstdCompressSync(payload);
	const corrupt = Buffer.from(encoded);
	corrupt[4] |= 0x08; // Reserved frame-header bit, with the rest of the frame present.
	const badChecksum = zstdCompressSync(payload, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });
	badChecksum[badChecksum.length - 1] ^= 0xff;
	const partial = zstdCompressSync(Buffer.from('payload')).subarray(0, -1);
	for (const [options, code] of [
		[{ stored: encoded.subarray(0, encoded.length - 1) }, 'INVALID_CONTAINER'],
		[{ stored: Buffer.from('28b52ffd', 'hex') }, 'INVALID_CONTAINER'],
		[{ stored: corrupt }, 'INVALID_CONTAINER'],
		[{ stored: badChecksum }, 'DECOMPRESSION_FAILED'],
		// Node 22 returns six bytes from this incomplete frame: matching the declaration is insufficient.
		[{ stored: partial, uncompressedSize: 6 }, 'INVALID_CONTAINER'],
		[{ uncompressedSize: payload.length - 1 }, 'DECOMPRESSION_FAILED'],
		[{ uncompressedSize: payload.length + 1 }, 'INVALID_CONTAINER']
	] as const) {
		const bytes = replay(chunk(18, payload, options));
		const [entry] = readRoflContainer(bytes).chunks;
		assert.throws(() => decompressRoflChunk(bytes, entry), { code });
	}
});

test('a compressed chunk accepts one frame and rejects trailing or concatenated frames', () => {
	const payload = Buffer.from('valid frame before trailing data');
	const encoded = zstdCompressSync(payload);
	const emptyFrame = zstdCompressSync(Buffer.alloc(0));
	const skippableFrame = Buffer.from('502a4d1800000000', 'hex');
	for (const tail of [Buffer.from([0xde, 0xad]), emptyFrame, encoded, skippableFrame]) {
		const bytes = replay(chunk(17, payload, { stored: Buffer.concat([encoded, tail]) }));
		const [entry] = readRoflContainer(bytes).chunks;
		assert.throws(() => decompressRoflChunk(bytes, entry), { code: 'INVALID_CONTAINER' });
	}
});

test('complete empty and multiblock frames decode while every truncated prefix is rejected', () => {
	for (const length of [0, 7, 256, 131_073]) {
		const payload = Buffer.alloc(length, 0x41);
		for (const checksum of [0, 1]) for (const contentSize of [0, 1]) {
			const encoded = zstdCompressSync(payload, { params: {
				[constants.ZSTD_c_checksumFlag]: checksum,
				[constants.ZSTD_c_contentSizeFlag]: contentSize
			} });
			const bytes = replay(chunk(18, payload, { stored: encoded }));
			const [entry] = readRoflContainer(bytes).chunks;
			assert.deepEqual(Buffer.from(decompressRoflChunk(bytes, entry)), payload);
			// Starts at the complete magic; earlier prefixes cannot pass container identification.
			for (let end = 4; end < encoded.length; end++) {
				const truncated = replay(chunk(18, payload, { stored: encoded.subarray(0, end) }));
				const [cutEntry] = readRoflContainer(truncated).chunks;
				assert.throws(() => decompressRoflChunk(truncated, cutEntry), { code: 'INVALID_CONTAINER' });
			}
		}
	}
});

test('a valid zstd frame requiring a window above 16 MiB is rejected', () => {
	const payload = Buffer.from('small payload with an oversized advertised window');
	const encoded = zstdCompressSync(payload, { params: { [constants.ZSTD_c_contentSizeFlag]: 0 } });
	// Non-single-segment frame: the window descriptor follows the frame header byte.
	assert.equal(encoded.subarray(0, 5).toString('hex'), '28b52ffd00');
	encoded[5] = 0x78; // Window exponent 15, mantissa 0: 2^(10 + 15) = 32 MiB.
	assert.deepEqual(zstdDecompressSync(encoded), payload);
	const bytes = replay(chunk(17, payload, { stored: encoded }));
	const [entry] = readRoflContainer(bytes).chunks;
	assert.throws(() => decompressRoflChunk(bytes, entry), { code: 'DECOMPRESSION_FAILED' });
});

test('decompression rejects invalid chunk ranges and inconsistent raw output lengths', () => {
	const bytes = replay(chunk(17, Buffer.from('raw'), { raw: true }));
	const [entry] = readRoflContainer(bytes).chunks;
	for (const change of [
		{ bodyOffset: -1 }, { bodyOffset: bytes.length }, { bodyLength: bytes.length },
		{ bodyLength: 0.5 }, { uncompressedSize: entry.uncompressedSize + 1 }
	]) {
		assert.throws(() => decompressRoflChunk(bytes, { ...entry, ...change }), { code: 'INVALID_CONTAINER' });
	}
	assert.throws(() => decompressRoflChunk(bytes, { ...entry, uncompressedSize: MAX_CHUNK_BYTES + 1 }), { code: 'RESOURCE_LIMIT' });
});

test('raw metadata retains leading zeros, unknown decimals, strings and nested values', () => {
	const players = [{
		RIOT_ID_TAG_LINE: '0012', UNKNOWN_DECIMAL: '001.2500', UNKNOWN_EXPONENT: '1e3',
		UNKNOWN_STRING: '  미해석 값  ', UNKNOWN_NUMBER: 1.25, UNKNOWN_EMPTY: '',
		UNKNOWN_OBJECT: { values: ['001', null, true] }
	}];
	const metadata = { gameLength: 1000, statsJson: JSON.stringify(players), unknownTopLevel: { enabled: true } };
	const bytes = replay(chunk(17, Buffer.from('body')), metadata);
	const result = readRoflMetadata(bytes);
	assert.equal(result.gameVersion, '16.21.829.8620');
	assert.deepEqual(result.metadata, metadata);
	assert.equal(result.metadata.statsJson, metadata.statsJson);
	assert.deepEqual(result.playerStats, players);
});
