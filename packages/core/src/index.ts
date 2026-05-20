import type {
  DrawingEntity,
  Geometry,
  GeometryDocument,
  Layer,
  SceneNode,
  ScenePackage,
  SourceMapDocument
} from "@kairo/schema";

export * from "./kairoPackage";

export type { DrawingEntity, Geometry, GeometryDocument, Layer, SceneNode, ScenePackage, SourceMapDocument };

export type SourceMapEntry = SourceMapDocument["sources"][number];

export const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export type Vec3 = readonly [number, number, number];

export type Bounds3 = {
  min: Vec3;
  max: Vec3;
};

export type EntityBounds = {
  entityId: string;
  type: DrawingEntity["type"];
  layerId?: string;
  sourceRef?: string;
  bounds: Bounds3;
  centroid: Vec3;
  size: Vec3;
  diagonal: number;
  distanceFromMainCluster: number;
  isOutlier: boolean;
};

export type RobustSceneBounds = {
  rawBounds: Bounds3;
  visibleBounds: Bounds3;
  fitBounds: Bounds3;
  outlierBounds: Bounds3 | null;
  outlierEntityIds: string[];
  mainClusterCenter: Vec3;
  entityBounds: EntityBounds[];
  topOutliers: EntityBounds[];
};

export type RobustBoundsOptions = {
  mainQuantile?: number;
  distanceMultiplier?: number;
  iqrMultiplier?: number;
  topOutlierCount?: number;
};

export type ParsedSourceRef =
  | { kind: "file" }
  | { kind: "direct"; handle: string }
  | { kind: "mtext"; handle: string }
  | { kind: "block-child"; insertHandle: string; blockName: string; childHandle: string }
  | { kind: "unknown" };

function finitePoints(points: readonly (readonly number[])[]): Vec3[] {
  return points.map(vec3From).filter((point) => point.every(Number.isFinite));
}

function splineReferencePoints(entity: Extract<DrawingEntity, { type: "spline" }>): Vec3[] {
  return finitePoints([...(entity.fitPoints ?? []), ...(entity.controlPoints ?? [])]);
}

function bulgedSegmentPoints(start: Vec3, end: Vec3, bulge: number): Vec3[] {
  if (Math.abs(bulge) < 1e-12) return [start, end];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const chordLength = Math.hypot(dx, dy);
  if (chordLength < 1e-9) return [start, end];

  const sweep = 4 * Math.atan(bulge);
  const midpoint: Vec3 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
  const normal: Vec3 = [-dy / chordLength, dx / chordLength, 0];
  const centerOffset = (chordLength * (1 - bulge * bulge)) / (4 * bulge);
  const center: Vec3 = [midpoint[0] + normal[0] * centerOffset, midpoint[1] + normal[1] * centerOffset, midpoint[2]];
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const segmentCount = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  const points: Vec3[] = [];

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const angle = startAngle + sweep * t;
    points.push([
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
      start[2] + (end[2] - start[2]) * t
    ]);
  }

  return points;
}

function polylineReferencePoints(entity: Extract<DrawingEntity, { type: "polyline" }>): Vec3[] {
  const vertices = finitePoints(entity.points);
  if (vertices.length < 2) return vertices;
  const points: Vec3[] = [];
  const segmentCount = entity.closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < segmentCount; i += 1) {
    const segmentPoints = bulgedSegmentPoints(vertices[i], vertices[(i + 1) % vertices.length], entity.bulges?.[i] ?? 0);
    if (points.length > 0) segmentPoints.shift();
    points.push(...segmentPoints);
  }

  return points;
}

function ellipsePoint(entity: Extract<DrawingEntity, { type: "ellipse" }>, parameter: number): Vec3 {
  const major = entity.majorAxis;
  const minorScale = entity.minorToMajorRatio;
  const minor: Vec3 = [-major[1] * minorScale, major[0] * minorScale, major[2] * minorScale];
  return [
    entity.center[0] + Math.cos(parameter) * major[0] + Math.sin(parameter) * minor[0],
    entity.center[1] + Math.cos(parameter) * major[1] + Math.sin(parameter) * minor[1],
    entity.center[2] + Math.cos(parameter) * major[2] + Math.sin(parameter) * minor[2]
  ];
}

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
      return boundsCenter(boundsFromPoints(polylineReferencePoints(entity)));
    }
    case "circle":
    case "arc":
      return [entity.center[0], entity.center[1], entity.center[2]];
    case "point":
      return [entity.position[0], entity.position[1], entity.position[2]];
    case "ellipse":
      return [entity.center[0], entity.center[1], entity.center[2]];
    case "spline": {
      const points = splineReferencePoints(entity);
      return points.length > 0 ? boundsCenter(boundsFromPoints(points)) : [0, 0, 0];
    }
    case "face3d":
    case "solid":
      return boundsCenter(boundsFromPoints(finitePoints(entity.vertices)));
    case "text":
      return [entity.position[0], entity.position[1], entity.position[2]];
  }
}

function emptyBounds(): { min: [number, number, number]; max: [number, number, number] } {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function boundsIsEmpty(bounds: Bounds3): boolean {
  return bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1] || bounds.min[2] > bounds.max[2];
}

function expandBoundsByPoint(bounds: { min: [number, number, number]; max: [number, number, number] }, point: Vec3) {
  bounds.min[0] = Math.min(bounds.min[0], point[0]);
  bounds.min[1] = Math.min(bounds.min[1], point[1]);
  bounds.min[2] = Math.min(bounds.min[2], point[2]);
  bounds.max[0] = Math.max(bounds.max[0], point[0]);
  bounds.max[1] = Math.max(bounds.max[1], point[1]);
  bounds.max[2] = Math.max(bounds.max[2], point[2]);
}

function boundsFromPoints(points: readonly Vec3[]): Bounds3 {
  const bounds = emptyBounds();
  for (const point of points) expandBoundsByPoint(bounds, point);
  return boundsIsEmpty(bounds) ? { min: [0, 0, 0], max: [0, 0, 0] } : bounds;
}

function vec3From(values: readonly number[]): Vec3 {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0];
}

function expandBoundsByBounds(bounds: { min: [number, number, number]; max: [number, number, number] }, other: Bounds3) {
  if (boundsIsEmpty(other)) return;
  expandBoundsByPoint(bounds, other.min);
  expandBoundsByPoint(bounds, other.max);
}

function boundsSize(bounds: Bounds3): Vec3 {
  if (boundsIsEmpty(bounds)) return [0, 0, 0];
  return [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
}

function boundsCenter(bounds: Bounds3): Vec3 {
  if (boundsIsEmpty(bounds)) return [0, 0, 0];
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
}

function vectorDiagonal(size: Vec3): number {
  return Math.hypot(size[0], size[1], size[2]);
}

function normalizedDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function angleWithinArc(angle: number, start: number, end: number): boolean {
  const normalizedAngle = normalizedDegrees(angle);
  const normalizedStart = normalizedDegrees(start);
  let normalizedEnd = normalizedDegrees(end);
  if (normalizedEnd < normalizedStart) normalizedEnd += 360;
  const comparableAngle = normalizedAngle < normalizedStart ? normalizedAngle + 360 : normalizedAngle;
  return comparableAngle >= normalizedStart && comparableAngle <= normalizedEnd;
}

export function computeEntityBounds(entity: DrawingEntity): Bounds3 {
  const bounds = emptyBounds();
  if (entity.type === "line") {
    expandBoundsByPoint(bounds, vec3From(entity.start));
    expandBoundsByPoint(bounds, vec3From(entity.end));
  } else if (entity.type === "polyline") {
    for (const point of polylineReferencePoints(entity)) expandBoundsByPoint(bounds, point);
  } else if (entity.type === "circle") {
    const [x, y, z] = entity.center;
    expandBoundsByPoint(bounds, [x - entity.radius, y - entity.radius, z]);
    expandBoundsByPoint(bounds, [x + entity.radius, y + entity.radius, z]);
  } else if (entity.type === "arc") {
    const start = normalizedDegrees(entity.startAngleDeg);
    const end = entity.endAngleDeg;
    const angles = [entity.startAngleDeg, entity.endAngleDeg, 0, 90, 180, 270].filter((angle) =>
      angleWithinArc(angle, start, end)
    );
    for (const angle of angles) {
      const radians = (normalizedDegrees(angle) * Math.PI) / 180;
      expandBoundsByPoint(bounds, [
        entity.center[0] + Math.cos(radians) * entity.radius,
        entity.center[1] + Math.sin(radians) * entity.radius,
        entity.center[2]
      ]);
    }
  } else if (entity.type === "point") {
    expandBoundsByPoint(bounds, vec3From(entity.position));
  } else if (entity.type === "ellipse") {
    for (let i = 0; i < 32; i += 1) {
      const parameter = entity.startParameter + ((entity.endParameter - entity.startParameter) * i) / 31;
      expandBoundsByPoint(bounds, ellipsePoint(entity, parameter));
    }
  } else if (entity.type === "spline") {
    for (const point of splineReferencePoints(entity)) expandBoundsByPoint(bounds, point);
  } else if (entity.type === "face3d" || entity.type === "solid") {
    for (const point of entity.vertices) expandBoundsByPoint(bounds, vec3From(point));
  } else {
    const halfHeight = entity.height / 2;
    expandBoundsByPoint(bounds, [entity.position[0] - halfHeight, entity.position[1] - halfHeight, entity.position[2]]);
    expandBoundsByPoint(bounds, [entity.position[0] + halfHeight, entity.position[1] + halfHeight, entity.position[2]]);
  }
  return bounds;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantileOfSorted(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) return 0;
  const clamped = Math.min(Math.max(quantile, 0), 1);
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor((sortedValues.length - 1) * clamped)));
  return sortedValues[index];
}

export function computeSceneCentroid(centroids: readonly Vec3[]): Vec3 {
  if (centroids.length === 0) return [0, 0, 0];
  return [
    medianOf(centroids.map((c) => c[0])),
    medianOf(centroids.map((c) => c[1])),
    medianOf(centroids.map((c) => c[2]))
  ];
}

export function computeRobustSceneBounds(
  entities: readonly DrawingEntity[],
  options: RobustBoundsOptions = {}
): RobustSceneBounds {
  const distanceMultiplier = Math.max(options.distanceMultiplier ?? 5, 1);
  const iqrMultiplier = Math.max(options.iqrMultiplier ?? 6, 1);
  const topOutlierCount = Math.max(options.topOutlierCount ?? 20, 0);
  const rawBounds = emptyBounds();

  const baseRecords = entities.map((entity) => {
    const bounds = computeEntityBounds(entity);
    const size = boundsSize(bounds);
    expandBoundsByBounds(rawBounds, bounds);
    return {
      entity,
      bounds,
      centroid: computeEntityCentroid(entity),
      size,
      diagonal: vectorDiagonal(size)
    };
  });

  if (baseRecords.length === 0 || boundsIsEmpty(rawBounds)) {
    const fallback: Bounds3 = { min: [0, 0, 0], max: [0, 0, 0] };
    return {
      rawBounds: fallback,
      visibleBounds: fallback,
      fitBounds: fallback,
      outlierBounds: null,
      outlierEntityIds: [],
      mainClusterCenter: [0, 0, 0],
      entityBounds: [],
      topOutliers: []
    };
  }

  const medianCenter = computeSceneCentroid(baseRecords.map((record) => record.centroid));
  const distancesFromMedian = baseRecords.map((record) =>
    Math.hypot(record.centroid[0] - medianCenter[0], record.centroid[1] - medianCenter[1])
  );
  const sortedDistances = [...distancesFromMedian].sort((a, b) => a - b);
  const medianDistance = medianOf(sortedDistances);
  const q1Distance = quantileOfSorted(sortedDistances, 0.25);
  const q3Distance = quantileOfSorted(sortedDistances, 0.75);
  const iqrDistance = Math.max(q3Distance - q1Distance, 0);
  const distanceThreshold = Math.max(medianDistance * distanceMultiplier, q3Distance + iqrDistance * iqrMultiplier, 1);

  const mainClusterBounds = emptyBounds();
  baseRecords.forEach((record, index) => {
    if (distancesFromMedian[index] <= distanceThreshold) {
      expandBoundsByBounds(mainClusterBounds, record.bounds);
    }
  });
  if (boundsIsEmpty(mainClusterBounds)) {
    expandBoundsByBounds(mainClusterBounds, rawBounds);
  }

  const mainClusterCenter = boundsCenter(mainClusterBounds);
  const entityBounds = baseRecords.map((record, index): EntityBounds => {
    const distanceFromMainCluster = Math.hypot(
      record.centroid[0] - mainClusterCenter[0],
      record.centroid[1] - mainClusterCenter[1]
    );
    const isOutlier = distancesFromMedian[index] > distanceThreshold;
    return {
      entityId: record.entity.id,
      type: record.entity.type,
      layerId: record.entity.layerId,
      sourceRef: record.entity.sourceRef,
      bounds: record.bounds,
      centroid: record.centroid,
      size: record.size,
      diagonal: record.diagonal,
      distanceFromMainCluster,
      isOutlier
    };
  });

  const visibleBounds = emptyBounds();
  const outlierBounds = emptyBounds();
  for (const record of entityBounds) {
    if (record.isOutlier) {
      expandBoundsByBounds(outlierBounds, record.bounds);
    } else {
      expandBoundsByBounds(visibleBounds, record.bounds);
    }
  }
  if (boundsIsEmpty(visibleBounds)) {
    expandBoundsByBounds(visibleBounds, rawBounds);
  }

  const outliers = entityBounds
    .filter((record) => record.isOutlier)
    .sort((a, b) => b.distanceFromMainCluster - a.distanceFromMainCluster);

  return {
    rawBounds,
    visibleBounds,
    fitBounds: visibleBounds,
    outlierBounds: boundsIsEmpty(outlierBounds) ? null : outlierBounds,
    outlierEntityIds: outliers.map((record) => record.entityId),
    mainClusterCenter,
    entityBounds,
    topOutliers: outliers.slice(0, topOutlierCount)
  };
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
