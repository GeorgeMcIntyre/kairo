import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CIRCLE_SEGMENTS = 32;
const ARC_SEGMENTS = 24;
const DEFAULT_RIBBON_WIDTH_MM = 18;
const MAX_TEXT_CHARS = 24;
const LONG_TEXT_WORD_LIMIT = 8;
const LONG_TEXT_CHAR_LIMIT = 72;
const TEXT_MIN_CAP_HEIGHT_SOURCE = 12;
const TEXT_MAX_CAP_HEIGHT_SOURCE = 150;
const TEXT_Z_LIFT_SOURCE = 3;
const TEXT_MIN_STROKE_WIDTH_SOURCE = 0.6;
const TEXT_MAX_STROKE_WIDTH_SOURCE = 3.2;

const STROKE_FONT = {
  "0": { w: 1, s: [[0.15, 0, 0.85, 0], [0.85, 0, 0.85, 1], [0.85, 1, 0.15, 1], [0.15, 1, 0.15, 0], [0.25, 0.15, 0.75, 0.85]] },
  "1": { w: 0.7, s: [[0.35, 0, 0.35, 1], [0.18, 0.82, 0.35, 1], [0.18, 0, 0.55, 0]] },
  "2": { w: 1, s: [[0.15, 0.82, 0.3, 1], [0.3, 1, 0.8, 1], [0.8, 1, 0.9, 0.82], [0.9, 0.82, 0.15, 0], [0.15, 0, 0.9, 0]] },
  "3": { w: 1, s: [[0.15, 1, 0.85, 1], [0.85, 1, 0.55, 0.5], [0.55, 0.5, 0.85, 0], [0.85, 0, 0.15, 0], [0.35, 0.5, 0.65, 0.5]] },
  "4": { w: 1, s: [[0.8, 0, 0.8, 1], [0.15, 0.42, 0.9, 0.42], [0.15, 0.42, 0.75, 1]] },
  "5": { w: 1, s: [[0.85, 1, 0.15, 1], [0.15, 1, 0.15, 0.55], [0.15, 0.55, 0.78, 0.55], [0.78, 0.55, 0.9, 0.35], [0.9, 0.35, 0.75, 0], [0.75, 0, 0.15, 0]] },
  "6": { w: 1, s: [[0.85, 0.9, 0.65, 1], [0.65, 1, 0.2, 0.55], [0.2, 0.55, 0.2, 0.15], [0.2, 0.15, 0.35, 0], [0.35, 0, 0.75, 0], [0.75, 0, 0.9, 0.15], [0.9, 0.15, 0.75, 0.45], [0.75, 0.45, 0.2, 0.45]] },
  "7": { w: 1, s: [[0.12, 1, 0.9, 1], [0.9, 1, 0.35, 0], [0.35, 0.55, 0.72, 0.55]] },
  "8": { w: 1, s: [[0.3, 0, 0.75, 0], [0.75, 0, 0.9, 0.18], [0.9, 0.18, 0.65, 0.5], [0.65, 0.5, 0.9, 0.82], [0.9, 0.82, 0.75, 1], [0.75, 1, 0.3, 1], [0.3, 1, 0.12, 0.82], [0.12, 0.82, 0.35, 0.5], [0.35, 0.5, 0.12, 0.18], [0.12, 0.18, 0.3, 0], [0.35, 0.5, 0.65, 0.5]] },
  "9": { w: 1, s: [[0.15, 0.1, 0.35, 0], [0.35, 0, 0.8, 0.45], [0.8, 0.45, 0.8, 0.85], [0.8, 0.85, 0.65, 1], [0.65, 1, 0.25, 1], [0.25, 1, 0.1, 0.85], [0.1, 0.85, 0.25, 0.55], [0.25, 0.55, 0.8, 0.55]] },
  A: { w: 1, s: [[0.1, 0, 0.5, 1], [0.5, 1, 0.9, 0], [0.25, 0.45, 0.75, 0.45]] },
  B: { w: 1, s: [[0.15, 0, 0.15, 1], [0.15, 1, 0.7, 1], [0.7, 1, 0.85, 0.85], [0.85, 0.85, 0.7, 0.55], [0.7, 0.55, 0.15, 0.55], [0.7, 0.55, 0.88, 0.35], [0.88, 0.35, 0.72, 0], [0.72, 0, 0.15, 0]] },
  C: { w: 1, s: [[0.85, 0.85, 0.7, 1], [0.7, 1, 0.25, 1], [0.25, 1, 0.1, 0.82], [0.1, 0.82, 0.1, 0.18], [0.1, 0.18, 0.25, 0], [0.25, 0, 0.72, 0], [0.72, 0, 0.88, 0.16]] },
  D: { w: 1, s: [[0.15, 0, 0.15, 1], [0.15, 1, 0.65, 1], [0.65, 1, 0.9, 0.75], [0.9, 0.75, 0.9, 0.25], [0.9, 0.25, 0.65, 0], [0.65, 0, 0.15, 0]] },
  E: { w: 0.9, s: [[0.8, 1, 0.15, 1], [0.15, 1, 0.15, 0], [0.15, 0, 0.85, 0], [0.15, 0.52, 0.7, 0.52]] },
  F: { w: 0.9, s: [[0.15, 0, 0.15, 1], [0.15, 1, 0.85, 1], [0.15, 0.52, 0.72, 0.52]] },
  G: { w: 1, s: [[0.85, 0.85, 0.7, 1], [0.7, 1, 0.25, 1], [0.25, 1, 0.1, 0.82], [0.1, 0.82, 0.1, 0.18], [0.1, 0.18, 0.25, 0], [0.25, 0, 0.78, 0], [0.78, 0, 0.9, 0.18], [0.9, 0.18, 0.9, 0.45], [0.9, 0.45, 0.55, 0.45]] },
  H: { w: 1, s: [[0.15, 0, 0.15, 1], [0.85, 0, 0.85, 1], [0.15, 0.5, 0.85, 0.5]] },
  I: { w: 0.55, s: [[0.12, 1, 0.43, 1], [0.275, 1, 0.275, 0], [0.12, 0, 0.43, 0]] },
  J: { w: 0.8, s: [[0.65, 1, 0.65, 0.18], [0.65, 0.18, 0.48, 0], [0.48, 0, 0.18, 0], [0.18, 0, 0.08, 0.16]] },
  K: { w: 1, s: [[0.15, 0, 0.15, 1], [0.85, 1, 0.15, 0.45], [0.15, 0.45, 0.9, 0]] },
  L: { w: 0.85, s: [[0.15, 1, 0.15, 0], [0.15, 0, 0.8, 0]] },
  M: { w: 1.2, s: [[0.12, 0, 0.12, 1], [0.12, 1, 0.6, 0.45], [0.6, 0.45, 1.08, 1], [1.08, 1, 1.08, 0]] },
  N: { w: 1, s: [[0.12, 0, 0.12, 1], [0.12, 1, 0.88, 0], [0.88, 0, 0.88, 1]] },
  O: { w: 1, s: [[0.3, 0, 0.72, 0], [0.72, 0, 0.9, 0.2], [0.9, 0.2, 0.9, 0.8], [0.9, 0.8, 0.72, 1], [0.72, 1, 0.3, 1], [0.3, 1, 0.1, 0.8], [0.1, 0.8, 0.1, 0.2], [0.1, 0.2, 0.3, 0]] },
  P: { w: 1, s: [[0.15, 0, 0.15, 1], [0.15, 1, 0.72, 1], [0.72, 1, 0.88, 0.82], [0.88, 0.82, 0.72, 0.58], [0.72, 0.58, 0.15, 0.58]] },
  Q: { w: 1, s: [[0.3, 0, 0.72, 0], [0.72, 0, 0.9, 0.2], [0.9, 0.2, 0.9, 0.8], [0.9, 0.8, 0.72, 1], [0.72, 1, 0.3, 1], [0.3, 1, 0.1, 0.8], [0.1, 0.8, 0.1, 0.2], [0.1, 0.2, 0.3, 0], [0.58, 0.28, 0.95, -0.08]] },
  R: { w: 1, s: [[0.15, 0, 0.15, 1], [0.15, 1, 0.72, 1], [0.72, 1, 0.88, 0.82], [0.88, 0.82, 0.72, 0.58], [0.72, 0.58, 0.15, 0.58], [0.45, 0.58, 0.9, 0]] },
  S: { w: 1, s: [[0.85, 0.85, 0.72, 1], [0.72, 1, 0.25, 1], [0.25, 1, 0.1, 0.82], [0.1, 0.82, 0.25, 0.55], [0.25, 0.55, 0.75, 0.45], [0.75, 0.45, 0.9, 0.2], [0.9, 0.2, 0.75, 0], [0.75, 0, 0.22, 0], [0.22, 0, 0.08, 0.12]] },
  T: { w: 1, s: [[0.1, 1, 0.9, 1], [0.5, 1, 0.5, 0]] },
  U: { w: 1, s: [[0.12, 1, 0.12, 0.2], [0.12, 0.2, 0.3, 0], [0.3, 0, 0.7, 0], [0.7, 0, 0.88, 0.2], [0.88, 0.2, 0.88, 1]] },
  V: { w: 1, s: [[0.1, 1, 0.5, 0], [0.5, 0, 0.9, 1]] },
  W: { w: 1.25, s: [[0.08, 1, 0.32, 0], [0.32, 0, 0.62, 0.55], [0.62, 0.55, 0.92, 0], [0.92, 0, 1.17, 1]] },
  X: { w: 1, s: [[0.1, 1, 0.9, 0], [0.9, 1, 0.1, 0]] },
  Y: { w: 1, s: [[0.1, 1, 0.5, 0.52], [0.9, 1, 0.5, 0.52], [0.5, 0.52, 0.5, 0]] },
  Z: { w: 1, s: [[0.12, 1, 0.88, 1], [0.88, 1, 0.12, 0], [0.12, 0, 0.88, 0]] },
  "-": { w: 0.7, s: [[0.1, 0.5, 0.6, 0.5]] },
  "_": { w: 0.8, s: [[0.05, 0, 0.75, 0]] },
  ".": { w: 0.35, s: [[0.16, 0, 0.18, 0.02]] },
  "/": { w: 0.8, s: [[0.1, 0, 0.72, 1]] },
  "&": { w: 1, s: [[0.8, 0, 0.28, 0.65], [0.28, 0.65, 0.32, 1], [0.32, 1, 0.7, 1], [0.7, 1, 0.72, 0.72], [0.72, 0.72, 0.18, 0.18], [0.18, 0.18, 0.32, 0], [0.32, 0, 0.9, 0.55]] },
  " ": { w: 0.55, s: [] }
};

const FONT_5X7 = {
  "0": ["11111", "10001", "10011", "10101", "11001", "10001", "11111"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

function usage() {
  console.error(
    "Usage: node tools/export-scene-cadex-glb.mjs <scene-dir> <output-base> [--ribbon-width-mm N] [--scale N] [--scale-to-meters]"
  );
}

function parseArgs(argv) {
  const [sceneDir, outputBase, ...rest] = argv;
  let ribbonWidth = DEFAULT_RIBBON_WIDTH_MM;
  let coordinateScale = 1;
  let outputUnits = "source";
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--ribbon-width-mm") {
      ribbonWidth = Number(rest[index + 1]);
      index += 1;
    } else if (rest[index] === "--scale") {
      coordinateScale = Number(rest[index + 1]);
      outputUnits = `source*${coordinateScale}`;
      index += 1;
    } else if (rest[index] === "--scale-to-meters") {
      coordinateScale = 0.001;
      outputUnits = "meter";
    }
  }
  return { sceneDir, outputBase, ribbonWidth, coordinateScale, outputUnits };
}

function colorTuple(color, fallback = [0.22, 0.55, 0.9]) {
  if (!color) return fallback;
  return [color.r ?? fallback[0], color.g ?? fallback[1], color.b ?? fallback[2]];
}

function readableCadColor(layerName, color) {
  const normalized = layerName.toUpperCase();
  const source = colorTuple(color, [0.42, 0.42, 0.42]);
  const max = Math.max(...source);
  const min = Math.min(...source);
  const isWhiteOrVeryLight = min > 0.82;
  const isBlackOrVeryDark = max < 0.12;
  if (normalized.includes("TEXT") || normalized.includes("ANNO") || normalized.includes("TTL")) return [0.72, 0.48, 0.04];
  if (isWhiteOrVeryLight) return [0.42, 0.42, 0.42];
  if (isBlackOrVeryDark) return [0.18, 0.18, 0.18];
  return source;
}

function materialKey(layerId, layerName, color) {
  const rounded = color.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("");
  return `${layerId}:${layerName}:${rounded}`;
}

function pointsForCircle(entity) {
  const points = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i += 1) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push([
      entity.center[0] + Math.cos(angle) * entity.radius,
      entity.center[1] + Math.sin(angle) * entity.radius,
      entity.center[2]
    ]);
  }
  return points;
}

function pointsForArc(entity) {
  const points = [];
  const start = (entity.startAngleDeg * Math.PI) / 180;
  const end = (entity.endAngleDeg * Math.PI) / 180;
  for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
    const angle = start + ((end - start) * i) / ARC_SEGMENTS;
    points.push([
      entity.center[0] + Math.cos(angle) * entity.radius,
      entity.center[1] + Math.sin(angle) * entity.radius,
      entity.center[2]
    ]);
  }
  return points;
}

function pointsForEntity(entity) {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "polyline") return entity.closed ? [...entity.points, entity.points[0]] : entity.points;
  if (entity.type === "circle") return pointsForCircle(entity);
  if (entity.type === "arc") return pointsForArc(entity);
  return [];
}

function scalePoint(point, scale) {
  return [point[0] * scale, point[1] * scale, point[2] * scale];
}

function scaleEntityForExport(entity, scale) {
  if (scale === 1) return entity;
  return {
    ...entity,
    position: entity.position ? scalePoint(entity.position, scale) : entity.position,
    height: entity.height ? entity.height * scale : entity.height
  };
}

function sourceBaseName(sourcePath) {
  return sourcePath ? path.basename(String(sourcePath)) : undefined;
}

function normalizeText(text) {
  return String(text ?? "").replace(/\\P/gi, " ").replace(/\s+/g, " ").trim();
}

function exportTextLabel(text) {
  const normalized = normalizeText(text).toUpperCase();
  const stationHeader = normalized.match(/\b([A-Z0-9]+-\d{3}[LR])\b\s+(LOAD|GEO|RESPOT|SPAC|RACK)/);
  if (stationHeader) return stationHeader[1];
  const strongTag = normalized.match(/\b[A-Z0-9]+-\d{3}[LR](?:-[A-Z0-9]+)?\b/);
  if (strongTag) return strongTag[0];
  return normalized.slice(0, MAX_TEXT_CHARS);
}

function shouldExportMainText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const upper = normalized.toUpperCase();
  const wordCount = upper.split(/\s+/).filter(Boolean).length;
  const hasStationOrDeviceTag = /\b[A-Z0-9]+-\d{3}[LR](?:-[A-Z0-9]+)?\b/.test(upper);
  const hasUsefulKeyword = /\b(ROBOT|PDP|PANEL|DROP|RIVET|RESPOT|GEO|SPAC|LOAD|RACK|NEST|DUNNAGE|BASE|PLATE|LIFT|TILT|NUT|WELD)\b/.test(upper);
  if (hasStationOrDeviceTag) return true;
  if (upper.length > LONG_TEXT_CHAR_LIMIT || wordCount > LONG_TEXT_WORD_LIMIT) return false;
  return hasUsefulKeyword;
}

function groupFor(map, key, init) {
  const existing = map.get(key);
  if (existing) return existing;
  const next = init();
  map.set(key, next);
  return next;
}

function addLinePositions(group, start, end) {
  group.positions.push(start[0], start[1], start[2], end[0], end[1], end[2]);
}

function addRibbon(group, start, end, width) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return false;
  const halfWidth = width / 2;
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  const z = ((start[2] ?? 0) + (end[2] ?? 0)) / 2;
  const base = group.positions.length / 3;
  group.positions.push(
    start[0] + nx, start[1] + ny, z,
    start[0] - nx, start[1] - ny, z,
    end[0] - nx, end[1] - ny, z,
    end[0] + nx, end[1] + ny, z
  );
  group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return true;
}

function addTextPixelQuad(group, origin, cos, sin, x, y, size, z) {
  const corners = [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size]
  ].map(([localX, localY]) => [
    origin[0] + localX * cos - localY * sin,
    origin[1] + localX * sin + localY * cos,
    z
  ]);
  const base = group.positions.length / 3;
  for (const corner of corners) group.positions.push(corner[0], corner[1], corner[2]);
  group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function transformTextPoint(origin, cos, sin, x, y, z) {
  return [
    origin[0] + x * cos - y * sin,
    origin[1] + x * sin + y * cos,
    z
  ];
}

function addTextStrokeLine(lineGroup, meshGroup, origin, cos, sin, x1, y1, x2, y2, z, width) {
  const start = transformTextPoint(origin, cos, sin, x1, y1, z);
  const end = transformTextPoint(origin, cos, sin, x2, y2, z);
  if (lineGroup) addLinePositions(lineGroup, start, end);
  if (meshGroup) addRibbon(meshGroup, start, end, width);
}

function addGlyphStrokeRuns(lineGroup, meshGroup, glyph, origin, cos, sin, offsetX, pixel, z, width) {
  let strokeCount = 0;

  for (let row = 0; row < glyph.length; row += 1) {
    let startCol = -1;
    for (let col = 0; col <= glyph[row].length; col += 1) {
      const filled = col < glyph[row].length && glyph[row][col] === "1";
      if (filled && startCol < 0) startCol = col;
      if ((!filled || col === glyph[row].length) && startCol >= 0) {
        const y = (6 - row + 0.5) * pixel;
        addTextStrokeLine(
          lineGroup,
          meshGroup,
          origin,
          cos,
          sin,
          offsetX + startCol * pixel,
          y,
          offsetX + col * pixel,
          y,
          z,
          width
        );
        strokeCount += 1;
        startCol = -1;
      }
    }
  }

  for (let col = 0; col < 5; col += 1) {
    let startRow = -1;
    for (let row = 0; row <= glyph.length; row += 1) {
      const filled = row < glyph.length && glyph[row][col] === "1";
      if (filled && startRow < 0) startRow = row;
      if ((!filled || row === glyph.length) && startRow >= 0) {
        const x = offsetX + (col + 0.5) * pixel;
        addTextStrokeLine(
          lineGroup,
          meshGroup,
          origin,
          cos,
          sin,
          x,
          (6 - startRow + 1) * pixel,
          x,
          (6 - row + 1) * pixel,
          z,
          width
        );
        strokeCount += 1;
        startRow = -1;
      }
    }
  }

  return strokeCount;
}

function addTextStrokes(lineGroup, meshGroup, entity, options) {
  const text = exportTextLabel(entity.text);
  if (!text) {
    return { strokeCount: 0 };
  }

  const scale = options.coordinateScale;
  const minCapHeight = TEXT_MIN_CAP_HEIGHT_SOURCE * scale;
  const maxCapHeight = TEXT_MAX_CAP_HEIGHT_SOURCE * scale;
  const capHeight = Math.max(minCapHeight, Math.min(entity.height * 0.42, maxCapHeight));
  const widthFactor = 0.62;
  const spacing = capHeight * 0.22;
  const rotation = ((entity.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const origin = entity.position;
  const z = (origin[2] ?? 0) + TEXT_Z_LIFT_SOURCE * scale;
  const width = Math.max(TEXT_MIN_STROKE_WIDTH_SOURCE * scale, Math.min(capHeight * 0.035, TEXT_MAX_STROKE_WIDTH_SOURCE * scale));
  let count = 0;
  let cursor = 0;

  for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
    const glyph = STROKE_FONT[text[charIndex]] ?? STROKE_FONT[" "];
    for (const stroke of glyph.s) {
      addTextStrokeLine(
        lineGroup,
        meshGroup,
        origin,
        cos,
        sin,
        cursor + stroke[0] * capHeight * widthFactor,
        stroke[1] * capHeight,
        cursor + stroke[2] * capHeight * widthFactor,
        stroke[3] * capHeight,
        z,
        width
      );
      count += 1;
    }
    cursor += glyph.w * capHeight * widthFactor + spacing;
  }

  return {
    strokeCount: count,
    label: text,
    sourceHeight: options.sourceHeight,
    exportedTextHeight: entity.height,
    capHeight,
    zLift: TEXT_Z_LIFT_SOURCE * scale,
    z,
    sourceRef: entity.sourceRef,
    layerId: entity.layerId
  };
}

function padBuffer(buffer, padByte) {
  const paddedLength = Math.ceil(buffer.length / 4) * 4;
  if (paddedLength === buffer.length) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(paddedLength - buffer.length, padByte)]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function boundsOf(positions) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

function emptyBounds() {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
}

function includePoint(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis] ?? 0;
    if (value < bounds.min[axis]) bounds.min[axis] = value;
    if (value > bounds.max[axis]) bounds.max[axis] = value;
  }
}

function finiteBounds(bounds) {
  if (!Number.isFinite(bounds.min[0])) {
    return undefined;
  }
  return {
    min: bounds.min.map((value) => Number(value.toFixed(6))),
    max: bounds.max.map((value) => Number(value.toFixed(6)))
  };
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedObjectFromMap(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

async function loadScene(sceneDir) {
  const [manifest, layers, sourceMap, importReport] = await Promise.all([
    readFile(path.join(sceneDir, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(sceneDir, "layers.json"), "utf8").then(JSON.parse),
    readFile(path.join(sceneDir, "source-map.json"), "utf8")
      .then(JSON.parse)
      .catch(() => ({ sources: [] })),
    readFile(path.join(sceneDir, "import-report.json"), "utf8")
      .then(JSON.parse)
      .catch(() => ({ warnings: [] }))
  ]);
  const geometryDir = path.join(sceneDir, "geometry");
  const geometryFiles = (await readdir(geometryDir))
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  return { manifest, layers, sourceMap, importReport, geometryDir, geometryFiles };
}

function makeMaterials(materials) {
  return materials.map((material) => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...material.color, 1],
      metallicFactor: 0,
      roughnessFactor: 0.9
    },
    doubleSided: true,
    extras: {
      layerId: material.layerId,
      layerName: material.layerName
    }
  }));
}

function addBufferView(buffers, accessors, typedBuffer, target, accessor) {
  const byteOffset = buffers.reduce((sum, entry) => sum + entry.length, 0);
  buffers.push(typedBuffer);
  const bufferViewIndex = accessors.bufferViews.length;
  accessors.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: typedBuffer.byteLength,
    target
  });
  const accessorIndex = accessors.items.length;
  accessors.items.push({ bufferView: bufferViewIndex, byteOffset: 0, ...accessor });
  return accessorIndex;
}

async function writeGlb(outputPath, primitiveMode, groups, materials, extras) {
  const buffers = [];
  const accessors = { bufferViews: [], items: [] };
  const primitives = [];

  for (const group of groups) {
    if (group.positions.length === 0) continue;
    const positions = Buffer.from(new Float32Array(group.positions).buffer);
    const positionBounds = boundsOf(group.positions);
    const positionAccessor = addBufferView(buffers, accessors, positions, 34962, {
      componentType: 5126,
      count: group.positions.length / 3,
      type: "VEC3",
      min: positionBounds.min,
      max: positionBounds.max
    });

    const primitive = {
      attributes: { POSITION: positionAccessor },
      mode: primitiveMode,
      material: group.materialIndex,
      extras: {
        layerId: group.layerId,
        layerName: group.layerName,
        vertexCount: group.positions.length / 3
      }
    };

    if (group.indices?.length > 0) {
      const indices = Buffer.from(new Uint32Array(group.indices).buffer);
      primitive.indices = addBufferView(buffers, accessors, indices, 34963, {
        componentType: 5125,
        count: group.indices.length,
        type: "SCALAR",
        min: [0],
        max: [group.positions.length / 3 - 1]
      });
      primitive.extras.triangleCount = group.indices.length / 3;
    }

    primitives.push(primitive);
  }

  const binary = Buffer.concat(buffers);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kairo CAD Exchanger GLB probe",
      extras: {
        sourceUnits: extras.units,
        sourcePath: extras.source
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: path.basename(outputPath, ".glb") }],
    meshes: [{ name: extras.meshName, primitives }],
    materials: makeMaterials(materials),
    accessors: accessors.items,
    bufferViews: accessors.bufferViews,
    buffers: [{ byteLength: binary.byteLength }],
    extras
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const binChunk = padBuffer(binary, 0x00);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.concat([Buffer.from("glTF"), u32(2), u32(totalLength)]);
  const jsonHeader = Buffer.concat([u32(jsonChunk.length), Buffer.from("JSON")]);
  const binHeader = Buffer.concat([u32(binChunk.length), Buffer.from("BIN\0")]);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

function sourceEntityCounts(sourceMap) {
  const counts = new Map();
  for (const source of sourceMap.sources ?? []) {
    if (source.entityType && source.entityType !== "FILE") {
      increment(counts, source.entityType);
    }
  }
  return sortedObjectFromMap(counts);
}

function importWarningCounts(importReport) {
  const counts = new Map();
  for (const warning of importReport.warnings ?? []) {
    increment(counts, warning.code ?? "UNKNOWN");
  }
  return sortedObjectFromMap(counts);
}

function reportMarkdown(report) {
  const cell = (value) => String(value).replace(/\|/g, "\\|");
  const lines = [
    "# CAD Exchanger GLB Conversion Report",
    "",
    `Source: ${report.sourceFile ?? "unknown"}`,
    `Units: ${report.sourceUnits} -> ${report.outputUnits}`,
    `Coordinate scale: ${report.coordinateScale}`,
    "",
    "## Entity Counts",
    "",
    `- Source-map entities: ${JSON.stringify(report.entityCounts.sourceMap)}`,
    `- Scene entities: ${JSON.stringify(report.entityCounts.scene)}`,
    `- Exported entities: ${JSON.stringify(report.entityCounts.exported)}`,
    "",
    "## Text",
    "",
    `- Text entities in scene: ${report.text.textEntities}`,
    `- Exported text entities: ${report.text.exportedTextEntities}`,
    `- Skipped text entities: ${report.text.skippedTextEntities}`,
    `- Text Z lift: ${report.text.textZLift}`,
    `- Suspicious source text heights: ${report.text.suspiciousLargeTextHeights.length}`,
    "",
    "## Risks",
    "",
    ...report.risks.map((risk) => `- ${risk}`),
    "",
    "## Import Warnings",
    "",
    `- Warning counts: ${JSON.stringify(report.importWarnings.warningCounts)}`,
    `- Warning details: ${report.importWarnings.warnings.length}`,
    "",
    "## Layers",
    "",
    "| Layer | Entities | Bounds |",
    "| --- | ---: | --- |",
    ...report.layers.map((layer) => `| ${cell(layer.name)} | ${layer.entityCount} | ${layer.bounds ? JSON.stringify(layer.bounds) : "n/a"} |`)
  ];
  return `${lines.join("\n")}\n`;
}

function buildReport(stats, scene, sceneEntityCounts, sourceCounts, layerReports, textMetrics, outputPaths) {
  const suspiciousLargeTextHeights = textMetrics
    .filter((entry) => entry.sourceHeight >= 300)
    .map((entry) => ({
      label: entry.label,
      sourceHeight: Number(entry.sourceHeight.toFixed(6)),
      exportedTextHeight: Number(entry.exportedTextHeight.toFixed(6)),
      capHeight: Number(entry.capHeight.toFixed(6)),
      z: Number(entry.z.toFixed(6)),
      sourceRef: entry.sourceRef,
      layerId: entry.layerId
    }))
    .sort((a, b) => `${b.sourceHeight}:${a.label}:${a.sourceRef}`.localeCompare(`${a.sourceHeight}:${b.label}:${b.sourceRef}`));

  const risks = [];
  if (stats.skippedTextEntities > 0) {
    risks.push(`${stats.skippedTextEntities} scene text entities were intentionally filtered from key-text GLB outputs.`);
  }
  if (suspiciousLargeTextHeights.length > 0) {
    risks.push(`${suspiciousLargeTextHeights.length} source text entities are >= 300 source units and should be visually checked.`);
  }
  if (stats.coordinateScale !== 1) {
    risks.push("GLB coordinates are scaled from source units; text styling constants are scaled by the same coordinate scale.");
  }
  if ((scene.importReport.warnings ?? []).length > 0) {
    risks.push(`${scene.importReport.warnings.length} DXF import warnings are included in importWarnings for skipped or approximated source geometry.`);
  } else {
    risks.push("No import-report.json was found beside the scene; source DXF skipped/unsupported entities may be incomplete in this report.");
  }

  return {
    format: "kairo-cadex-glb-report",
    version: 1,
    sourceFile: sourceBaseName(scene.manifest.source?.path),
    sourceUnits: stats.sourceUnits,
    outputUnits: stats.outputUnits,
    coordinateScale: stats.coordinateScale,
    entityCounts: {
      sourceMap: sourceCounts,
      scene: sortedObjectFromMap(sceneEntityCounts),
      exported: {
        curveEntities: stats.curveEntities,
        lineSegments: stats.lineSegments,
        textEntities: stats.exportedTextEntities,
        textStrokeSegments: stats.textStrokeSegments
      }
    },
    text: {
      textEntities: stats.textEntities,
      exportedTextEntities: stats.exportedTextEntities,
      skippedTextEntities: stats.skippedTextEntities,
      textZLift: Number((TEXT_Z_LIFT_SOURCE * stats.coordinateScale).toFixed(6)),
      suspiciousLargeTextHeights
    },
    importWarnings: {
      warningCounts: importWarningCounts(scene.importReport),
      warnings: (scene.importReport.warnings ?? []).map((warning) => ({
        code: warning.code,
        entityType: warning.entityType,
        handle: warning.handle,
        message: warning.message
      }))
    },
    layers: [...layerReports.values()]
      .map((layer) => ({
        id: layer.id,
        name: layer.name,
        entityCount: layer.entityCount,
        bounds: finiteBounds(layer.bounds)
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    outputs: Object.fromEntries(Object.entries(outputPaths).map(([key, value]) => [key, path.basename(value)])),
    risks
  };
}

async function main() {
  const { sceneDir, outputBase, ribbonWidth, coordinateScale, outputUnits } = parseArgs(process.argv.slice(2));
  if (
    !sceneDir ||
    !outputBase ||
    !Number.isFinite(ribbonWidth) ||
    ribbonWidth <= 0 ||
    !Number.isFinite(coordinateScale) ||
    coordinateScale <= 0
  ) {
    usage();
    process.exitCode = 2;
    return;
  }

  const scene = await loadScene(path.resolve(sceneDir));
  const layerById = new Map(scene.layers.layers.map((layer) => [layer.id, layer]));
  const materials = [];
  const materialIndexByKey = new Map();

  function resolveMaterial(layerId) {
    const layer = layerById.get(layerId) ?? { id: layerId ?? "unknown", name: layerId ?? "Unknown" };
    const color = readableCadColor(layer.name, layer.color);
    const key = materialKey(layer.id, layer.name, color);
    if (materialIndexByKey.has(key)) return materialIndexByKey.get(key);
    const index = materials.length;
    materialIndexByKey.set(key, index);
    materials.push({ name: layer.name, layerId: layer.id, layerName: layer.name, color });
    return index;
  }

  const lineGroups = new Map();
  const meshGroups = new Map();
  const textMaterialIndex = materials.push({
    name: "Kairo text labels",
    layerId: "kairo-text",
    layerName: "Kairo text labels",
    color: [0.08, 0.08, 0.08]
  }) - 1;
  const textLineGroup = {
    materialIndex: textMaterialIndex,
    layerId: "kairo-text",
    layerName: "Kairo text labels",
    positions: []
  };
  const textRibbonGroup = {
    materialIndex: textMaterialIndex,
    layerId: "kairo-text",
    layerName: "Kairo text labels",
    positions: [],
    indices: []
  };
  const stats = {
    source: sourceBaseName(scene.manifest.source?.path),
    units: scene.manifest.units,
    geometryDocuments: scene.geometryFiles.length,
    curveSets: 0,
    curveEntities: 0,
    textEntities: 0,
    exportedTextEntities: 0,
    skippedTextEntities: 0,
    textStrokeSegments: 0,
    lineSegments: 0,
    ribbonWidthMm: ribbonWidth,
    exportedRibbonWidth: ribbonWidth * coordinateScale,
    coordinateScale,
    sourceUnits: scene.manifest.units,
    outputUnits,
    materialCount: 0
  };
  const sceneEntityCounts = new Map();
  const sourceCounts = sourceEntityCounts(scene.sourceMap);
  const layerReports = new Map(
    scene.layers.layers.map((layer) => [
      layer.id,
      {
        id: layer.id,
        name: layer.name,
        entityCount: 0,
        bounds: emptyBounds()
      }
    ])
  );
  const textMetrics = [];

  for (const fileName of scene.geometryFiles) {
    const document = JSON.parse(await readFile(path.join(scene.geometryDir, fileName), "utf8"));
    for (const geometry of document.geometries ?? []) {
      if (geometry.kind !== "curve-set") continue;
      stats.curveSets += 1;
      const fallbackLayerId = geometry.layerId;
      for (const entity of geometry.entities ?? []) {
        const layerId = entity.layerId ?? fallbackLayerId ?? "unknown";
        increment(sceneEntityCounts, entity.type);
        const layerReport = groupFor(layerReports, layerId, () => ({
          id: layerId,
          name: layerById.get(layerId)?.name ?? layerId,
          entityCount: 0,
          bounds: emptyBounds()
        }));
        layerReport.entityCount += 1;
        if (entity.type === "text") {
          stats.textEntities += 1;
          if (entity.position) {
            includePoint(layerReport.bounds, scalePoint(entity.position, coordinateScale));
          }
          if (shouldExportMainText(entity.text)) {
            const textResult = addTextStrokes(textLineGroup, textRibbonGroup, scaleEntityForExport(entity, coordinateScale), {
              coordinateScale,
              sourceHeight: entity.height ?? 0
            });
            if (textResult.strokeCount > 0) {
              stats.exportedTextEntities += 1;
              stats.textStrokeSegments += textResult.strokeCount;
              textMetrics.push(textResult);
            }
          } else {
            stats.skippedTextEntities += 1;
          }
          continue;
        }

        const points = pointsForEntity(entity).map((point) => scalePoint(point, coordinateScale));
        if (points.length < 2) continue;
        for (const point of points) {
          includePoint(layerReport.bounds, point);
        }
        stats.curveEntities += 1;
        const materialIndex = resolveMaterial(layerId);
        const layer = layerById.get(layerId) ?? { id: layerId, name: layerId };
        const key = `${materialIndex}:${layerId}`;
        const lineGroup = groupFor(lineGroups, key, () => ({
          materialIndex,
          layerId,
          layerName: layer.name,
          positions: []
        }));
        const meshGroup = groupFor(meshGroups, key, () => ({
          materialIndex,
          layerId,
          layerName: layer.name,
          positions: [],
          indices: []
        }));

        for (let index = 0; index < points.length - 1; index += 1) {
          addLinePositions(lineGroup, points[index], points[index + 1]);
          if (addRibbon(meshGroup, points[index], points[index + 1], ribbonWidth * coordinateScale)) {
            stats.lineSegments += 1;
          }
        }
      }
    }
  }

  const outputRoot = path.resolve(outputBase);
  const linesPath = `${outputRoot}.materials.lines.glb`;
  const linesTextPath = `${outputRoot}.pro.lines-keytext.glb`;
  const meshPath = `${outputRoot}.pro.ribbons-keytext.glb`;
  stats.materialCount = materials.length;

  await writeGlb(linesPath, 1, Array.from(lineGroups.values()), materials, {
    ...stats,
    meshName: "DXF material-colored line primitives",
    primitiveMode: "LINES",
    textIncluded: false
  });

  await writeGlb(linesTextPath, 1, [...Array.from(lineGroups.values()), textLineGroup], materials, {
    ...stats,
    meshName: "DXF material-colored line primitives with key stroke text",
    primitiveMode: "LINES",
    textIncluded: true,
    textStyle: "filtered stroke text"
  });

  await writeGlb(meshPath, 4, [...Array.from(meshGroups.values()), textRibbonGroup], materials, {
    ...stats,
    meshName: "DXF ribbon mesh with key stroke text",
    primitiveMode: "TRIANGLES",
    textIncluded: true,
    textStyle: "filtered ribbon stroke text"
  });

  await writeFile(
    `${outputRoot}.cadex-summary.json`,
    `${JSON.stringify({ ...stats, outputs: { linesPath, linesTextPath, meshPath } }, null, 2)}\n`
  );
  const report = buildReport(stats, scene, sceneEntityCounts, sourceCounts, layerReports, textMetrics, {
    linesPath,
    linesTextPath,
    meshPath
  });
  await writeFile(`${outputRoot}.cadex-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(`${outputRoot}.cadex-report.md`, reportMarkdown(report));
  console.log(`Wrote ${linesPath}`);
  console.log(`Wrote ${linesTextPath}`);
  console.log(`Wrote ${meshPath}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
