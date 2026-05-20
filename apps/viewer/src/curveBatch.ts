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
const ELLIPSE_SEGMENTS = 48;

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

export function pointsForEllipse(entity: Extract<DrawingEntity, { type: "ellipse" }>) {
  const points: THREE.Vector3[] = [];
  const major = new THREE.Vector3(...entity.majorAxis);
  const minor = new THREE.Vector3(-entity.majorAxis[1], entity.majorAxis[0], entity.majorAxis[2]).multiplyScalar(
    entity.minorToMajorRatio
  );
  for (let i = 0; i <= ELLIPSE_SEGMENTS; i += 1) {
    const t = entity.startParameter + ((entity.endParameter - entity.startParameter) * i) / ELLIPSE_SEGMENTS;
    points.push(
      new THREE.Vector3(...entity.center)
        .add(major.clone().multiplyScalar(Math.cos(t)))
        .add(minor.clone().multiplyScalar(Math.sin(t)))
    );
  }
  return points;
}

export function pointsForSpline(entity: Extract<DrawingEntity, { type: "spline" }>) {
  const points = (entity.fitPoints.length > 1 ? entity.fitPoints : entity.controlPoints).map((point) => new THREE.Vector3(...point));
  return points;
}

function pointsForBulgedSegment(start: THREE.Vector3, end: THREE.Vector3, bulge: number) {
  if (Math.abs(bulge) < 1e-12) {
    return [start.clone(), end.clone()];
  }

  const chord = end.clone().sub(start);
  const chordLength = Math.hypot(chord.x, chord.y);
  if (chordLength < 1e-9) {
    return [start.clone(), end.clone()];
  }

  const sweep = 4 * Math.atan(bulge);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const normal = new THREE.Vector3(-chord.y / chordLength, chord.x / chordLength, 0);
  const centerOffset = (chordLength * (1 - bulge * bulge)) / (4 * bulge);
  const center = midpoint.clone().add(normal.multiplyScalar(centerOffset));
  const radius = center.distanceTo(start);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const segmentCount = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const angle = startAngle + sweep * t;
    points.push(
      new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        start.z + (end.z - start.z) * t
      )
    );
  }

  return points;
}

export function pointsForPolyline(entity: Extract<DrawingEntity, { type: "polyline" }>) {
  const vertices = entity.points.map((point) => new THREE.Vector3(...point));
  if (vertices.length < 2) return vertices;
  const points: THREE.Vector3[] = [];
  const segmentCount = entity.closed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < segmentCount; i += 1) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const segmentPoints = pointsForBulgedSegment(start, end, entity.bulges?.[i] ?? 0);
    if (points.length > 0) {
      segmentPoints.shift();
    }
    points.push(...segmentPoints);
  }

  return points;
}

export function pointsForFaceOrSolid(entity: Extract<DrawingEntity, { type: "face3d" | "solid" }>) {
  const points = entity.vertices.map((point) => new THREE.Vector3(...point));
  return points.length > 0 ? [...points, points[0].clone()] : points;
}

export function pointsForEntity(entity: DrawingEntity): THREE.Vector3[] {
  if (entity.type === "line") {
    return [new THREE.Vector3(...entity.start), new THREE.Vector3(...entity.end)];
  }

  if (entity.type === "polyline") {
    return pointsForPolyline(entity);
  }

  if (entity.type === "circle") {
    return pointsForCircle(entity);
  }

  if (entity.type === "arc") {
    return pointsForArc(entity);
  }

  if (entity.type === "point") {
    const center = new THREE.Vector3(...entity.position);
    return [center.clone().add(new THREE.Vector3(-1, 0, 0)), center.clone().add(new THREE.Vector3(1, 0, 0))];
  }

  if (entity.type === "ellipse") {
    return pointsForEllipse(entity);
  }

  if (entity.type === "spline") {
    return pointsForSpline(entity);
  }

  if (entity.type === "face3d" || entity.type === "solid") {
    return pointsForFaceOrSolid(entity);
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
