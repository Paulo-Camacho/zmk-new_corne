// Reading and writing the `combos { ... }` node of a ZMK devicetree keymap.
//
// Combos are not part of the ZMK Studio RPC protocol, so unlike everything
// else in this tool they are edited in the .keymap source and only take effect
// after a rebuild and flash.
//
// This is a deliberately small parser: it handles the flat `name { prop = <…>; }`
// shape combos actually use, not devicetree in general.

const NODE_RE = /([A-Za-z_][\w-]*)\s*\{([^{}]*)\}\s*;/g;
const CELL_PROP_RE = /([A-Za-z_][\w-]*)\s*=\s*<([^>]*)>\s*;/g;
const STRING_PROP_RE = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"\s*;/g;
const FLAG_PROP_RE = /(?:^|\n)\s*([A-Za-z_][\w-]*)\s*;/g;

// Finds the body of a named node, by brace matching so nested nodes survive.
export function findBlock(text, nodeName) {
  const header = new RegExp(`(^|\\n)([ \\t]*)${nodeName}\\s*\\{`, "g");
  const match = header.exec(text);
  if (!match) return null;

  const open = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        const close = i;
        const semi = text.indexOf(";", close);
        return {
          indent: match[2],
          bodyStart: open + 1,
          bodyEnd: close,
          nodeEnd: semi === -1 ? close + 1 : semi + 1,
          body: text.slice(open + 1, close),
        };
      }
    }
  }
  return null;
}

const numbers = (cells) =>
  cells.trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));

export function parseCombos(keymapText) {
  const block = findBlock(keymapText, "combos");
  if (!block) return [];

  const combos = [];
  for (const [, name, body] of block.body.matchAll(NODE_RE)) {
    const combo = {
      name,
      bindings: "",
      keyPositions: [],
      layers: [],
      timeoutMs: null,
      requirePriorIdleMs: null,
      slowRelease: false,
      unknown: [],
    };

    for (const [, prop, cells] of body.matchAll(CELL_PROP_RE)) {
      switch (prop) {
        case "bindings": combo.bindings = cells.trim(); break;
        case "key-positions": combo.keyPositions = numbers(cells); break;
        case "layers": combo.layers = numbers(cells); break;
        case "timeout-ms": combo.timeoutMs = numbers(cells)[0] ?? null; break;
        case "require-prior-idle-ms": combo.requirePriorIdleMs = numbers(cells)[0] ?? null; break;
        default: combo.unknown.push(`${prop} = <${cells.trim()}>;`); break;
      }
    }
    for (const [, prop, value] of body.matchAll(STRING_PROP_RE)) {
      combo.unknown.push(`${prop} = "${value}";`);
    }
    for (const [, prop] of body.matchAll(FLAG_PROP_RE)) {
      if (prop === "slow-release") combo.slowRelease = true;
      else combo.unknown.push(`${prop};`);
    }

    combos.push(combo);
  }
  return combos;
}

export function serializeCombo(combo, indent = "        ") {
  const inner = `${indent}    `;
  const lines = [`${indent}${combo.name} {`, `${inner}bindings = <${combo.bindings}>;`];
  lines.push(`${inner}key-positions = <${combo.keyPositions.join(" ")}>;`);
  if (combo.layers.length) lines.push(`${inner}layers = <${combo.layers.join(" ")}>;`);
  if (combo.timeoutMs !== null && combo.timeoutMs !== undefined) {
    lines.push(`${inner}timeout-ms = <${combo.timeoutMs}>;`);
  }
  if (combo.requirePriorIdleMs !== null && combo.requirePriorIdleMs !== undefined) {
    lines.push(`${inner}require-prior-idle-ms = <${combo.requirePriorIdleMs}>;`);
  }
  if (combo.slowRelease) lines.push(`${inner}slow-release;`);
  for (const extra of combo.unknown ?? []) lines.push(`${inner}${extra}`);
  lines.push(`${indent}};`);
  return lines.join("\n");
}

// Rewrites the combos node in place, leaving the rest of the file untouched.
// When the file has no combos node yet, one is inserted before `keymap {`.
export function writeCombos(keymapText, combos) {
  const block = findBlock(keymapText, "combos");
  const indent = block ? `${block.indent}    ` : "        ";
  const body = combos.length
    ? `\n${combos.map((c) => serializeCombo(c, indent)).join("\n\n")}\n${block?.indent ?? "    "}`
    : "\n";

  if (block) {
    const compatible = /compatible\s*=\s*"[^"]*"\s*;/.exec(block.body)?.[0] ?? 'compatible = "zmk,combos";';
    const head = `\n${indent}${compatible}\n`;
    return keymapText.slice(0, block.bodyStart) + head + body + keymapText.slice(block.bodyEnd);
  }

  const keymapNode = findBlock(keymapText, "keymap");
  if (!keymapNode) throw new Error("keymap node not found; refusing to guess where combos belong");
  const at = keymapText.lastIndexOf("\n", keymapText.lastIndexOf("keymap", keymapNode.bodyStart));
  const nodeIndent = keymapNode.indent;
  const inserted = `\n${nodeIndent}combos {\n${nodeIndent}    compatible = "zmk,combos";\n${body}${nodeIndent}};\n`;
  return keymapText.slice(0, at) + inserted + keymapText.slice(at);
}

// Combos only fire when every position is on a layer the combo listens to.
// An empty `layers` list means all layers.
export function comboAppliesToLayer(combo, layerIndex) {
  return combo.layers.length === 0 || combo.layers.includes(layerIndex);
}
