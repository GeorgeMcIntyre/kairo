import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { pointsForEntity } from "./curveBatch";

const DEFAULT_RIBBON_WIDTH_SOURCE = 18;
const MAX_TEXT_CHARS = 24;
const LONG_TEXT_WORD_LIMIT = 8;
const LONG_TEXT_CHAR_LIMIT = 72;
const TEXT_MIN_CAP_HEIGHT_SOURCE = 12;
const TEXT_MAX_CAP_HEIGHT_SOURCE = 150;
const TEXT_Z_LIFT_SOURCE = 3;
const TEXT_MIN_STROKE_WIDTH_SOURCE = 0.6;
const TEXT_MAX_STROKE_WIDTH_SOURCE = 3.2;

const UNIT_TO_METER = {
  millimeter: 0.001,
  centimeter: 0.01,
  meter: 1,
  inch: 0.0254,
  foot: 0.3048
} as const;

const FONT_5X7: Record<string, string[]> = {
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

type Vec3 = [number, number, number];

type ExportGroup = {
  materialIndex: number;
  layerId: string;
  layerName: string;
  positions: number[];
  indices: number[];
};

type ExportMaterial = {
  name: string;
  layerId: string;
  layerName: string;
  color: [number, number, number];
};

type TextMetric = {
  label: string;
  sourceHeight: number;
  exportedTextHeight: number;
  capHeight: number;
  z: number;
  sourceRef?: string;
  layerId?: string;
};

type LayerReport = {
  id: string;
  name: string;
  entityCount: number;
  bounds: BoundsAccumulator;
};

type BoundsAccumulator = {
  min: Vec3;
  max: Vec3;
};

export type CadExchangerGlbReport = {
  format: "kairo-cadex-glb-report";
  version: 1;
  sourceFile?: string;
  sourceUnits: ScenePackage["manifest"]["units"];
  outputUnits: "meter";
  coordinateScale: number;
  entityCounts: {
    sourceMap: Record<string, number>;
    scene: Record<string, number>;
    exported: {
      curveEntities: number;
      lineSegments: number;
      textEntities: number;
      textStrokeSegments: number;
    };
  };
  text: {
    textEntities: number;
    exportedTextEntities: number;
    skippedTextEntities: number;
    textZLift: number;
    suspiciousLargeTextHeights: TextMetric[];
  };
  layers: Array<{
    id: string;
    name: string;
    entityCount: number;
    bounds?: {
      min: Vec3;
      max: Vec3;
    };
  }>;
  outputs: {
    meshPath: string;
  };
  risks: string[];
};

export type CadExchangerGlbExport = {
  filename: string;
  bytes: Uint8Array;
  reportFilename: string;
  reportJson: string;
  reportMarkdown: string;
  report: CadExchangerGlbReport;
};

function sourceBaseName(sourcePath?: string) {
  return sourcePath?.split(/[\\/]/).filter(Boolean).at(-1);
}

function withoutExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function colorTuple(color?: { r: number; g: number; b: number }, fallback: [number, number, number] = [0.22, 0.55, 0.9]) {
  if (!color) return fallback;
  return [color.r, color.g, color.b] as [number, number, number];
}

function readableCadColor(layerName: string, color?: { r: number; g: number; b: number }): [number, number, number] {
  const normalized = layerName.toUpperCase();
  const source = colorTuple(color, [0.42, 0.42, 0.42]);
  const max = Math.max(...source);
  const min = Math.min(...source);
  if (normalized.includes("TEXT") || normalized.includes("ANNO") || normalized.includes("TTL")) return [0.72, 0.48, 0.04];
  if (min > 0.82) return [0.42, 0.42, 0.42];
  if (max < 0.12) return [0.18, 0.18, 0.18];
  return source;
}

function materialKey(layerId: string, layerName: string, color: readonly number[]) {
  const rounded = color.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("");
  return `${layerId}:${layerName}:${rounded}`;
}

function normalizeText(text: unknown) {
  return String(text ?? "").replace(/\\P/gi, " ").replace(/\s+/g, " ").trim();
}

function shouldExportMainText(text: unknown) {
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

function exportTextLabel(text: unknown) {
  const normalized = normalizeText(text).toUpperCase();
  const stationHeader = normalized.match(/\b([A-Z0-9]+-\d{3}[LR])\b\s+(LOAD|GEO|RESPOT|SPAC|RACK)/);
  if (stationHeader) return stationHeader[1];
  const strongTag = normalized.match(/\b[A-Z0-9]+-\d{3}[LR](?:-[A-Z0-9]+)?\b/);
  if (strongTag) return strongTag[0];
  return normalized.slice(0, MAX_TEXT_CHARS);
}

function scalePoint(point: readonly number[], scale: number): Vec3 {
  return [(point[0] ?? 0) * scale, (point[1] ?? 0) * scale, (point[2] ?? 0) * scale];
}

function emptyBounds(): BoundsAccumulator {
  return {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
}

function includePoint(bounds: BoundsAccumulator, point: readonly number[]) {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = point[axis] ?? 0;
    if (value < bounds.min[axis]) bounds.min[axis] = value;
    if (value > bounds.max[axis]) bounds.max[axis] = value;
  }
}

function finiteBounds(bounds: BoundsAccumulator) {
  if (!Number.isFinite(bounds.min[0])) return undefined;
  return {
    min: bounds.min.map((value) => Number(value.toFixed(6))) as Vec3,
    max: bounds.max.map((value) => Number(value.toFixed(6))) as Vec3
  };
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortedObjectFromMap(map: Map<string, number>) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function groupFor<K, V>(map: Map<K, V>, key: K, init: () => V) {
  const existing = map.get(key);
  if (existing) return existing;
  const next = init();
  map.set(key, next);
  return next;
}

function addRibbon(group: ExportGroup, start: Vec3, end: Vec3, width: number) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return false;
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

function transformTextPoint(origin: Vec3, cos: number, sin: number, x: number, y: number, z: number): Vec3 {
  return [origin[0] + x * cos - y * sin, origin[1] + x * sin + y * cos, z];
}

function addTextStrokeLine(group: ExportGroup, origin: Vec3, cos: number, sin: number, x1: number, y1: number, x2: number, y2: number, z: number, width: number) {
  return addRibbon(group, transformTextPoint(origin, cos, sin, x1, y1, z), transformTextPoint(origin, cos, sin, x2, y2, z), width);
}

function addGlyphStrokeRuns(group: ExportGroup, glyph: readonly string[], origin: Vec3, cos: number, sin: number, offsetX: number, pixel: number, z: number, width: number) {
  let strokeCount = 0;

  for (let row = 0; row < glyph.length; row += 1) {
    let startCol = -1;
    for (let col = 0; col <= glyph[row].length; col += 1) {
      const filled = col < glyph[row].length && glyph[row][col] === "1";
      if (filled && startCol < 0) startCol = col;
      if ((!filled || col === glyph[row].length) && startCol >= 0) {
        const y = (6 - row + 0.5) * pixel;
        if (addTextStrokeLine(group, origin, cos, sin, offsetX + startCol * pixel, y, offsetX + col * pixel, y, z, width)) {
          strokeCount += 1;
        }
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
        if (addTextStrokeLine(group, origin, cos, sin, x, (6 - startRow + 1) * pixel, x, (6 - row + 1) * pixel, z, width)) {
          strokeCount += 1;
        }
        startRow = -1;
      }
    }
  }

  return strokeCount;
}

function addTextStrokes(group: ExportGroup, entity: Extract<DrawingEntity, { type: "text" }>, coordinateScale: number): TextMetric & { strokeCount: number } {
  const text = exportTextLabel(entity.text);
  const minCapHeight = TEXT_MIN_CAP_HEIGHT_SOURCE * coordinateScale;
  const maxCapHeight = TEXT_MAX_CAP_HEIGHT_SOURCE * coordinateScale;
  const exportedTextHeight = entity.height * coordinateScale;
  const capHeight = Math.max(minCapHeight, Math.min(exportedTextHeight * 0.42, maxCapHeight));
  const pixel = capHeight / 7;
  const spacing = pixel;
  const rotation = ((entity.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const origin = scalePoint(entity.position, coordinateScale);
  const z = (origin[2] ?? 0) + TEXT_Z_LIFT_SOURCE * coordinateScale;
  const width = Math.max(TEXT_MIN_STROKE_WIDTH_SOURCE * coordinateScale, Math.min(capHeight * 0.035, TEXT_MAX_STROKE_WIDTH_SOURCE * coordinateScale));
  let strokeCount = 0;
  let cursor = 0;

  for (const char of text) {
    const glyph = FONT_5X7[char] ?? FONT_5X7[" "];
    strokeCount += addGlyphStrokeRuns(group, glyph, origin, cos, sin, cursor, pixel, z, width);
    cursor += 6 * pixel + spacing;
  }

  return {
    strokeCount,
    label: text,
    sourceHeight: entity.height,
    exportedTextHeight,
    capHeight,
    z,
    sourceRef: entity.sourceRef,
    layerId: entity.layerId
  };
}

function boundsOf(positions: readonly number[]) {
  const bounds = emptyBounds();
  for (let index = 0; index < positions.length; index += 3) {
    includePoint(bounds, [positions[index], positions[index + 1], positions[index + 2]]);
  }
  return finiteBounds(bounds) ?? { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3 };
}

function makeMaterials(materials: readonly ExportMaterial[]) {
  return materials.map((material) => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: [...material.color, 1],
      metallicFactor: 0,
      roughnessFactor: 0.8
    },
    extras: {
      layerId: material.layerId,
      layerName: material.layerName
    }
  }));
}

function padBytes(bytes: Uint8Array, padByte: number) {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  if (paddedLength === bytes.byteLength) return bytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(padByte, bytes.byteLength);
  return padded;
}

function u32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(chunks: readonly Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function float32Bytes(values: readonly number[]) {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint32Bytes(values: readonly number[]) {
  return new Uint8Array(new Uint32Array(values).buffer);
}

function writeGlb(name: string, groups: readonly ExportGroup[], materials: readonly ExportMaterial[], extras: Record<string, unknown>) {
  const buffers: Uint8Array[] = [];
  const bufferViews: unknown[] = [];
  const accessors: unknown[] = [];
  const primitives: unknown[] = [];

  function addBufferView(typedBuffer: Uint8Array, target: number, accessor: Record<string, unknown>) {
    const byteOffset = buffers.reduce((sum, entry) => sum + entry.byteLength, 0);
    buffers.push(typedBuffer);
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: typedBuffer.byteLength, target });
    const accessorIndex = accessors.length;
    accessors.push({ bufferView: bufferViewIndex, byteOffset: 0, ...accessor });
    return accessorIndex;
  }

  for (const group of groups) {
    if (group.positions.length === 0 || group.indices.length === 0) continue;
    const positionBounds = boundsOf(group.positions);
    const positionAccessor = addBufferView(float32Bytes(group.positions), 34962, {
      componentType: 5126,
      count: group.positions.length / 3,
      type: "VEC3",
      min: positionBounds.min,
      max: positionBounds.max
    });
    const indexAccessor = addBufferView(uint32Bytes(group.indices), 34963, {
      componentType: 5125,
      count: group.indices.length,
      type: "SCALAR",
      min: [0],
      max: [group.positions.length / 3 - 1]
    });

    primitives.push({
      attributes: { POSITION: positionAccessor },
      indices: indexAccessor,
      mode: 4,
      material: group.materialIndex,
      extras: {
        layerId: group.layerId,
        layerName: group.layerName,
        vertexCount: group.positions.length / 3,
        triangleCount: group.indices.length / 3
      }
    });
  }

  const binary = concatBytes(buffers);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kairo viewer CAD Exchanger GLB export"
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ name: "DXF ribbon mesh with key stroke text", primitives }],
    materials: makeMaterials(materials),
    accessors,
    bufferViews,
    buffers: [{ byteLength: binary.byteLength }],
    extras
  };

  const jsonChunk = padBytes(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const binChunk = padBytes(binary, 0x00);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  return concatBytes([
    new TextEncoder().encode("glTF"),
    u32(2),
    u32(totalLength),
    u32(jsonChunk.byteLength),
    new TextEncoder().encode("JSON"),
    jsonChunk,
    u32(binChunk.byteLength),
    new Uint8Array([0x42, 0x49, 0x4e, 0x00]),
    binChunk
  ]);
}

function sourceEntityCounts(scenePackage: ScenePackage) {
  const counts = new Map<string, number>();
  for (const source of scenePackage.sourceMap.sources) {
    if (source.entityType && source.entityType !== "FILE") {
      increment(counts, source.entityType);
    }
  }
  return sortedObjectFromMap(counts);
}

function reportMarkdown(report: CadExchangerGlbReport) {
  const cell = (value: unknown) => String(value).replace(/\|/g, "\\|");
  return [
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
    "## Layers",
    "",
    "| Layer | Entities | Bounds |",
    "| --- | ---: | --- |",
    ...report.layers.map((layer) => `| ${cell(layer.name)} | ${layer.entityCount} | ${layer.bounds ? JSON.stringify(layer.bounds) : "n/a"} |`)
  ].join("\n") + "\n";
}

export function exportScenePackageToCadExchangerGlb(scenePackage: ScenePackage): CadExchangerGlbExport {
  const sourceUnits = scenePackage.manifest.units;
  const coordinateScale = UNIT_TO_METER[sourceUnits];
  const sourceFile = sourceBaseName(scenePackage.manifest.source.path);
  const baseName = withoutExtension(sourceFile ?? scenePackage.scene.nodes[0]?.displayName ?? "kairo-scene");
  const filename = `${baseName}.pro.ribbons-keytext.glb`;
  const reportFilename = `${baseName}.cadex-report.md`;
  const layerById = new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer]));
  const materials: ExportMaterial[] = [];
  const materialIndexByKey = new Map<string, number>();

  function resolveMaterial(layerId: string) {
    const layer = layerById.get(layerId);
    const layerName = layer?.name ?? layerId;
    const color = readableCadColor(layerName, layer?.color);
    const key = materialKey(layer?.id ?? layerId, layerName, color);
    const existing = materialIndexByKey.get(key);
    if (existing !== undefined) return existing;
    const index = materials.length;
    materialIndexByKey.set(key, index);
    materials.push({ name: layerName, layerId: layer?.id ?? layerId, layerName, color });
    return index;
  }

  const textMaterialIndex = materials.push({
    name: "Kairo text labels",
    layerId: "kairo-text",
    layerName: "Kairo text labels",
    color: [0.08, 0.08, 0.08]
  }) - 1;
  const groups = new Map<string, ExportGroup>();
  const textGroup: ExportGroup = {
    materialIndex: textMaterialIndex,
    layerId: "kairo-text",
    layerName: "Kairo text labels",
    positions: [],
    indices: []
  };
  const sceneEntityCounts = new Map<string, number>();
  const layerReports = new Map<string, LayerReport>(
    scenePackage.layers.layers.map((layer) => [
      layer.id,
      {
        id: layer.id,
        name: layer.name,
        entityCount: 0,
        bounds: emptyBounds()
      }
    ])
  );
  const textMetrics: TextMetric[] = [];
  let curveEntities = 0;
  let lineSegments = 0;
  let textEntities = 0;
  let exportedTextEntities = 0;
  let skippedTextEntities = 0;
  let textStrokeSegments = 0;

  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      const fallbackLayerId = geometry.layerId;
      for (const entity of geometry.entities) {
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
          textEntities += 1;
          includePoint(layerReport.bounds, scalePoint(entity.position, coordinateScale));
          if (shouldExportMainText(entity.text)) {
            const result = addTextStrokes(textGroup, entity, coordinateScale);
            if (result.strokeCount > 0) {
              exportedTextEntities += 1;
              textStrokeSegments += result.strokeCount;
              textMetrics.push(result);
            }
          } else {
            skippedTextEntities += 1;
          }
          continue;
        }

        const points = pointsForEntity(entity).map((point) => scalePoint([point.x, point.y, point.z], coordinateScale));
        if (points.length < 2) continue;
        for (const point of points) includePoint(layerReport.bounds, point);
        curveEntities += 1;
        const materialIndex = resolveMaterial(layerId);
        const layer = layerById.get(layerId) ?? { id: layerId, name: layerId };
        const group = groupFor(groups, `${materialIndex}:${layerId}`, () => ({
          materialIndex,
          layerId,
          layerName: layer.name,
          positions: [],
          indices: []
        }));
        for (let index = 0; index < points.length - 1; index += 1) {
          if (addRibbon(group, points[index], points[index + 1], DEFAULT_RIBBON_WIDTH_SOURCE * coordinateScale)) {
            lineSegments += 1;
          }
        }
      }
    }
  }

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
    .sort((a, b) => `${b.sourceHeight}:${a.label}:${a.sourceRef ?? ""}`.localeCompare(`${a.sourceHeight}:${b.label}:${b.sourceRef ?? ""}`));
  const risks = [];
  if (skippedTextEntities > 0) risks.push(`${skippedTextEntities} scene text entities were intentionally filtered from key-text GLB output.`);
  if (suspiciousLargeTextHeights.length > 0) risks.push(`${suspiciousLargeTextHeights.length} source text entities are >= 300 source units and should be visually checked.`);
  risks.push("GLB coordinates are scaled from source units to meters; text styling constants are scaled by the same coordinate scale.");
  risks.push("Browser export uses the loaded ScenePackage; run the CLI conversion report when DXF import warning details are required.");

  const report: CadExchangerGlbReport = {
    format: "kairo-cadex-glb-report",
    version: 1,
    sourceFile,
    sourceUnits,
    outputUnits: "meter",
    coordinateScale,
    entityCounts: {
      sourceMap: sourceEntityCounts(scenePackage),
      scene: sortedObjectFromMap(sceneEntityCounts),
      exported: {
        curveEntities,
        lineSegments,
        textEntities: exportedTextEntities,
        textStrokeSegments
      }
    },
    text: {
      textEntities,
      exportedTextEntities,
      skippedTextEntities,
      textZLift: Number((TEXT_Z_LIFT_SOURCE * coordinateScale).toFixed(6)),
      suspiciousLargeTextHeights
    },
    layers: [...layerReports.values()]
      .map((layer) => ({
        id: layer.id,
        name: layer.name,
        entityCount: layer.entityCount,
        bounds: finiteBounds(layer.bounds)
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    outputs: {
      meshPath: filename
    },
    risks
  };

  const bytes = writeGlb(withoutExtension(filename), [...groups.values(), textGroup], materials, {
    source: sourceFile,
    sourceUnits,
    outputUnits: "meter",
    coordinateScale,
    ribbonWidthSource: DEFAULT_RIBBON_WIDTH_SOURCE,
    exportedRibbonWidth: DEFAULT_RIBBON_WIDTH_SOURCE * coordinateScale,
    textIncluded: true,
    textStyle: "filtered 5x7 ribbon stroke text",
    curveEntities,
    lineSegments,
    textEntities,
    exportedTextEntities,
    skippedTextEntities,
    textStrokeSegments
  });
  const reportMarkdownText = reportMarkdown(report);

  return {
    filename,
    bytes,
    reportFilename,
    reportJson: `${JSON.stringify(report, null, 2)}\n`,
    reportMarkdown: reportMarkdownText,
    report
  };
}
