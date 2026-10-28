import { RoflError } from './format.ts';

export interface RoflPacket {
	index: number;
	/** Offsets are relative to the supplied decompressed chunk. */
	offset: number;
	length: number;
	flags: number;
	timestampSeconds: number;
	packetId: number;
	param: number;
	payloadOffset: number;
	payloadLength: number;
}

/** Reads block framing only. Payloads remain in bytes, and state resets for each chunk. */
export function* iterateRoflPackets(bytes: Uint8Array): Generator<RoflPacket> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let cursor = 0;
	let index = 0;
	let timestampSeconds = 0;
	let packetId = 0;
	let param = 0;

	function take(length: number): number {
		if (length > bytes.byteLength - cursor) {
			throw new RoflError('INVALID_PACKET', `ROFL 패킷이 오프셋 ${cursor}에서 잘렸습니다.`);
		}
		const offset = cursor;
		cursor += length;
		return offset;
	}

	while (cursor < bytes.byteLength) {
		const offset = cursor;
		const flags = view.getUint8(take(1));
		timestampSeconds = flags & 0x80
			? timestampSeconds + view.getUint8(take(1)) / 1000
			: view.getFloat32(take(4), true);
		if (!Number.isFinite(timestampSeconds)) {
			throw new RoflError('INVALID_PACKET', `ROFL 패킷의 시간 값이 올바르지 않습니다. (오프셋 ${offset})`);
		}
		const payloadLength = flags & 0x10 ? view.getUint8(take(1)) : view.getUint32(take(4), true);
		if (!(flags & 0x40)) packetId = view.getUint16(take(2), true);
		param = flags & 0x20
			? (param + view.getInt8(take(1))) >>> 0
			: view.getUint32(take(4), true);
		const payloadOffset = take(payloadLength);
		yield {
			index: index++, offset, length: cursor - offset, flags, timestampSeconds,
			packetId, param, payloadOffset, payloadLength
		};
	}
}
