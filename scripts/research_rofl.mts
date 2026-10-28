import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { decompressRoflChunk, readRoflContainer, type RoflChunk } from '../apps/web/src/lib/server/rofl/container.ts';
import { MAX_ROFL_FILE_BYTES, RoflError } from '../apps/web/src/lib/server/rofl/format.ts';
import { iterateRoflPackets } from '../apps/web/src/lib/server/rofl/packets.ts';
import { readRoflMetadata } from '../apps/web/src/lib/server/rofl/parser.ts';

const MAX_STATISTICS_ENTRIES = 250_000;

type ChunkReport = RoflChunk & {
	decodedFile?: string; decodedSha256?: string; decodedBytes: number;
	packets: number; framedBytes: number; payloadBytes: number;
	error?: { code: string; message: string };
};
type PacketType = {
	stream: number; packetId: number; packets: number; payloadBytes: number;
	firstTimestampSeconds: number; lastTimestampSeconds: number;
	lengths: Map<number, number>; flags: Map<number, number>; params: Set<number>;
};

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function research(source: string, destination: string): Promise<boolean> {
	const file = await stat(source);
	if (!file.isFile()) throw new RoflError('INVALID_FILE', '일반 파일 경로를 지정해 주세요.');
	if (file.size > MAX_ROFL_FILE_BYTES) throw new RoflError('FILE_TOO_LARGE', 'ROFL 파일은 128 MiB 이하여야 합니다.');
	const bytes = await readFile(source);
	const container = readRoflContainer(bytes);
	const output = resolve(destination);
	// Never replace an earlier research run or its original replay.
	await mkdir(output);
	await mkdir(join(output, 'chunks'));
	await writeFile(join(output, 'original.rofl'), bytes, { flag: 'wx' });
	const { metadataOffset, metadataLength } = container.layout;
	await writeFile(join(output, 'metadata.raw.json'), bytes.subarray(metadataOffset, metadataOffset + metadataLength), { flag: 'wx' });
	const saveJson = (name: string, data: unknown) => writeFile(join(output, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
	let metadataError: { code: string; message: string } | undefined;
	try { await saveJson('metadata.json', readRoflMetadata(bytes)); }
	catch (error) {
		if (!(error instanceof RoflError)) throw error;
		metadataError = { code: error.code, message: error.message };
	}

	const chunks: ChunkReport[] = [];
	const types = new Map<string, PacketType>();
	const packetIds = new Set<number>();
	const streams = new Map<number, { chunks: number; packets: number; decodedBytes: number; framedBytes: number }>();
	const statistics = {
		entryLimit: MAX_STATISTICS_ENTRIES, retainedEntries: 0, truncated: false,
		interpretation: 'When truncated, lists and histograms may omit new keys and distinct counts are lower bounds. Existing keys continue to be counted. Full packet/chunk totals and the packet index are unaffected.'
	};
	function retainEntry(): boolean {
		if (statistics.retainedEntries >= statistics.entryLimit) {
			statistics.truncated = true;
			return false;
		}
		statistics.retainedEntries++;
		return true;
	}
	function addDistinct(values: Set<number>, value: number): void {
		if (!values.has(value) && retainEntry()) values.add(value);
	}
	function increment(histogram: Map<number, number>, value: number): void {
		const count = histogram.get(value);
		if (count !== undefined) histogram.set(value, count + 1);
		else if (retainEntry()) histogram.set(value, 1);
	}
	let packets = 0, payloadBytes = 0, framedBytes = 0, decodedBytes = 0;
	let firstTimestampSeconds = Infinity, lastTimestampSeconds = -Infinity;
	let negativeParamDeltas = 0;

	async function* packetIndex(): AsyncGenerator<string> {
		for (const chunk of container.chunks) {
			const row: ChunkReport = { ...chunk, decodedBytes: 0, packets: 0, framedBytes: 0, payloadBytes: 0 };
			chunks.push(row);
			let stream = streams.get(chunk.stream);
			if (!stream && retainEntry()) {
				stream = { chunks: 0, packets: 0, decodedBytes: 0, framedBytes: 0 };
				streams.set(chunk.stream, stream);
			}
			if (stream) stream.chunks++;
			let batch = '';
			try {
				const decoded = decompressRoflChunk(bytes, chunk);
				row.decodedFile = `chunks/${String(chunk.index).padStart(6, '0')}.bin`;
				row.decodedSha256 = sha256(decoded);
				row.decodedBytes = decoded.byteLength;
				decodedBytes += decoded.byteLength;
				if (stream) stream.decodedBytes += decoded.byteLength;
				await writeFile(join(output, row.decodedFile), decoded, { flag: 'wx' });
				for (const packet of iterateRoflPackets(decoded)) {
					row.packets++; packets++;
					row.framedBytes += packet.length; framedBytes += packet.length;
					if (stream) { stream.packets++; stream.framedBytes += packet.length; }
					row.payloadBytes += packet.payloadLength; payloadBytes += packet.payloadLength;
					if (packet.flags & 0x20 && decoded[packet.payloadOffset - 1] >= 128) negativeParamDeltas++;
					firstTimestampSeconds = Math.min(firstTimestampSeconds, packet.timestampSeconds);
					lastTimestampSeconds = Math.max(lastTimestampSeconds, packet.timestampSeconds);
					addDistinct(packetIds, packet.packetId);
					const key = `${chunk.stream}:${packet.packetId}`;
					let type = types.get(key);
					if (!type && retainEntry()) {
						type = {
							stream: chunk.stream, packetId: packet.packetId, packets: 0, payloadBytes: 0,
							firstTimestampSeconds: packet.timestampSeconds, lastTimestampSeconds: packet.timestampSeconds,
							lengths: new Map<number, number>(), flags: new Map<number, number>(), params: new Set<number>()
						};
						types.set(key, type);
					}
					if (type) {
						type.packets++; type.payloadBytes += packet.payloadLength;
						type.firstTimestampSeconds = Math.min(type.firstTimestampSeconds, packet.timestampSeconds);
						type.lastTimestampSeconds = Math.max(type.lastTimestampSeconds, packet.timestampSeconds);
						increment(type.lengths, packet.payloadLength);
						increment(type.flags, packet.flags);
						addDistinct(type.params, packet.param);
					}
					batch += JSON.stringify({ chunk: chunk.index, ...packet }) + '\n';
					if (batch.length >= 65_536) { yield batch; batch = ''; }
				}
			} catch (error) {
				if (!(error instanceof RoflError)) throw error;
				// Keep the original and decoded chunk even when its block interpretation is incomplete.
				row.error = { code: error.code, message: error.message };
			}
			if (batch) yield batch;
		}
	}

	await pipeline(packetIndex(), createGzip({ level: 1 }), createWriteStream(join(output, 'packets.ndjson.gz'), { flags: 'wx' }));
	await saveJson('chunks.json', chunks);
	await saveJson('packet-types.json', [...types.values()].sort((a, b) => a.stream - b.stream || a.packetId - b.packetId).map((type) => ({
		...type, lengths: Object.fromEntries([...type.lengths].sort((a, b) => a[0] - b[0])),
		flags: Object.fromEntries([...type.flags].sort((a, b) => a[0] - b[0])), params: undefined,
		distinctParams: type.params.size, meaning: null
	})));
	const failedChunks = chunks.filter((chunk) => chunk.error).length;
	const report = {
		schemaVersion: 1, status: failedChunks || metadataError ? 'partial' : 'complete',
		source: { filename: basename(source), bytes: bytes.byteLength, sha256: sha256(bytes) },
		format: container.layout, chunkHeaderLength: container.chunkHeaderLength,
		extensionBytes: [...new Set(container.chunks.map((chunk) => chunk.extensionByte))],
		chunkCount: chunks.length, failedChunks, declaredDecompressedBytes: container.decompressedBytes,
		decodedBytes, framedBytes, unframedDecodedBytes: decodedBytes - framedBytes,
		packets, distinctPacketIds: packetIds.size, payloadBytes, negativeParamDeltas,
		firstTimestampSeconds: packets ? firstTimestampSeconds : null,
		lastTimestampSeconds: packets ? lastTimestampSeconds : null,
		streams: Object.fromEntries([...streams].sort((a, b) => a[0] - b[0])),
		statistics,
		metadataFiles: {
			raw: 'metadata.raw.json', parsed: metadataError ? null : 'metadata.json',
			interpretation: 'The raw file preserves exact metadata bytes. The parsed view preserves string values, but JavaScript number literals may lose precision; non-finite numbers serialize as null.'
		},
		metadataError, verifiedSemanticDecoders: 0,
		timestampArithmetic: 'float32 absolute values and double-precision delta accumulation; original bytes retained',
		paramArithmetic: 'signed int8 delta with uint32 wrap; original bytes retained',
		packetIndex: 'packets.ndjson.gz; offsets refer to the decoded chunk file in chunks.json'
	};
	// A report is written only after all export streams have finished.
	await saveJson('report.json', report);
	console.log(JSON.stringify({ output, status: report.status, chunks: chunks.length, packets, distinctPacketIds: packetIds.size, failedChunks, statisticsTruncated: statistics.truncated }));
	return report.status === 'complete';
}

const [source, destination, ...extra] = process.argv.slice(2);
if (!source || !destination || extra.length) {
	console.error('사용법: pnpm rofl:research /path/to/replay.rofl /path/to/new-output-directory');
	process.exitCode = 1;
} else {
	try { if (!await research(source, destination)) process.exitCode = 2; }
	catch (error) {
		if (error instanceof RoflError) console.error(`${error.code}: ${error.message}`);
		else if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') console.error('출력 경로가 이미 존재합니다. 새 디렉터리를 지정해 주세요.');
		else console.error('ROFL 연구 결과를 생성하지 못했습니다. 입력 파일과 출력 경로·디스크 공간을 확인해 주세요.');
		process.exitCode = 1;
	}
}
