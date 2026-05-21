import type { Geometry, ScenePackage } from "@kairo/schema";
import * as THREE from "three";
import { pointsForEntity } from "./curveBatch";

type GlbPrimitive = {
  attributes: Record<string, number>;
  mode: number;
};

type GlbMesh = {
  name: string;
  primitives: GlbPrimitive[];
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
export type CadExchangerGlbTextMode = "metadata" | "skip";

export type CadExchangerGlbExportOptions = {
  geometryMode?: CadExchangerGlbGeometryMode;
  textMode?: CadExchangerGlbTextMode;
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
  ribbonWidthMm: number;
  layerTree: boolean;
  geometryDocuments: number;
  curveSets: number;
  curveEntities: number;
  skippedTextEntities: number;
  textMetadataEntities: number;
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
const ARRAY_BUFFER_TARGET = 34962;
const LINES_MODE = 1;
const TRIANGLES_MODE = 4;
const DEFAULT_CAD_COLOR: [number, number, number] = [0.22, 0.55, 0.9];
const DEFAULT_RIBBON_WIDTH_MM = 3;

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

function pushVertex(target: number[], point: readonly [number, number, number]) {
  target.push(point[0], point[1], point[2]);
}

function pushColor(target: number[], color: readonly [number, number, number], count: number) {
  for (let index = 0; index < count; index += 1) {
    target.push(color[0], color[1], color[2]);
  }
}

function appendRibbonSegment(
  positions: number[],
  colors: number[],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  widthMeters: number,
  color: readonly [number, number, number]
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
  pushVertex(positions, p1);
  pushVertex(positions, p2);
  pushVertex(positions, p0);
  pushVertex(positions, p2);
  pushVertex(positions, p3);
  pushColor(colors, color, 6);
  return true;
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

type GeometryBucket = {
  key: string;
  layerId?: string;
  layerName: string;
  name: string;
  mode: number;
  modeName: string;
  positions: number[];
  colors: number[];
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

function bucketKey(layerTree: boolean, layerId: string | undefined, modeName: string) {
  return layerTree ? `${layerId ?? "no-layer"}:${modeName}` : modeName;
}

function bucketName(layerTree: boolean, layerName: string, modeName: string) {
  return layerTree ? `${layerName} ${modeName.toLowerCase()}` : modeName === "LINES" ? "DXF curve lines" : "DXF ribbon and mesh triangles";
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
    ribbonWidthMm,
    layerTree,
    geometryDocuments: scenePackage.geometry.length,
    curveSets: 0,
    curveEntities: 0,
    skippedTextEntities: 0,
    textMetadataEntities: 0,
    skippedExcludedEntities: 0,
    lineSegments: 0,
    meshTriangles: 0,
    vertices: 0,
    primitiveModes: []
  };

  const getBucket = (layerId: string | undefined, layerName: string, mode: number, modeName: string) => {
    const key = bucketKey(layerTree, layerId, modeName);
    const existing = buckets.get(key);
    if (existing) return existing;
    const bucket: GeometryBucket = {
      key,
      layerId,
      layerName,
      name: bucketName(layerTree, layerName, modeName),
      mode,
      modeName,
      positions: [],
      colors: []
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
            if (textMode === "metadata") {
              textMetadata.push({
                id: entity.id,
                text: entity.text,
                layerId: entity.layerId ?? geometry.layerId ?? node.layerId,
                origin: entity.origin,
                tag: entity.tag,
                position: transformedPoint(
                  new THREE.Vector3(entity.position[0], entity.position[1], entity.position[2]),
                  nodeMatrix,
                  coordinateScale
                ),
                heightMeters: entity.height * coordinateScale,
                rotationDeg: entity.rotationDeg,
                sourceRef: entity.sourceRef
              });
              stats.textMetadataEntities += 1;
            }
            continue;
          }
          if (options.excludedEntityIds?.has(entity.id)) {
            stats.skippedExcludedEntities += 1;
            continue;
          }
          const points = pointsForEntity(entity);
          if (points.length < 2) continue;
          const entityLayer = layersById.get(entity.layerId ?? geometry.layerId ?? "");
          const entityLayerId = entity.layerId ?? geometry.layerId ?? node.layerId;
          const entityLayerName = entityLayer?.name ?? layerName;
          const color = readableCadColor(entityLayerName, entity.color ?? entityLayer?.color ?? layer?.color);
          const mode = geometryMode === "ribbons" ? TRIANGLES_MODE : LINES_MODE;
          const modeName = geometryMode === "ribbons" ? "TRIANGLES" : "LINES";
          const bucket = getBucket(entityLayerId, entityLayerName, mode, modeName);
          stats.curveEntities += 1;
          for (let index = 0; index < points.length - 1; index += 1) {
            const start = transformedPoint(points[index], nodeMatrix, coordinateScale);
            const end = transformedPoint(points[index + 1], nodeMatrix, coordinateScale);
            if (geometryMode === "ribbons") {
              if (appendRibbonSegment(bucket.positions, bucket.colors, start, end, ribbonWidthMeters, color)) {
                stats.meshTriangles += 2;
              }
            } else {
              pushVertex(bucket.positions, start);
              pushVertex(bucket.positions, end);
              pushColor(bucket.colors, color, 2);
            }
            stats.lineSegments += 1;
          }
        }
      } else {
        const material = scenePackage.materials.materials.find((entry) => entry.id === geometry.materialId);
        const color = colorTuple(material?.baseColor ?? layer?.color, fallbackColor);
        const bucket = getBucket(node.layerId ?? geometry.layerId, layerName, TRIANGLES_MODE, "TRIANGLES");
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
            pushColor(bucket.colors, color, 1);
          }
          stats.meshTriangles += 1;
        }
      }
    }
  }

  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  const binaryParts: Uint8Array[] = [];
  let binaryOffset = 0;

  const appendAttribute = (positions: readonly number[], colors: readonly number[], mode: number): GlbPrimitive => {
    const positionBytes = padBytes(floatBytes(positions), 0);
    const colorBytes = padBytes(floatBytes(colors), 0);
    const positionAccessor = accessors.length;
    const colorAccessor = accessors.length + 1;
    const positionBufferView = bufferViews.length;
    const colorBufferView = bufferViews.length + 1;
    const positionBounds = boundsOf(positions);

    binaryParts.push(positionBytes, colorBytes);
    bufferViews.push({
      buffer: 0,
      byteOffset: binaryOffset,
      byteLength: positionBytes.byteLength,
      target: ARRAY_BUFFER_TARGET
    });
    binaryOffset += positionBytes.byteLength;
    bufferViews.push({
      buffer: 0,
      byteOffset: binaryOffset,
      byteLength: colorBytes.byteLength,
      target: ARRAY_BUFFER_TARGET
    });
    binaryOffset += colorBytes.byteLength;
    accessors.push(
      {
        bufferView: positionBufferView,
        byteOffset: 0,
        componentType: FLOAT_COMPONENT_TYPE,
        count: positions.length / 3,
        type: "VEC3",
        min: positionBounds.min,
        max: positionBounds.max
      },
      {
        bufferView: colorBufferView,
        byteOffset: 0,
        componentType: FLOAT_COMPONENT_TYPE,
        count: colors.length / 3,
        type: "VEC3"
      }
    );
    return {
      attributes: {
        POSITION: positionAccessor,
        COLOR_0: colorAccessor
      },
      mode
    };
  };

  const exportedBuckets = [...buckets.values()]
    .filter((bucket) => bucket.positions.length > 0)
    .sort((left, right) => left.mode - right.mode || left.name.localeCompare(right.name));
  const meshes: GlbMesh[] = [];
  const nodes: GlbNode[] = [];
  const flatPrimitives: GlbPrimitive[] = [];

  for (const bucket of exportedBuckets) {
    const primitive = appendAttribute(bucket.positions, bucket.colors, bucket.mode);
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
