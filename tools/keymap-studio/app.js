import { StudioClient } from "./client.js";
import { parseCombos, writeCombos, comboAppliesToLayer } from "./combos.js";
import { positionLabel } from "./labels.js";
import { BINDING_GROUPS, scanLocalBehaviors, scanUsedBindings } from "./bindings.js";
import { core, behaviors as behaviorReq, keymap as keymapReq } from "./messages.js";
import {
  MODIFIERS, MODIFIER_KEYS, PAGE_KEYBOARD,
  behaviorAbbreviation, constantAbbreviation, decodeKeycode, encodeKeycode, keyGlyph, keycodeName,
  shiftedTwin, usageForEventCode, usageGroups,
} from "./keycodes.js";

const $ = (id) => document.getElementById(id);
const client = new StudioClient();

const state = {
  keymap: null,
  layouts: null,
  behaviors: new Map(),
  layerIndex: 0,
  keyPosition: null,
  dirty: false,
  // Combos are not part of the RPC protocol; they come from the .keymap file.
  keymapText: null,
  keymapPath: "",
  combos: [],
  comboSelected: null,
  comboDraft: null,
  usedBindings: new Set(),
  localBehaviors: [],
  typing: false,
  pressed: new Set(),
  recentKeys: [],
};

// --- logging --------------------------------------------------------------

function log(msg, kind = "") {
  const line = document.createElement("div");
  line.textContent = `${new Date().toLocaleTimeString()}  ${msg}`;
  if (kind) line.style.color = kind === "error" ? "var(--danger)" : "var(--accent-ink)";
  $("log").prepend(line);
  while ($("log").childElementCount > 80) $("log").lastElementChild.remove();
}

// --- protocol helpers -----------------------------------------------------

const send = (subsystem, body) => client.request(subsystem, body);

async function loadBehaviors() {
  const list = await send("behaviors", behaviorReq.listAll());
  state.behaviors.clear();
  for (const id of list.ids) {
    const res = await send("behaviors", behaviorReq.getDetails(id));
    state.behaviors.set(id, res.details);
  }
}

async function loadKeymap() {
  const res = await send("keymap", keymapReq.getKeymap());
  state.keymap = res.keymap;
  if (state.layerIndex >= state.keymap.layers.length) state.layerIndex = 0;
}

async function loadLayouts() {
  const res = await send("keymap", keymapReq.getPhysicalLayouts());
  state.layouts = res.layouts;
  // Some firmware reports an active index it never sent a layout for; left as
  // is, that renders an empty board on a perfectly healthy keyboard.
  const count = state.layouts?.layouts?.length ?? 0;
  const active = state.layouts?.activeLayoutIndex ?? 0;
  if (count && (active < 0 || active >= count)) {
    log(`device reports active layout ${active} of ${count} — falling back to the first`);
    state.layouts.activeLayoutIndex = 0;
  }
}

async function refreshDirty() {
  const res = await send("keymap", keymapReq.checkUnsavedChanges());
  setDirty(res.unsaved);
}

function setDirty(dirty) {
  state.dirty = dirty;
  $("dirty").textContent = dirty ? "unsaved changes" : "";
  $("dirty").className = `status${dirty ? " unsaved" : ""}`;
  $("save").disabled = !client.connected || !dirty;
  $("discard").disabled = !client.connected || !dirty;
}

async function loadAll() {
  await loadLayouts();
  await loadBehaviors();
  await loadKeymap();
  await refreshDirty();
  renderAll();
}

// --- behavior/parameter metadata ------------------------------------------

// Flattens every metadata set into the distinct descriptions allowed per slot.
function paramSlots(behavior) {
  const p1 = [];
  const p2 = [];
  for (const set of behavior?.metadata ?? []) {
    p1.push(...set.param1);
    p2.push(...set.param2);
  }
  return [p1, p2];
}

const slotHas = (descs, type) => descs.some((d) => d.type === type);

// The picker's shifted-symbol entries (TILDE, EXCL, ...) are LSFT(<key>).
const SHIFTED_ENTRY_MODS = 0x02;

// A keycap-sized label: what the key does, with the behavior only spelled out
// when it is not a plain key press. `title` carries the unabbreviated truth.
function bindingLabel(binding) {
  const behavior = state.behaviors.get(binding.behaviorId);
  if (!behavior) {
    return binding.behaviorId === 0
      ? { main: "\u2014", sub: "", dim: true, title: "empty" }
      : { main: "?", sub: "", dim: true, title: `unknown behavior #${binding.behaviorId}` };
  }

  const name = behavior.displayName;
  const lower = name.trim().toLowerCase();
  if (lower === "transparent") return { main: "\u25bd", sub: "", dim: true, title: "Transparent" };
  if (lower === "none") return { main: "\u2715", sub: "", dim: true, title: "None" };

  const [p1] = paramSlots(behavior);

  if (slotHas(p1, "hidUsage")) {
    const isKeyPress = lower === "key press";
    return {
      top: isKeyPress ? shiftedTwin(binding.param1) : null,
      main: keyGlyph(binding.param1),
      sub: isKeyPress ? "" : behaviorAbbreviation(name),
      dim: false,
      title: `${name} \u00b7 ${keycodeName(binding.param1)}`,
    };
  }

  if (slotHas(p1, "layerId")) {
    const layer = state.keymap?.layers[binding.param1];
    return {
      main: layer?.name || `L${binding.param1}`,
      sub: behaviorAbbreviation(name),
      dim: false,
      title: `${name} \u00b7 layer ${binding.param1}`,
    };
  }

  // A named constant — &bt BT_CLR_ALL, &out OUT_USB — reads as its name, not
  // as the raw number the firmware happens to give it.
  const constant = p1.find((d) => d.type === "constant" && d.value === binding.param1);
  if (constant?.name) {
    // Only the set this constant belongs to says whether a second parameter
    // (a profile index) means anything for it.
    const set = (behavior.metadata ?? []).find((m) =>
      m.param1.some((d) => d.type === "constant" && d.value === binding.param1),
    );
    const takesIndex = (set?.param2 ?? []).some((d) => d.type === "range");
    const short = constantAbbreviation(constant.name);
    return {
      main: takesIndex ? `${short} ${binding.param2}` : short,
      sub: behaviorAbbreviation(name),
      dim: false,
      title: `${name} \u00b7 ${constant.name}${takesIndex ? ` ${binding.param2}` : ""}`,
    };
  }

  if (p1.length === 0) {
    return { main: behaviorAbbreviation(name), sub: "", dim: false, title: name };
  }

  return { main: String(binding.param1), sub: behaviorAbbreviation(name), dim: false, title: name };
}

// --- rendering ------------------------------------------------------------

function renderAll() {
  renderLayers();
  renderLayoutSelect();
  renderKeyboard();
  renderInspector();
  renderCombos();
  renderComboEditor();
  renderBindingSheet();
}

function renderLayers() {
  const host = $("layers");
  host.textContent = "";
  const layers = state.keymap?.layers ?? [];
  if (!layers.length) {
    host.innerHTML = '<span class="empty">—</span>';
    return;
  }
  layers.forEach((layer, index) => {
    const row = document.createElement("div");
    row.className = `layer-row${index === state.layerIndex ? " active" : ""}`;
    row.innerHTML = `<span class="idx">${index}</span><span class="name"></span>`;
    row.querySelector(".name").textContent = layer.name || `Layer ${index}`;
    row.addEventListener("click", () => {
      state.layerIndex = index;
      state.keyPosition = null;
      renderAll();
    });
    host.append(row);
  });

  const connected = client.connected;
  $("add-layer").disabled = !connected || (state.keymap?.availableLayers ?? 0) === 0;
  $("rename-layer").disabled = !connected;
  $("remove-layer").disabled = !connected || layers.length <= 1;
  $("move-up").disabled = !connected || state.layerIndex === 0;
  $("move-down").disabled = !connected || state.layerIndex >= layers.length - 1;
}

function renderLayoutSelect() {
  const select = $("layout");
  select.textContent = "";
  const layouts = state.layouts?.layouts ?? [];
  layouts.forEach((layout, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${layout.name} (${layout.keys.length})`;
    option.selected = layout === activeLayout();
    select.append(option);
  });
  select.disabled = !client.connected || layouts.length < 2;
}

const UNIT = 0.58; // px per 1/100 key unit, i.e. 58px per 1u key
const MAX_SCALE = 2.4;

// Corner positions of one key after its own rotation, so rotated thumb keys
// are inside the measured board instead of hanging off the plate.
function keyCorners(key) {
  const corners = [
    [key.x, key.y],
    [key.x + key.width, key.y],
    [key.x + key.width, key.y + key.height],
    [key.x, key.y + key.height],
  ];
  if (!key.r) return corners;

  const angle = (key.r / 100) * (Math.PI / 180);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return corners.map(([x, y]) => {
    const dx = x - key.rx;
    const dy = y - key.ry;
    return [key.rx + dx * cos - dy * sin, key.ry + dx * sin + dy * cos];
  });
}

function boardBounds(keys) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of keys) {
    for (const [x, y] of keyCorners(key)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

// Scales the case so the whole board is visible in the column it sits in.
function fitBoard() {
  const fit = document.querySelector(".board-fit");
  const box = document.querySelector(".case");
  const column = document.querySelector("section");
  if (!fit || !box || !box.offsetWidth) return;

  box.style.transform = "none";
  // Fit both ways, so a short wide window does not scale the board off-screen.
  const availableWidth = column.clientWidth - 40;
  const availableHeight = column.clientHeight - 40;
  const scale = Math.min(
    MAX_SCALE,
    availableWidth / box.offsetWidth,
    availableHeight / box.offsetHeight,
  );
  box.style.transform = `scale(${scale})`;
  fit.style.width = `${box.offsetWidth * scale}px`;
  fit.style.height = `${box.offsetHeight * scale}px`;
}

// The layout the board draws. Falls back to the first one so an out-of-range
// active index reported by the device never blanks the board.
function activeLayout() {
  const layouts = state.layouts?.layouts ?? [];
  if (!layouts.length) return null;
  return layouts[state.layouts.activeLayoutIndex] ?? layouts[0];
}

// What is actually missing, so a connected keyboard never reads as unplugged.
function boardGapText() {
  if (!client.connected) {
    return [
      "No keyboard connected",
      "Plug the left half in over USB and press Connect to see the board.",
    ];
  }
  if (!activeLayout()) {
    return [
      "Connected, but no physical layout",
      "The keyboard reported no layout to draw. Press Reload; if it stays empty, the firmware was built without ZMK Studio layout data.",
    ];
  }
  if (!state.keymap?.layers?.length) {
    return ["Connected, but no keymap", "The keyboard reported no layers. Press Reload."];
  }
  return [
    "Layer is empty",
    `Layer ${state.layerIndex} has no bindings to draw. Pick another layer on the left.`,
  ];
}

function renderKeyboard() {
  const host = $("keyboard");
  host.textContent = "";
  const layout = activeLayout();
  const layer = state.keymap?.layers[state.layerIndex];

  // With nothing to draw, the empty case reads as a stray icon; hide it and
  // say what is missing instead.
  const hasBoard = Boolean(layout && layer);
  $("board-fit").hidden = !hasBoard;
  $("board-empty").hidden = hasBoard;
  $("typing").hidden = !hasBoard;
  if (!hasBoard) {
    const [title, detail] = boardGapText();
    const empty = $("board-empty");
    empty.querySelector("strong").textContent = title;
    empty.querySelector("span").textContent = detail;
    host.style.width = "0px";
    host.style.height = "0px";
    return;
  }

  const bounds = boardBounds(layout.keys);

  layout.keys.forEach((key, position) => {
    const el = document.createElement("div");
    el.className = `key${position === state.keyPosition ? " selected" : ""}`;
    el.dataset.position = String(position);
    el.style.left = `${(key.x - bounds.minX) * UNIT}px`;
    el.style.top = `${(key.y - bounds.minY) * UNIT}px`;
    el.style.width = `${key.width * UNIT - 3}px`;
    el.style.height = `${key.height * UNIT - 3}px`;
    if (key.r) {
      el.style.transformOrigin = `${(key.rx - key.x) * UNIT}px ${(key.ry - key.y) * UNIT}px`;
      el.style.transform = `rotate(${key.r / 100}deg)`;
    }

    const comboRole = comboRoleFor(position);
    if (comboRole) el.classList.add(comboRole);
    if (state.pressed.has(position)) el.classList.add("pressed");
    const draftOrder = state.comboDraft?.keyPositions.indexOf(position) ?? -1;
    if (draftOrder >= 0) {
      const order = document.createElement("span");
      order.className = "combo-order";
      order.textContent = String(draftOrder + 1);
      el.append(order);
    }

    const binding = layer.bindings[position];
    const label = binding
      ? bindingLabel(binding)
      : { main: "?", sub: "", dim: true, title: "no binding" };
    if (label.dim) el.classList.add("dim");

    // Stacked legend: shifted symbol above, the key itself below — the way a
    // physical keycap is printed.
    const top = document.createElement("span");
    top.className = "top";
    top.textContent = label.top ?? "";
    el.append(top);

    const main = document.createElement("span");
    main.className = "main";
    main.textContent = label.main;
    if (label.main.length > 4) main.classList.add("long");
    else if (label.main.length > 2) main.classList.add("medium");
    el.append(main);

    if (label.sub) {
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = label.sub;
      el.append(sub);
    }
    el.title = `position ${position} \u00b7 ${label.title}`;

    el.addEventListener("click", () => {
      // While a combo is being edited, the board picks its key positions
      // instead of selecting a key to rebind.
      if (state.comboDraft) {
        toggleDraftPosition(position);
        return;
      }
      state.keyPosition = position;
      renderKeyboard();
      renderInspector();
    });

    host.append(el);
  });

  host.style.width = `${bounds.width * UNIT}px`;
  host.style.height = `${bounds.height * UNIT}px`;
  fitBoard();
}

window.addEventListener("resize", fitBoard);

// Builds one parameter control. Returns null when the slot takes no value.
function paramControl(descs, current, labelText) {
  if (!descs.length) return null;

  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.textContent = labelText;
  wrap.append(label);

  if (slotHas(descs, "hidUsage")) {
    const usage = descs.find((d) => d.type === "hidUsage").value;
    const groups = usageGroups(usage.keyboardMax || 0xffff, usage.consumerMax || 0xffff);
    const { mods: initialMods, page, id } = decodeKeycode(current);

    // One-click bases for the keys people reach for most: plain modifiers.
    const quick = document.createElement("div");
    quick.className = "quick-mods";
    wrap.append(quick);

    const filter = document.createElement("input");
    filter.type = "search";
    filter.placeholder = "filter keys… (try \u201cmedia\u201d, \u201cvolume\u201d, \u201carrow\u201d)";
    filter.className = "filter";
    wrap.append(filter);

    const select = document.createElement("select");
    select.size = 14;
    wrap.append(select);

    const populate = (needle) => {
      // Every word must match somewhere in the option's search text, so
      // "vol up" narrows instead of widening, and "media" matches a whole group.
      const terms = needle.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const matches = (o) => {
        const hay = o.search ?? o.name.toLowerCase();
        return terms.every((t) => hay.includes(t));
      };
      const chosen = select.value;
      select.textContent = "";
      let shown = 0;
      for (const group of groups) {
        const options = terms.length ? group.options.filter(matches) : group.options;
        if (!options.length) continue;
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.name;
        for (const opt of options) {
          const option = document.createElement("option");
          option.value = String(opt.value);
          option.textContent = opt.label ?? opt.name;
          optgroup.append(option);
        }
        select.append(optgroup);
        shown += options.length;
      }
      if (!shown) {
        const option = document.createElement("option");
        option.disabled = true;
        option.textContent = "no keys match — try a shorter word";
        select.append(option);
      }
      // Keep the current selection when it survives the filter.
      if (chosen && select.querySelector(`option[value="${chosen}"]`)) select.value = chosen;
    };

    populate("");
    // LSFT(GRAVE) is its own entry (TILDE); select it rather than GRAVE + a ticked LSFT.
    const shiftedEntry = String(encodeKeycode(page, id, initialMods & SHIFTED_ENTRY_MODS));
    const hasShiftedEntry = (initialMods & SHIFTED_ENTRY_MODS) !== 0
      && select.querySelector(`option[value="${shiftedEntry}"]`) !== null;
    select.value = hasShiftedEntry ? shiftedEntry : String(encodeKeycode(page, id));
    if (!select.value) select.value = "0";
    const boxMods = hasShiftedEntry ? initialMods & ~SHIFTED_ENTRY_MODS : initialMods;

    for (const [name, usageId] of MODIFIER_KEYS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", () => {
        filter.value = "";
        populate("");
        select.value = String(encodeKeycode(PAGE_KEYBOARD, usageId));
        update();
      });
      quick.append(button);
    }

    const modsField = document.createElement("div");
    modsField.className = "field mods-field";
    const modsLabel = document.createElement("label");
    modsLabel.textContent = "Held with — wraps the key, e.g. LCTL(A)";
    modsField.append(modsLabel);

    const modsBox = document.createElement("div");
    modsBox.className = "mods";
    const boxes = MODIFIERS.map(([name, bit]) => {
      const holder = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(boxMods & bit);
      holder.append(input, document.createTextNode(name));
      modsBox.append(holder);
      return [input, bit];
    });
    modsField.append(modsBox);

    const preview = document.createElement("div");
    preview.className = "preview";
    modsField.append(preview);
    wrap.append(modsField);

    const value = () => {
      // A filtered-out or empty selection must not silently become usage 0,
      // which the firmware rejects as invalid parameters.
      const raw = Number(select.value);
      const base = decodeKeycode(Number.isFinite(raw) ? raw : 0);
      const modBits = boxes.reduce((acc, [input, bit]) => (input.checked ? acc | bit : acc), 0);
      // Shifted-symbol entries carry their own LSFT; the checkboxes add to it.
      return encodeKeycode(base.page, base.id, base.mods | modBits);
    };

    function update() {
      const encoded = value();
      const { mods, id: baseId } = decodeKeycode(encoded);
      preview.textContent = `= ${keycodeName(encoded)}`;
      // Modifier bits with no key underneath send nothing at all.
      const empty = mods !== 0 && baseId === 0;
      preview.classList.toggle("warn", empty);
      if (empty) {
        preview.textContent = "Modifiers alone send nothing — pick a real key, or choose LCTRL/LSHFT/… above for a plain modifier key.";
      }
    }

    filter.addEventListener("input", () => populate(filter.value));
    select.addEventListener("change", update);
    for (const [input] of boxes) input.addEventListener("change", update);
    update();

    return { element: wrap, getValue: value };
  }

  if (slotHas(descs, "layerId")) {
    const select = document.createElement("select");
    (state.keymap?.layers ?? []).forEach((layer, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${index}: ${layer.name || "unnamed"}`;
      option.selected = index === current;
      select.append(option);
    });
    wrap.append(select);
    return { element: wrap, getValue: () => Number(select.value) };
  }

  const range = descs.find((d) => d.type === "range");
  if (range) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(range.value.min);
    input.max = String(range.value.max);
    input.value = String(current);
    wrap.append(input);
    return { element: wrap, getValue: () => Number(input.value) };
  }

  const constants = descs.filter((d) => d.type === "constant");
  if (constants.length) {
    const select = document.createElement("select");
    for (const desc of constants) {
      const option = document.createElement("option");
      option.value = String(desc.value);
      option.textContent = desc.name || String(desc.value);
      option.selected = desc.value === current;
      select.append(option);
    }
    wrap.append(select);
    return { element: wrap, getValue: () => Number(select.value) };
  }

  return null; // nil-only slot
}

function renderInspector() {
  const host = $("inspector");
  host.textContent = "";

  const layer = state.keymap?.layers[state.layerIndex];
  if (!layer || state.keyPosition === null) {
    host.innerHTML = '<span class="empty">Select a key.</span>';
    return;
  }

  const binding = layer.bindings[state.keyPosition] ?? { behaviorId: 0, param1: 0, param2: 0 };

  const header = document.createElement("div");
  header.className = "field";
  header.innerHTML = `<label>Layer ${state.layerIndex} &middot; position ${state.keyPosition}</label>`;
  host.append(header);

  const behaviorField = document.createElement("div");
  behaviorField.className = "field";
  behaviorField.innerHTML = "<label>Behavior</label>";
  const behaviorSelect = document.createElement("select");
  const sorted = [...state.behaviors.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  for (const behavior of sorted) {
    const option = document.createElement("option");
    option.value = String(behavior.id);
    option.textContent = behavior.displayName;
    option.selected = behavior.id === binding.behaviorId;
    behaviorSelect.append(option);
  }
  behaviorField.append(behaviorSelect);
  host.append(behaviorField);

  const paramsHost = document.createElement("div");
  host.append(paramsHost);

  let controls = [];

  const renderParams = () => {
    paramsHost.textContent = "";
    const behavior = state.behaviors.get(Number(behaviorSelect.value));
    const [p1, p2] = paramSlots(behavior);
    const sameBehavior = behavior?.id === binding.behaviorId;
    controls = [
      paramControl(p1, sameBehavior ? binding.param1 : 0, p1[0]?.name || "Parameter 1"),
      paramControl(p2, sameBehavior ? binding.param2 : 0, p2[0]?.name || "Parameter 2"),
    ];
    for (const control of controls) if (control) paramsHost.append(control.element);
  };

  behaviorSelect.addEventListener("change", renderParams);
  renderParams();

  const apply = document.createElement("button");
  apply.className = "primary";
  apply.textContent = "Apply to keyboard";
  apply.addEventListener("click", async () => {
    apply.disabled = true;
    try {
      await applyBinding({
        behaviorId: Number(behaviorSelect.value),
        param1: controls[0]?.getValue() ?? 0,
        param2: controls[1]?.getValue() ?? 0,
      });
    } finally {
      apply.disabled = false;
    }
  });
  host.append(apply);
}

// --- mutations ------------------------------------------------------------

const BINDING_ERRORS = ["ok", "invalid location", "invalid behavior", "invalid parameters"];

async function applyBinding(binding) {
  const layer = state.keymap.layers[state.layerIndex];
  const behavior = state.behaviors.get(binding.behaviorId);
  const [p1] = paramSlots(behavior);
  // The firmware rejects usage 0 outright; catch it here so the reason is clear.
  if (slotHas(p1, "hidUsage") && (binding.param1 & 0xffff) === 0) {
    log("pick a key first — a bare modifier or empty selection is not a valid keycode", "error");
    return;
  }
  try {
    const res = await send("keymap", keymapReq.setLayerBinding(layer.id, state.keyPosition, binding));
    if (res.code !== 0) {
      log(`set binding rejected: ${BINDING_ERRORS[res.code] ?? res.code}`, "error");
      return;
    }
    layer.bindings[state.keyPosition] = binding;
    log(`position ${state.keyPosition} -> ${bindingLabel(binding).main}`, "ok");
    renderKeyboard();
    await refreshDirty();
  } catch (err) {
    log(err.message, "error");
  }
}

async function guarded(fn) {
  try {
    await fn();
  } catch (err) {
    log(err.message, "error");
  }
}

// --- combos ---------------------------------------------------------------
//
// Combos are devicetree, not RPC. They are read from and written back to
// config/eyelash_corne.keymap, and only take effect after a rebuild and flash.

// How a key position relates to the combo currently in focus.
function comboRoleFor(position) {
  if (state.comboDraft) {
    return state.comboDraft.keyPositions.includes(position) ? "combo-member" : null;
  }
  const selected = state.combos[state.comboSelected];
  if (selected?.keyPositions.includes(position)) return "combo-member";

  const onThisLayer = state.combos.some(
    (combo) => comboAppliesToLayer(combo, state.layerIndex) && combo.keyPositions.includes(position),
  );
  return onThisLayer ? "combo-touched" : null;
}

function toggleDraftPosition(position) {
  const draft = state.comboDraft;
  const at = draft.keyPositions.indexOf(position);
  if (at >= 0) draft.keyPositions.splice(at, 1);
  else draft.keyPositions.push(position);
  renderKeyboard();
  renderComboEditor();
}

async function loadCombos() {
  try {
    const res = await fetch("/api/keymap");
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const data = await res.json();
    state.keymapText = data.text;
    state.keymapPath = data.path;
    state.combos = parseCombos(data.text);
    state.usedBindings = scanUsedBindings(data.text);
    state.localBehaviors = scanLocalBehaviors(data.text);
    log(`loaded ${state.combos.length} combo(s) from ${state.keymapPath}`, "ok");
  } catch (err) {
    state.keymapText = null;
    state.combos = [];
    log(`could not read keymap for combos: ${err.message}`, "error");
  }
  renderCombos();
  renderComboEditor();
  renderBindingSheet();
  renderKeyboard();
}

async function saveCombos() {
  if (state.keymapText === null) {
    log("keymap file was never loaded; refusing to write", "error");
    return false;
  }
  const text = writeCombos(state.keymapText, state.combos);
  const res = await fetch("/api/keymap", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    log(`combo save failed: ${(await res.json()).error ?? res.statusText}`, "error");
    return false;
  }
  state.keymapText = text;
  log(`combos written to ${state.keymapPath} — use Apply to keyboard to build and flash`, "ok");
  refreshRepoState();
  return true;
}

// Keycap label for combo chips (always BASE layout — combos are defined in devicetree).
function positionGlyph(position) {
  return positionLabel(position);
}

function renderCombos() {
  const host = $("combo-list");
  host.textContent = "";

  if (state.keymapText === null) {
    host.innerHTML = '<span class="empty">Keymap file unavailable — start the page with serve.sh to edit combos.</span>';
    return;
  }
  if (!state.combos.length) {
    host.innerHTML = '<span class="empty">No combos defined.</span>';
    return;
  }

  state.combos.forEach((combo, index) => {
    const row = document.createElement("div");
    row.className = "combo-row";
    if (index === state.comboSelected) row.classList.add("active");
    if (!comboAppliesToLayer(combo, state.layerIndex)) row.classList.add("other-layer");

    const name = document.createElement("span");
    name.className = "combo-name";
    name.textContent = combo.name;
    row.append(name);

    const keys = document.createElement("span");
    keys.className = "combo-keys";
    combo.keyPositions.forEach((position, i) => {
      if (i) keys.append(Object.assign(document.createElement("span"), {
        className: "plus", textContent: "+",
      }));
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = positionGlyph(position);
      chip.title = `position ${position} (${positionLabel(position)})`;
      keys.append(chip);
    });
    row.append(keys);

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "\u2192";
    row.append(arrow);

    const binding = document.createElement("code");
    binding.className = "combo-binding";
    binding.textContent = combo.bindings;
    row.append(binding);

    const meta = document.createElement("span");
    meta.className = "combo-meta";
    meta.textContent = combo.layers.length
      ? `layers ${combo.layers.join(", ")}`
      : "all layers";
    if (combo.timeoutMs !== null) meta.textContent += ` \u00b7 ${combo.timeoutMs}ms`;
    row.append(meta);

    row.addEventListener("click", () => {
      state.comboSelected = index === state.comboSelected ? null : index;
      state.comboDraft = null;
      renderCombos();
      renderComboEditor();
      renderKeyboard();
    });

    const edit = document.createElement("button");
    edit.className = "combo-edit";
    edit.textContent = "Edit";
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
      state.comboSelected = index;
      state.comboDraft = { ...combo, keyPositions: [...combo.keyPositions], layers: [...combo.layers] };
      renderCombos();
      renderComboEditor();
      renderKeyboard();
    });
    row.append(edit);

    const remove = document.createElement("button");
    remove.className = "danger combo-edit";
    remove.textContent = "Delete";
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`Delete combo "${combo.name}"?\n\nYou must commit, build, and flash both halves before it stops on the keyboard.`)) {
        return;
      }
      const previous = state.combos;
      state.combos = state.combos.filter((_, i) => i !== index);
      if (await saveCombos()) {
        state.comboDraft = null;
        state.comboSelected = null;
      } else {
        state.combos = previous;
      }
      renderCombos();
      renderComboEditor();
      renderKeyboard();
    });
    row.append(remove);

    host.append(row);
  });
}

function renderComboEditor() {
  const host = $("combo-editor");
  host.textContent = "";
  const draft = state.comboDraft;
  host.hidden = !draft;
  if (!draft) return;

  const isNew = state.comboSelected === null || state.comboSelected >= state.combos.length;

  const grid = document.createElement("div");
  grid.className = "combo-form";

  const textField = (label, value, onInput, placeholder = "") => {
    const wrap = document.createElement("label");
    wrap.className = "combo-field";
    wrap.append(Object.assign(document.createElement("span"), { textContent: label }));
    const input = document.createElement("input");
    input.value = value ?? "";
    input.placeholder = placeholder;
    input.addEventListener("input", () => onInput(input.value));
    wrap.append(input);
    return wrap;
  };

  grid.append(textField("Name", draft.name, (v) => { draft.name = v.trim().replace(/\s+/g, "_"); }, "jk_esc"));
  const bindingField = textField("Binding", draft.bindings, (v) => { draft.bindings = v.trim(); }, "&kp ESCAPE");
  bindingField.querySelector("input").setAttribute("list", "binding-options");
  bindingField.querySelector("span").append(
    Object.assign(document.createElement("button"), {
      className: "link",
      textContent: "what can I put here?",
      onclick: () => showBindingSheet(),
    }),
  );
  grid.append(bindingField);
  grid.append(textField("Timeout (ms)", draft.timeoutMs ?? "", (v) => {
    draft.timeoutMs = v.trim() === "" ? null : Number(v);
  }, "50"));
  grid.append(textField("Require prior idle (ms)", draft.requirePriorIdleMs ?? "", (v) => {
    draft.requirePriorIdleMs = v.trim() === "" ? null : Number(v);
  }, "150"));
  host.append(grid);

  // Key positions, picked by clicking the board.
  const positions = document.createElement("div");
  positions.className = "combo-field wide";
  positions.append(Object.assign(document.createElement("span"), {
    textContent: "Key positions — click keys on the board to add or remove",
  }));
  const chips = document.createElement("div");
  chips.className = "combo-keys editing";
  if (!draft.keyPositions.length) {
    chips.append(Object.assign(document.createElement("span"), {
      className: "empty", textContent: "none selected",
    }));
  }
  draft.keyPositions.forEach((position, i) => {
    if (i) chips.append(Object.assign(document.createElement("span"), { className: "plus", textContent: "+" }));
    const chip = document.createElement("button");
    chip.className = "chip removable";
    chip.textContent = `${positionGlyph(position)} (${position})`;
    chip.title = "remove";
    chip.addEventListener("click", () => toggleDraftPosition(position));
    chips.append(chip);
  });
  positions.append(chips);
  host.append(positions);

  // Layers: an empty list means every layer, which is how ZMK reads it, so the
  // "All layers" toggle just clears the list rather than ticking every box.
  const layers = document.createElement("div");
  layers.className = "combo-field wide";
  layers.append(Object.assign(document.createElement("span"), { textContent: "Active on layers" }));

  const allLayers = draft.layers.length === 0;
  const allHolder = document.createElement("label");
  allHolder.className = "combo-all-layers";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.checked = allLayers;
  allInput.addEventListener("change", () => {
    // Turning it off has to leave a layer picked, or the combo silently
    // goes back to meaning "all layers" anyway.
    draft.layers = allInput.checked ? [] : [state.layerIndex ?? 0];
    renderComboEditor();
  });
  allHolder.append(allInput, document.createTextNode("All layers"));

  const layerBoxes = document.createElement("div");
  layerBoxes.className = "combo-layers";
  (state.keymap?.layers ?? []).forEach((layer, index) => {
    const holder = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = draft.layers.includes(index);
    input.disabled = allLayers;
    input.addEventListener("change", () => {
      if (input.checked) draft.layers = [...new Set([...draft.layers, index])].sort((a, b) => a - b);
      else draft.layers = draft.layers.filter((l) => l !== index);
      // Unticking the last layer is the same as "all layers": keep the toggle honest.
      renderComboEditor();
    });
    holder.append(input, document.createTextNode(`${index} ${layer.name || ""}`.trim()));
    layerBoxes.append(holder);
  });
  layerBoxes.append(allHolder);
  layers.append(layerBoxes);
  host.append(layers);

  const actions = document.createElement("div");
  actions.className = "combo-actions";

  const save = document.createElement("button");
  save.className = "primary";
  save.textContent = isNew ? "Create combo" : "Save combo";
  save.addEventListener("click", async () => {
    if (!draft.name) return log("combo needs a name", "error");
    if (!draft.bindings.startsWith("&")) return log("binding must start with & (e.g. &kp ESCAPE)", "error");
    if (draft.keyPositions.length < 2) return log("a combo needs at least two key positions", "error");

    const clash = state.combos.findIndex((c, i) => c.name === draft.name && i !== state.comboSelected);
    if (clash >= 0) return log(`another combo is already named ${draft.name}`, "error");

    const next = [...state.combos];
    if (isNew) next.push(draft);
    else next[state.comboSelected] = draft;

    const previous = state.combos;
    state.combos = next;
    if (await saveCombos()) {
      state.comboDraft = null;
      state.comboSelected = isNew ? next.length - 1 : state.comboSelected;
    } else {
      state.combos = previous;
    }
    renderCombos();
    renderComboEditor();
    renderKeyboard();
  });
  actions.append(save);

  if (!isNew) {
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete combo ${draft.name}?`)) return;
      const previous = state.combos;
      state.combos = state.combos.filter((_, i) => i !== state.comboSelected);
      if (await saveCombos()) {
        state.comboDraft = null;
        state.comboSelected = null;
      } else {
        state.combos = previous;
      }
      renderCombos();
      renderComboEditor();
      renderKeyboard();
    });
    actions.append(remove);
  }

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    state.comboDraft = null;
    renderCombos();
    renderComboEditor();
    renderKeyboard();
  });
  actions.append(cancel);

  host.append(actions);
}

// --- binding reference sheet ----------------------------------------------

// Does the connected keyboard actually report this behavior?
function deviceHasBehavior(studioName) {
  if (!studioName || !state.behaviors.size) return false;
  const wanted = studioName.toLowerCase();
  return [...state.behaviors.values()].some((b) => b.displayName.trim().toLowerCase() === wanted);
}

function showBindingSheet() {
  $("binding-sheet").hidden = false;
  $("sheet-toggle").textContent = "Hide";
  $("binding-sheet").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function bindingRow(entry) {
  const row = document.createElement("div");
  row.className = "sheet-row";

  const code = document.createElement("code");
  code.className = "sheet-code";
  code.textContent = entry.params ? `${entry.code} ${entry.params}` : entry.code;
  row.append(code);

  const what = document.createElement("span");
  what.className = "sheet-what";
  what.textContent = entry.what ?? "Defined by this keymap.";
  row.append(what);

  const tags = document.createElement("span");
  tags.className = "sheet-tags";
  if (deviceHasBehavior(entry.studioName)) {
    tags.append(Object.assign(document.createElement("span"), {
      className: "tag on-device", textContent: "on your keyboard", title: "reported by the connected firmware",
    }));
  }
  if (state.usedBindings.has(entry.code)) {
    tags.append(Object.assign(document.createElement("span"), {
      className: "tag in-keymap", textContent: "in your keymap",
    }));
  }
  row.append(tags);

  const use = document.createElement("button");
  use.className = "sheet-use";
  use.textContent = "Use";
  use.title = "put this in the combo binding field";
  use.addEventListener("click", () => {
    if (!state.comboDraft) {
      log("open or create a combo first, then press Use", "error");
      return;
    }
    state.comboDraft.bindings = entry.params ? `${entry.code} ` : entry.code;
    renderComboEditor();
    $("combo-editor").querySelector("input[list]")?.focus();
  });
  row.append(use);

  return row;
}

function renderBindingSheet() {
  const host = $("binding-sheet");
  host.textContent = "";

  const groups = [...BINDING_GROUPS];
  if (state.localBehaviors.length) {
    groups.push({
      group: "Defined in this keymap",
      entries: state.localBehaviors.map((entry) => ({
        ...entry,
        what: "Custom behavior declared in config/eyelash_corne.keymap.",
      })),
    });
  }

  for (const { group, entries } of groups) {
    const heading = document.createElement("h3");
    heading.className = "sheet-group";
    heading.textContent = group;
    host.append(heading);
    for (const entry of entries) host.append(bindingRow(entry));
  }

  // Autocomplete for the combo binding field.
  const list = $("binding-options");
  list.textContent = "";
  for (const { entries } of groups) {
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = entry.example ?? entry.code;
      list.append(option);
    }
  }
}

$("sheet-toggle").addEventListener("click", () => {
  const sheet = $("binding-sheet");
  sheet.hidden = !sheet.hidden;
  $("sheet-toggle").textContent = sheet.hidden ? "Show" : "Hide";
});

// --- typing test ----------------------------------------------------------
//
// The keyboard is a HID device, so the browser sees exactly what it sends.
// Matching that against the keymap shows whether a key does what it should.

// Positions on the current layer bound to this HID usage.
function positionsForUsage(usage) {
  const layer = state.keymap?.layers[state.layerIndex];
  if (!layer) return [];
  const positions = [];
  layer.bindings.forEach((binding, position) => {
    const behavior = state.behaviors.get(binding.behaviorId);
    const [p1] = paramSlots(behavior);
    if (!slotHas(p1, "hidUsage")) return;
    if ((binding.param1 & 0xffff) === usage) positions.push(position);
  });
  return positions;
}

function renderTypingReadout() {
  const host = $("typing-readout");
  host.textContent = "";

  if (!state.typing) {
    host.innerHTML = '<span class="empty">Press <em>Start</em>, then type on the keyboard.</span>';
    return;
  }
  if (!state.recentKeys.length) {
    host.innerHTML = '<span class="empty">Listening — press any key.</span>';
    return;
  }

  for (const entry of state.recentKeys) {
    const chip = document.createElement("span");
    chip.className = `typed${entry.positions.length ? "" : " unmatched"}`;
    chip.append(Object.assign(document.createElement("strong"), { textContent: entry.glyph }));
    chip.append(Object.assign(document.createElement("span"), {
      textContent: entry.positions.length
        ? `position ${entry.positions.join(", ")}`
        : "not on this layer",
    }));
    host.append(chip);
  }
}

// Toggle the class in place: a full re-render on every keystroke would
// flicker and re-run the board fit.
function markPressed(position, down) {
  const el = $("keyboard").querySelector(`.key[data-position="${position}"]`);
  el?.classList.toggle("pressed", down);
}

function noteKeyPress(usage) {
  const positions = positionsForUsage(usage);
  state.recentKeys.unshift({ glyph: keyGlyph(encodeKeycode(PAGE_KEYBOARD, usage)), positions });
  state.recentKeys = state.recentKeys.slice(0, 10);
  for (const position of positions) {
    state.pressed.add(position);
    markPressed(position, true);
  }
  renderTypingReadout();
}

function releaseKey(usage) {
  for (const position of positionsForUsage(usage)) {
    state.pressed.delete(position);
    markPressed(position, false);
  }
}

function setTyping(on) {
  state.typing = on;
  $("typing-toggle").textContent = on ? "Stop" : "Start";
  $("typing-toggle").classList.toggle("primary", on);
  $("typing").classList.toggle("listening", on);
  if (!on) {
    for (const position of state.pressed) markPressed(position, false);
    state.pressed.clear();
    state.recentKeys = [];
  }
  renderTypingReadout();
}

$("typing-toggle").addEventListener("click", () => setTyping(!state.typing));

window.addEventListener("keydown", (event) => {
  if (!state.typing) return;
  const usage = usageForEventCode(event.code);
  if (usage === null) return;
  // Swallow the keystroke so the test does not type into the page.
  event.preventDefault();
  if (event.repeat) return;
  noteKeyPress(usage);
});

window.addEventListener("keyup", (event) => {
  if (!state.typing) return;
  const usage = usageForEventCode(event.code);
  if (usage === null) return;
  event.preventDefault();
  releaseKey(usage);
});

// --- apply pipeline -------------------------------------------------------
//
// Combos are compiled into the firmware, so "applying" one means committing
// the keymap, letting CI build it, and flashing the result.

const apply = {
  sha: null,
  runId: null,
  buildTimer: null,
  bootloaderTimer: null,
  startedAt: 0,
  flashLeftDone: false,
  flashRightDone: false,
};

// GitHub's own status strings are not written for people to read.
const BUILD_STATES = {
  queued: "Queued on GitHub Actions…",
  in_progress: "Building firmware…",
  waiting: "Waiting for a runner…",
  requested: "Requested…",
};

function setStep(step, state, detail) {
  const li = document.querySelector(`#apply-steps li[data-step="${step}"]`);
  if (!li) return;
  li.className = state; // "", "active", "done", "failed"
  if (detail !== undefined) {
    $(`step-${step}-detail`).textContent = detail;
    li.querySelector(".step-link")?.remove();
  }
}

// Adds (or replaces) the "run 123" link under a step.
function setStepLink(step, href, text) {
  const li = document.querySelector(`#apply-steps li[data-step="${step}"]`);
  if (!li) return;
  li.querySelector(".step-link")?.remove();
  const link = document.createElement("a");
  link.className = "step-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  $(`step-${step}-detail`).after(link);
}

async function api(path, options) {
  const res = await fetch(path, options);
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    // Non-JSON error pages still need a usable message.
  }
  if (!res.ok) throw new Error(payload.hint ? `${payload.error} — ${payload.hint}` : payload.error ?? res.statusText);
  return payload;
}

async function refreshRepoState() {
  try {
    const repo = await api("/api/repo");
    const bits = [`branch ${repo.branch}`];
    if (repo.keymapDirty) bits.push("keymap has uncommitted changes");
    if (repo.unpushed) bits.push(`${repo.unpushed} unpushed`);
    $("repo-state").textContent = bits.join(" · ");
    $("do-commit").disabled = !repo.keymapDirty;
    // A finished push stays reported as done; only an idle step tracks the file.
    if (!apply.sha) {
      setStep("commit", repo.keymapDirty ? "active" : "", repo.keymapDirty
        ? "Combo edits are written to the file but not committed."
        : "No uncommitted keymap changes.");
    } else if (repo.keymapDirty) {
      setStep("commit", "active", "New combo edits since that push — commit again to include them.");
    }
    return repo;
  } catch (err) {
    $("repo-state").textContent = err.message;
    return null;
  }
}

async function pollBuild() {
  if (!apply.sha) return;
  try {
    const build = await api(`/api/run?sha=${apply.sha}`);
    if (build.state === "pending") {
      setStep("build", "active", "Waiting for GitHub Actions to pick up the commit…");
      return;
    }
    if (build.state !== "completed") {
      const elapsed = Math.round((Date.now() - apply.startedAt) / 1000);
      setStep("build", "active", `${BUILD_STATES[build.state] ?? build.state} — ${elapsed}s elapsed`);
      setStepLink("build", build.url, `run ${build.runId}`);
      return;
    }

    clearInterval(apply.buildTimer);
    apply.buildTimer = null;

    if (build.conclusion === "success") {
      apply.runId = build.runId;
      const took = Math.round((Date.now() - apply.startedAt) / 1000);
      setStep("build", "done", `Build succeeded in ${took}s.`);
      setStepLink("build", build.url, `run ${build.runId}`);
      apply.flashLeftDone = false;
      apply.flashRightDone = false;
      setStep("flash-left", "active");
      setStep("flash-right", "", "Flash after the left half, or plug in the right half first if you only need combo keys on that side.");
      watchBootloader();
      log("firmware built — flash left, then right (USB + double-tap reset each half)", "ok");
    } else {
      setStep("build", "failed", `Build ${build.conclusion}.`);
      setStepLink("build", build.url, "open the failed run");
      log(`CI build ${build.conclusion}`, "error");
    }
  } catch (err) {
    setStep("build", "failed", err.message);
    clearInterval(apply.buildTimer);
    apply.buildTimer = null;
  }
}

// The bootloader drive appears only after a double-tap of reset, so poll for it
// rather than making the user tell us when it is ready.
function watchBootloader() {
  if (apply.bootloaderTimer) return;
  apply.bootloaderTimer = setInterval(async () => {
    const repo = await api("/api/repo").catch(() => null);
    const mounted = Boolean(repo?.bootloader);
    const ready = mounted && apply.runId;
    $("do-flash-left").disabled = !ready || apply.flashLeftDone;
    $("do-flash-right").disabled = !ready;
    const mountMsg = mounted
      ? `Bootloader at ${repo.bootloader} — choose Flash left or Flash right for whichever half is plugged in.`
      : "Plug in one half over USB, double-tap reset, then flash.";
    if (!apply.flashLeftDone) {
      $("step-flash-left-detail").textContent = mountMsg;
    }
    $("step-flash-right-detail").textContent = apply.flashRightDone
      ? "Right half flashed for this build."
      : `${mountMsg} Combos on N/M/, etc. require flashing the right half.`;
  }, 2000);
}

async function flashFirmwareHalf(half) {
  const step = half === "left" ? "flash-left" : "flash-right";
  const button = $(`do-flash-${half}`);
  button.disabled = true;
  setStep(step, "active", `Downloading firmware and copying to the ${half} half…`);
  try {
    const result = await api("/api/flash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: apply.runId, half }),
    });
    setStep(step, "done", `Flashed ${result.flashed}.`);
    log(`flashed ${half} half (${result.flashed})`, "ok");
    if (half === "left") {
      apply.flashLeftDone = true;
      setStep("flash-right", apply.flashRightDone ? "done" : "active");
    } else {
      apply.flashRightDone = true;
      await loadCombos();
      log("combo list matches keymap file — keyboard should match after both halves are flashed", "ok");
    }
  } catch (err) {
    setStep(step, "failed", err.message);
    log(err.message, "error");
    button.disabled = false;
  }
}

$("do-commit").addEventListener("click", () => guarded(async () => {
  const button = $("do-commit");
  button.disabled = true;
  setStep("commit", "active", "Committing and pushing…");
  try {
    const result = await api("/api/commit-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: $("commit-message").value.trim() }),
    });
    apply.sha = result.sha;
    apply.startedAt = Date.now();
    setStep("commit", "done", `Pushed ${result.sha.slice(0, 7)} to ${result.branch}.`);
    setStep("build", "active", "Waiting for GitHub Actions…");
    log(`pushed ${result.sha.slice(0, 7)} to ${result.branch}`, "ok");

    clearInterval(apply.buildTimer);
    apply.buildTimer = setInterval(pollBuild, 10000);
    pollBuild();
  } catch (err) {
    setStep("commit", "failed", err.message);
    log(err.message, "error");
    button.disabled = false;
  }
  refreshRepoState();
}));

$("do-flash-left").addEventListener("click", () => guarded(() => flashFirmwareHalf("left")));
$("do-flash-right").addEventListener("click", () => guarded(() => flashFirmwareHalf("right")));

$("combo-reload").addEventListener("click", () => guarded(async () => {
  await loadCombos();
  log("reloaded combos from disk", "ok");
}));

// --- wiring ---------------------------------------------------------------

function setConnectedUi(connected) {
  $("connect").disabled = connected;
  $("disconnect").disabled = !connected;
  $("reload").disabled = !connected;
  if (!connected) {
    $("device").textContent = "not connected";
    $("device").className = "status";
    setDirty(false);
  }
}

$("connect").addEventListener("click", () => guarded(async () => {
  await client.connect();
  const info = await send("core", core.getDeviceInfo());
  const lock = await send("core", core.getLockState());
  $("device").textContent = info.info.name + (lock.locked ? " (locked)" : "");
  if (lock.locked) log("device is locked; unlock it to make changes", "error");
  await loadAll();
  log("connected", "ok");
}));

$("disconnect").addEventListener("click", () => guarded(() => client.disconnect()));
$("reload").addEventListener("click", () => guarded(loadAll));

$("save").addEventListener("click", () => guarded(async () => {
  const res = await send("keymap", keymapReq.saveChanges());
  if (res.result.ok) {
    log("saved to flash", "ok");
    await refreshDirty();
  } else {
    log(`save failed (code ${res.result.err})`, "error");
  }
}));

$("discard").addEventListener("click", () => guarded(async () => {
  await send("keymap", keymapReq.discardChanges());
  await loadKeymap();
  await refreshDirty();
  renderAll();
  log("discarded unsaved changes", "ok");
}));

$("add-layer").addEventListener("click", () => guarded(async () => {
  const res = await send("keymap", keymapReq.addLayer());
  if (res.result.err !== null) {
    log(`add layer failed (code ${res.result.err})`, "error");
    return;
  }
  await loadKeymap();
  state.layerIndex = res.result.ok.index;
  renderAll();
}));

$("remove-layer").addEventListener("click", () => guarded(async () => {
  const res = await send("keymap", keymapReq.removeLayer(state.layerIndex));
  if (res.result.err !== null) {
    log(`remove layer failed (code ${res.result.err})`, "error");
    return;
  }
  state.layerIndex = Math.max(0, state.layerIndex - 1);
  await loadKeymap();
  renderAll();
}));

$("rename-layer").addEventListener("click", () => guarded(async () => {
  const layer = state.keymap.layers[state.layerIndex];
  const name = prompt("Layer name", layer.name || "");
  if (name === null) return;
  const res = await send("keymap", keymapReq.setLayerProps(layer.id, name));
  if (res.code !== 0) {
    log(`rename failed (code ${res.code})`, "error");
    return;
  }
  await loadKeymap();
  renderAll();
}));

const moveLayer = (delta) => guarded(async () => {
  const dest = state.layerIndex + delta;
  const res = await send("keymap", keymapReq.moveLayer(state.layerIndex, dest));
  if (res.result.err !== null) {
    log(`move layer failed (code ${res.result.err})`, "error");
    return;
  }
  state.layerIndex = dest;
  await loadKeymap();
  renderAll();
});

$("move-up").addEventListener("click", () => moveLayer(-1));
$("move-down").addEventListener("click", () => moveLayer(1));

$("layout").addEventListener("change", (event) => guarded(async () => {
  const index = Number(event.target.value);
  const res = await send("keymap", keymapReq.setActivePhysicalLayout(index));
  if (res.result.err !== null) {
    log(`layout switch failed (code ${res.result.err})`, "error");
    return;
  }
  state.layouts.activeLayoutIndex = index;
  state.keymap = res.result.ok;
  state.keyPosition = null;
  renderAll();
}));

$("combo-new").addEventListener("click", () => {
  state.comboSelected = state.combos.length;
  state.comboDraft = {
    name: "",
    bindings: "&kp ",
    keyPositions: [],
    layers: [],
    timeoutMs: 50,
    requirePriorIdleMs: null,
    slowRelease: false,
    unknown: [],
  };
  renderCombos();
  renderComboEditor();
  renderKeyboard();
});

client.addEventListener("connected", () => setConnectedUi(true));
client.addEventListener("disconnected", () => {
  setConnectedUi(false);
  state.keymap = null;
  state.layouts = null;
  state.keyPosition = null;
  renderAll();
  log("disconnected");
});
client.addEventListener("warning", (event) => log(event.detail));
client.addEventListener("error", (event) => log(String(event.detail?.message ?? event.detail), "error"));
client.addEventListener("notification", (event) => {
  const note = event.detail;
  if (!note) return;
  if (note.kind === "unsavedChangesStatusChanged") setDirty(note.unsaved);
  if (note.kind === "lockStateChanged") log(note.locked ? "device locked" : "device unlocked");
});

setConnectedUi(false);

// Combos come from the keymap file, so they load whether or not a keyboard
// is connected.
loadCombos();
renderAll();
refreshRepoState();
