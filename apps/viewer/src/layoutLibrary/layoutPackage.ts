import type { Bounds3 } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import type { AdvancedLayoutModel, BomRow, Device, Line, Station } from "../advancedEngineering/advancedLayout";
import type { DeviceKind } from "../semantic/deviceDictionary";
import type { LayoutSemantics, SemanticTextEntity } from "../semantic/layoutSemantics";

export type LayoutPackageSchema = "kairo-layout-library-package";
export type LayoutPackageSchemaVersion = 1;
export type ReviewStatus = "accepted" | "corrected" | "rejected" | "uncertain";

export type SourceDxfMetadata = {
  format?: string;
  path?: string;
  displayName: string;
  units: string;
  axisUp: string;
  handedness: string;
};

export type ExtractedLabel = {
  id: string;
  rawText: string;
  normalizedText: string;
  displayText: string;
  sourceKind: string;
  layerId?: string;
  bounds: Bounds3;
};

export type DeviceClassification = {
  id: string;
  sourceDeviceId: string;
  detectedLabel: string;
  classifiedDeviceType: DeviceKind;
  equipmentTypeId?: string;
  equipmentDisplayName?: string;
  stationId?: string;
  confidence: number;
  reason: string[];
  reviewStatus: ReviewStatus;
};

export type GeometryAssociation = {
  id: string;
  sourceDeviceId: string;
  detectedLabel: string;
  status: Device["associationStatus"];
  associatedEntityIds: string[];
  geometryGroupId?: string;
  confidence: number;
  reason: string[];
  bounds: Bounds3;
};

export type StationCellGroupingCandidate = {
  id: string;
  kind: "line" | "station";
  parentId?: string;
  label: string;
  stationIds: string[];
  deviceIds: string[];
  confidence: number;
  evidence: string[];
  bounds: Bounds3;
};

export type LayoutLibraryItem = {
  id: string;
  sourceDeviceId: string;
  sourceBomRowId?: string;
  label: string;
  itemType: DeviceKind;
  equipmentTypeId?: string;
  equipmentDisplayName?: string;
  stationId?: string;
  sourceEntityIds: string[];
  footprintBounds: Bounds3;
  clearanceBounds: Bounds3;
  paddedBounds: Bounds3;
  confidence: number;
  reviewStatus: ReviewStatus;
  evidence: string[];
};

export type LayoutTrainingRecord = {
  id: string;
  detectedItemId: string;
  detectedLabel: string;
  detectedItemType: DeviceKind;
  expectedItemType: DeviceKind;
  correctedItemType?: DeviceKind;
  confidence: number;
  reason: string[];
  reviewerStatus: ReviewStatus;
  notes: string;
  sourceEntityIds: string[];
  linkedLibraryItemId: string;
};

export type LayoutPackageSummary = {
  extractedLabels: number;
  classifiedDevices: number;
  geometryAssociations: number;
  stationCellCandidates: number;
  libraryItemCandidates: number;
  trainingRecords: number;
  acceptedTrainingRecords: number;
  uncertainTrainingRecords: number;
};

export type LayoutPackage = {
  schema: LayoutPackageSchema;
  schemaVersion: LayoutPackageSchemaVersion;
  source: SourceDxfMetadata;
  extractedLabels: ExtractedLabel[];
  deviceClassifications: DeviceClassification[];
  geometryAssociations: GeometryAssociation[];
  stationCellGroupingCandidates: StationCellGroupingCandidate[];
  libraryItemCandidates: LayoutLibraryItem[];
  trainingPack: LayoutTrainingRecord[];
  bomRows: BomRow[];
  summary: LayoutPackageSummary;
};

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sourceDisplayName(path: string | undefined): string {
  if (!path) return "current viewer scene";
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? "current viewer scene";
}

function reviewStatusForDevice(device: Device): ReviewStatus {
  if (device.associationStatus !== "linked") return "uncertain";
  if (!device.equipmentTypeId) return "uncertain";
  if (device.confidence < 0.72) return "uncertain";
  return "accepted";
}

function sourceEntityIdsForDevice(device: Device): string[] {
  return uniqueSorted([...device.sourceTextIds, ...device.linkedEntityIds]);
}

function buildSource(scenePackage: ScenePackage): SourceDxfMetadata {
  const source = scenePackage.manifest.source;
  return {
    format: source.format,
    path: source.path,
    displayName: sourceDisplayName(source.path),
    units: scenePackage.manifest.units,
    axisUp: scenePackage.manifest.axisSystem.up,
    handedness: scenePackage.manifest.axisSystem.handedness
  };
}

function labelRow(text: SemanticTextEntity): ExtractedLabel {
  return {
    id: text.entityId,
    rawText: text.rawText ?? text.text,
    normalizedText: text.normalizedText,
    displayText: text.displayText ?? text.normalizedText,
    sourceKind: text.sourceKind,
    layerId: text.layerId,
    bounds: text.bounds
  };
}

function classificationForDevice(device: Device): DeviceClassification {
  return {
    id: `classification-${slug(device.id)}`,
    sourceDeviceId: device.id,
    detectedLabel: device.primaryLabel,
    classifiedDeviceType: device.kind,
    equipmentTypeId: device.equipmentTypeId,
    equipmentDisplayName: device.equipmentDisplayName,
    stationId: device.stationId,
    confidence: device.confidence,
    reason: device.evidence,
    reviewStatus: reviewStatusForDevice(device)
  };
}

function geometryAssociationForDevice(device: Device): GeometryAssociation {
  return {
    id: `geometry-association-${slug(device.id)}`,
    sourceDeviceId: device.id,
    detectedLabel: device.primaryLabel,
    status: device.associationStatus,
    associatedEntityIds: uniqueSorted(device.linkedEntityIds),
    geometryGroupId: device.geometryGroupId,
    confidence: device.associationStatus === "linked" ? device.confidence : Math.min(device.confidence, 0.5),
    reason: device.evidence.filter((entry) => /geometry|candidate|cluster|block|nearby|linked/i.test(entry)),
    bounds: device.bounds
  };
}

function stationCandidate(station: Station): StationCellGroupingCandidate {
  return {
    id: `station-cell-${slug(station.id)}`,
    kind: "station",
    parentId: station.lineId,
    label: station.id,
    stationIds: [station.id],
    deviceIds: station.deviceIds,
    confidence: station.confidence,
    evidence: station.evidence,
    bounds: station.bounds
  };
}

function lineCandidate(line: Line): StationCellGroupingCandidate {
  return {
    id: `line-cell-${slug(line.id)}`,
    kind: "line",
    label: line.name,
    stationIds: line.stationIds,
    deviceIds: [],
    confidence: line.confidence,
    evidence: line.evidence,
    bounds: line.bounds
  };
}

function bomRowForDevice(device: Device, bomRows: readonly BomRow[]): BomRow | undefined {
  return bomRows.find((row) => row.sourceDeviceIds.includes(device.id));
}

function libraryItemForDevice(device: Device, bomRows: readonly BomRow[]): LayoutLibraryItem {
  const sourceBomRow = bomRowForDevice(device, bomRows);
  return {
    id: `library-item-${slug(device.id)}`,
    sourceDeviceId: device.id,
    sourceBomRowId: sourceBomRow?.id,
    label: device.primaryLabel,
    itemType: device.kind,
    equipmentTypeId: device.equipmentTypeId,
    equipmentDisplayName: device.equipmentDisplayName,
    stationId: device.stationId,
    sourceEntityIds: sourceEntityIdsForDevice(device),
    footprintBounds: device.footprintBounds,
    clearanceBounds: device.clearanceBounds,
    paddedBounds: device.paddedBounds,
    confidence: device.confidence,
    reviewStatus: reviewStatusForDevice(device),
    evidence: device.evidence
  };
}

function trainingRecordForDevice(device: Device): LayoutTrainingRecord {
  const reviewStatus = reviewStatusForDevice(device);
  return {
    id: `training-record-${slug(device.id)}`,
    detectedItemId: device.id,
    detectedLabel: device.primaryLabel,
    detectedItemType: device.kind,
    expectedItemType: device.kind,
    confidence: device.confidence,
    reason: device.evidence,
    reviewerStatus: reviewStatus,
    notes: reviewStatus === "accepted" ? "Seed record from deterministic semantic extraction." : "Needs reviewer confirmation before training use.",
    sourceEntityIds: sourceEntityIdsForDevice(device),
    linkedLibraryItemId: `library-item-${slug(device.id)}`
  };
}

function buildSummary(layoutPackage: Omit<LayoutPackage, "summary">): LayoutPackageSummary {
  return {
    extractedLabels: layoutPackage.extractedLabels.length,
    classifiedDevices: layoutPackage.deviceClassifications.length,
    geometryAssociations: layoutPackage.geometryAssociations.length,
    stationCellCandidates: layoutPackage.stationCellGroupingCandidates.length,
    libraryItemCandidates: layoutPackage.libraryItemCandidates.length,
    trainingRecords: layoutPackage.trainingPack.length,
    acceptedTrainingRecords: layoutPackage.trainingPack.filter((record) => record.reviewerStatus === "accepted").length,
    uncertainTrainingRecords: layoutPackage.trainingPack.filter((record) => record.reviewerStatus === "uncertain").length
  };
}

export function buildLayoutPackage(
  scenePackage: ScenePackage,
  semantics: LayoutSemantics,
  advancedLayout: AdvancedLayoutModel
): LayoutPackage {
  const packageWithoutSummary = {
    schema: "kairo-layout-library-package" as const,
    schemaVersion: 1 as const,
    source: buildSource(scenePackage),
    extractedLabels: semantics.textEntities.map(labelRow).sort((left, right) => left.id.localeCompare(right.id)),
    deviceClassifications: advancedLayout.devices.map(classificationForDevice).sort((left, right) => left.id.localeCompare(right.id)),
    geometryAssociations: advancedLayout.devices.map(geometryAssociationForDevice).sort((left, right) => left.id.localeCompare(right.id)),
    stationCellGroupingCandidates: [
      ...advancedLayout.lines.map(lineCandidate),
      ...advancedLayout.stations.map(stationCandidate)
    ].sort((left, right) => left.id.localeCompare(right.id)),
    libraryItemCandidates: advancedLayout.devices
      .map((device) => libraryItemForDevice(device, advancedLayout.bomRows))
      .sort((left, right) => left.id.localeCompare(right.id)),
    trainingPack: advancedLayout.devices.map(trainingRecordForDevice).sort((left, right) => left.id.localeCompare(right.id)),
    bomRows: advancedLayout.bomRows
  };

  return {
    ...packageWithoutSummary,
    summary: buildSummary(packageWithoutSummary)
  };
}

export function exportLayoutPackageJson(layoutPackage: LayoutPackage): string {
  return `${JSON.stringify(layoutPackage, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

export function exportLayoutPackageCsv(layoutPackage: LayoutPackage): string {
  const rows = [
    csvRow(["section", "id", "parent", "type", "status", "confidence", "source_ids", "label", "notes"]),
    ...layoutPackage.extractedLabels.map((label) =>
      csvRow(["label", label.id, "", label.sourceKind, "", "", label.id, label.rawText, label.normalizedText])
    ),
    ...layoutPackage.deviceClassifications.map((classification) =>
      csvRow([
        "classification",
        classification.id,
        classification.stationId ?? "",
        classification.classifiedDeviceType,
        classification.reviewStatus,
        classification.confidence.toFixed(2),
        classification.sourceDeviceId,
        classification.detectedLabel,
        classification.reason.join("; ")
      ])
    ),
    ...layoutPackage.geometryAssociations.map((association) =>
      csvRow([
        "geometry",
        association.id,
        association.geometryGroupId ?? "",
        association.status,
        association.status,
        association.confidence.toFixed(2),
        association.associatedEntityIds,
        association.detectedLabel,
        association.reason.join("; ")
      ])
    ),
    ...layoutPackage.libraryItemCandidates.map((item) =>
      csvRow([
        "library-item",
        item.id,
        item.stationId ?? "",
        item.equipmentTypeId ?? item.itemType,
        item.reviewStatus,
        item.confidence.toFixed(2),
        item.sourceEntityIds,
        item.label,
        item.evidence.join("; ")
      ])
    ),
    ...layoutPackage.trainingPack.map((record) =>
      csvRow([
        "training",
        record.id,
        record.linkedLibraryItemId,
        record.detectedItemType,
        record.reviewerStatus,
        record.confidence.toFixed(2),
        record.sourceEntityIds,
        record.detectedLabel,
        record.notes
      ])
    )
  ];
  return `${rows.join("\n")}\n`;
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

export function exportLayoutPackageMarkdown(layoutPackage: LayoutPackage): string {
  const rows = [
    "# Kairo Layout Library Package",
    "",
    `Source: \`${layoutPackage.source.displayName}\``,
    "",
    "## Counts",
    "",
    `- Extracted labels: ${layoutPackage.summary.extractedLabels}`,
    `- Classified devices: ${layoutPackage.summary.classifiedDevices}`,
    `- Geometry associations: ${layoutPackage.summary.geometryAssociations}`,
    `- Station/cell candidates: ${layoutPackage.summary.stationCellCandidates}`,
    `- Library item candidates: ${layoutPackage.summary.libraryItemCandidates}`,
    `- Training records: ${layoutPackage.summary.trainingRecords}`,
    `- Accepted training records: ${layoutPackage.summary.acceptedTrainingRecords}`,
    `- Uncertain training records: ${layoutPackage.summary.uncertainTrainingRecords}`,
    "",
    "## Library Item Candidates",
    "",
    markdownRow(["Status", "Label", "Type", "Equipment", "Station", "Confidence", "Linked entities"]),
    "|---|---|---|---|---|---:|---|",
    ...layoutPackage.libraryItemCandidates.map((item) =>
      markdownRow([
        item.reviewStatus,
        item.label,
        item.itemType,
        item.equipmentTypeId ?? "unmapped",
        item.stationId ?? "-",
        item.confidence.toFixed(2),
        item.sourceEntityIds.join(", ")
      ])
    ),
    "",
    "## Training Pack",
    "",
    markdownRow(["Reviewer status", "Detected label", "Detected type", "Expected type", "Confidence", "Notes"]),
    "|---|---|---|---|---:|---|",
    ...layoutPackage.trainingPack.map((record) =>
      markdownRow([
        record.reviewerStatus,
        record.detectedLabel,
        record.detectedItemType,
        record.expectedItemType,
        record.confidence.toFixed(2),
        record.notes
      ])
    ),
    "",
    "## Geometry Associations",
    "",
    markdownRow(["Status", "Label", "Group", "Entities", "Confidence", "Reason"]),
    "|---|---|---|---|---:|---|",
    ...layoutPackage.geometryAssociations.map((association) =>
      markdownRow([
        association.status,
        association.detectedLabel,
        association.geometryGroupId ?? "-",
        association.associatedEntityIds.join(", "),
        association.confidence.toFixed(2),
        association.reason.join("; ")
      ])
    )
  ];

  return `${rows.join("\n")}\n`;
}
