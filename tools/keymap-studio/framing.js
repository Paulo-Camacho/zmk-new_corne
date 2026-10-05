// ZMK Studio RPC framing, mirroring vendor/zmk/app/src/studio/msg_framing.{c,h}.
// A frame is SOF, the protobuf payload with framing bytes escaped, then EOF.

export const SOF = 0xab;
export const ESC = 0xac;
export const EOF = 0xad;

export function frame(payload) {
  const out = [SOF];
  for (const b of payload) {
    if (b === SOF || b === ESC || b === EOF) out.push(ESC);
    out.push(b);
  }
  out.push(EOF);
  return Uint8Array.from(out);
}

const IDLE = "idle";
const DATA = "data";
const ESCAPED = "escaped";
const ERR = "err";

// Feeds bytes in, calls onFrame(payload) for each complete frame.
export class Unframer {
  constructor(onFrame, onWarning = () => {}) {
    this.onFrame = onFrame;
    this.onWarning = onWarning;
    this.state = IDLE;
    this.buf = [];
  }

  push(chunk) {
    for (const b of chunk) this.byte(b);
  }

  byte(b) {
    switch (this.state) {
      case IDLE:
        if (b === SOF) {
          this.state = DATA;
          this.buf = [];
        } else {
          this.onWarning(`expected SOF, got 0x${b.toString(16).padStart(2, "0")}`);
        }
        return;

      case DATA:
        if (b === SOF) {
          this.onWarning("unescaped SOF mid-frame");
          this.state = ERR;
        } else if (b === ESC) {
          this.state = ESCAPED;
        } else if (b === EOF) {
          this.state = IDLE;
          this.onFrame(Uint8Array.from(this.buf));
          this.buf = [];
        } else {
          this.buf.push(b);
        }
        return;

      case ESCAPED:
        this.buf.push(b);
        this.state = DATA;
        return;

      case ERR:
        // Resynchronise on the next frame boundary, discarding the bad frame.
        if (b === EOF) this.state = IDLE;
        else if (b === SOF) { this.state = DATA; this.buf = []; }
        return;
    }
  }
}
