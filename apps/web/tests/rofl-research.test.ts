import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync, zstdCompressSync } from 'node:zlib';

const script = fileURLToPath(new URL('../../../scripts/research_rofl.mts', import.meta.url));

async function workspace(t: TestContext): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'msm2-rofl-research-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	return directory;
}

function replay(chunks: { bytes: Buffer; stream?: number }[], metadata = Buffer.from('{"statsJson":"[{}]"}')): Buffer {
	const version = Buffer.from('16.21.829.8620');
	const header = Buffer.alloc(15 + version.length);
	header.write('RIOT');
	header.writeUInt16LE(2, 4);
	header[14] = version.length;
	version.copy(header, 15);
	const region = chunks.flatMap(({ bytes, stream }, index) => {
		const encoded = zstdCompressSync(bytes);
		const descriptor = Buffer.alloc(17);
		descriptor.writeUInt32LE(index + 1, 0);
		descriptor.writeUInt32LE(index + 2, 4);
		descriptor[8] = stream ?? 1;
		descriptor.writeUInt32LE(bytes.length, 9);
		descriptor.writeUInt32LE(encoded.length, 13);
		return [descriptor, encoded];
	});
	const length = Buffer.alloc(4);
	length.writeUInt32LE(metadata.length);
	return Buffer.concat([header, ...region, Buffer.alloc(256, 0x7f), metadata, length]);
}

function run(source: string, destination: string) {
	return spawnSync(process.execPath, ['--experimental-strip-types', script, source, destination], {
		encoding: 'utf8', timeout: 30_000
	});
}

test('research keeps exact metadata bytes, describes parsed-number limits, and refuses to replace output', async (t) => {
	const directory = await workspace(t);
	const source = join(directory, 'source.rofl'), output = join(directory, 'output');
	const metadata = Buffer.from(' {"statsJson":"[{\\"TAG\\":\\"0012\\",\\"N\\":9007199254740993,\\"HUGE\\":1e400}]","outer":9007199254740993} \n');
	const bytes = replay([{ bytes: Buffer.from('f0000000', 'hex') }], metadata);
	await writeFile(source, bytes);
	const first = run(source, output);
	assert.equal(first.status, 0, first.stderr);
	assert.deepEqual(await readFile(join(output, 'metadata.raw.json')), metadata);
	assert.deepEqual(await readFile(join(output, 'original.rofl')), bytes);
	const parsed = JSON.parse(await readFile(join(output, 'metadata.json'), 'utf8'));
	assert.equal(parsed.playerStats[0].TAG, '0012');
	assert.equal(parsed.playerStats[0].N, 9007199254740992);
	assert.equal(parsed.playerStats[0].HUGE, null);
	assert.equal(parsed.metadata.statsJson, JSON.parse(metadata.toString()).statsJson);
	const reportBytes = await readFile(join(output, 'report.json'));
	const report = JSON.parse(reportBytes.toString());
	assert.equal(report.metadataFiles.raw, 'metadata.raw.json');
	assert.match(report.metadataFiles.interpretation, /lose precision/);
	assert.equal(report.statistics.truncated, false);
	assert.equal(report.packets, 1);
	const second = run(source, output);
	assert.equal(second.status, 1);
	assert.deepEqual(await readFile(join(output, 'report.json')), reportBytes);
	assert.deepEqual(await readFile(source), bytes);
});

test('invalid metadata still exports its raw bytes and reports partial completion', async (t) => {
	const directory = await workspace(t);
	const source = join(directory, 'source.rofl'), output = join(directory, 'output');
	const metadata = Buffer.from('{"statsJson":');
	await writeFile(source, replay([{ bytes: Buffer.from('f0000000', 'hex') }], metadata));
	const result = run(source, output);
	assert.equal(result.status, 2, result.stderr);
	assert.deepEqual(await readFile(join(output, 'metadata.raw.json')), metadata);
	assert.equal((await readdir(output)).includes('metadata.json'), false);
	const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
	assert.equal(report.status, 'partial');
	assert.equal(report.metadataError.code, 'INVALID_METADATA');
	assert.equal(report.metadataFiles.parsed, null);
	assert.equal(report.packets, 1);
});

test('packet framing failures retain complete decoded chunks and continue later chunks', async (t) => {
	const directory = await workspace(t);
	const source = join(directory, 'source.rofl'), output = join(directory, 'output');
	const first = Buffer.from('f0000000f0', 'hex'), second = Buffer.from('f0000001', 'hex');
	await writeFile(source, replay([{ bytes: first }, { bytes: second }]));
	const result = run(source, output);
	assert.equal(result.status, 2, result.stderr);
	const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
	assert.equal(report.status, 'partial');
	assert.equal(report.failedChunks, 1);
	assert.equal(report.packets, 2);
	assert.equal(report.unframedDecodedBytes, 1);
	const chunks = JSON.parse(await readFile(join(output, 'chunks.json'), 'utf8'));
	assert.equal(chunks[0].error.code, 'INVALID_PACKET');
	assert.deepEqual(await readFile(join(output, chunks[0].decodedFile)), first);
	assert.deepEqual(await readFile(join(output, chunks[1].decodedFile)), second);
	const packets = gunzipSync(await readFile(join(output, 'packets.ndjson.gz'))).toString().trim().split('\n').map((line) => JSON.parse(line));
	assert.deepEqual(packets.map(({ chunk }) => chunk), [0, 1]);
});

test('statistics stop retaining new entries at their shared limit while all packets are exported', async (t) => {
	const directory = await workspace(t);
	const source = join(directory, 'source.rofl'), output = join(directory, 'output');
	const count = 250_010;
	const manyParams = Buffer.alloc(count * 4, Buffer.from('f0000001', 'hex'));
	const otherStream = Buffer.from('900000341201000000', 'hex');
	await writeFile(source, replay([{ bytes: manyParams }, { bytes: otherStream, stream: 2 }]));
	const result = run(source, output);
	assert.equal(result.status, 0, result.stderr);
	const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
	assert.equal(report.status, 'complete');
	assert.equal(report.statistics.truncated, true);
	assert.equal(report.statistics.retainedEntries, report.statistics.entryLimit);
	assert.equal(report.statistics.entryLimit, 250_000);
	assert.equal(report.packets, count + 1);
	assert.equal(report.framedBytes, manyParams.length + otherStream.length);
	assert.equal(report.unframedDecodedBytes, 0);
	assert.equal(report.streams['1'].packets, count);
	assert.equal(report.streams['2'], undefined);
	assert.equal(report.distinctPacketIds, 1);
	const types = JSON.parse(await readFile(join(output, 'packet-types.json'), 'utf8'));
	assert.equal(types.length, 1);
	assert.equal(types[0].packets, count);
	assert.equal(types[0].lengths['0'], count);
	assert.equal(types[0].flags['240'], count);
	assert.equal(types[0].distinctParams, 249_995);
	const chunks = JSON.parse(await readFile(join(output, 'chunks.json'), 'utf8'));
	assert.deepEqual(await readFile(join(output, chunks[0].decodedFile)), manyParams);
	assert.deepEqual(await readFile(join(output, chunks[1].decodedFile)), otherStream);
	const index = gunzipSync(await readFile(join(output, 'packets.ndjson.gz')));
	let lines = 0, lastStart = 0;
	for (let offset = 0; offset < index.length; offset++) {
		if (index[offset] !== 10) continue;
		lines++;
		if (offset < index.length - 1) lastStart = offset + 1;
	}
	assert.equal(lines, count + 1);
	const last = JSON.parse(index.subarray(lastStart).toString());
	assert.equal(last.chunk, 1);
	assert.equal(last.packetId, 0x1234);
});
