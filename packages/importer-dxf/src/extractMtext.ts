// Standalone DXF MTEXT scanner.
//
// The @dxfjs/parser library does not surface MTEXT entities (verified: 0
// references to "mtext" in its compiled JS). MTEXT carries the largest
// title-block headers in real-world layouts (e.g. "7B-070L RACK LOAD" at
// 457.2 mm), so dropping them silently leaves fit-scene with no readable
// labels. This module reads the pre-cleaned DXF text and emits the records
// the importer needs.
//
// Scope (intentionally minimal): direct ENTITIES section MTEXT only. MTEXT
// inside BLOCK definitions is not extracted in this pass — the missing
// headers proven by grep are direct entities. Adding block-resident MTEXT
// expansion later would mirror the existing block expansion paths.

export type RawMtextRecord = {
  handle?: string;
  layerName?: string;
  text: string; // already stripped of MTEXT formatting codes
  insertion: [number, number, number];
  height: number; // group 40, world units
  rotationDeg: number; // group 50 (degrees)
  attachmentPoint?: number; // group 71 (1..9)
};

const SECTION_MARKER = "SECTION";
const ENTITIES_MARKER = "ENTITIES";
const ENDSEC_MARKER = "ENDSEC";
const MTEXT_MARKER = "MTEXT";

const ESC_BACKSLASH = "";
const ESC_OPEN_BRACE = "";
const ESC_CLOSE_BRACE = "";
const ASCII_SPACE = " ";

// Replace MTEXT inline formatting codes with plain text. The codes that matter:
//   \P  → newline (paragraph break)
//   \X  → newline (column break, treated same)
//   \~  → space (DXF spec calls this a non-breaking space; we use ASCII)
//   \\  → literal backslash
//   \{  → literal {
//   \}  → literal }
//   \f \F \C \H \W \Q \T \A \p  → parameterised, end with ';'; strip
//   \L \l \O \o \K \k          → parameterless toggles; strip
//   \S<over>^<under>;          → stacked text; render flat with '/'
//   {...}                       → grouping; strip braces, keep content
//   \U+XXXX                     → unicode codepoint
//   \M+NXXXXXX                  → big-font escape; drop
export function stripMtextFormatting(input: string): string {
  if (!input) return "";

  // Step 1: protect literal \\ \{ \} so later passes don't mangle them.
  let s = input
    .replace(/\\\\/g, ESC_BACKSLASH)
    .replace(/\\\{/g, ESC_OPEN_BRACE)
    .replace(/\\\}/g, ESC_CLOSE_BRACE);

  // Step 2: paragraph/column/tilde to newline/space.
  s = s.replace(/\\P/g, "\n").replace(/\\X/g, "\n").replace(/\\~/g, ASCII_SPACE);

  // Step 3: stacked text \S<over>^<under>; or \S<num>/<den>; — keep glyphs joined.
  s = s.replace(/\\S([^;]*?);/g, (_match, body: string) =>
    body.replace(/[\^#]/g, "/").replace(/\\/g, "")
  );

  // Step 4: strip parameterised codes that end with ';'.
  s = s.replace(/\\[fFCHWQTApc][^;]*;/g, "");

  // Step 5: strip parameterless toggles (no semicolon).
  s = s.replace(/\\[LOKlok]/g, "");

  // Step 6: \U+XXXX unicode escape.
  s = s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_match, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

  // Step 7: \M+NXXXXXX big-font escapes — drop, no useful glyph mapping.
  s = s.replace(/\\M\+[0-9A-Fa-f]+/g, "");

  // Step 8: drop unmatched grouping braces but keep their content.
  s = s.replace(/[{}]/g, "");

  // Step 9: restore protected literals.
  s = s
    .replace(new RegExp(ESC_BACKSLASH, "g"), "\\")
    .replace(new RegExp(ESC_OPEN_BRACE, "g"), "{")
    .replace(new RegExp(ESC_CLOSE_BRACE, "g"), "}");

  return s;
}

// Iterate the DXF as (groupCode, value) pairs. DXF is line-based: each pair is
// two consecutive lines (code line + value line). Group code 0 starts a new
// entity. We only walk the ENTITIES section; BLOCKS are out of scope.
export function extractDirectMtextEntities(rawDxfText: string): RawMtextRecord[] {
  const lines = rawDxfText.split(/\r?\n/);
  const records: RawMtextRecord[] = [];

  let inEntitiesSection = false;
  let i = 0;

  const readPair = (): [number, string] | null => {
    while (i + 1 < lines.length) {
      const codeLine = lines[i].trim();
      const valueLine = lines[i + 1] ?? "";
      i += 2;
      if (codeLine.length === 0) continue;
      const code = Number.parseInt(codeLine, 10);
      if (Number.isNaN(code)) continue;
      return [code, valueLine];
    }
    return null;
  };

  // Walk to ENTITIES section start.
  while (i < lines.length) {
    const pair = readPair();
    if (!pair) break;
    const [code, value] = pair;
    if (code === 0 && value === SECTION_MARKER) {
      const next = readPair();
      if (next && next[0] === 2 && next[1] === ENTITIES_MARKER) {
        inEntitiesSection = true;
        break;
      }
    }
  }

  if (!inEntitiesSection) return records;

  let pending: Partial<RawMtextRecord & { textChunks: string[]; primaryText: string }> | null = null;

  const finalize = () => {
    if (!pending) return;
    const chunks = pending.textChunks ?? [];
    const primary = pending.primaryText ?? "";
    const raw = `${chunks.join("")}${primary}`;
    const stripped = stripMtextFormatting(raw).trim();
    if (stripped.length === 0) {
      pending = null;
      return;
    }
    records.push({
      handle: pending.handle,
      layerName: pending.layerName,
      text: stripped,
      insertion: pending.insertion ?? [0, 0, 0],
      height: pending.height ?? 0,
      rotationDeg: pending.rotationDeg ?? 0,
      attachmentPoint: pending.attachmentPoint
    });
    pending = null;
  };

  while (i < lines.length) {
    const pair = readPair();
    if (!pair) break;
    const [code, value] = pair;

    if (code === 0) {
      finalize();
      if (value === ENDSEC_MARKER) break;
      if (value === MTEXT_MARKER) {
        pending = { textChunks: [], primaryText: "", insertion: [0, 0, 0] };
      }
      continue;
    }

    if (!pending) continue;

    switch (code) {
      case 5:
        pending.handle = value.trim();
        break;
      case 8:
        pending.layerName = value.trim();
        break;
      case 10:
        pending.insertion = [Number.parseFloat(value), pending.insertion?.[1] ?? 0, pending.insertion?.[2] ?? 0];
        break;
      case 20:
        pending.insertion = [pending.insertion?.[0] ?? 0, Number.parseFloat(value), pending.insertion?.[2] ?? 0];
        break;
      case 30:
        pending.insertion = [pending.insertion?.[0] ?? 0, pending.insertion?.[1] ?? 0, Number.parseFloat(value)];
        break;
      case 40:
        pending.height = Number.parseFloat(value);
        break;
      case 50:
        pending.rotationDeg = Number.parseFloat(value);
        break;
      case 71:
        pending.attachmentPoint = Number.parseInt(value.trim(), 10);
        break;
      case 1:
        pending.primaryText = value;
        break;
      case 3:
        pending.textChunks?.push(value);
        break;
      default:
        break;
    }
  }

  // Handle the final entity if the file ends without ENDSEC.
  finalize();

  return records;
}
