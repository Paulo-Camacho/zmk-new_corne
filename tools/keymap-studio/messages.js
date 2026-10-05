// Encoders and decoders for the subset of the ZMK Studio protocol this tool uses.
// Field numbers come from vendor/zmk-studio-messages/proto/zmk/*.proto.

import { Writer, Reader, forEachField, WIRE_LEN, WIRE_VARINT } from "./proto.js";

const SUBSYSTEM_FIELDS = { core: 3, behaviors: 4, keymap: 5, custom: 100 };
const SUBSYSTEM_BY_FIELD = { 2: "meta", 3: "core", 4: "behaviors", 5: "keymap", 100: "custom" };

export function encodeRequest(requestId, subsystem, body) {
  const field = SUBSYSTEM_FIELDS[subsystem];
  if (!field) throw new Error(`unknown subsystem ${subsystem}`);
  return new Writer().uint32Field(1, requestId).messageField(field, body).finish();
}

// --- request bodies -------------------------------------------------------

export const core = {
  getDeviceInfo: () => new Writer().boolField(1, true),
  getLockState: () => new Writer().boolField(2, true),
  lock: () => new Writer().boolField(3, true),
  resetSettings: () => new Writer().boolField(4, true),
};

export const behaviors = {
  listAll: () => new Writer().boolField(1, true),
  getDetails: (behaviorId) =>
    new Writer().messageField(2, new Writer().uint32Field(1, behaviorId)),
};

function bindingWriter(binding) {
  return new Writer()
    .sint32Field(1, binding.behaviorId | 0)
    .uint32Field(2, binding.param1 >>> 0)
    .uint32Field(3, binding.param2 >>> 0);
}

export const keymap = {
  getKeymap: () => new Writer().boolField(1, true),
  setLayerBinding: (layerId, keyPosition, binding) =>
    new Writer().messageField(
      2,
      new Writer()
        .uint32Field(1, layerId)
        .uint32Field(2, keyPosition)
        .messageField(3, bindingWriter(binding)),
    ),
  checkUnsavedChanges: () => new Writer().boolField(3, true),
  saveChanges: () => new Writer().boolField(4, true),
  discardChanges: () => new Writer().boolField(5, true),
  getPhysicalLayouts: () => new Writer().boolField(6, true),
  // The tag must be written even for index 0: it is the oneof selector, not a defaultable value.
  setActivePhysicalLayout: (index) => new Writer().tag(7, WIRE_VARINT).varint(index >>> 0),
  moveLayer: (startIndex, destIndex) =>
    new Writer().messageField(8, new Writer().uint32Field(1, startIndex).uint32Field(2, destIndex)),
  addLayer: () => new Writer().messageField(9, new Writer()),
  removeLayer: (layerIndex) =>
    new Writer().messageField(10, new Writer().uint32Field(1, layerIndex)),
  restoreLayer: (layerId, atIndex) =>
    new Writer().messageField(11, new Writer().uint32Field(1, layerId).uint32Field(2, atIndex)),
  setLayerProps: (layerId, name) =>
    new Writer().messageField(12, new Writer().uint32Field(1, layerId).stringField(2, name)),
};

// --- decoders -------------------------------------------------------------

// Repeated scalars may arrive packed or unpacked; accept both.
function readRepeatedUint32(into, wire, r) {
  if (wire === WIRE_LEN) {
    const sub = new Reader(r.bytes());
    while (!sub.done) into.push(sub.uint32());
  } else {
    into.push(r.uint32());
  }
}

function decodeBinding(buf) {
  const out = { behaviorId: 0, param1: 0, param2: 0 };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.behaviorId = r.sint32(); return true; }
    if (f === 2) { out.param1 = r.uint32(); return true; }
    if (f === 3) { out.param2 = r.uint32(); return true; }
    return false;
  });
  return out;
}

function decodeLayer(buf) {
  const out = { id: 0, name: "", bindings: [] };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.id = r.uint32(); return true; }
    if (f === 2) { out.name = r.string(); return true; }
    if (f === 3) { out.bindings.push(decodeBinding(r.bytes())); return true; }
    return false;
  });
  return out;
}

function decodeKeymap(buf) {
  const out = { layers: [], availableLayers: 0, maxLayerNameLength: 0 };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.layers.push(decodeLayer(r.bytes())); return true; }
    if (f === 2) { out.availableLayers = r.uint32(); return true; }
    if (f === 3) { out.maxLayerNameLength = r.uint32(); return true; }
    return false;
  });
  return out;
}

function decodeKeyAttrs(buf) {
  const out = { width: 0, height: 0, x: 0, y: 0, r: 0, rx: 0, ry: 0 };
  const order = [null, "width", "height", "x", "y", "r", "rx", "ry"];
  forEachField(buf, (f, wire, r) => {
    const name = order[f];
    if (!name) return false;
    out[name] = r.sint32();
    return true;
  });
  return out;
}

function decodePhysicalLayout(buf) {
  const out = { name: "", keys: [] };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.name = r.string(); return true; }
    if (f === 2) { out.keys.push(decodeKeyAttrs(r.bytes())); return true; }
    return false;
  });
  return out;
}

function decodePhysicalLayouts(buf) {
  const out = { activeLayoutIndex: 0, layouts: [] };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.activeLayoutIndex = r.uint32(); return true; }
    if (f === 2) { out.layouts.push(decodePhysicalLayout(r.bytes())); return true; }
    return false;
  });
  return out;
}

// Every keymap mutation returns `oneof result { <ok> | <err enum> }` with ok=1, err=2.
function decodeResult(buf, decodeOk) {
  const out = { ok: null, err: null };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.ok = decodeOk(r, wire); return true; }
    if (f === 2) { out.err = r.uint32(); return true; }
    return false;
  });
  return out;
}

const okMessage = (decode) => (r) => decode(r.bytes());
const okBool = (r) => r.bool();

function decodeAddLayerDetails(buf) {
  const out = { index: 0, layer: null };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.index = r.uint32(); return true; }
    if (f === 2) { out.layer = decodeLayer(r.bytes()); return true; }
    return false;
  });
  return out;
}

function decodeParamDescription(buf) {
  const out = { name: "", type: "unknown", value: null };
  forEachField(buf, (f, wire, r) => {
    switch (f) {
      case 1: out.name = r.string(); return true;
      case 2: r.bytes(); out.type = "nil"; return true;
      case 3: out.type = "constant"; out.value = r.uint32(); return true;
      case 4: {
        const range = { min: 0, max: 0 };
        forEachField(r.bytes(), (rf, rw, rr) => {
          if (rf === 1) { range.min = rr.int32(); return true; }
          if (rf === 2) { range.max = rr.int32(); return true; }
          return false;
        });
        out.type = "range";
        out.value = range;
        return true;
      }
      case 5: {
        const usage = { keyboardMax: 0, consumerMax: 0 };
        forEachField(r.bytes(), (uf, uw, ur) => {
          if (uf === 1) { usage.keyboardMax = ur.uint32(); return true; }
          if (uf === 2) { usage.consumerMax = ur.uint32(); return true; }
          return false;
        });
        out.type = "hidUsage";
        out.value = usage;
        return true;
      }
      case 6: r.bytes(); out.type = "layerId"; return true;
      default: return false;
    }
  });
  return out;
}

function decodeParametersSet(buf) {
  const out = { param1: [], param2: [] };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.param1.push(decodeParamDescription(r.bytes())); return true; }
    if (f === 2) { out.param2.push(decodeParamDescription(r.bytes())); return true; }
    return false;
  });
  return out;
}

function decodeBehaviorDetails(buf) {
  const out = { id: 0, displayName: "", metadata: [] };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.id = r.uint32(); return true; }
    if (f === 2) { out.displayName = r.string(); return true; }
    if (f === 3) { out.metadata.push(decodeParametersSet(r.bytes())); return true; }
    return false;
  });
  return out;
}

function decodeKeymapResponse(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    switch (f) {
      case 1: out = { kind: "getKeymap", keymap: decodeKeymap(r.bytes()) }; return true;
      case 2: out = { kind: "setLayerBinding", code: r.uint32() }; return true;
      case 3: out = { kind: "checkUnsavedChanges", unsaved: r.bool() }; return true;
      case 4: out = { kind: "saveChanges", result: decodeResult(r.bytes(), okBool) }; return true;
      case 5: out = { kind: "discardChanges", ok: r.bool() }; return true;
      case 6: out = { kind: "getPhysicalLayouts", layouts: decodePhysicalLayouts(r.bytes()) }; return true;
      case 7: out = { kind: "setActivePhysicalLayout", result: decodeResult(r.bytes(), okMessage(decodeKeymap)) }; return true;
      case 8: out = { kind: "moveLayer", result: decodeResult(r.bytes(), okMessage(decodeKeymap)) }; return true;
      case 9: out = { kind: "addLayer", result: decodeResult(r.bytes(), okMessage(decodeAddLayerDetails)) }; return true;
      case 10: out = { kind: "removeLayer", result: decodeResult(r.bytes(), okMessage(() => true)) }; return true;
      case 11: out = { kind: "restoreLayer", result: decodeResult(r.bytes(), okMessage(decodeLayer)) }; return true;
      case 12: out = { kind: "setLayerProps", code: r.uint32() }; return true;
      default: return false;
    }
  });
  return out;
}

function decodeCoreResponse(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    if (f === 1) {
      const info = { name: "", serialNumber: new Uint8Array() };
      forEachField(r.bytes(), (df, dw, dr) => {
        if (df === 1) { info.name = dr.string(); return true; }
        if (df === 2) { info.serialNumber = dr.bytes().slice(); return true; }
        return false;
      });
      out = { kind: "getDeviceInfo", info };
      return true;
    }
    if (f === 2) { out = { kind: "getLockState", locked: r.uint32() === 0 }; return true; }
    if (f === 4) { out = { kind: "resetSettings", ok: r.bool() }; return true; }
    return false;
  });
  return out;
}

function decodeBehaviorsResponse(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    if (f === 1) {
      const ids = [];
      forEachField(r.bytes(), (bf, bw, br) => {
        if (bf !== 1) return false;
        readRepeatedUint32(ids, bw, br);
        return true;
      });
      out = { kind: "listAll", ids };
      return true;
    }
    if (f === 2) { out = { kind: "getDetails", details: decodeBehaviorDetails(r.bytes()) }; return true; }
    return false;
  });
  return out;
}

const ERROR_NAMES = ["GENERIC", "UNLOCK_REQUIRED", "RPC_NOT_FOUND", "MSG_DECODE_FAILED", "MSG_ENCODE_FAILED"];

function decodeMetaResponse(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out = { kind: "noResponse" }; return true; }
    if (f === 2) {
      const code = r.uint32();
      out = { kind: "error", code, name: ERROR_NAMES[code] ?? `UNKNOWN_${code}` };
      return true;
    }
    return false;
  });
  return out;
}

function decodeRequestResponse(buf) {
  const out = { requestId: 0, subsystem: null, payload: null };
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out.requestId = r.uint32(); return true; }
    const subsystem = SUBSYSTEM_BY_FIELD[f];
    if (!subsystem) return false;
    const body = r.bytes();
    out.subsystem = subsystem;
    switch (subsystem) {
      case "meta": out.payload = decodeMetaResponse(body); break;
      case "core": out.payload = decodeCoreResponse(body); break;
      case "behaviors": out.payload = decodeBehaviorsResponse(body); break;
      case "keymap": out.payload = decodeKeymapResponse(body); break;
      default: out.payload = { kind: "raw", bytes: body.slice() }; break;
    }
    return true;
  });
  return out;
}

function decodeNotification(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    if (f === 2) {
      let locked = null;
      forEachField(r.bytes(), (nf, nw, nr) => {
        if (nf !== 1) return false;
        locked = nr.uint32() === 0;
        return true;
      });
      out = { kind: "lockStateChanged", locked };
      return true;
    }
    if (f === 5) {
      let unsaved = false;
      forEachField(r.bytes(), (nf, nw, nr) => {
        if (nf !== 1) return false;
        unsaved = nr.bool();
        return true;
      });
      out = { kind: "unsavedChangesStatusChanged", unsaved };
      return true;
    }
    return false;
  });
  return out;
}

export function decodeResponse(buf) {
  let out = null;
  forEachField(buf, (f, wire, r) => {
    if (f === 1) { out = { type: "response", ...decodeRequestResponse(r.bytes()) }; return true; }
    if (f === 2) { out = { type: "notification", notification: decodeNotification(r.bytes()) }; return true; }
    return false;
  });
  return out;
}
