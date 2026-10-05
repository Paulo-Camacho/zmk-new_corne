// Offline protocol tests: build device-shaped frames, run them through the
// client's decoders, and re-parse our own requests the way the firmware would.
// Run with: node test.js

import assert from "node:assert/strict";
import { Writer, forEachField } from "./proto.js";
import { frame, Unframer } from "./framing.js";
import { encodeRequest, decodeResponse, core, behaviors, keymap } from "./messages.js";
import { encodeKeycode, keycodeName, usageGroups, searchText, PAGE_KEYBOARD } from "./keycodes.js";
import { parseCombos, writeCombos, comboAppliesToLayer, findBlock } from "./combos.js";

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}

// Decodes one frame the way StudioClient does.
function roundTrip(payload) {
  let decoded = null;
  const unframer = new Unframer((p) => { decoded = decodeResponse(p); });
  unframer.push(frame(payload));
  assert.ok(decoded, "frame did not decode");
  return decoded;
}

// --- device-shaped responses ---------------------------------------------

check("keymap response decodes layers and bindings", () => {
  const binding = (id, p1) => new Writer().sint32Field(1, id).uint32Field(2, p1);
  const layer = new Writer()
    .uint32Field(1, 7)
    .stringField(2, "BASE")
    .messageField(3, binding(3, encodeKeycode(PAGE_KEYBOARD, 0x04)))
    .messageField(3, binding(-2, 0));
  const keymapMsg = new Writer().messageField(1, layer).uint32Field(2, 4).uint32Field(3, 16);
  const payload = new Writer()
    .messageField(1, new Writer().uint32Field(1, 42).messageField(5, new Writer().messageField(1, keymapMsg)))
    .finish();

  const msg = roundTrip(payload);
  assert.equal(msg.type, "response");
  assert.equal(msg.requestId, 42);
  assert.equal(msg.subsystem, "keymap");
  assert.equal(msg.payload.kind, "getKeymap");

  const [decodedLayer] = msg.payload.keymap.layers;
  assert.equal(decodedLayer.id, 7);
  assert.equal(decodedLayer.name, "BASE");
  assert.equal(decodedLayer.bindings.length, 2);
  assert.equal(decodedLayer.bindings[0].behaviorId, 3);
  assert.equal(keycodeName(decodedLayer.bindings[0].param1), "A");
  assert.equal(decodedLayer.bindings[1].behaviorId, -2, "negative behavior ids need zigzag decoding");
  assert.equal(msg.payload.keymap.availableLayers, 4);
});

check("physical layout attrs decode as signed values", () => {
  const key = new Writer()
    .sint32Field(1, 100).sint32Field(2, 100).sint32Field(3, 250).sint32Field(4, 0)
    .sint32Field(5, -1500).sint32Field(6, 300).sint32Field(7, 50);
  const layout = new Writer().stringField(1, "default").messageField(2, key);
  const layouts = new Writer().uint32Field(1, 0).messageField(2, layout);
  const payload = new Writer()
    .messageField(1, new Writer().uint32Field(1, 1).messageField(5, new Writer().messageField(6, layouts)))
    .finish();

  const msg = roundTrip(payload);
  const [decoded] = msg.payload.layouts.layouts;
  assert.equal(decoded.name, "default");
  assert.deepEqual(decoded.keys[0], { width: 100, height: 100, x: 250, y: 0, r: -1500, rx: 300, ry: 50 });
});

check("packed and unpacked behavior id lists both decode", () => {
  const packed = new Writer().bytesField(1, new Writer().varint(1).varint(2).varint(300).finish());
  const unpacked = new Writer().uint32Field(1, 1).uint32Field(1, 2).uint32Field(1, 300);
  for (const list of [packed, unpacked]) {
    const payload = new Writer()
      .messageField(1, new Writer().uint32Field(1, 9).messageField(4, new Writer().messageField(1, list)))
      .finish();
    const msg = roundTrip(payload);
    assert.deepEqual(msg.payload.ids, [1, 2, 300]);
  }
});

check("behavior details decode parameter metadata", () => {
  const hidUsage = new Writer()
    .stringField(1, "Key")
    .messageField(5, new Writer().uint32Field(1, 0xff).uint32Field(2, 0x2ff));
  const set = new Writer().messageField(1, hidUsage);
  const details = new Writer().uint32Field(1, 3).stringField(2, "Key Press").messageField(3, set);
  const payload = new Writer()
    .messageField(1, new Writer().uint32Field(1, 5).messageField(4, new Writer().messageField(2, details)))
    .finish();

  const msg = roundTrip(payload);
  assert.equal(msg.payload.details.displayName, "Key Press");
  const [param] = msg.payload.details.metadata[0].param1;
  assert.equal(param.type, "hidUsage");
  assert.deepEqual(param.value, { keyboardMax: 0xff, consumerMax: 0x2ff });
});

check("meta errors surface by name", () => {
  const payload = new Writer()
    .messageField(1, new Writer().uint32Field(1, 8).messageField(2, new Writer().uint32Field(2, 1)))
    .finish();
  const msg = roundTrip(payload);
  assert.equal(msg.payload.kind, "error");
  assert.equal(msg.payload.name, "UNLOCK_REQUIRED");
});

check("unsaved-changes notification decodes", () => {
  const payload = new Writer()
    .messageField(2, new Writer().messageField(5, new Writer().boolField(1, true)))
    .finish();
  const msg = roundTrip(payload);
  assert.equal(msg.type, "notification");
  assert.deepEqual(msg.notification, { kind: "unsavedChangesStatusChanged", unsaved: true });
});

check("device info decodes", () => {
  const info = new Writer().stringField(1, "Eyelash Corne").bytesField(2, Uint8Array.from([1, 2, 3]));
  const payload = new Writer()
    .messageField(1, new Writer().uint32Field(1, 2).messageField(3, new Writer().messageField(1, info)))
    .finish();
  const msg = roundTrip(payload);
  assert.equal(msg.payload.info.name, "Eyelash Corne");
});

// --- our requests, parsed the way the firmware would ----------------------

function parseRequest(bytes) {
  const out = { requestId: 0, subsystem: null, body: null };
  forEachField(bytes, (f, wire, r) => {
    if (f === 1) { out.requestId = r.uint32(); return true; }
    out.subsystem = f;
    out.body = r.bytes();
    return true;
  });
  return out;
}

function oneofField(body) {
  let found = null;
  forEachField(body, (f, wire, r) => {
    found = { field: f, wire, reader: r };
    r.skip(wire);
    return true;
  });
  return found;
}

check("request envelope carries id and subsystem", () => {
  const req = parseRequest(encodeRequest(11, "core", core.getDeviceInfo()));
  assert.equal(req.requestId, 11);
  assert.equal(req.subsystem, 3);
  assert.equal(oneofField(req.body).field, 1);
});

check("bool selectors are emitted even when the value is false-like", () => {
  const req = parseRequest(encodeRequest(1, "keymap", keymap.saveChanges()));
  assert.equal(oneofField(req.body).field, 4);
});

check("set_active_physical_layout keeps its tag for index 0", () => {
  const req = parseRequest(encodeRequest(1, "keymap", keymap.setActivePhysicalLayout(0)));
  const field = oneofField(req.body);
  assert.equal(field.field, 7, "index 0 must still select the oneof");
});

check("add_layer sends an empty submessage, not nothing", () => {
  const req = parseRequest(encodeRequest(1, "keymap", keymap.addLayer()));
  assert.equal(oneofField(req.body).field, 9);
});

check("set_layer_binding encodes layer, position and binding", () => {
  const bytes = encodeRequest(3, "keymap", keymap.setLayerBinding(2, 17, {
    behaviorId: -4, param1: encodeKeycode(PAGE_KEYBOARD, 0x2c), param2: 0,
  }));
  const req = parseRequest(bytes);
  let inner = null;
  forEachField(req.body, (f, wire, r) => {
    if (f !== 2) return false;
    inner = r.bytes();
    return true;
  });
  const parsed = { layerId: 0, keyPosition: 0, binding: null };
  forEachField(inner, (f, wire, r) => {
    if (f === 1) { parsed.layerId = r.uint32(); return true; }
    if (f === 2) { parsed.keyPosition = r.uint32(); return true; }
    if (f === 3) {
      const b = { behaviorId: 0, param1: 0, param2: 0 };
      forEachField(r.bytes(), (bf, bw, br) => {
        if (bf === 1) { b.behaviorId = br.sint32(); return true; }
        if (bf === 2) { b.param1 = br.uint32(); return true; }
        if (bf === 3) { b.param2 = br.uint32(); return true; }
        return false;
      });
      parsed.binding = b;
      return true;
    }
    return false;
  });
  assert.equal(parsed.layerId, 2);
  assert.equal(parsed.keyPosition, 17);
  assert.equal(parsed.binding.behaviorId, -4);
  assert.equal(keycodeName(parsed.binding.param1), "SPACE");
});

check("behavior details request carries the id", () => {
  const req = parseRequest(encodeRequest(1, "behaviors", behaviors.getDetails(6)));
  assert.equal(req.subsystem, 4);
  let id = null;
  forEachField(req.body, (f, wire, r) => {
    if (f !== 2) return false;
    forEachField(r.bytes(), (df, dw, dr) => {
      if (df !== 1) return false;
      id = dr.uint32();
      return true;
    });
    return true;
  });
  assert.equal(id, 6);
});

// --- framing edge cases ---------------------------------------------------

check("framing escapes every reserved byte", () => {
  const payload = Uint8Array.from([0xab, 0xac, 0xad, 0x00, 0xff]);
  let got = null;
  const unframer = new Unframer((p) => { got = p; });
  unframer.push(frame(payload));
  assert.deepEqual(Array.from(got), Array.from(payload));
});

check("unframer resynchronises after a corrupt frame", () => {
  const frames = [];
  const unframer = new Unframer((p) => frames.push(Array.from(p)));
  unframer.push(Uint8Array.from([0xab, 0x01, 0xab])); // unescaped SOF mid-frame
  unframer.push(frame(Uint8Array.from([0x09])));
  assert.deepEqual(frames, [[0x09]]);
});

check("frames split across reads still assemble", () => {
  const bytes = frame(new Writer().messageField(2, new Writer().messageField(5, new Writer().boolField(1, true))).finish());
  const frames = [];
  const unframer = new Unframer((p) => frames.push(p));
  for (const b of bytes) unframer.push(Uint8Array.of(b));
  assert.equal(frames.length, 1);
  assert.equal(decodeResponse(frames[0]).notification.kind, "unsavedChangesStatusChanged");
});

// --- keycodes -------------------------------------------------------------

check("keycode names round-trip through modifiers", () => {
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x04)), "A");
  assert.equal(keycodeName(encodeKeycode(0x0c, 0x0cd)), "C_PP");
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x2c, 0x08)), "LGUI(SPACE)");
  assert.equal(keycodeName(0), "NONE");
});

check("modifier keys stay selectable below the reported keyboard_max", () => {
  // NKRO without the extended report caps keyboard_max at KP_EQUAL (0x67),
  // but modifiers live in the report's modifier byte and remain valid.
  const groups = usageGroups(0x67, 0xfff);
  const names = groups.flatMap((g) => g.options.map((o) => o.name));
  for (const mod of ["LCTRL", "LSHFT", "LALT", "LGUI", "RCTRL", "RSHFT", "RALT", "RGUI"]) {
    assert.ok(names.includes(mod), `${mod} must be offered`);
  }
  assert.ok(!names.includes("F13"), "non-modifier usages above the max stay filtered out");
  assert.equal(groups[1].name, "Modifiers", "modifiers group comes first after None");
});

check("shifted symbols are their own picker entries", () => {
  const groups = usageGroups();
  const shifted = groups.find((g) => g.name === "Shifted symbols");
  assert.ok(shifted, "shifted symbols group exists");
  const tilde = shifted.options.find((o) => o.name === "TILDE");
  assert.equal(tilde.value, encodeKeycode(PAGE_KEYBOARD, 0x35, 0x02), "TILDE is LSFT(GRAVE)");
  assert.ok(tilde.search.includes("~"));
  assert.equal(shifted.options.length, 21);

  const grave = groups.flatMap((g) => g.options).find((o) => o.name === "GRAVE");
  assert.equal(grave.value, encodeKeycode(PAGE_KEYBOARD, 0x35), "GRAVE stays unshifted");
  assert.equal(grave.label, "GRAVE  ` ~");

  const index = (name) => groups.findIndex((g) => g.name === name);
  assert.equal(index("Shifted symbols"), index("Punctuation") + 1);
});

check("LSFT over a shiftable key reads as its ZMK alias", () => {
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x35, 0x02)), "TILDE");
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x1e, 0x02)), "EXCL");
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x35, 0x20)), "RSFT(GRAVE)", "right shift keeps the wrapper");
  assert.equal(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x04, 0x02)), "LSFT(A)", "letters have no alias");
});

check("plain modifier keycodes encode as bare usages, not mod bits", () => {
  const lctrl = encodeKeycode(PAGE_KEYBOARD, 0xe0);
  assert.equal(keycodeName(lctrl), "LCTRL");
  assert.notEqual(keycodeName(encodeKeycode(PAGE_KEYBOARD, 0x00, 0x01)), "LCTRL");
});

// --- combos ---------------------------------------------------------------

const SAMPLE_KEYMAP = `/ {
    combos {
        compatible = "zmk,combos";

        jk_esc {
            bindings = <&kp ESCAPE>;
            key-positions = <23 24>;
            layers = <0>;
            timeout-ms = <50>;
            require-prior-idle-ms = <150>;
        };

        softoff {
            bindings = <&soft_off>;
            key-positions = <1 15 29>;
        };
    };

    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <&kp A &kp B>;
        };
    };
};
`;

check("the picker filter matches intent, not just ZMK names", () => {
  const options = usageGroups().flatMap((g) => g.options);
  const find = (needle) => {
    const terms = needle.toLowerCase().split(/\s+/);
    return options
      .filter((o) => terms.every((t) => o.search.includes(t)))
      .map((o) => o.name);
  };

  const media = find("media");
  assert.ok(media.includes("C_PLAY"), "media finds the consumer page");
  assert.ok(media.includes("C_VOL_UP"));
  assert.ok(!media.includes("A"), "media does not drag in letters");

  assert.ok(find("volume").includes("C_VOL_UP"));
  assert.ok(find("screenshot").includes("PSCRN"));
  assert.ok(find("arrow").includes("LEFT"));
  assert.ok(find("numpad").includes("KP_N4"));
  assert.ok(find("clipboard").includes("K_COPY"));
  assert.ok(find("vol up").includes("C_VOL_UP"), "words narrow, they do not widen");
  assert.ok(!find("vol up").includes("C_VOL_DN"));
  assert.equal(find("nonsensequery").length, 0);
});

check("search text keeps F-key aliasing off unrelated names", () => {
  assert.ok(searchText("F5", "Function").includes("function"));
  assert.ok(!searchText("FSLH", "Punctuation").includes("fkey"));
  assert.ok(searchText("FSLH", "Punctuation", 0x38).includes("?"), "glyphs are searchable");
});

check("combos parse out of a keymap", () => {
  const combos = parseCombos(SAMPLE_KEYMAP);
  assert.equal(combos.length, 2);
  assert.deepEqual(combos[0], {
    name: "jk_esc",
    bindings: "&kp ESCAPE",
    keyPositions: [23, 24],
    layers: [0],
    timeoutMs: 50,
    requirePriorIdleMs: 150,
    slowRelease: false,
    unknown: [],
  });
  assert.deepEqual(combos[1].keyPositions, [1, 15, 29]);
  assert.deepEqual(combos[1].layers, [], "no layers property means every layer");
  assert.equal(combos[1].timeoutMs, null);
});

check("rewriting unchanged combos is a no-op", () => {
  const out = writeCombos(SAMPLE_KEYMAP, parseCombos(SAMPLE_KEYMAP));
  assert.equal(out, SAMPLE_KEYMAP, "an untouched round-trip must not rewrite the file");
});

check("editing one combo leaves the keymap node alone", () => {
  const combos = parseCombos(SAMPLE_KEYMAP);
  combos[0].bindings = "&kp TAB";
  combos[0].keyPositions = [23, 24, 25];
  const out = writeCombos(SAMPLE_KEYMAP, combos);

  const reparsed = parseCombos(out);
  assert.equal(reparsed[0].bindings, "&kp TAB");
  assert.deepEqual(reparsed[0].keyPositions, [23, 24, 25]);
  assert.equal(reparsed.length, 2, "the other combo survives");
  assert.ok(out.includes("default_layer {"), "the keymap node is untouched");
  assert.ok(out.includes('compatible = "zmk,keymap";'));
});

check("adding and deleting combos", () => {
  const combos = parseCombos(SAMPLE_KEYMAP);
  combos.push({
    name: "sd_tab",
    bindings: "&kp TAB",
    keyPositions: [15, 16],
    layers: [0, 1],
    timeoutMs: 40,
    requirePriorIdleMs: null,
    slowRelease: true,
    unknown: [],
  });
  const added = writeCombos(SAMPLE_KEYMAP, combos);
  const withNew = parseCombos(added);
  assert.equal(withNew.length, 3);
  assert.equal(withNew[2].name, "sd_tab");
  assert.equal(withNew[2].slowRelease, true);
  assert.equal(withNew[2].requirePriorIdleMs, null, "omitted optional props stay omitted");

  const removed = writeCombos(added, withNew.filter((c) => c.name !== "jk_esc"));
  const after = parseCombos(removed);
  assert.deepEqual(after.map((c) => c.name), ["softoff", "sd_tab"]);
});

check("a keymap with no combos node gets one", () => {
  const bare = SAMPLE_KEYMAP.replace(/    combos \{[\s\S]*?\n    \};\n\n/, "");
  assert.equal(parseCombos(bare).length, 0);
  const out = writeCombos(bare, [{
    name: "jk_esc",
    bindings: "&kp ESCAPE",
    keyPositions: [23, 24],
    layers: [],
    timeoutMs: 50,
    requirePriorIdleMs: null,
    slowRelease: false,
    unknown: [],
  }]);
  const combos = parseCombos(out);
  assert.equal(combos.length, 1);
  assert.equal(combos[0].name, "jk_esc");
  assert.ok(out.includes("keymap {"), "the keymap node still exists");
});

check("unrecognised combo properties are preserved", () => {
  const withExtra = SAMPLE_KEYMAP.replace(
    "            require-prior-idle-ms = <150>;",
    "            require-prior-idle-ms = <150>;\n            some-future-prop = <7>;",
  );
  const combos = parseCombos(withExtra);
  assert.deepEqual(combos[0].unknown, ["some-future-prop = <7>;"]);
  assert.ok(writeCombos(withExtra, combos).includes("some-future-prop = <7>;"));
});

check("layer scoping", () => {
  const [jk, softoff] = parseCombos(SAMPLE_KEYMAP);
  assert.equal(comboAppliesToLayer(jk, 0), true);
  assert.equal(comboAppliesToLayer(jk, 1), false);
  assert.equal(comboAppliesToLayer(softoff, 3), true, "no layers listed means all layers");
});

check("findBlock matches braces rather than the first closer", () => {
  const block = findBlock(SAMPLE_KEYMAP, "keymap");
  assert.ok(block.body.includes("default_layer {"));
  assert.ok(block.body.includes("&kp A &kp B"));
});

console.log(failures ? `\n${failures} test(s) failed` : "\nall tests passed");
process.exit(failures ? 1 : 0);
