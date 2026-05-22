import type { Geometry, ScenePackage } from "@kairo/schema";
import * as THREE from "three";
import { pointsForEntity, type CurveTessellationOptions } from "./curveBatch";

type GlbPrimitive = {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
  mode: number;
};

type GlbMesh = {
  name: string;
  primitives: GlbPrimitive[];
};

type GlbMaterial = {
  name: string;
  pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
  };
  doubleSided: boolean;
};

type GlbNode = {
  name: string;
  mesh?: number;
  children?: number[];
  extras?: Record<string, unknown>;
};

type ColorLike = {
  r?: number;
  g?: number;
  b?: number;
};

export type CadExchangerGlbGeometryMode = "lines" | "ribbons";
export type CadExchangerGlbTextMode = "metadata" | "visible" | "skip";
export type CadExchangerGlbCurveDetail = "standard" | "compact" | "coarse";

export type CadExchangerGlbExportOptions = {
  geometryMode?: CadExchangerGlbGeometryMode;
  textMode?: CadExchangerGlbTextMode;
  curveDetail?: CadExchangerGlbCurveDetail;
  includeNormals?: boolean;
  ribbonWidthMm?: number;
  layerTree?: boolean;
  excludedEntityIds?: ReadonlySet<string>;
  presetName?: string;
};

export type CadExchangerGlbExportStats = {
  sourcePath?: string;
  sourceUnits: string;
  outputUnits: string;
  coordinateScale: number;
  geometryMode: CadExchangerGlbGeometryMode;
  textMode: CadExchangerGlbTextMode;
  curveDetail: CadExchangerGlbCurveDetail;
  includeNormals: boolean;
  ribbonWidthMm: number;
  layerTree: boolean;
  geometryDocuments: number;
  curveSets: number;
  curveEntities: number;
  skippedTextEntities: number;
  textMetadataEntities: number;
  visibleTextEntities: number;
  visibleTextSegments: number;
  skippedExcludedEntities: number;
  lineSegments: number;
  meshTriangles: number;
  vertices: number;
  primitiveModes: string[];
};

export type CadExchangerGlbExportResult = {
  bytes: Uint8Array;
  filename: string;
  stats: CadExchangerGlbExportStats;
};

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;
const UNSIGNED_SHORT_COMPONENT_TYPE = 5123;
const UNSIGNED_INT_COMPONENT_TYPE = 5125;
const ARRAY_BUFFER_TARGET = 34962;
const ELEMENT_ARRAY_BUFFER_TARGET = 34963;
const LINES_MODE = 1;
const TRIANGLES_MODE = 4;
const DEFAULT_CAD_COLOR: [number, number, number] = [0.22, 0.55, 0.9];
const DEFAULT_TEXT_COLOR: [number, number, number] = [0.05, 0.05, 0.05];
const DEFAULT_RIBBON_WIDTH_MM = 3;
const MAX_VISIBLE_TEXT_CHARS = 64;

const STROKE_FONT: Record<string, { w: number; s: number[][] }> = {
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

function colorTuple(color: ColorLike | undefined, fallback: [number, number, number] = DEFAULT_CAD_COLOR): [number, number, number] {
  if (!color) return fallback;
  return [color.r ?? fallback[0], color.g ?? fallback[1], color.b ?? fallback[2]];
}

function readableCadColor(layerName: string, color: ColorLike | undefined): [number, number, number] {
  const normalized = layerName.toUpperCase();
  const source = colorTuple(color, [0.42, 0.42, 0.42]);
  const max = Math.max(...source);
  const min = Math.min(...source);
  if (normalized.includes("TEXT") || normalized.includes("ANNO") || normalized.includes("TTL")) return [0.72, 0.48, 0.04];
  if (min > 0.82) return [0.42, 0.42, 0.42];
  if (max < 0.12) return [0.18, 0.18, 0.18];
  return source;
}

function padBytes(bytes: Uint8Array, padByte: number): Uint8Array {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  if (paddedLength === bytes.byteLength) return bytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(padByte, bytes.byteLength);
  return padded;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint32(offset, value, true);
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function sequentialIndexBytes(vertexCount: number): {
  bytes: Uint8Array;
  componentType: typeof UNSIGNED_SHORT_COMPONENT_TYPE | typeof UNSIGNED_INT_COMPONENT_TYPE;
} {
  if (vertexCount <= 65535) {
    const indices = new Uint16Array(vertexCount);
    for (let index = 0; index < vertexCount; index += 1) indices[index] = index;
    return { bytes: new Uint8Array(indices.buffer), componentType: UNSIGNED_SHORT_COMPONENT_TYPE };
  }

  const indices = new Uint32Array(vertexCount);
  for (let index = 0; index < vertexCount; index += 1) indices[index] = index;
  return { bytes: new Uint8Array(indices.buffer), componentType: UNSIGNED_INT_COMPONENT_TYPE };
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.byteLength;
  }
  return combined;
}

function boundsOf(positions: readonly number[]) {
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

function transformedPoint(point: THREE.Vector3, matrix: THREE.Matrix4, scale: number): [number, number, number] {
  const transformed = point.clone().applyMatrix4(matrix);
  return [transformed.x * scale, transformed.y * scale, transformed.z * scale];
}

function transformTextPoint(
  origin: readonly [number, number, number],
  cos: number,
  sin: number,
  x: number,
  y: number,
  z: number
): [number, number, number] {
  return [origin[0] + x * cos - y * sin, origin[1] + x * sin + y * cos, z];
}

function pushVertex(target: number[], point: readonly [number, number, number]) {
  target.push(point[0], point[1], point[2]);
}

function pushNormal(target: number[], normal: readonly [number, number, number], count: number) {
  for (let index = 0; index < count; index += 1) {
    target.push(normal[0], normal[1], normal[2]);
  }
}

function appendRibbonSegment(
  positions: number[],
  normals: number[],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  widthMeters: number
) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return false;

  const halfWidth = widthMeters / 2;
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  const p0: [number, number, number] = [start[0] + nx, start[1] + ny, start[2]];
  const p1: [number, number, number] = [end[0] + nx, end[1] + ny, end[2]];
  const p2: [number, number, number] = [end[0] - nx, end[1] - ny, end[2]];
  const p3: [number, number, number] = [start[0] - nx, start[1] - ny, start[2]];

  pushVertex(positions, p0);
  pushVertex(positions, p2);
  pushVertex(positions, p1);
  pushVertex(positions, p0);
  pushVertex(positions, p3);
  pushVertex(positions, p2);
  pushNormal(normals, [0, 0, 1], 6);
  return true;
}

function normalizeVisibleText(text: string) {
  return String(text ?? "")
    .replace(/\\P/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, MAX_VISIBLE_TEXT_CHARS);
}

function appendVisibleText(
  positions: number[],
  normals: number[],
  text: string,
  origin: readonly [number, number, number],
  heightMeters: number,
  rotationDeg: number,
  widthMeters: number
) {
  const label = normalizeVisibleText(text);
  if (!label) return 0;

  const capHeight = Math.max(0.012, Math.min(heightMeters * 0.42, 0.15));
  const strokeWidth = Math.max(widthMeters, Math.min(capHeight * 0.04, 0.006));
  const widthFactor = 0.62;
  const spacing = capHeight * 0.22;
  const rotation = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const z = origin[2] + 0.003;
  let cursor = 0;
  let count = 0;

  for (const char of label) {
    const glyph = STROKE_FONT[char] ?? STROKE_FONT[" "];
    for (const stroke of glyph.s) {
      const start = transformTextPoint(
        origin,
        cos,
        sin,
        cursor + stroke[0] * capHeight * widthFactor,
        stroke[1] * capHeight,
        z
      );
      const end = transformTextPoint(
        origin,
        cos,
        sin,
        cursor + stroke[2] * capHeight * widthFactor,
        stroke[3] * capHeight,
        z
      );
      if (appendRibbonSegment(positions, normals, start, end, strokeWidth)) count += 1;
    }
    cursor += glyph.w * capHeight * widthFactor + spacing;
  }

  return count;
}

function matrixFromArray(values: readonly number[]) {
  return new THREE.Matrix4().fromArray([...values]);
}

function geometryById(scenePackage: ScenePackage): Map<string, Geometry> {
  const result = new Map<string, Geometry>();
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      result.set(geometry.id, geometry);
    }
  }
  return result;
}

function sourceBaseName(scenePackage: ScenePackage): string {
  const sourcePath = scenePackage.manifest.source.path ?? "kairo-layout";
  const normalized = sourcePath.split(/[\\/]/).pop() ?? "kairo-layout";
  return normalized.replace(/\.[^.]+$/, "") || "kairo-layout";
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "kairo-layout";
}

function unitScaleToMeters(units: ScenePackage["manifest"]["units"]) {
  if (units === "millimeter") return 0.001;
  if (units === "centimeter") return 0.01;
  if (units === "meter") return 1;
  if (units === "inch") return 0.0254;
  if (units === "foot") return 0.3048;
  return 1;
}

function sceneCoordinateScale(scenePackage: ScenePackage): { scale: number; units: string } {
  return { scale: unitScaleToMeters(scenePackage.manifest.units), units: "meter" };
}

function tessellationForDetail(detail: CadExchangerGlbCurveDetail): CurveTessellationOptions {
  if (detail === "coarse") {
    return {
      circleSegments: 8,
      arcSegments: 4,
      ellipseSegments: 8,
      bulgeMinSegments: 2,
      bulgeAngleStepRad: Math.PI / 4
    };
  }
  if (detail === "compact") {
    return {
      circleSegments: 12,
      arcSegments: 6,
      ellipseSegments: 12,
      bulgeMinSegments: 3,
      bulgeAngleStepRad: Math.PI / 3
    };
  }
  return {};
}

type GeometryBucket = {
  key: string;
  layerId?: string;
  layerName: string;
  name: string;
  mode: number;
  modeName: string;
  materialColor: [number, number, number];
  positions: number[];
  normals: number[];
};

type TextMetadata = {
  id: string;
  text: string;
  layerId?: string;
  origin: string;
  tag?: string;
  position: [number, number, number];
  heightMeters: number;
  rotationDeg: number;
  sourceRef?: string;
};

function materialColorKey(color: readonly [number, number, number]) {
  return color.map((component) => Math.round(Math.min(Math.max(component, 0), 1) * 255)).join("-");
}

function bucketKey(layerTree: boolean, layerId: string | undefined, modeName: string, color: readonly [number, number, number]) {
  const materialKey = materialColorKey(color);
  return layerTree ? `${layerId ?? "no-layer"}:${modeName}:${materialKey}` : `${modeName}:${materialKey}`;
}

function bucketName(layerTree: boolean, layerName: string, modeName: string, color: readonly [number, number, number]) {
  const suffix = materialColorKey(color);
  if (layerTree) return `${layerName} ${modeName.toLowerCase()} ${suffix}`;
  return modeName === "LINES" ? `DXF curve lines ${suffix}` : `DXF ribbon and mesh triangles ${suffix}`;
}

export function exportScenePackageToCadExchangerGlb(
  scenePackage: ScenePackage,
  options: CadExchangerGlbExportOptions = {}
): CadExchangerGlbExportResult {
  const { scale: coordinateScale, units: outputUnits } = sceneCoordinateScale(scenePackage);
  const geometryMap = geometryById(scenePackage);
  const layersById = new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer]));
  const geometryMode = options.geometryMode ?? "lines";
  const textMode = options.textMode ?? "metadata";
  const curveDetail = options.curveDetail ?? "standard";
  const includeNormals = options.includeNormals ?? false;
  const tessellation = tessellationForDetail(curveDetail);
  const ribbonWidthMm = Math.max(0.01, options.ribbonWidthMm ?? DEFAULT_RIBBON_WIDTH_MM);
  const ribbonWidthMeters = ribbonWidthMm / 1000;
  const layerTree = options.layerTree ?? false;
  const buckets = new Map<string, GeometryBucket>();
  const textMetadata: TextMetadata[] = [];
  const stats: CadExchangerGlbExportStats = {
    sourcePath: scenePackage.manifest.source.path,
    sourceUnits: scenePackage.manifest.units,
    outputUnits,
    coordinateScale,
    geometryMode,
    textMode,
    curveDetail,
    includeNormals,
    ribbonWidthMm,
    layerTree,
    geometryDocuments: scenePackage.geometry.length,
    curveSets: 0,
    curveEntities: 0,
    skippedTextEntities: 0,
    textMetadataEntities: 0,
    visibleTextEntities: 0,
    visibleTextSegments: 0,
    skippedExcludedEntities: 0,
    lineSegments: 0,
    meshTriangles: 0,
    vertices: 0,
    primitiveModes: []
  };

  const getBucket = (
    layerId: string | undefined,
    layerName: string,
    mode: number,
    modeName: string,
    materialColor: [number, number, number]
  ) => {
    const key = bucketKey(layerTree, layerId, modeName, materialColor);
    const existing = buckets.get(key);
    if (existing) return existing;
    const bucket: GeometryBucket = {
      key,
      layerId,
      layerName,
      name: bucketName(layerTree, layerName, modeName, materialColor),
      mode,
      modeName,
      materialColor,
      positions: [],
      normals: []
    };
    buckets.set(key, bucket);
    return bucket;
  };

  for (const node of scenePackage.scene.nodes) {
    const nodeMatrix = matrixFromArray(node.localTransform);
    for (const geometryRef of node.geometryRefs ?? []) {
      const geometry = geometryMap.get(geometryRef);
      if (!geometry) continue;
      const layer = layersById.get(node.layerId ?? geometry.layerId ?? "");
      const layerName = layer?.name ?? node.layerId ?? geometry.layerId ?? "No layer";
      const fallbackColor = readableCadColor(layerName, layer?.color);

      if (geometry.kind === "curve-set") {
        stats.curveSets += 1;
        for (const entity of geometry.entities) {
          if (entity.type === "text") {
            stats.skippedTextEntities += 1;
            if (textMode === "metadata" || textMode === "visible") {
              const position = transformedPoint(
                new THREE.Vector3(entity.position[0], entity.position[1], entity.position[2]),
                nodeMatrix,
                coordinateScale
              );
              textMetadata.push({
                id: entity.id,
                text: entity.text,
                layerId: entity.layerId ?? geometry.layerId ?? node.layerId,
                origin: entity.origin,
                tag: entity.tag,
                position,
                heightMeters: entity.height * coordinateScale,
                rotationDeg: entity.rotationDeg,
                sourceRef: entity.sourceRef
              });
              stats.textMetadataEntities += 1;
              if (textMode === "visible" && !options.excludedEntityIds?.has(entity.id)) {
                const entityLayer = layersById.get(entity.layerId ?? geometry.layerId ?? "");
                const entityLayerId = entity.layerId ?? geometry.layerId ?? node.layerId;
                const entityLayerName = entityLayer?.name ?? layerName;
                const bucket = getBucket(entityLayerId, entityLayerName, TRIANGLES_MODE, "TRIANGLES", DEFAULT_TEXT_COLOR);
                const segmentCount = appendVisibleText(
                  bucket.positions,
                  bucket.normals,
                  entity.text,
                  position,
                  entity.height * coordinateScale,
                  entity.rotationDeg,
                  ribbonWidthMeters
                );
                if (segmentCount > 0) {
                  stats.visibleTextEntities += 1;
                  stats.visibleTextSegments += segmentCount;
                  stats.meshTriangles += segmentCount * 2;
                  stats.lineSegments += segmentCount;
                }
              }
            }
            continue;
          }
          if (options.excludedEntityIds?.has(entity.id)) {
            stats.skippedExcludedEntities += 1;
            continue;
          }
          const points = pointsForEntity(entity, tessellation);
          if (points.length < 2) continue;
          const entityLayer = layersById.get(entity.layerId ?? geometry.layerId ?? "");
          const entityLayerId = entity.layerId ?? geometry.layerId ?? node.layerId;
          const entityLayerName = entityLayer?.name ?? layerName;
          const color = readableCadColor(entityLayerName, entity.color ?? entityLayer?.color ?? layer?.color);
          const mode = geometryMode === "ribbons" ? TRIANGLES_MODE : LINES_MODE;
          const modeName = geometryMode === "ribbons" ? "TRIANGLES" : "LINES";
          const bucket = getBucket(entityLayerId, entityLayerName, mode, modeName, color);
          stats.curveEntities += 1;
          for (let index = 0; index < points.length - 1; index += 1) {
            const start = transformedPoint(points[index], nodeMatrix, coordinateScale);
            const end = transformedPoint(points[index + 1], nodeMatrix, coordinateScale);
            if (geometryMode === "ribbons") {
              if (appendRibbonSegment(bucket.positions, bucket.normals, start, end, ribbonWidthMeters)) {
                stats.meshTriangles += 2;
              }
            } else {
              pushVertex(bucket.positions, start);
              pushVertex(bucket.positions, end);
            }
            stats.lineSegments += 1;
          }
        }
      } else {
        const material = scenePackage.materials.materials.find((entry) => entry.id === geometry.materialId);
        const color = colorTuple(material?.baseColor ?? layer?.color, fallbackColor);
        const bucket = getBucket(node.layerId ?? geometry.layerId, layerName, TRIANGLES_MODE, "TRIANGLES", color);
        for (let index = 0; index < geometry.indices.length; index += 3) {
          const i0 = geometry.indices[index] * 3;
          const i1 = geometry.indices[index + 1] * 3;
          const i2 = geometry.indices[index + 2] * 3;
          const vertices = [
            new THREE.Vector3(geometry.vertices[i0], geometry.vertices[i0 + 1], geometry.vertices[i0 + 2]),
            new THREE.Vector3(geometry.vertices[i1], geometry.vertices[i1 + 1], geometry.vertices[i1 + 2]),
            new THREE.Vector3(geometry.vertices[i2], geometry.vertices[i2 + 1], geometry.vertices[i2 + 2])
          ];
          for (const vertex of vertices) {
            pushVertex(bucket.positions, transformedPoint(vertex, nodeMatrix, coordinateScale));
          }
          const v0 = vertices[0];
          const v1 = vertices[1];
          const v2 = vertices[2];
          const normal = v1.clone().sub(v0).cross(v2.clone().sub(v0)).normalize();
          pushNormal(bucket.normals, [normal.x || 0, normal.y || 0, normal.z || 1], 3);
          stats.meshTriangles += 1;
        }
      }
    }
  }

  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  const binaryParts: Uint8Array[] = [];
  let binaryOffset = 0;

  const appendAttribute = (positions: readonly number[], normals: readonly number[], mode: number, material: number): GlbPrimitive => {
    const positionBytes = padBytes(floatBytes(positions), 0);
    const positionAccessor = accessors.length;
    const positionBufferView = bufferViews.length;
    const positionBounds = boundsOf(positions);

    binaryParts.push(positionBytes);
    bufferViews.push({
      buffer: 0,
      byteOffset: binaryOffset,
      byteLength: positionBytes.byteLength,
      target: ARRAY_BUFFER_TARGET
    });
    binaryOffset += positionBytes.byteLength;
    accessors.push({
      bufferView: positionBufferView,
      byteOffset: 0,
      componentType: FLOAT_COMPONENT_TYPE,
      count: positions.length / 3,
      type: "VEC3",
      min: positionBounds.min,
      max: positionBounds.max
    });
    let normalAccessor: number | undefined;
    if (includeNormals && mode === TRIANGLES_MODE && normals.length === positions.length) {
      const normalBytes = padBytes(floatBytes(normals), 0);
      normalAccessor = accessors.length;
      const normalBufferView = bufferViews.length;
      binaryParts.push(normalBytes);
      bufferViews.push({
        buffer: 0,
        byteOffset: binaryOffset,
        byteLength: normalBytes.byteLength,
        target: ARRAY_BUFFER_TARGET
      });
      binaryOffset += normalBytes.byteLength;
      accessors.push({
        bufferView: normalBufferView,
        byteOffset: 0,
        componentType: FLOAT_COMPONENT_TYPE,
        count: normals.length / 3,
        type: "VEC3"
      });
    }
    let indexAccessor: number | undefined;
    if (mode === TRIANGLES_MODE) {
      const vertexCount = positions.length / 3;
      const indexData = sequentialIndexBytes(vertexCount);
      const indexBytes = padBytes(indexData.bytes, 0);
      indexAccessor = accessors.length;
      const indexBufferView = bufferViews.length;
      binaryParts.push(indexBytes);
      bufferViews.push({
        buffer: 0,
        byteOffset: binaryOffset,
        byteLength: indexBytes.byteLength,
        target: ELEMENT_ARRAY_BUFFER_TARGET
      });
      binaryOffset += indexBytes.byteLength;
      accessors.push({
        bufferView: indexBufferView,
        byteOffset: 0,
        componentType: indexData.componentType,
        count: vertexCount,
        type: "SCALAR",
        min: [0],
        max: [Math.max(0, vertexCount - 1)]
      });
    }

    const attributes: Record<string, number> = {
      POSITION: positionAccessor
    };
    if (normalAccessor !== undefined) attributes.NORMAL = normalAccessor;
    return {
      attributes,
      indices: indexAccessor,
      material,
      mode
    };
  };

  const exportedBuckets = [...buckets.values()]
    .filter((bucket) => bucket.positions.length > 0)
    .sort((left, right) => left.mode - right.mode || left.name.localeCompare(right.name));
  const meshes: GlbMesh[] = [];
  const materials: GlbMaterial[] = [];
  const materialsByKey = new Map<string, number>();
  const nodes: GlbNode[] = [];
  const flatPrimitives: GlbPrimitive[] = [];

  const materialForBucket = (bucket: GeometryBucket) => {
    const key = materialColorKey(bucket.materialColor);
    const existing = materialsByKey.get(key);
    if (existing !== undefined) return existing;
    const materialIndex = materials.length;
    materialsByKey.set(key, materialIndex);
    materials.push({
      name: `Kairo CAD ${key}`,
      pbrMetallicRoughness: {
        baseColorFactor: [bucket.materialColor[0], bucket.materialColor[1], bucket.materialColor[2], 1],
        metallicFactor: 0,
        roughnessFactor: 1
      },
      doubleSided: true
    });
    return materialIndex;
  };

  for (const bucket of exportedBuckets) {
    const primitive = appendAttribute(bucket.positions, bucket.normals, bucket.mode, materialForBucket(bucket));
    if (!stats.primitiveModes.includes(bucket.modeName)) stats.primitiveModes.push(bucket.modeName);
    if (layerTree) {
      const meshIndex = meshes.length;
      meshes.push({ name: bucket.name, primitives: [primitive] });
      nodes.push({
        mesh: meshIndex,
        name: bucket.layerName,
        extras: {
          layerId: bucket.layerId,
          primitiveMode: bucket.modeName
        }
      });
    } else {
      flatPrimitives.push(primitive);
    }
    stats.vertices += bucket.positions.length / 3;
  }

  let sceneNodes: number[];
  if (layerTree) {
    nodes.unshift({
      name: "Kairo GLB export layers",
      children: nodes.map((_, index) => index + 1),
      extras: {
        presetName: options.presetName,
        outputUnits,
        coordinateScale,
        geometryMode,
        ribbonWidthMm
      }
    });
    sceneNodes = [0];
  } else {
    meshes.push({
      name: "DXF curves and simple meshes",
      primitives: flatPrimitives
    });
    nodes.push({ mesh: 0, name: "Kairo CAD Exchanger layout handoff" });
    sceneNodes = [0];
  }

  if (stats.vertices === 0) {
    throw new Error("No GLB geometry was generated. The scene has no exportable curves or meshes.");
  }

  const binaryChunk = padBytes(concatBytes(binaryParts), 0);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kairo CAD Exchanger GLB handoff",
      extras: {
        sourceUnits: stats.sourceUnits,
        outputUnits: stats.outputUnits,
        coordinateScale: stats.coordinateScale,
        sourcePath: stats.sourcePath,
        presetName: options.presetName,
        geometryMode: stats.geometryMode,
        textMode: stats.textMode,
        curveDetail: stats.curveDetail,
        cadExchangerIndexedTriangles: true,
        includeNormals: stats.includeNormals,
        ribbonWidthMm: stats.ribbonWidthMm,
        layerTree: stats.layerTree,
        skippedTextEntities: stats.skippedTextEntities,
        textMetadataEntities: stats.textMetadataEntities,
        skippedExcludedEntities: stats.skippedExcludedEntities
      }
    },
    scene: 0,
    scenes: [{ nodes: sceneNodes }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryChunk.byteLength }],
    extras: {
      ...stats,
      textMetadata
    }
  };
  const jsonChunk = padBytes(new TextEncoder().encode(JSON.stringify(gltf)), 0x20);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength;
  const bytes = new Uint8Array(totalLength);
  writeUint32(bytes, 0, GLB_MAGIC);
  writeUint32(bytes, 4, GLB_VERSION);
  writeUint32(bytes, 8, totalLength);
  writeUint32(bytes, 12, jsonChunk.byteLength);
  writeUint32(bytes, 16, JSON_CHUNK_TYPE);
  bytes.set(jsonChunk, 20);
  const binHeaderOffset = 20 + jsonChunk.byteLength;
  writeUint32(bytes, binHeaderOffset, binaryChunk.byteLength);
  writeUint32(bytes, binHeaderOffset + 4, BIN_CHUNK_TYPE);
  bytes.set(binaryChunk, binHeaderOffset + 8);

  return {
    bytes,
    filename: `${safeFilename(sourceBaseName(scenePackage))}.cadex-handoff.glb`,
    stats
  };
}
