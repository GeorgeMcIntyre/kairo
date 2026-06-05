import type { Bounds3 } from "@kairo/core";
import type { Device, Station, WarningSeverity } from "../advancedEngineering/advancedLayout";

export type LayoutValidationRuleId =
  | "DEVICE_UNLINKED_GEOMETRY"
  | "DEVICE_AMBIGUOUS_GEOMETRY"
  | "MISSING_EQUIPMENT_LIBRARY_MATCH"
  | "FOOTPRINT_OVERLAP"
  | "CLEARANCE_OVERLAP"
  | "OUTSIDE_STATION_NEIGHBORHOOD"
  | "LOW_CONFIDENCE_BOM_ROW";

export type LayoutValidationIssue = {
  id: string;
  severity: WarningSeverity;
  ruleId: LayoutValidationRuleId;
  deviceIds: string[];
  entityIds: string[];
  message: string;
  suggestedAction: string;
};

export type LayoutValidationOptions = {
  overlapToleranceMm?: number;
  lowConfidenceThreshold?: number;
  stationNeighborhoodRadiusMm?: number;
};

const DEFAULT_OVERLAP_TOLERANCE_MM = 1;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.72;
const DEFAULT_STATION_NEIGHBORHOOD_RADIUS_MM = 25000;

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function boundsOverlapArea(left: Bounds3, right: Bounds3): number {
  const width = Math.max(0, Math.min(left.max[0], right.max[0]) - Math.max(left.min[0], right.min[0]));
  const depth = Math.max(0, Math.min(left.max[1], right.max[1]) - Math.max(left.min[1], right.min[1]));
  return width * depth;
}

function boundsCenter2d(bounds: Bounds3): { x: number; y: number } {
  return {
    x: (bounds.min[0] + bounds.max[0]) / 2,
    y: (bounds.min[1] + bounds.max[1]) / 2
  };
}

function distance2d(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function pairId(left: Device, right: Device): string {
  return [left.id, right.id].map(slug).sort().join("__");
}

function sourceIdsFor(device: Device): string[] {
  return [...device.sourceTextIds, ...device.linkedEntityIds].sort();
}

function singleDeviceIssues(device: Device, options: Required<LayoutValidationOptions>): LayoutValidationIssue[] {
  const issues: LayoutValidationIssue[] = [];

  if (device.associationStatus === "unlinked") {
    issues.push({
      id: `layout-device-unlinked-${slug(device.id)}`,
      severity: "warning",
      ruleId: "DEVICE_UNLINKED_GEOMETRY",
      deviceIds: [device.id],
      entityIds: sourceIdsFor(device),
      message: `${device.displayText} has no linked geometry and uses a fallback footprint.`,
      suggestedAction: "Link geometry to the device or mark the fallback footprint as reviewed."
    });
  }

  if (device.associationStatus === "ambiguous") {
    issues.push({
      id: `layout-device-ambiguous-${slug(device.id)}`,
      severity: "warning",
      ruleId: "DEVICE_AMBIGUOUS_GEOMETRY",
      deviceIds: [device.id],
      entityIds: sourceIdsFor(device),
      message: `${device.displayText} has ambiguous nearby geometry.`,
      suggestedAction: "Choose the intended geometry candidate before using footprint or BOM output as final."
    });
  }

  if (!device.equipmentTypeId) {
    issues.push({
      id: `layout-missing-equipment-${slug(device.id)}`,
      severity: "warning",
      ruleId: "MISSING_EQUIPMENT_LIBRARY_MATCH",
      deviceIds: [device.id],
      entityIds: sourceIdsFor(device),
      message: `${device.displayText} is not mapped to the Kairo equipment library.`,
      suggestedAction: "Add or choose an equipment library item for this device kind."
    });
  }

  if (device.confidence < options.lowConfidenceThreshold) {
    issues.push({
      id: `layout-low-confidence-bom-${slug(device.id)}`,
      severity: "info",
      ruleId: "LOW_CONFIDENCE_BOM_ROW",
      deviceIds: [device.id],
      entityIds: sourceIdsFor(device),
      message: `${device.displayText} is below the BOM confidence threshold.`,
      suggestedAction: "Review classification and geometry before relying on this BOM row."
    });
  }

  return issues;
}

function pairIssues(
  left: Device,
  right: Device,
  options: Required<LayoutValidationOptions>
): LayoutValidationIssue[] {
  const issues: LayoutValidationIssue[] = [];
  const footprintOverlap = boundsOverlapArea(left.footprintBounds, right.footprintBounds);
  if (footprintOverlap > options.overlapToleranceMm) {
    issues.push({
      id: `layout-footprint-overlap-${pairId(left, right)}`,
      severity: "critical",
      ruleId: "FOOTPRINT_OVERLAP",
      deviceIds: [left.id, right.id].sort(),
      entityIds: [...sourceIdsFor(left), ...sourceIdsFor(right)],
      message: `${left.displayText} and ${right.displayText} footprints overlap.`,
      suggestedAction: "Move one device or correct the detected footprint."
    });
    return issues;
  }

  const clearanceOverlap =
    boundsOverlapArea(left.clearanceBounds, right.footprintBounds) +
    boundsOverlapArea(right.clearanceBounds, left.footprintBounds);
  if (clearanceOverlap > options.overlapToleranceMm) {
    issues.push({
      id: `layout-clearance-overlap-${pairId(left, right)}`,
      severity: "warning",
      ruleId: "CLEARANCE_OVERLAP",
      deviceIds: [left.id, right.id].sort(),
      entityIds: [...sourceIdsFor(left), ...sourceIdsFor(right)],
      message: `${left.displayText} and ${right.displayText} clearance envelopes overlap a footprint.`,
      suggestedAction: "Review service/access clearance or adjust equipment positions."
    });
  }

  return issues;
}

function stationNeighborhoodIssues(
  device: Device,
  stationsById: ReadonlyMap<string, Station>,
  options: Required<LayoutValidationOptions>
): LayoutValidationIssue[] {
  if (!device.stationId) return [];
  const station = stationsById.get(device.stationId);
  if (!station) return [];

  const distance = distance2d(boundsCenter2d(device.footprintBounds), boundsCenter2d(station.bounds));
  if (distance <= options.stationNeighborhoodRadiusMm) return [];

  return [
    {
      id: `layout-outside-station-neighborhood-${slug(device.id)}`,
      severity: "info",
      ruleId: "OUTSIDE_STATION_NEIGHBORHOOD",
      deviceIds: [device.id],
      entityIds: sourceIdsFor(device),
      message: `${device.displayText} is far from station ${device.stationId}.`,
      suggestedAction: "Confirm station assignment or review the detected footprint location."
    }
  ];
}

function normalizeOptions(options: LayoutValidationOptions = {}): Required<LayoutValidationOptions> {
  return {
    overlapToleranceMm: options.overlapToleranceMm ?? DEFAULT_OVERLAP_TOLERANCE_MM,
    lowConfidenceThreshold: options.lowConfidenceThreshold ?? DEFAULT_LOW_CONFIDENCE_THRESHOLD,
    stationNeighborhoodRadiusMm: options.stationNeighborhoodRadiusMm ?? DEFAULT_STATION_NEIGHBORHOOD_RADIUS_MM
  };
}

export function buildLayoutValidationIssues(
  devices: readonly Device[],
  stations: readonly Station[] = [],
  options: LayoutValidationOptions = {}
): LayoutValidationIssue[] {
  const normalizedOptions = normalizeOptions(options);
  const stationsById = new Map(stations.map((station) => [station.id, station]));
  const issues: LayoutValidationIssue[] = [];

  for (const device of devices) {
    issues.push(...singleDeviceIssues(device, normalizedOptions));
    issues.push(...stationNeighborhoodIssues(device, stationsById, normalizedOptions));
  }

  for (let i = 0; i < devices.length; i += 1) {
    for (let j = i + 1; j < devices.length; j += 1) {
      issues.push(...pairIssues(devices[i], devices[j], normalizedOptions));
    }
  }

  return issues.sort((left, right) => left.id.localeCompare(right.id));
}
