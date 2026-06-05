import {
  computeEntityBounds,
  computeEntityCentroid,
  parseSourceRef,
  type Bounds3,
  type Vec3
} from "@kairo/core";
import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import type { DeviceDictionaryMatch } from "./deviceDictionary";
import type { LayoutSemanticOptions, SemanticTextLabel } from "./layoutSemantics";

export type SemanticGeometryGroupSource = "block-insert" | "cluster";

export type SemanticGeometryGroup = {
  id: string;
  source: SemanticGeometryGroupSource;
  entityIds: string[];
  sourceRefs: string[];
  layerIds: string[];
  layerNames: string[];
  insertHandle?: string;
  blockName?: string;
  bounds: Bounds3;
  centroid: Vec3;
  diagonal: number;
};

export type DeviceGeometryAssociationStatus = "linked" | "ambiguous" | "unlinked";

export type DeviceGeometryAssociationCandidate = {
  groupId: string;
  source: SemanticGeometryGroupSource;
  entityIds: string[];
  bounds: Bounds3;
  centroid: Vec3;
  distanceToBounds: number;
  distanceToCentroid: number;
  confidence: number;
  reason: string[];
};

export type DeviceGeometryAssociation = {
  status: DeviceGeometryAssociationStatus;
  confidence: number;
  reason: string[];
  group?: SemanticGeometryGroup;
  candidates: DeviceGeometryAssociationCandidate[];
};

type MutableBounds3 = {
  min: [number, number, number];
  max: [number, number, number];
};

type MutableGeometryGroup = Omit<SemanticGeometryGroup, "bounds" | "centroid" | "diagonal"> & {
  bounds: MutableBounds3;
  centroidTotal: [number, number, number];
};

const DEFAULT_CLUSTER_CELL_SIZE = 1800;
const DEFAULT_ASSOCIATION_RADIUS = 3200;

function emptyBounds(): MutableBounds3 {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function boundsIsEmpty(bounds: Bounds3): boolean {
  return bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1] || bounds.min[2] > bounds.max[2];
}

function expandBounds(bounds: MutableBounds3, other: Bounds3) {
  if (boundsIsEmpty(other)) return;
  bounds.min[0] = Math.min(bounds.min[0], other.min[0]);
  bounds.min[1] = Math.min(bounds.min[1], other.min[1]);
  bounds.min[2] = Math.min(bounds.min[2], other.min[2]);
  bounds.max[0] = Math.max(bounds.max[0], other.max[0]);
  bounds.max[1] = Math.max(bounds.max[1], other.max[1]);
  bounds.max[2] = Math.max(bounds.max[2], other.max[2]);
}

function finalizedBounds(bounds: MutableBounds3): Bounds3 {
  if (!boundsIsEmpty(bounds)) return bounds;
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

function boundsCenter(bounds: Bounds3): Vec3 {
  if (boundsIsEmpty(bounds)) return [0, 0, 0];
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
}

function boundsDiagonal(bounds: Bounds3): number {
  if (boundsIsEmpty(bounds)) return 0;
  return Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2]
  );
}

function distance2d(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function distanceToBounds2d(point: Vec3, bounds: Bounds3): number {
  const dx = point[0] < bounds.min[0] ? bounds.min[0] - point[0] : point[0] > bounds.max[0] ? point[0] - bounds.max[0] : 0;
  const dy = point[1] < bounds.min[1] ? bounds.min[1] - point[1] : point[1] > bounds.max[1] ? point[1] - bounds.max[1] : 0;
  return Math.hypot(dx, dy);
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function layerNameMap(scenePackage: ScenePackage): Map<string, string> {
  return new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer.name]));
}

function geometryGroupForBlock(entity: DrawingEntity) {
  if (!entity.sourceRef) return undefined;
  const parsed = parseSourceRef(entity.sourceRef);
  if (parsed.kind !== "block-child") return undefined;
  return {
    id: `insert-${slug(parsed.insertHandle)}-${slug(parsed.blockName)}`,
    insertHandle: parsed.insertHandle,
    blockName: parsed.blockName
  };
}

function clusterKeyFor(entity: DrawingEntity, layerId: string | undefined, cellSize: number): string {
  const centroid = computeEntityCentroid(entity);
  const cellX = Math.floor(centroid[0] / cellSize);
  const cellY = Math.floor(centroid[1] / cellSize);
  return `cluster-${slug(layerId ?? "none")}-${cellX}-${cellY}`;
}

function addToGroup(group: MutableGeometryGroup, entity: DrawingEntity, layerId: string | undefined, layerName?: string) {
  const bounds = computeEntityBounds(entity);
  const centroid = computeEntityCentroid(entity);
  group.entityIds.push(entity.id);
  if (entity.sourceRef) group.sourceRefs.push(entity.sourceRef);
  if (layerId && !group.layerIds.includes(layerId)) group.layerIds.push(layerId);
  if (layerName && !group.layerNames.includes(layerName)) group.layerNames.push(layerName);
  expandBounds(group.bounds, bounds);
  group.centroidTotal[0] += centroid[0];
  group.centroidTotal[1] += centroid[1];
  group.centroidTotal[2] += centroid[2];
}

function finalizeGroup(group: MutableGeometryGroup): SemanticGeometryGroup {
  const bounds = finalizedBounds(group.bounds);
  const count = Math.max(group.entityIds.length, 1);
  const averageCentroid: Vec3 = [
    group.centroidTotal[0] / count,
    group.centroidTotal[1] / count,
    group.centroidTotal[2] / count
  ];
  return {
    id: group.id,
    source: group.source,
    entityIds: group.entityIds,
    sourceRefs: group.sourceRefs,
    layerIds: group.layerIds,
    layerNames: group.layerNames,
    insertHandle: group.insertHandle,
    blockName: group.blockName,
    bounds,
    centroid: boundsIsEmpty(bounds) ? averageCentroid : boundsCenter(bounds),
    diagonal: boundsDiagonal(bounds)
  };
}

export function buildSemanticGeometryGroups(
  scenePackage: ScenePackage,
  options: Pick<LayoutSemanticOptions, "outlierEntityIds" | "geometryClusterCellSize"> = {}
): SemanticGeometryGroup[] {
  const layers = layerNameMap(scenePackage);
  const cellSize = Math.max(options.geometryClusterCellSize ?? DEFAULT_CLUSTER_CELL_SIZE, 100);
  const groups = new Map<string, MutableGeometryGroup>();

  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      for (const entity of geometry.entities) {
        if (entity.type === "text") continue;
        if (options.outlierEntityIds?.has(entity.id)) continue;
        const layerId = entity.layerId ?? geometry.layerId;
        const blockGroup = geometryGroupForBlock(entity);
        const id = blockGroup?.id ?? clusterKeyFor(entity, layerId, cellSize);
        const existing = groups.get(id);
        const group =
          existing ??
          {
            id,
            source: blockGroup ? "block-insert" : "cluster",
            entityIds: [],
            sourceRefs: [],
            layerIds: [],
            layerNames: [],
            insertHandle: blockGroup?.insertHandle,
            blockName: blockGroup?.blockName,
            bounds: emptyBounds(),
            centroidTotal: [0, 0, 0]
          };
        addToGroup(group, entity, layerId, layerId ? layers.get(layerId) : undefined);
        groups.set(id, group);
      }
    }
  }

  return [...groups.values()].map(finalizeGroup).sort((left, right) => left.id.localeCompare(right.id));
}

function clamped(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function labelKindHint(parsed: DeviceDictionaryMatch | undefined, group: SemanticGeometryGroup): { boost: number; reasons: string[] } {
  if (!parsed) return { boost: 0, reasons: [] };
  const haystack = [group.blockName, ...group.layerNames, ...group.layerIds].filter(Boolean).join(" ").toUpperCase();
  const reasons: string[] = [];
  let boost = 0;

  if (
    (parsed.kind === "robot" || parsed.kind === "device_number" || parsed.kind === "robot_model") &&
    /\b(ROBOT|RBT|GENRO|FANUC)\b/.test(haystack)
  ) {
    boost += 0.08;
    reasons.push("robot layer/block hint");
  }

  if (parsed.kind === "dunnage" && /\b(DUNNAGE|RACK|DN|MTLONST)\b/.test(haystack)) {
    boost += 0.08;
    reasons.push("dunnage layer/block hint");
  }

  if (parsed.kind === "nest" && /\b(NEST|GENPRTO|SPAC|NUT|PED)\b/.test(haystack)) {
    boost += 0.08;
    reasons.push("nest/process tooling layer/block hint");
  }

  if ((parsed.kind === "fence" || parsed.kind === "cable_tray" || parsed.kind === "service_drop") && /\b(FENCE|FEN|CABLE|DROP)\b/.test(haystack)) {
    boost += 0.06;
    reasons.push("support-equipment layer/block hint");
  }

  return { boost, reasons };
}

function sizeSanity(group: SemanticGeometryGroup, label: SemanticTextLabel): { adjustment: number; reason?: string } {
  if (group.diagonal < Math.max(label.height * 0.4, 1)) {
    return { adjustment: -0.08, reason: "geometry very small for label" };
  }
  if (group.diagonal > 42000) {
    return { adjustment: -0.1, reason: "geometry group very large" };
  }
  return { adjustment: 0 };
}

function candidateForGroup(
  label: SemanticTextLabel,
  group: SemanticGeometryGroup,
  parsed: DeviceDictionaryMatch | undefined,
  maxDistance: number
): DeviceGeometryAssociationCandidate | undefined {
  const distanceToBounds = distanceToBounds2d(label.position, group.bounds);
  const distanceToCentroid = distance2d(label.position, group.centroid);
  if (distanceToBounds > maxDistance && distanceToCentroid > maxDistance * 1.6) return undefined;

  const distanceConfidence = clamped(1 - distanceToBounds / maxDistance);
  const centroidConfidence = clamped(1 - distanceToCentroid / (maxDistance * 1.6));
  const labelConfidence = parsed?.confidence ?? 0.32;
  const hint = labelKindHint(parsed, group);
  const sanity = sizeSanity(group, label);
  const confidence = clamped(
    labelConfidence * 0.55 + distanceConfidence * 0.3 + centroidConfidence * 0.1 + hint.boost + sanity.adjustment,
    0.04,
    0.98
  );
  const reason = [
    ...(parsed?.evidence ?? ["label pattern not classified"]),
    `distance to group ${Math.round(distanceToBounds)} mm`,
    `centroid distance ${Math.round(distanceToCentroid)} mm`,
    group.source === "block-insert" ? `block insert ${group.blockName ?? group.insertHandle ?? group.id}` : "nearby geometry cluster",
    ...hint.reasons,
    ...(sanity.reason ? [sanity.reason] : [])
  ];

  return {
    groupId: group.id,
    source: group.source,
    entityIds: group.entityIds,
    bounds: group.bounds,
    centroid: group.centroid,
    distanceToBounds,
    distanceToCentroid,
    confidence,
    reason
  };
}

function isAmbiguous(
  best: DeviceGeometryAssociationCandidate,
  next: DeviceGeometryAssociationCandidate | undefined
): boolean {
  if (!next) return false;
  const confidenceGap = best.confidence - next.confidence;
  const distanceGap = Math.abs(best.distanceToBounds - next.distanceToBounds);
  const closeDistance = distanceGap <= Math.max(250, Math.min(best.distanceToBounds, next.distanceToBounds) * 0.35);
  return confidenceGap <= 0.08 && closeDistance;
}

function maxAssociationDistance(label: SemanticTextLabel, options: Pick<LayoutSemanticOptions, "deviceAssociationRadius">): number {
  if (label.associationRadius !== undefined) {
    return Math.max(label.associationRadius, 250);
  }
  return Math.max(options.deviceAssociationRadius ?? DEFAULT_ASSOCIATION_RADIUS, label.height * 16, 250);
}

export function associateLabelToGeometry(
  label: SemanticTextLabel,
  groups: readonly SemanticGeometryGroup[],
  parsed?: DeviceDictionaryMatch,
  options: Pick<LayoutSemanticOptions, "deviceAssociationRadius"> = {}
): DeviceGeometryAssociation {
  const maxDistance = maxAssociationDistance(label, options);
  const candidates = groups
    .map((group) => candidateForGroup(label, group, parsed, maxDistance))
    .filter((candidate): candidate is DeviceGeometryAssociationCandidate => candidate !== undefined)
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.distanceToBounds - right.distanceToBounds ||
        left.groupId.localeCompare(right.groupId)
    )
    .slice(0, 5);

  const best = candidates[0];
  if (!best) {
    return {
      status: "unlinked",
      confidence: clamped((parsed?.confidence ?? 0.25) * 0.35, 0.04, 0.45),
      reason: [...(parsed?.evidence ?? ["label pattern not classified"]), "no nearby geometry group found"],
      candidates: []
    };
  }

  const group = groups.find((entry) => entry.id === best.groupId);
  const ambiguous = isAmbiguous(best, candidates[1]);
  if (ambiguous) {
    return {
      status: "ambiguous",
      confidence: Math.min(best.confidence, 0.68),
      reason: [...best.reason, "multiple nearby geometry groups score similarly"],
      group,
      candidates
    };
  }

  return {
    status: "linked",
    confidence: best.confidence,
    reason: best.reason,
    group,
    candidates
  };
}
