import { findBlock } from "./combos.js";

const DISPLAY_NAME_RE = /display-name\s*=\s*"([^"]*)"\s*;/;

/** Layer nodes inside `keymap { }`, in file order — for combo UI without USB. */
export function parseKeymapLayerNames(keymapText) {
  const block = findBlock(keymapText, "keymap");
  if (!block) return [];

  const layers = [];
  const header = /(^|\n)([ \t]*)([A-Za-z_][\w-]*)\s*\{/g;
  let match;
  while ((match = header.exec(block.body)) !== null) {
    const name = match[3];
    if (name === "compatible") continue;
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < block.body.length; i++) {
      if (block.body[i] === "{") depth++;
      else if (block.body[i] === "}") {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) continue;
    const body = block.body.slice(open + 1, close);
    const display = DISPLAY_NAME_RE.exec(body)?.[1]?.trim();
    layers.push({ nodeName: name, name: display || name });
  }
  return layers;
}

/** Space-separated key position indices (0–47), duplicates removed in order. */
export function parseKeyPositions(text) {
  const seen = new Set();
  const out = [];
  for (const part of text.trim().split(/\s+/).filter(Boolean)) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 47) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
