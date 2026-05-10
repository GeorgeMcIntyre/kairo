import type {
  DrawingEntity,
  Geometry,
  GeometryDocument,
  Layer,
  SceneNode,
  ScenePackage,
  SourceMapDocument
} from "@kairo/schema";

export type { DrawingEntity, Geometry, GeometryDocument, Layer, SceneNode, ScenePackage, SourceMapDocument };

export type SourceMapEntry = SourceMapDocument["sources"][number];

export const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export type Vec3 = readonly [number, number, number];

export type ParsedSourceRef =
  | { kind: "file" }
  | { kind: "direct"; handle: string }
  | { kind: "mtext"; handle: string }
  | { kind: "block-child"; insertHandle: string; blockName: string; childHandle: string }
  | { kind: "unknown" };

export function parseSourceRef(sourceRef: string): ParsedSourceRef {
  if (sourceRef === "src-dxf-file") return { kind: "file" };
  const blockChildMatch = sourceRef.match(/^src-dxf-insert-(.+?)-block-(.+?)-child-(.+)$/);
  if (blockChildMatch) {
    return {
      kind: "block-child",
      insertHandle: blockChildMatch[1],
      blockName: blockChildMatch[2],
      childHandle: blockChildMatch[3]
    };
  }
  const mtextMatch = sourceRef.match(/^src-dxf-mtext-(.+)$/);
  if (mtextMatch) return { kind: "mtext", handle: mtextMatch[1] };
  const directMatch = sourceRef.match(/^src-dxf-(.+)$/);
  if (directMatch) return { kind: "direct", handle: directMatch[1] };
  return { kind: "unknown" };
}

export function computeEntityCentroid(entity: DrawingEntity): Vec3 {
  switch (entity.type) {
    case "line":
      return [
        (entity.start[0] + entity.end[0]) / 2,
        (entity.start[1] + entity.end[1]) / 2,
        (entity.start[2] + entity.end[2]) / 2
      ];
    case "polyline": {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (const p of entity.points) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[2] < minZ) minZ = p[2];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
        if (p[2] > maxZ) maxZ = p[2];
      }
      return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    }
    case "circle":
    case "arc":
      return [entity.center[0], entity.center[1], entity.center[2]];
    case "text":
      return [entity.position[0], entity.position[1], entity.position[2]];
  }
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeSceneCentroid(centroids: readonly Vec3[]): Vec3 {
  if (centroids.length === 0) return [0, 0, 0];
  return [
    medianOf(centroids.map((c) => c[0])),
    medianOf(centroids.map((c) => c[1])),
    medianOf(centroids.map((c) => c[2]))
  ];
}

export function flattenCurveEntities(documents: readonly GeometryDocument[]): DrawingEntity[] {
  const result: DrawingEntity[] = [];
  for (const doc of documents) {
    for (const geom of doc.geometries) {
      if (geom.kind === "curve-set") {
        for (const entity of geom.entities) {
          result.push(entity);
        }
      }
    }
  }
  return result;
}

export function flattenGeometry(scenePackage: ScenePackage): Geometry[] {
  return scenePackage.geometry.flatMap((document) => document.geometries);
}

export function geometryById(scenePackage: ScenePackage): Map<string, Geometry> {
  return new Map(flattenGeometry(scenePackage).map((geometry) => [geometry.id, geometry]));
}

export function nodesById(scenePackage: ScenePackage): Map<string, SceneNode> {
  return new Map(scenePackage.scene.nodes.map((node) => [node.id, node]));
}

export function sourcePathForNode(scenePackage: ScenePackage, node: SceneNode): string | undefined {
  if (!node.sourceRef) {
    return undefined;
  }

  return scenePackage.sourceMap.sources.find((source) => source.id === node.sourceRef)?.path;
}

export function sourceEntryForNode(scenePackage: ScenePackage, node: SceneNode): SourceMapEntry | undefined {
  if (!node.sourceRef) {
    return undefined;
  }
  return scenePackage.sourceMap.sources.find((source) => source.id === node.sourceRef);
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function loadExplodedScene(baseUrl: string): Promise<ScenePackage> {
  const root = baseUrl.replace(/\/$/, "");
  const [manifest, scene, meshGeometry, curveGeometry, layers, materials, sourceMap] = await Promise.all([
    fetchJson<ScenePackage["manifest"]>(`${root}/manifest.json`),
    fetchJson<ScenePackage["scene"]>(`${root}/scene.json`),
    fetchJson<GeometryDocument>(`${root}/geometry/bracket.mesh.json`),
    fetchJson<GeometryDocument>(`${root}/geometry/drawing.curves.json`),
    fetchJson<ScenePackage["layers"]>(`${root}/layers.json`),
    fetchJson<ScenePackage["materials"]>(`${root}/materials.json`),
    fetchJson<SourceMapDocument>(`${root}/source-map.json`)
  ]);

  return {
    manifest,
    scene,
    geometry: [meshGeometry, curveGeometry],
    layers,
    materials,
    sourceMap
  };
}
