import type { Bounds3 } from "@kairo/core";
import type { DeviceSemantic } from "@kairo/semantic";
import type { EquipmentLibraryMatch } from "./equipmentLibrary";

export type EquipmentFootprintSource = "geometry-bounds" | "candidate-geometry-bounds" | "library-default" | "label-bounds";

export type EquipmentEnvelope = {
  footprintBounds: Bounds3;
  clearanceBounds: Bounds3;
  paddedBounds: Bounds3;
  footprintSource: EquipmentFootprintSource;
  clearanceReason?: string;
  paddingMm: number;
  requiresReview: boolean;
  evidence: string[];
};

function boundsWidth(bounds: Bounds3): number {
  return Math.max(0, bounds.max[0] - bounds.min[0]);
}

function boundsDepth(bounds: Bounds3): number {
  return Math.max(0, bounds.max[1] - bounds.min[1]);
}

function boundsIsUsable(bounds: Bounds3 | undefined): bounds is Bounds3 {
  if (!bounds) return false;
  return Number.isFinite(bounds.min[0]) && Number.isFinite(bounds.max[0]) && boundsWidth(bounds) > 0 && boundsDepth(bounds) > 0;
}

function boundsCenter(bounds: Bounds3): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
}

function boundsFromCenter(center: readonly [number, number, number], width: number, depth: number): Bounds3 {
  const halfWidth = Math.max(width, 1) / 2;
  const halfDepth = Math.max(depth, 1) / 2;
  return {
    min: [center[0] - halfWidth, center[1] - halfDepth, center[2]],
    max: [center[0] + halfWidth, center[1] + halfDepth, center[2]]
  };
}

function expandUniform(bounds: Bounds3, amount: number): Bounds3 {
  const safeAmount = Math.max(0, amount);
  return {
    min: [bounds.min[0] - safeAmount, bounds.min[1] - safeAmount, bounds.min[2]],
    max: [bounds.max[0] + safeAmount, bounds.max[1] + safeAmount, bounds.max[2]]
  };
}

function expandClearance(bounds: Bounds3, equipment: EquipmentLibraryMatch | undefined): Bounds3 {
  if (!equipment) return bounds;
  const clearance = equipment.item.clearance;
  return {
    min: [bounds.min[0] - clearance.leftMm, bounds.min[1] - clearance.rearMm, bounds.min[2]],
    max: [bounds.max[0] + clearance.rightMm, bounds.max[1] + clearance.frontMm, bounds.max[2]]
  };
}

function linkedCandidateBounds(device: DeviceSemantic): Bounds3 | undefined {
  if (!device.geometryGroupId) return undefined;
  return device.associationCandidates.find((candidate) => candidate.groupId === device.geometryGroupId)?.bounds;
}

function bestCandidateBounds(device: DeviceSemantic): Bounds3 | undefined {
  return device.associationCandidates[0]?.bounds;
}

function fallbackBounds(device: DeviceSemantic, equipment: EquipmentLibraryMatch | undefined): Bounds3 {
  if (!equipment) return device.bounds;
  return boundsFromCenter(boundsCenter(device.bounds), equipment.item.footprint.widthMm, equipment.item.footprint.depthMm);
}

export function buildEquipmentEnvelope(device: DeviceSemantic, equipment: EquipmentLibraryMatch | undefined): EquipmentEnvelope {
  const evidence: string[] = [];
  let footprintBounds: Bounds3;
  let footprintSource: EquipmentFootprintSource;
  let requiresReview = equipment?.requiresReview ?? true;

  const linkedBounds = device.associationStatus === "linked" ? linkedCandidateBounds(device) : undefined;
  const candidateBounds = device.associationStatus === "ambiguous" ? bestCandidateBounds(device) : undefined;
  if (boundsIsUsable(linkedBounds)) {
    footprintBounds = linkedBounds;
    footprintSource = "geometry-bounds";
    evidence.push(`footprint from linked geometry group ${device.geometryGroupId}`);
  } else if (boundsIsUsable(candidateBounds)) {
    footprintBounds = candidateBounds;
    footprintSource = "candidate-geometry-bounds";
    requiresReview = true;
    evidence.push("footprint from best ambiguous geometry candidate");
  } else if (equipment) {
    footprintBounds = fallbackBounds(device, equipment);
    footprintSource = "library-default";
    requiresReview = true;
    evidence.push(`footprint from ${equipment.item.equipmentTypeId} library default`);
  } else {
    footprintBounds = device.bounds;
    footprintSource = "label-bounds";
    requiresReview = true;
    evidence.push("footprint from label bounds because no equipment library match exists");
  }

  const clearanceBounds = expandClearance(footprintBounds, equipment);
  const paddingMm = equipment?.item.defaultPaddingMm ?? 0;
  const paddedBounds = expandUniform(clearanceBounds, paddingMm);
  if (equipment) evidence.push(equipment.item.clearance.reason);
  if (paddingMm > 0) evidence.push(`padding ${paddingMm} mm`);

  return {
    footprintBounds,
    clearanceBounds,
    paddedBounds,
    footprintSource,
    clearanceReason: equipment?.item.clearance.reason,
    paddingMm,
    requiresReview,
    evidence
  };
}
