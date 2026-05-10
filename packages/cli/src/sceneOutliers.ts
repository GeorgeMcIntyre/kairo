import type { DrawingEntity, GeometryDocument } from "@kairo/schema";

export type Vec3 = readonly [number, number, number];

export type OutlierResult = {
  rank: number;
  distance: number;
  type: DrawingEntity["type"];
  layerId?: string;
  sourceRef?: string;
  entityId: string;
  centroid: Vec3;
};

export type FindOutliersOptions = {
  multiplier?: number;
};

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
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computeSceneCentroid(centroids: readonly Vec3[]): Vec3 {
  if (centroids.length === 0) return [0, 0, 0];
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const c of centroids) {
    xs.push(c[0]);
    ys.push(c[1]);
    zs.push(c[2]);
  }
  return [median(xs), median(ys), median(zs)];
}

function distance3(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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

export function findOutliers(
  entities: readonly DrawingEntity[],
  options: FindOutliersOptions = {}
): OutlierResult[] {
  const multiplier = options.multiplier ?? 3;
  if (entities.length === 0) return [];

  const centroids: Vec3[] = entities.map((entity) => computeEntityCentroid(entity));
  const sceneCentroid = computeSceneCentroid(centroids);

  const distances = centroids.map((c) => distance3(c, sceneCentroid));
  const medianDistance = median(distances);
  const threshold = medianDistance * multiplier;

  const outliers: Array<{ entity: DrawingEntity; centroid: Vec3; distance: number }> = [];
  for (let i = 0; i < entities.length; i++) {
    if (distances[i] > threshold && distances[i] > 0) {
      outliers.push({ entity: entities[i], centroid: centroids[i], distance: distances[i] });
    }
  }

  outliers.sort((a, b) => b.distance - a.distance);

  return outliers.map((o, idx) => ({
    rank: idx + 1,
    distance: o.distance,
    type: o.entity.type,
    layerId: o.entity.layerId,
    sourceRef: o.entity.sourceRef,
    entityId: o.entity.id,
    centroid: o.centroid
  }));
}
