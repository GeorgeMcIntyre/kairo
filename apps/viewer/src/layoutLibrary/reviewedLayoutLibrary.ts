import type { Bounds3 } from "@kairo/core";
import { findEquipmentForDeviceKind, type EquipmentBomCategory } from "../equipment/equipmentLibrary";
import type { DeviceKind } from "../semantic/deviceDictionary";
import type { LayoutLibraryItem, LayoutPackage, ReviewStatus } from "./layoutPackage";
import type { ReviewedTrainingTruthPackage, ReviewedTrainingTruthRecord, SourceLayoutIdentity, TrainingUseStatus } from "./layoutReviewPack";

export type ReviewedLayoutLibrarySchema = "kairo-reviewed-layout-library";
export type ReviewedLayoutLibrarySchemaVersion = 1;

export type ReviewedLayoutLibraryItem = {
  id: string;
  sourceLibraryItemId: string;
  sourceTruthRecordId: string;
  detectedItemId: string;
  label: string;
  itemType: DeviceKind;
  equipmentTypeId?: string;
  equipmentDisplayName?: string;
  bomCategory?: EquipmentBomCategory;
  stationId?: string;
  sourceEntityIds: string[];
  associatedEntityIds: string[];
  footprintBounds: Bounds3;
  clearanceBounds: Bounds3;
  paddedBounds: Bounds3;
  confidence: number;
  reviewStatus: Extract<ReviewStatus, "accepted" | "corrected">;
  reviewerNote: string;
  evidence: string[];
};

export type ReviewedLayoutLibraryReviewRecord = {
  id: string;
  sourceTruthRecordId: string;
  detectedItemId: string;
  label: string;
  finalDeviceType: DeviceKind;
  trainingUse: TrainingUseStatus;
  reviewStatus: ReviewStatus;
  reviewerNote: string;
};

export type ReviewedLayoutLibraryPackage = {
  schema: ReviewedLayoutLibrarySchema;
  schemaVersion: ReviewedLayoutLibrarySchemaVersion;
  packageId: string;
  sourceLayout: SourceLayoutIdentity;
  truthPackageId: string;
  items: ReviewedLayoutLibraryItem[];
  reviewOnlyRecords: ReviewedLayoutLibraryReviewRecord[];
  excludedRecords: ReviewedLayoutLibraryReviewRecord[];
  summary: {
    reusableItems: number;
    acceptedItems: number;
    correctedItems: number;
    reviewOnlyRecords: number;
    excludedRecords: number;
    itemsByType: Record<string, number>;
  };
};

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function libraryItemForTruthRecord(
  layoutPackage: LayoutPackage,
  truthRecord: ReviewedTrainingTruthRecord
): LayoutLibraryItem | undefined {
  return (
    layoutPackage.libraryItemCandidates.find((item) => item.id === truthRecord.linkedLibraryItemId) ??
    layoutPackage.libraryItemCandidates.find((item) => item.sourceDeviceId === truthRecord.detectedItemId) ??
    layoutPackage.libraryItemCandidates.find((item) => item.label === truthRecord.detectedLabel)
  );
}

function associatedEntityIdsForTruthRecord(truthRecord: ReviewedTrainingTruthRecord): string[] {
  return uniqueSorted([
    ...(truthRecord.correctedGeometryAssociationId ? [truthRecord.correctedGeometryAssociationId] : []),
    ...truthRecord.detectedGeometryAssociation.associatedEntityIds
  ]);
}

function reviewedItemForTruthRecord(
  layoutPackage: LayoutPackage,
  truthRecord: ReviewedTrainingTruthRecord
): ReviewedLayoutLibraryItem | undefined {
  if (truthRecord.trainingUse !== "trainable") return undefined;
  if (truthRecord.reviewStatus !== "accepted" && truthRecord.reviewStatus !== "corrected") return undefined;
  const sourceItem = libraryItemForTruthRecord(layoutPackage, truthRecord);
  if (!sourceItem) return undefined;

  const equipment = findEquipmentForDeviceKind(truthRecord.finalDeviceType);
  return {
    id: `reviewed-library-item-${slug(truthRecord.id)}`,
    sourceLibraryItemId: sourceItem.id,
    sourceTruthRecordId: truthRecord.id,
    detectedItemId: truthRecord.detectedItemId,
    label: truthRecord.detectedLabel,
    itemType: truthRecord.finalDeviceType,
    equipmentTypeId: equipment?.item.equipmentTypeId ?? sourceItem.equipmentTypeId,
    equipmentDisplayName: equipment?.item.displayName ?? sourceItem.equipmentDisplayName,
    bomCategory: equipment?.item.defaultBomCategory,
    stationId: sourceItem.stationId,
    sourceEntityIds: uniqueSorted([...sourceItem.sourceEntityIds, ...truthRecord.sourceEntityIds]),
    associatedEntityIds: associatedEntityIdsForTruthRecord(truthRecord),
    footprintBounds: sourceItem.footprintBounds,
    clearanceBounds: sourceItem.clearanceBounds,
    paddedBounds: sourceItem.paddedBounds,
    confidence: truthRecord.confidence,
    reviewStatus: truthRecord.reviewStatus,
    reviewerNote: truthRecord.reviewerNote,
    evidence: truthRecord.evidence
  };
}

function reviewRecordForTruthRecord(truthRecord: ReviewedTrainingTruthRecord): ReviewedLayoutLibraryReviewRecord {
  return {
    id: `reviewed-library-hold-${slug(truthRecord.id)}`,
    sourceTruthRecordId: truthRecord.id,
    detectedItemId: truthRecord.detectedItemId,
    label: truthRecord.detectedLabel,
    finalDeviceType: truthRecord.finalDeviceType,
    trainingUse: truthRecord.trainingUse,
    reviewStatus: truthRecord.reviewStatus,
    reviewerNote: truthRecord.reviewerNote
  };
}

function summary(
  items: readonly ReviewedLayoutLibraryItem[],
  reviewOnlyRecords: readonly ReviewedLayoutLibraryReviewRecord[],
  excludedRecords: readonly ReviewedLayoutLibraryReviewRecord[]
): ReviewedLayoutLibraryPackage["summary"] {
  return {
    reusableItems: items.length,
    acceptedItems: items.filter((item) => item.reviewStatus === "accepted").length,
    correctedItems: items.filter((item) => item.reviewStatus === "corrected").length,
    reviewOnlyRecords: reviewOnlyRecords.length,
    excludedRecords: excludedRecords.length,
    itemsByType: countBy(items, (item) => item.itemType)
  };
}

export function buildReviewedLayoutLibrary(
  layoutPackage: LayoutPackage,
  trainingTruth: ReviewedTrainingTruthPackage
): ReviewedLayoutLibraryPackage {
  const items = trainingTruth.records
    .map((record) => reviewedItemForTruthRecord(layoutPackage, record))
    .filter((item): item is ReviewedLayoutLibraryItem => Boolean(item))
    .sort((left, right) => left.id.localeCompare(right.id));
  const reviewOnlyRecords = trainingTruth.records
    .filter((record) => record.trainingUse === "review-only")
    .map(reviewRecordForTruthRecord)
    .sort((left, right) => left.id.localeCompare(right.id));
  const excludedRecords = trainingTruth.records
    .filter((record) => record.trainingUse === "excluded")
    .map(reviewRecordForTruthRecord)
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: "kairo-reviewed-layout-library",
    schemaVersion: 1,
    packageId: `reviewed-layout-library-${slug(layoutPackage.source.displayName)}`,
    sourceLayout: trainingTruth.sourceLayout,
    truthPackageId: trainingTruth.packageId,
    items,
    reviewOnlyRecords,
    excludedRecords,
    summary: summary(items, reviewOnlyRecords, excludedRecords)
  };
}

export function exportReviewedLayoutLibraryJson(reviewedLibrary: ReviewedLayoutLibraryPackage): string {
  return `${JSON.stringify(reviewedLibrary, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

export function exportReviewedLayoutLibraryCsv(reviewedLibrary: ReviewedLayoutLibraryPackage): string {
  const rows = [
    csvRow([
      "section",
      "id",
      "label",
      "type",
      "equipment_type",
      "status",
      "training_use",
      "confidence",
      "source_ids",
      "associated_entity_ids",
      "notes"
    ]),
    ...reviewedLibrary.items.map((item) =>
      csvRow([
        "item",
        item.id,
        item.label,
        item.itemType,
        item.equipmentTypeId ?? "",
        item.reviewStatus,
        "trainable",
        item.confidence.toFixed(2),
        item.sourceEntityIds,
        item.associatedEntityIds,
        item.reviewerNote
      ])
    ),
    ...reviewedLibrary.reviewOnlyRecords.map((record) =>
      csvRow([
        "review-only",
        record.id,
        record.label,
        record.finalDeviceType,
        "",
        record.reviewStatus,
        record.trainingUse,
        "",
        record.detectedItemId,
        "",
        record.reviewerNote
      ])
    ),
    ...reviewedLibrary.excludedRecords.map((record) =>
      csvRow([
        "excluded",
        record.id,
        record.label,
        record.finalDeviceType,
        "",
        record.reviewStatus,
        record.trainingUse,
        "",
        record.detectedItemId,
        "",
        record.reviewerNote
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

export function exportReviewedLayoutLibraryMarkdown(reviewedLibrary: ReviewedLayoutLibraryPackage): string {
  const rows = [
    "# Kairo Reviewed Layout Library",
    "",
    `Source: \`${reviewedLibrary.sourceLayout.name}\``,
    `Truth package: \`${reviewedLibrary.truthPackageId}\``,
    "",
    "## Counts",
    "",
    `- Reusable items: ${reviewedLibrary.summary.reusableItems}`,
    `- Accepted items: ${reviewedLibrary.summary.acceptedItems}`,
    `- Corrected items: ${reviewedLibrary.summary.correctedItems}`,
    `- Review-only records: ${reviewedLibrary.summary.reviewOnlyRecords}`,
    `- Excluded records: ${reviewedLibrary.summary.excludedRecords}`,
    "",
    "## Reusable Items",
    "",
    markdownRow(["Status", "Label", "Type", "Equipment", "Station", "Confidence", "Associated entities", "Reviewer note"]),
    "|---|---|---|---|---|---:|---|---|",
    ...reviewedLibrary.items.map((item) =>
      markdownRow([
        item.reviewStatus,
        item.label,
        item.itemType,
        item.equipmentTypeId ?? "unmapped",
        item.stationId ?? "-",
        item.confidence.toFixed(2),
        item.associatedEntityIds.join(", "),
        item.reviewerNote
      ])
    ),
    "",
    "## Review-Only Records",
    "",
    markdownRow(["Label", "Type", "Status", "Note"]),
    "|---|---|---|---|",
    ...reviewedLibrary.reviewOnlyRecords.map((record) =>
      markdownRow([record.label, record.finalDeviceType, record.reviewStatus, record.reviewerNote])
    ),
    "",
    "## Excluded Records",
    "",
    markdownRow(["Label", "Type", "Status", "Note"]),
    "|---|---|---|---|",
    ...reviewedLibrary.excludedRecords.map((record) =>
      markdownRow([record.label, record.finalDeviceType, record.reviewStatus, record.reviewerNote])
    )
  ];
  return `${rows.join("\n")}\n`;
}
