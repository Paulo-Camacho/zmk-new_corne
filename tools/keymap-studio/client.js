// WebSerial transport plus request/response correlation for the ZMK Studio RPC.

import { frame, Unframer } from "./framing.js";
import { encodeRequest, decodeResponse } from "./messages.js";

export class StudioClient extends EventTarget {
  constructor() {
    super();
    this.port = null;
    this.writer = null;
    this.nextRequestId = 1;
    this.pending = new Map();
    // The firmware answers one request at a time, so requests are serialised.
    this.queue = Promise.resolve();
    this.unframer = new Unframer(
      (payload) => this.handleFrame(payload),
      (msg) => this.emit("warning", msg),
    );
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  get connected() {
    return this.port !== null;
  }

  async connect(baudRate = 115200) {
    if (!("serial" in navigator)) {
      throw new Error("WebSerial unavailable — use Chrome, Edge, or another Chromium browser over http://localhost");
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate });
    this.port = port;
    this.writer = port.writable.getWriter();
    this.readLoop();
    this.emit("connected");
  }

  async disconnect() {
    const port = this.port;
    if (!port) return;
    this.port = null;
    try { await this.writer?.close(); } catch { /* port may already be gone */ }
    this.writer = null;
    try { await this.reader?.cancel(); } catch { /* ditto */ }
    try { await port.close(); } catch { /* ditto */ }
    for (const { reject } of this.pending.values()) reject(new Error("disconnected"));
    this.pending.clear();
    this.emit("disconnected");
  }

  async readLoop() {
    while (this.port?.readable) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.unframer.push(value);
        }
      } catch (err) {
        this.emit("error", err);
        break;
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
    }
    if (this.port) await this.disconnect();
  }

  handleFrame(payload) {
    let msg;
    try {
      msg = decodeResponse(payload);
    } catch (err) {
      this.emit("warning", `undecodable frame: ${err.message}`);
      return;
    }
    if (!msg) return;

    if (msg.type === "notification") {
      this.emit("notification", msg.notification);
      return;
    }

    const entry = this.pending.get(msg.requestId);
    if (!entry) {
      this.emit("warning", `response for unknown request id ${msg.requestId}`);
      return;
    }
    this.pending.delete(msg.requestId);

    if (msg.subsystem === "meta" && msg.payload?.kind === "error") {
      entry.reject(new Error(`device error: ${msg.payload.name}`));
      return;
    }
    entry.resolve(msg.payload);
  }

  request(subsystem, body, timeoutMs = 5000) {
    const run = async () => {
      if (!this.writer) throw new Error("not connected");
      const requestId = this.nextRequestId++;
      const bytes = frame(encodeRequest(requestId, subsystem, body));

      const answer = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          reject(new Error(`request ${requestId} to ${subsystem} timed out`));
        }, timeoutMs);
        this.pending.set(requestId, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (err) => { clearTimeout(timer); reject(err); },
        });
      });

      await this.writer.write(bytes);
      return answer;
    };

    // Chain onto the queue, but never let one failure poison later requests.
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}
