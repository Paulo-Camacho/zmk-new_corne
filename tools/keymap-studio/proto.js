// Minimal protobuf wire-format codec.
// Only the subset used by the ZMK Studio RPC protocol is implemented:
// varint, length-delimited, and zigzag-encoded signed varints.

export const WIRE_VARINT = 0;
export const WIRE_LEN = 2;

export class Reader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }

  varint() {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (this.pos >= this.buf.length) throw new Error("varint ran past end of buffer");
      const b = this.buf[this.pos++];
      result |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
      if (shift > 63n) throw new Error("varint longer than 64 bits");
    }
    return result;
  }

  uint32() {
    return Number(this.varint() & 0xffffffffn);
  }

  int32() {
    // Negative int32 values are sign-extended to 64 bits on the wire.
    const v = BigInt.asIntN(64, this.varint());
    return Number(BigInt.asIntN(32, v));
  }

  sint32() {
    const v = this.varint();
    return Number((v >> 1n) ^ -(v & 1n));
  }

  bool() {
    return this.varint() !== 0n;
  }

  bytes() {
    const len = Number(this.varint());
    const end = this.pos + len;
    if (end > this.buf.length) throw new Error("length-delimited field ran past end of buffer");
    const out = this.buf.subarray(this.pos, end);
    this.pos = end;
    return out;
  }

  string() {
    return new TextDecoder().decode(this.bytes());
  }

  skip(wire) {
    switch (wire) {
      case WIRE_VARINT: this.varint(); break;
      case 1: this.pos += 8; break;
      case WIRE_LEN: this.bytes(); break;
      case 5: this.pos += 4; break;
      default: throw new Error(`unsupported wire type ${wire}`);
    }
  }

  get done() {
    return this.pos >= this.buf.length;
  }
}

// Walks every field of a message, handing each to `visit(fieldNumber, wireType, reader)`.
// The visitor must consume exactly one value; anything it ignores is skipped.
export function forEachField(buf, visit) {
  const r = new Reader(buf);
  while (!r.done) {
    const key = r.uint32();
    const field = key >>> 3;
    const wire = key & 7;
    const before = r.pos;
    if (visit(field, wire, r) !== true) {
      if (r.pos !== before) throw new Error(`visitor consumed field ${field} but returned false`);
      r.skip(wire);
    }
  }
}

export class Writer {
  constructor() {
    this.parts = [];
    this.len = 0;
  }

  raw(bytes) {
    this.parts.push(bytes);
    this.len += bytes.length;
    return this;
  }

  varint(value) {
    let v = BigInt(value);
    if (v < 0n) v = BigInt.asUintN(64, v);
    const out = [];
    do {
      let byte = Number(v & 0x7fn);
      v >>= 7n;
      if (v > 0n) byte |= 0x80;
      out.push(byte);
    } while (v > 0n);
    return this.raw(Uint8Array.from(out));
  }

  tag(field, wire) {
    return this.varint((field << 3) | wire);
  }

  uint32Field(field, value) {
    if (value === 0 || value === undefined) return this;
    return this.tag(field, WIRE_VARINT).varint(value >>> 0);
  }

  sint32Field(field, value) {
    if (value === 0 || value === undefined) return this;
    const zigzag = (value << 1) ^ (value >> 31);
    return this.tag(field, WIRE_VARINT).varint(zigzag >>> 0);
  }

  // proto3 `bool` request selectors must be emitted even when false-looking,
  // because the oneof tag itself is what selects the request.
  boolField(field, value) {
    return this.tag(field, WIRE_VARINT).varint(value ? 1 : 0);
  }

  bytesField(field, bytes) {
    return this.tag(field, WIRE_LEN).varint(bytes.length).raw(bytes);
  }

  stringField(field, str) {
    return this.bytesField(field, new TextEncoder().encode(str));
  }

  messageField(field, writer) {
    return this.bytesField(field, writer.finish());
  }

  finish() {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const part of this.parts) {
      out.set(part, off);
      off += part.length;
    }
    return out;
  }
}
