import type { Geometry, ScenePackage } from "@kairo/schema";
import * as THREE from "three";
import { pointsForEntity } from "./curveBatch";

type GlbPrimitive = {
  attributes: Record<string, number>;
  mode: number;
};

type ColorLike = {
  r?: number;
  g?: number;
  b?: number;
};

export type CadExchangerGlbExportStats = {
  sourcePath?: string;
  sourceUnits: string;
  outputUnits: string;
  coordinateScale: number;
  geometryDocuments: number;
  curveSets: number;
  curveEntities: number;
  skippedTextEntities: number;
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

export function exportScenePackageToCadExchangerGlb(scenePackage: ScenePackage): CadExchangerGlbExportResult {
  const { scale: coordinateScale, units: outputUnits } = sceneCoordinateScale(scenePackage);
  const geometryMap = geometryById(scenePackage);
  const layersById = new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer]));
  const linePositions: number[] = [];
  const lineColors: number[] = [];
  const meshPositions: number[] = [];
  const meshColors: number[] = [];
  const stats: CadExchangerGlbExportStats = {
    sourcePath: scenePackage.manifest.source.path,
    sourceUnits: scenePackage.manifest.units,
    outputUnits,
    coordinateScale,
    geometryDocuments: scenePackage.geometry.length,
    curveSets: 0,
    curveEntities: 0,
    skippedTextEntities: 0,
    lineSegments: 0,
    meshTriangles: 0,
    vertices: 0,
    primitiveModes: []
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
            continue;
          }
          const points = pointsForEntity(entity);
          if (points.length < 2) continue;
          const entityLayer = layersById.get(entity.layerId ?? geometry.layerId ?? "");
          const color = readableCadColor(entityLayer?.name ?? layerName, entity.color ?? entityLayer?.color ?? layer?.color);
          stats.curveEntities += 1;
          for (let index = 0; index < points.length - 1; index += 1) {
            linePositions.push(...transformedPoint(points[index], nodeMatrix, coordinateScale));
            linePositions.push(...transformedPoint(points[index + 1], nodeMatrix, coordinateScale));
            lineColors.push(...color, ...color);
            stats.lineSegments += 1;
          }
        }
      } else {
        const material = scenePackage.materials.materials.find((entry) => entry.id === geometry.materialId);
        const color = colorTuple(material?.baseColor ?? layer?.color, fallbackColor);
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
            meshPositions.push(...transformedPoint(vertex, nodeMatrix, coordinateScale));
            meshColors.push(...color);
          }
          stats.meshTriangles += 1;
        }
      }
    }
  }

  const primitives: GlbPrimitive[] = [];
  const accessors: unknown[] = [];
  const bufferViews: unknown[] = [];
  const binaryParts: Uint8Array[] = [];
  let binaryOffset = 0;

  const appendAttribute = (positions: readonly number[], colors: readonly number[], mode: number) => {
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
    primitives.push({
      attributes: {
        POSITION: positionAccessor,
        COLOR_0: colorAccessor
      },
      mode
    });
  };

  if (linePositions.length > 0) {
    appendAttribute(linePositions, lineColors, LINES_MODE);
    stats.primitiveModes.push("LINES");
  }
  if (meshPositions.length > 0) {
    appendAttribute(meshPositions, meshColors, TRIANGLES_MODE);
    stats.primitiveModes.push("TRIANGLES");
  }
  stats.vertices = (linePositions.length + meshPositions.length) / 3;
  if (stats.vertices === 0) {
    throw new Error("No GLB geometry was generated. The scene has no exportable curves or meshes.");
  }

  const binaryChunk = padBytes(
    binaryParts.reduce((combined, part) => {
      const next = new Uint8Array(combined.byteLength + part.byteLength);
      next.set(combined);
      next.set(part, combined.byteLength);
      return next;
    }, new Uint8Array()),
    0
  );
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kairo CAD Exchanger GLB handoff",
      extras: {
        sourceUnits: stats.sourceUnits,
        outputUnits: stats.outputUnits,
        coordinateScale: stats.coordinateScale,
        sourcePath: stats.sourcePath
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Kairo CAD Exchanger layout handoff" }],
    meshes: [
      {
        name: "DXF curves and simple meshes",
        primitives
      }
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryChunk.byteLength }],
    extras: stats
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
