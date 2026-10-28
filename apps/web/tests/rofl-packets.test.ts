import assert from 'node:assert/strict';
import test from 'node:test';
import { iterateRoflPackets } from '../src/lib/server/rofl/packets.ts';

// Literal wire fixtures cover all high-nibble combinations; low bits have no assigned meaning.
const framingFixtures: [number, string, number, number, number][] = [
	[0x05, '05 0000a03f 03000000 3412 78563412 aabbcc', 1.25, 0x1234, 0x12345678],
	[0x15, '15 0000a03f 03 3412 78563412 aabbcc', 1.25, 0x1234, 0x12345678],
	[0x25, '25 0000a03f 03000000 3412 fe aabbcc', 1.25, 0x1234, 0xfffffffe],
	[0x35, '35 0000a03f 03 3412 fe aabbcc', 1.25, 0x1234, 0xfffffffe],
	[0x45, '45 0000a03f 03000000 78563412 aabbcc', 1.25, 0, 0x12345678],
	[0x55, '55 0000a03f 03 78563412 aabbcc', 1.25, 0, 0x12345678],
	[0x65, '65 0000a03f 03000000 fe aabbcc', 1.25, 0, 0xfffffffe],
	[0x75, '75 0000a03f 03 fe aabbcc', 1.25, 0, 0xfffffffe],
	[0x85, '85 7d 03000000 3412 78563412 aabbcc', 0.125, 0x1234, 0x12345678],
	[0x95, '95 7d 03 3412 78563412 aabbcc', 0.125, 0x1234, 0x12345678],
	[0xa5, 'a5 7d 03000000 3412 fe aabbcc', 0.125, 0x1234, 0xfffffffe],
	[0xb5, 'b5 7d 03 3412 fe aabbcc', 0.125, 0x1234, 0xfffffffe],
	[0xc5, 'c5 7d 03000000 78563412 aabbcc', 0.125, 0, 0x12345678],
	[0xd5, 'd5 7d 03 78563412 aabbcc', 0.125, 0, 0x12345678],
	[0xe5, 'e5 7d 03000000 fe aabbcc', 0.125, 0, 0xfffffffe],
	[0xf5, 'f5 7d 03 fe aabbcc', 0.125, 0, 0xfffffffe]
];

function hex(value: string): Buffer {
	return Buffer.from(value.replaceAll(' ', ''), 'hex');
}

test('all 16 framing combinations preserve flags and exact block and payload ranges', () => {
	for (const [flags, encoded, timestampSeconds, packetId, param] of framingFixtures) {
		const bytes = hex(encoded);
		assert.deepEqual([...iterateRoflPackets(bytes)], [{
			index: 0, offset: 0, length: bytes.length, flags, timestampSeconds, packetId, param,
			payloadOffset: bytes.length - 3, payloadLength: 3
		}]);
	}
});

test('state accumulates time, reuses IDs and wraps signed parameter deltas in both directions', () => {
	const bytes = hex('90 fa 00 3412 ffffffff f0 7d 00 01 f0 00 00 ff f0 ff 00 80 f0 00 00 7f');
	const packets = [...iterateRoflPackets(bytes)];
	assert.deepEqual(packets.map(({ index, timestampSeconds, packetId, param }) => ({ index, timestampSeconds, packetId, param })), [
		{ index: 0, timestampSeconds: 0.25, packetId: 0x1234, param: 0xffffffff },
		{ index: 1, timestampSeconds: 0.375, packetId: 0x1234, param: 0 },
		{ index: 2, timestampSeconds: 0.375, packetId: 0x1234, param: 0xffffffff },
		{ index: 3, timestampSeconds: 0.63, packetId: 0x1234, param: 0xffffff7f },
		{ index: 4, timestampSeconds: 0.63, packetId: 0x1234, param: 0xfffffffe }
	]);
	assert.deepEqual(packets.map(({ offset, length }) => [offset, length]), [[0, 9], [9, 4], [13, 4], [17, 4], [21, 4]]);
	assert.deepEqual(Buffer.concat(packets.map(({ offset, length }) => bytes.subarray(offset, offset + length))), bytes);
});

test('each invocation resets packet state and simultaneous generators stay independent', () => {
	const first = iterateRoflPackets(hex('90 fa 00 3412 ffffffff f0 7d 00 01'));
	assert.equal(first.next().value?.packetId, 0x1234);
	const other = [...iterateRoflPackets(hex('f0 7d 00 01'))];
	assert.deepEqual(other, [{
		index: 0, offset: 0, length: 4, flags: 0xf0, timestampSeconds: 0.125,
		packetId: 0, param: 1, payloadOffset: 4, payloadLength: 0
	}]);
	assert.equal(first.next().value?.param, 0);
	assert.equal(first.next().done, true);
	assert.deepEqual([...iterateRoflPackets(new Uint8Array())], []);
});

test('subarray offsets refer to the supplied chunk and parsing does not mutate its bytes', () => {
	const chunk = hex('f0 00 02 00 aabb f0 01 01 00 cc');
	const padded = Buffer.concat([Buffer.alloc(9, 0x81), chunk, Buffer.alloc(11, 0x82)]);
	const before = Buffer.from(padded);
	const bytes = new Uint8Array(padded.buffer, padded.byteOffset + 9, chunk.length);
	const packets = [...iterateRoflPackets(bytes)];
	assert.deepEqual(packets.map(({ offset, length, payloadOffset, payloadLength }) => ({ offset, length, payloadOffset, payloadLength })), [
		{ offset: 0, length: 6, payloadOffset: 4, payloadLength: 2 },
		{ offset: 6, length: 5, payloadOffset: 10, payloadLength: 1 }
	]);
	assert.deepEqual(packets.map(({ payloadOffset, payloadLength }) => Buffer.from(bytes.subarray(payloadOffset, payloadOffset + payloadLength)).toString('hex')), ['aabb', 'cc']);
	assert.deepEqual(padded, before);
});

test('every truncated header or payload is rejected with a classified error', () => {
	for (const [, encoded] of framingFixtures) {
		const bytes = hex(encoded);
		for (let end = 1; end < bytes.length; end++) {
			assert.throws(() => [...iterateRoflPackets(bytes.subarray(0, end))], { code: 'INVALID_PACKET' });
		}
	}
	// A complete first packet does not conceal a truncated following packet.
	assert.throws(() => [...iterateRoflPackets(hex('f0 00 00 00 f0'))], { code: 'INVALID_PACKET' });
});

test('declared large payload lengths cannot skip beyond the supplied chunk', () => {
	assert.throws(() => [...iterateRoflPackets(hex('e0 00 ffffffff 00'))], { code: 'INVALID_PACKET' });
	assert.throws(() => [...iterateRoflPackets(hex('e0 00 00000080 00'))], { code: 'INVALID_PACKET' });
});

test('nonfinite timestamps are rejected while negative and decreasing finite times are preserved', () => {
	for (const floatBytes of ['0000807f', '000080ff', '0000c07f']) {
		assert.throws(() => [...iterateRoflPackets(hex(`70 ${floatBytes} 00 00`))], { code: 'INVALID_PACKET' });
	}
	const packets = [...iterateRoflPackets(hex('70 0000803f 00 00 70 000080bf 00 00 f0 fa 00 00'))];
	assert.deepEqual(packets.map(({ timestampSeconds }) => timestampSeconds), [1, -1, -0.75]);
});
