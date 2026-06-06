import type { Bounds3, Vec3 } from "@kairo/core";
import type { SemanticNoteKind } from "./textSafety";
import type { DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics } from "./layoutSemantics";

export type SemanticDeviceOverride = {
  kind?: DeviceKind;
  geometryGroupId?: string;
  unlink?: boolean;
};

export type SemanticOverrideMap = Record<string, SemanticDeviceOverride>;

export type SemanticSummaryDevice = {
  deviceId: string;
  label: string;
  rawLabel?: string;
  displayLabel?: string;
  associationText?: string;
  noteKind?: SemanticNoteKind;
  kind: DeviceKind;
  confidence: number;
  associationStatus: DeviceSemantic["associationStatus"];
  associationConfidence: number;
  stationId?: string;
  linkedEntityCount: number;
  labelEntityIds: string[];
  linkedEntityIds: string[];
  candidateGroupIds: string[];
  reason: string[];
  bounds: Bounds3;
  centroid: Vec3;
};

export type SemanticSummary = {
  sourcePath?: string;
  counts: {
    stations: number;
    devices: number;
    linkedDevices: number;
    ambiguousDevices: number;
    unlinkedDevices: number;
    unknownLabels: number;
    lowConfidenceDevices: number;
    byKind: Record<string, number>;
  };
  stations: Array<{
    stationId: string;
    processName: string;
    confidence: number;
    deviceCount: number;
  }>;
  devices: SemanticSummaryDevice[];
  warnings: string[];
};

function boundsIsEmpty(bounds: Bounds3): boolean {
  return bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1] || bounds.min[2] > bounds.max[2];
}

function mergeBounds(bounds: readonly Bounds3[]): Bounds3 {
  const merged: { min: [number, number, number]; max: [number, number, number] } = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
  for (const bound of bounds) {
    if (boundsIsEmpty(bound)) continue;
    merged.min[0] = Math.min(merged.min[0], bound.min[0]);
    merged.min[1] = Math.min(merged.min[1], bound.min[1]);
    merged.min[2] = Math.min(merged.min[2], bound.min[2]);
    merged.max[0] = Math.max(merged.max[0], bound.max[0]);
    merged.max[1] = Math.max(merged.max[1], bound.max[1]);
    merged.max[2] = Math.max(merged.max[2], bound.max[2]);
  }
  if (!boundsIsEmpty(merged)) return merged;
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

function uniqueReasons(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const value of list) {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownRow(values: readonly unknown[]): string {
  return `| ${values.map(markdownCell).join(" | ")} |`;
}

function groupByKind(devices: readonly DeviceSemantic[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const device of devices) {
    counts[device.kind] = (counts[device.kind] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function applySemanticDeviceOverrides(
  semantics: LayoutSemantics,
  overrides: SemanticOverrideMap
): LayoutSemantics {
  const groupsById = new Map(semantics.geometryGroups.map((group) => [group.id, group]));
  const textBoundsById = new Map(semantics.textEntities.map((text) => [text.entityId, text.bounds]));
  const devices = semantics.devices.map((device): DeviceSemantic => {
    const override = overrides[device.id];
    if (!override) return device;

    let next: DeviceSemantic = {
      ...device,
      kind: override.kind ?? device.kind,
      evidence: override.kind && override.kind !== device.kind
        ? [...device.evidence, `manual class override to ${override.kind}`]
        : device.evidence
    };

    if (override.unlink) {
      return {
        ...next,
        geometryGroupId: undefined,
        geometryGroupSource: undefined,
        linkedEntityIds: [],
        nearbyEntityIds: [],
        associationStatus: "unlinked",
        associationConfidence: 1,
        associationReason: ["manual unlink override"],
        evidence: [...next.evidence, "manual unlink override"]
      };
    }

    if (!override.geometryGroupId) return next;
    const group = groupsById.get(override.geometryGroupId);
    if (!group) return next;
    const labelBounds = device.sourceTextEntityIds
      .map((id) => textBoundsById.get(id))
      .filter((bounds): bounds is Bounds3 => Boolean(bounds));

    next = {
      ...next,
      geometryGroupId: group.id,
      geometryGroupSource: group.source,
      linkedEntityIds: group.entityIds,
      nearbyEntityIds: group.entityIds,
      bounds: mergeBounds([...(labelBounds.length > 0 ? labelBounds : [device.bounds]), group.bounds]),
      centroid: group.centroid,
      associationStatus: "linked",
      associationConfidence: 1,
      associationReason: [`manual geometry override to ${group.id}`],
      evidence: [...next.evidence, `manual geometry override to ${group.id}`]
    };

    return next;
  });

  return { ...semantics, devices };
}

function summaryReasonsForDevice(device: DeviceSemantic): string[] {
  return uniqueReasons(device.evidence, device.associationReason);
}

function warningList(semantics: LayoutSemantics): string[] {
  const warnings: string[] = [];
  const ambiguous = semantics.devices.filter((device) => device.associationStatus === "ambiguous");
  const unlinked = semantics.devices.filter((device) => device.associationStatus === "unlinked");
  const lowConfidence = semantics.devices.filter((device) => device.confidence < 0.55);
  if (ambiguous.length > 0) warnings.push(`${ambiguous.length} device label(s) have ambiguous nearby geometry.`);
  if (unlinked.length > 0) warnings.push(`${unlinked.length} device label(s) have no linked geometry.`);
  if (lowConfidence.length > 0) warnings.push(`${lowConfidence.length} device candidate(s) are below 0.55 confidence.`);
  if (semantics.unknownTextEntities.length > 0) warnings.push(`${semantics.unknownTextEntities.length} text label(s) are unclassified.`);
  return warnings;
}

export function buildSemanticSummary(semantics: LayoutSemantics, sourcePath?: string): SemanticSummary {
  const linkedDevices = semantics.devices.filter((device) => device.associationStatus === "linked");
  const ambiguousDevices = semantics.devices.filter((device) => device.associationStatus === "ambiguous");
  const unlinkedDevices = semantics.devices.filter((device) => device.associationStatus === "unlinked");
  const lowConfidenceDevices = semantics.devices.filter((device) => device.confidence < 0.55);

  return {
    sourcePath,
    counts: {
      stations: semantics.stations.length,
      devices: semantics.devices.length,
      linkedDevices: linkedDevices.length,
      ambiguousDevices: ambiguousDevices.length,
      unlinkedDevices: unlinkedDevices.length,
      unknownLabels: semantics.unknownTextEntities.length,
      lowConfidenceDevices: lowConfidenceDevices.length,
      byKind: groupByKind(semantics.devices)
    },
    stations: semantics.stations.map((station) => ({
      stationId: station.stationId,
      processName: station.processName,
      confidence: station.confidence,
      deviceCount: station.deviceIds.length
    })),
    devices: semantics.devices.map((device) => ({
      deviceId: device.id,
      label: device.rawText ?? device.labelText,
      rawLabel: device.rawText,
      displayLabel: device.displayText,
      associationText: device.associationText,
      noteKind: device.noteKind,
      kind: device.kind,
      confidence: device.confidence,
      associationStatus: device.associationStatus,
      associationConfidence: device.associationConfidence,
      stationId: device.stationId,
      linkedEntityCount: device.linkedEntityIds.length,
      labelEntityIds: device.sourceTextEntityIds,
      linkedEntityIds: device.linkedEntityIds,
      candidateGroupIds: device.associationCandidates.map((candidate) => candidate.groupId),
      reason: summaryReasonsForDevice(device),
      bounds: device.bounds,
      centroid: device.centroid
    })),
    warnings: warningList(semantics)
  };
}

export function exportSemanticSummaryJson(summary: SemanticSummary): string {
  return `${JSON.stringify(summary, null, 2)}\n`;
}

export function exportSemanticSummaryMarkdown(summary: SemanticSummary): string {
  const lines = [
    "# Kairo Semantic Summary",
    "",
    summary.sourcePath ? `Source: \`${summary.sourcePath}\`` : "Source: current viewer scene",
    "",
    "## Counts",
    "",
    `- Stations: ${summary.counts.stations}`,
    `- Devices: ${summary.counts.devices}`,
    `- Linked devices: ${summary.counts.linkedDevices}`,
    `- Ambiguous devices: ${summary.counts.ambiguousDevices}`,
    `- Unlinked devices: ${summary.counts.unlinkedDevices}`,
    `- Unknown labels: ${summary.counts.unknownLabels}`,
    `- Low-confidence devices: ${summary.counts.lowConfidenceDevices}`,
    "",
    "## Device Types",
    "",
    ...Object.entries(summary.counts.byKind).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Warnings",
    "",
    ...(summary.warnings.length > 0 ? summary.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "## Devices",
    "",
    markdownRow(["Label", "Type", "Station", "Confidence", "Association", "Linked entities", "Reasons"]),
    "|---|---|---|---:|---|---:|---|",
    ...summary.devices.map(
      (device) =>
        markdownRow([
          device.label,
          device.kind,
          device.stationId ?? "-",
          device.confidence.toFixed(2),
          `${device.associationStatus} (${device.associationConfidence.toFixed(2)})`,
          device.linkedEntityCount,
          device.reason.join("; ")
        ])
    )
  ];

  return `${lines.join("\n")}\n`;
}
