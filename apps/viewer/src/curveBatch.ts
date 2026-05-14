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
  positions: Float32Array;
  pickEntriesBySegment: CurveSegmentPickEntry[];
};

export type CurveBatchOptions = {
  hiddenEntityIds?: ReadonlySet<string>;
};

const CIRCLE_SEGMENTS = 32;
const ARC_SEGMENTS = 24;

function segmentCountForEntity(entity: DrawingEntity): number {
  if (entity.type === "line") return 1;
  if (entity.type === "polyline") return Math.max(entity.points.length - 1 + (entity.closed ? 1 : 0), 0);
  if (entity.type === "circle") return CIRCLE_SEGMENTS;
  if (entity.type === "arc") return ARC_SEGMENTS;
  return 0;
}

function pushSegment(
  positions: Float32Array,
  offset: number,
  start: readonly number[],
  end: readonly number[]
): number {
  positions[offset] = start[0] ?? 0;
  positions[offset + 1] = start[1] ?? 0;
  positions[offset + 2] = start[2] ?? 0;
  positions[offset + 3] = end[0] ?? 0;
  positions[offset + 4] = end[1] ?? 0;
  positions[offset + 5] = end[2] ?? 0;
  return offset + 6;
}

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
  let segmentCount = 0;
  for (const entity of geometry.entities) {
    if (options.hiddenEntityIds?.has(entity.id)) continue;
    segmentCount += segmentCountForEntity(entity);
  }

  const positions = new Float32Array(segmentCount * 6);
  const pickEntriesBySegment: CurveSegmentPickEntry[] = [];
  let positionOffset = 0;

  for (const entity of geometry.entities) {
    if (options.hiddenEntityIds?.has(entity.id)) {
      continue;
    }

    const pickable: PickableCurveEntity = {
      entityId: entity.id,
      sourceRef: entity.sourceRef,
      type: entity.type,
      layerId: entity.layerId ?? fallbackLayerId ?? geometry.layerId
    };

    const pushPickEntry = () => {
      pickEntriesBySegment.push({
        ...pickable,
        startVertexIndex: positionOffset / 3,
        segmentIndex: pickEntriesBySegment.length
      });
    };

    if (entity.type === "line") {
      pushPickEntry();
      positionOffset = pushSegment(positions, positionOffset, entity.start, entity.end);
      continue;
    }

    if (entity.type === "polyline") {
      for (let i = 0; i < entity.points.length - 1; i += 1) {
        pushPickEntry();
        positionOffset = pushSegment(positions, positionOffset, entity.points[i], entity.points[i + 1]);
      }
      if (entity.closed && entity.points.length > 1) {
        pushPickEntry();
        positionOffset = pushSegment(positions, positionOffset, entity.points[entity.points.length - 1], entity.points[0]);
      }
      continue;
    }

    if (entity.type === "circle") {
      let previous: [number, number, number] = [entity.center[0] + entity.radius, entity.center[1], entity.center[2]];
      for (let i = 1; i <= CIRCLE_SEGMENTS; i += 1) {
        const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        const next: [number, number, number] = [
          entity.center[0] + Math.cos(angle) * entity.radius,
          entity.center[1] + Math.sin(angle) * entity.radius,
          entity.center[2]
        ];
        pushPickEntry();
        positionOffset = pushSegment(positions, positionOffset, previous, next);
        previous = next;
      }
      continue;
    }

    if (entity.type === "arc") {
      const start = THREE.MathUtils.degToRad(entity.startAngleDeg);
      const end = THREE.MathUtils.degToRad(entity.endAngleDeg);
      let previous: [number, number, number] = [
        entity.center[0] + Math.cos(start) * entity.radius,
        entity.center[1] + Math.sin(start) * entity.radius,
        entity.center[2]
      ];
      for (let i = 1; i <= ARC_SEGMENTS; i += 1) {
        const angle = start + ((end - start) * i) / ARC_SEGMENTS;
        const next: [number, number, number] = [
          entity.center[0] + Math.cos(angle) * entity.radius,
          entity.center[1] + Math.sin(angle) * entity.radius,
          entity.center[2]
        ];
        pushPickEntry();
        positionOffset = pushSegment(positions, positionOffset, previous, next);
        previous = next;
      }
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
