import type { DrawingEntity, Geometry } from "@kairo/schema";
import * as THREE from "three";

export type PickableCurveEntity = {
  entityId: string;
  sourceRef?: string;
  type: DrawingEntity["type"];
  layerId?: string;
};

export type CurveSegmentPickEntry = PickableCurveEntity & {
  startVertexIndex: number;
  segmentIndex: number;
};

export type CurveBatchData = {
  positions: number[];
  pickEntriesBySegment: CurveSegmentPickEntry[];
};

export type CurveBatchOptions = {
  hiddenEntityIds?: ReadonlySet<string>;
};

const CIRCLE_SEGMENTS = 32;
const ARC_SEGMENTS = 24;

export function pointsForCircle(entity: Extract<DrawingEntity, { type: "circle" }>) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i += 1) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        entity.center[0] + Math.cos(angle) * entity.radius,
        entity.center[1] + Math.sin(angle) * entity.radius,
        entity.center[2]
      )
    );
  }
  return points;
}

export function pointsForArc(entity: Extract<DrawingEntity, { type: "arc" }>) {
  const points: THREE.Vector3[] = [];
  const start = THREE.MathUtils.degToRad(entity.startAngleDeg);
  const end = THREE.MathUtils.degToRad(entity.endAngleDeg);
  for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
    const angle = start + ((end - start) * i) / ARC_SEGMENTS;
    points.push(
      new THREE.Vector3(
        entity.center[0] + Math.cos(angle) * entity.radius,
        entity.center[1] + Math.sin(angle) * entity.radius,
        entity.center[2]
      )
    );
  }
  return points;
}

export function pointsForEntity(entity: DrawingEntity): THREE.Vector3[] {
  if (entity.type === "line") {
    return [new THREE.Vector3(...entity.start), new THREE.Vector3(...entity.end)];
  }

  if (entity.type === "polyline") {
    const points = entity.points.map((point) => new THREE.Vector3(...point));
    return entity.closed ? [...points, points[0].clone()] : points;
  }

  if (entity.type === "circle") {
    return pointsForCircle(entity);
  }

  if (entity.type === "arc") {
    return pointsForArc(entity);
  }

  return [];
}

export function createCurveBatchData(
  geometry: Extract<Geometry, { kind: "curve-set" }>,
  fallbackLayerId?: string,
  options: CurveBatchOptions = {}
): CurveBatchData {
  const positions: number[] = [];
  const pickEntriesBySegment: CurveSegmentPickEntry[] = [];

  for (const entity of geometry.entities) {
    if (options.hiddenEntityIds?.has(entity.id)) {
      continue;
    }

    const points = pointsForEntity(entity);
    const pickable: PickableCurveEntity = {
      entityId: entity.id,
      sourceRef: entity.sourceRef,
      type: entity.type,
      layerId: entity.layerId ?? fallbackLayerId ?? geometry.layerId
    };

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const startVertexIndex = positions.length / 3;
      const segmentIndex = pickEntriesBySegment.length;
      const entry = {
        ...pickable,
        startVertexIndex,
        segmentIndex
      };
      positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      pickEntriesBySegment.push(entry);
    }
  }

  return { positions, pickEntriesBySegment };
}

export function pickEntryForIntersectionIndex(
  index: number | undefined,
  entriesBySegment: readonly CurveSegmentPickEntry[]
): CurveSegmentPickEntry | undefined {
  if (index === undefined || !Number.isInteger(index) || index < 0) {
    return undefined;
  }

  return entriesBySegment[Math.floor(index / 2)];
}
