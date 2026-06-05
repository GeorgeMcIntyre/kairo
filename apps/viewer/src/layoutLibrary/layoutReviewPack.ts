import { DEVICE_KINDS, type DeviceKind } from "../semantic/deviceDictionary";
import type { GeometryAssociation, LayoutPackage, LayoutTrainingRecord, ReviewStatus } from "./layoutPackage";

export type LayoutReviewPackSchema = "kairo-layout-review-pack";
export type ReviewedTrainingTruthSchema = "kairo-reviewed-training-truth";
export type ReviewSchemaVersion = 1;
export type GeometryAssociationReviewStatus = "linked" | "ambiguous" | "unlinked";
export type TrainingUseStatus = "trainable" | "excluded" | "review-only";

export type SourceLayoutIdentity = {
  id: string;
  name: string;
};

export type ReviewPackGeometryAssociation = {
  status: GeometryAssociationReviewStatus;
  associatedEntityIds: string[];
  geometryGroupId?: string;
};

export type LayoutReviewPackRecord = {
  id: string;
  detectedItemId: string;
  detectedLabel: string;
  detectedDeviceType: DeviceKind;
  correctedDeviceType?: DeviceKind;
  detectedGeometryAssociation: ReviewPackGeometryAssociation;
  correctedGeometryAssociationId?: string;
  correctedGeometryAssociationNote?: string;
  confidence: number;
  evidence: string[];
  reviewStatus: ReviewStatus;
  reviewerNote: string;
  reviewedAt: string;
  reviewVersion: number;
};

export type LayoutReviewPack = {
  schema: LayoutReviewPackSchema;
  schemaVersion: ReviewSchemaVersion;
  packageId: string;
  sourceLayout: SourceLayoutIdentity;
  createdAt: string;
  reviewVersion: number;
  records: LayoutReviewPackRecord[];
};

export type LayoutReviewPackValidationError = {
  path: string;
  message: string;
};

export type LayoutReviewPackParseResult =
  | { ok: true; reviewPack: LayoutReviewPack }
  | { ok: false; errors: LayoutReviewPackValidationError[] };

export type ReviewedTrainingTruthRecord = {
  id: string;
  sourceTrainingRecordId: string;
  detectedItemId: string;
  detectedLabel: string;
  detectedDeviceType: DeviceKind;
  finalDeviceType: DeviceKind;
  detectedGeometryAssociation: ReviewPackGeometryAssociation;
  correctedGeometryAssociationId?: string;
  correctedGeometryAssociationNote?: string;
  confidence: number;
  evidence: string[];
  reviewStatus: ReviewStatus;
  trainingUse: TrainingUseStatus;
  reviewerNote: string;
  reviewedAt: string;
  reviewVersion: number;
  sourceEntityIds: string[];
  linkedLibraryItemId: string;
};

export type ReviewedTrainingTruthPackage = {
  schema: ReviewedTrainingTruthSchema;
  schemaVersion: ReviewSchemaVersion;
  packageId: string;
  sourceLayout: SourceLayoutIdentity;
  reviewPackId: string;
  generatedPackageSchema: LayoutPackage["schema"];
  generatedPackageVersion: LayoutPackage["schemaVersion"];
  records: ReviewedTrainingTruthRecord[];
  summary: {
    totalRecords: number;
    trainableRecords: number;
    excludedRecords: number;
    reviewOnlyRecords: number;
    acceptedRecords: number;
    correctedRecords: number;
    rejectedRecords: number;
    uncertainRecords: number;
  };
};

const REVIEW_PACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const VALID_REVIEW_STATUSES: readonly ReviewStatus[] = ["accepted", "corrected", "rejected", "uncertain"];
const VALID_GEOMETRY_STATUSES: readonly GeometryAssociationReviewStatus[] = ["linked", "ambiguous", "unlinked"];

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isDeviceKind(value: unknown): value is DeviceKind {
  return isString(value) && DEVICE_KINDS.includes(value as DeviceKind);
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return isString(value) && VALID_REVIEW_STATUSES.includes(value as ReviewStatus);
}

function isGeometryStatus(value: unknown): value is GeometryAssociationReviewStatus {
  return isString(value) && VALID_GEOMETRY_STATUSES.includes(value as GeometryAssociationReviewStatus);
}

function sourceLayoutId(layoutPackage: LayoutPackage): string {
  return `layout-${slug(layoutPackage.source.displayName)}`;
}

function sourceLayout(layoutPackage: LayoutPackage): SourceLayoutIdentity {
  return {
    id: sourceLayoutId(layoutPackage),
    name: layoutPackage.source.displayName
  };
}

function geometryAssociationForTrainingRecord(
  trainingRecord: LayoutTrainingRecord,
  layoutPackage: LayoutPackage
): ReviewPackGeometryAssociation {
  const association = layoutPackage.geometryAssociations.find(
    (entry) => entry.sourceDeviceId === trainingRecord.detectedItemId
  );
  return {
    status: association?.status ?? "unlinked",
    associatedEntityIds: uniqueSorted(association?.associatedEntityIds ?? []),
    geometryGroupId: association?.geometryGroupId
  };
}

function reviewRecordForTrainingRecord(
  trainingRecord: LayoutTrainingRecord,
  layoutPackage: LayoutPackage
): LayoutReviewPackRecord {
  return {
    id: `review-${slug(trainingRecord.id)}`,
    detectedItemId: trainingRecord.detectedItemId,
    detectedLabel: trainingRecord.detectedLabel,
    detectedDeviceType: trainingRecord.detectedItemType,
    correctedDeviceType: undefined,
    detectedGeometryAssociation: geometryAssociationForTrainingRecord(trainingRecord, layoutPackage),
    correctedGeometryAssociationId: undefined,
    correctedGeometryAssociationNote: "",
    confidence: trainingRecord.confidence,
    evidence: trainingRecord.reason,
    reviewStatus: trainingRecord.reviewerStatus,
    reviewerNote: "",
    reviewedAt: "",
    reviewVersion: 1
  };
}

export function buildBlankLayoutReviewPack(layoutPackage: LayoutPackage): LayoutReviewPack {
  return {
    schema: "kairo-layout-review-pack",
    schemaVersion: 1,
    packageId: `review-pack-${slug(layoutPackage.source.displayName)}`,
    sourceLayout: sourceLayout(layoutPackage),
    createdAt: REVIEW_PACK_TIMESTAMP,
    reviewVersion: 1,
    records: layoutPackage.trainingPack
      .map((record) => reviewRecordForTrainingRecord(record, layoutPackage))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
}

function validateSourceLayout(value: unknown, errors: LayoutReviewPackValidationError[]): SourceLayoutIdentity | undefined {
  if (!isRecord(value)) {
    errors.push({ path: "sourceLayout", message: "sourceLayout must be an object." });
    return undefined;
  }
  if (!isString(value.id) || !value.id) {
    errors.push({ path: "sourceLayout.id", message: "sourceLayout.id must be a non-empty string." });
  }
  if (!isString(value.name) || !value.name) {
    errors.push({ path: "sourceLayout.name", message: "sourceLayout.name must be a non-empty string." });
  }
  if (errors.some((error) => error.path.startsWith("sourceLayout."))) return undefined;
  return { id: value.id as string, name: value.name as string };
}

function validateGeometryAssociation(
  value: unknown,
  path: string,
  errors: LayoutReviewPackValidationError[]
): ReviewPackGeometryAssociation | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: "detectedGeometryAssociation must be an object." });
    return undefined;
  }
  if (!isGeometryStatus(value.status)) {
    errors.push({ path: `${path}.status`, message: "status must be linked, ambiguous, or unlinked." });
  }
  if (!isStringArray(value.associatedEntityIds)) {
    errors.push({ path: `${path}.associatedEntityIds`, message: "associatedEntityIds must be an array of strings." });
  }
  if (value.geometryGroupId !== undefined && !isString(value.geometryGroupId)) {
    errors.push({ path: `${path}.geometryGroupId`, message: "geometryGroupId must be a string when present." });
  }
  if (errors.some((error) => error.path.startsWith(`${path}.`))) return undefined;
  return {
    status: value.status as GeometryAssociationReviewStatus,
    associatedEntityIds: uniqueSorted(value.associatedEntityIds as string[]),
    geometryGroupId: value.geometryGroupId as string | undefined
  };
}

function validateReviewRecord(
  value: unknown,
  index: number,
  errors: LayoutReviewPackValidationError[]
): LayoutReviewPackRecord | undefined {
  const path = `records[${index}]`;
  if (!isRecord(value)) {
    errors.push({ path, message: "record must be an object." });
    return undefined;
  }

  const geometryAssociation = validateGeometryAssociation(value.detectedGeometryAssociation, `${path}.detectedGeometryAssociation`, errors);
  if (!isString(value.id) || !value.id) errors.push({ path: `${path}.id`, message: "id must be a non-empty string." });
  if (!isString(value.detectedItemId) || !value.detectedItemId) {
    errors.push({ path: `${path}.detectedItemId`, message: "detectedItemId must be a non-empty string." });
  }
  if (!isString(value.detectedLabel) || !value.detectedLabel) {
    errors.push({ path: `${path}.detectedLabel`, message: "detectedLabel must be a non-empty string." });
  }
  if (!isDeviceKind(value.detectedDeviceType)) {
    errors.push({ path: `${path}.detectedDeviceType`, message: "detectedDeviceType must be a known Kairo device kind." });
  }
  if (value.correctedDeviceType !== undefined && value.correctedDeviceType !== "" && !isDeviceKind(value.correctedDeviceType)) {
    errors.push({ path: `${path}.correctedDeviceType`, message: "correctedDeviceType must be a known Kairo device kind when present." });
  }
  if (value.correctedGeometryAssociationId !== undefined && !isString(value.correctedGeometryAssociationId)) {
    errors.push({ path: `${path}.correctedGeometryAssociationId`, message: "correctedGeometryAssociationId must be a string when present." });
  }
  if (value.correctedGeometryAssociationNote !== undefined && !isString(value.correctedGeometryAssociationNote)) {
    errors.push({ path: `${path}.correctedGeometryAssociationNote`, message: "correctedGeometryAssociationNote must be a string when present." });
  }
  if (!isNumber(value.confidence)) errors.push({ path: `${path}.confidence`, message: "confidence must be a finite number." });
  if (!isStringArray(value.evidence)) errors.push({ path: `${path}.evidence`, message: "evidence must be an array of strings." });
  if (!isReviewStatus(value.reviewStatus)) {
    errors.push({ path: `${path}.reviewStatus`, message: "reviewStatus must be accepted, corrected, rejected, or uncertain." });
  }
  if (!isString(value.reviewerNote)) errors.push({ path: `${path}.reviewerNote`, message: "reviewerNote must be a string." });
  if (!isString(value.reviewedAt)) errors.push({ path: `${path}.reviewedAt`, message: "reviewedAt must be a string." });
  if (!isNumber(value.reviewVersion)) errors.push({ path: `${path}.reviewVersion`, message: "reviewVersion must be a finite number." });

  if (errors.some((error) => error.path === path || error.path.startsWith(`${path}.`))) return undefined;
  return {
    id: value.id as string,
    detectedItemId: value.detectedItemId as string,
    detectedLabel: value.detectedLabel as string,
    detectedDeviceType: value.detectedDeviceType as DeviceKind,
    correctedDeviceType: value.correctedDeviceType ? (value.correctedDeviceType as DeviceKind) : undefined,
    detectedGeometryAssociation: geometryAssociation as ReviewPackGeometryAssociation,
    correctedGeometryAssociationId: value.correctedGeometryAssociationId as string | undefined,
    correctedGeometryAssociationNote: (value.correctedGeometryAssociationNote as string | undefined) ?? "",
    confidence: value.confidence as number,
    evidence: value.evidence as string[],
    reviewStatus: value.reviewStatus as ReviewStatus,
    reviewerNote: value.reviewerNote as string,
    reviewedAt: value.reviewedAt as string,
    reviewVersion: value.reviewVersion as number
  };
}

function validateReviewPackReferences(
  reviewPack: LayoutReviewPack,
  layoutPackage: LayoutPackage | undefined,
  errors: LayoutReviewPackValidationError[]
): void {
  const recordIds = new Set<string>();
  const detectedItemIds = new Set<string>();
  const generatedDetectedItemIds = layoutPackage ? new Set(layoutPackage.trainingPack.map((record) => record.detectedItemId)) : undefined;

  reviewPack.records.forEach((record, index) => {
    if (recordIds.has(record.id)) errors.push({ path: `records[${index}].id`, message: `duplicate record id ${record.id}.` });
    recordIds.add(record.id);
    if (detectedItemIds.has(record.detectedItemId)) {
      errors.push({ path: `records[${index}].detectedItemId`, message: `duplicate detectedItemId ${record.detectedItemId}.` });
    }
    detectedItemIds.add(record.detectedItemId);
    if (generatedDetectedItemIds && !generatedDetectedItemIds.has(record.detectedItemId)) {
      errors.push({
        path: `records[${index}].detectedItemId`,
        message: `detectedItemId ${record.detectedItemId} does not exist in the generated training pack.`
      });
    }
    if (record.reviewStatus === "corrected" && !record.correctedDeviceType && !record.correctedGeometryAssociationId && !record.correctedGeometryAssociationNote) {
      errors.push({
        path: `records[${index}].reviewStatus`,
        message: "corrected records must include a correctedDeviceType, correctedGeometryAssociationId, or correctedGeometryAssociationNote."
      });
    }
  });
}

export function parseLayoutReviewPackJson(json: string, layoutPackage?: LayoutPackage): LayoutReviewPackParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [{ path: "$", message: error instanceof Error ? error.message : "Invalid JSON." }] };
  }

  const errors: LayoutReviewPackValidationError[] = [];
  if (!isRecord(parsed)) return { ok: false, errors: [{ path: "$", message: "review pack must be a JSON object." }] };
  if (parsed.schema !== "kairo-layout-review-pack") {
    errors.push({ path: "schema", message: "schema must be kairo-layout-review-pack." });
  }
  if (parsed.schemaVersion !== 1) errors.push({ path: "schemaVersion", message: "schemaVersion must be 1." });
  if (!isString(parsed.packageId) || !parsed.packageId) {
    errors.push({ path: "packageId", message: "packageId must be a non-empty string." });
  }
  const parsedSourceLayout = validateSourceLayout(parsed.sourceLayout, errors);
  if (!isString(parsed.createdAt)) errors.push({ path: "createdAt", message: "createdAt must be a string." });
  if (!isNumber(parsed.reviewVersion)) errors.push({ path: "reviewVersion", message: "reviewVersion must be a finite number." });
  if (!Array.isArray(parsed.records)) {
    errors.push({ path: "records", message: "records must be an array." });
  }

  const records = Array.isArray(parsed.records)
    ? parsed.records
        .map((record, index) => validateReviewRecord(record, index, errors))
        .filter((record): record is LayoutReviewPackRecord => Boolean(record))
    : [];

  if (errors.length > 0) return { ok: false, errors };

  const reviewPack: LayoutReviewPack = {
    schema: "kairo-layout-review-pack",
    schemaVersion: 1,
    packageId: parsed.packageId as string,
    sourceLayout: parsedSourceLayout as SourceLayoutIdentity,
    createdAt: parsed.createdAt as string,
    reviewVersion: parsed.reviewVersion as number,
    records: records.sort((left, right) => left.id.localeCompare(right.id))
  };
  validateReviewPackReferences(reviewPack, layoutPackage, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, reviewPack };
}

function trainingUseForReviewStatus(status: ReviewStatus): TrainingUseStatus {
  if (status === "accepted" || status === "corrected") return "trainable";
  if (status === "rejected") return "excluded";
  return "review-only";
}

function truthRecordForTrainingRecord(
  trainingRecord: LayoutTrainingRecord,
  reviewRecord: LayoutReviewPackRecord
): ReviewedTrainingTruthRecord {
  const finalDeviceType =
    reviewRecord.reviewStatus === "corrected" && reviewRecord.correctedDeviceType
      ? reviewRecord.correctedDeviceType
      : trainingRecord.expectedItemType;
  return {
    id: `truth-${slug(trainingRecord.id)}`,
    sourceTrainingRecordId: trainingRecord.id,
    detectedItemId: trainingRecord.detectedItemId,
    detectedLabel: trainingRecord.detectedLabel,
    detectedDeviceType: trainingRecord.detectedItemType,
    finalDeviceType,
    detectedGeometryAssociation: reviewRecord.detectedGeometryAssociation,
    correctedGeometryAssociationId: reviewRecord.correctedGeometryAssociationId,
    correctedGeometryAssociationNote: reviewRecord.correctedGeometryAssociationNote,
    confidence: reviewRecord.confidence,
    evidence: reviewRecord.evidence,
    reviewStatus: reviewRecord.reviewStatus,
    trainingUse: trainingUseForReviewStatus(reviewRecord.reviewStatus),
    reviewerNote: reviewRecord.reviewerNote || trainingRecord.notes,
    reviewedAt: reviewRecord.reviewedAt,
    reviewVersion: reviewRecord.reviewVersion,
    sourceEntityIds: trainingRecord.sourceEntityIds,
    linkedLibraryItemId: trainingRecord.linkedLibraryItemId
  };
}

function truthSummary(records: readonly ReviewedTrainingTruthRecord[]): ReviewedTrainingTruthPackage["summary"] {
  return {
    totalRecords: records.length,
    trainableRecords: records.filter((record) => record.trainingUse === "trainable").length,
    excludedRecords: records.filter((record) => record.trainingUse === "excluded").length,
    reviewOnlyRecords: records.filter((record) => record.trainingUse === "review-only").length,
    acceptedRecords: records.filter((record) => record.reviewStatus === "accepted").length,
    correctedRecords: records.filter((record) => record.reviewStatus === "corrected").length,
    rejectedRecords: records.filter((record) => record.reviewStatus === "rejected").length,
    uncertainRecords: records.filter((record) => record.reviewStatus === "uncertain").length
  };
}

export function mergeReviewedTrainingTruth(
  layoutPackage: LayoutPackage,
  reviewPack: LayoutReviewPack
): ReviewedTrainingTruthPackage {
  const reviewByDetectedItemId = new Map(reviewPack.records.map((record) => [record.detectedItemId, record]));
  const records = layoutPackage.trainingPack
    .map((trainingRecord) => {
      const reviewRecord = reviewByDetectedItemId.get(trainingRecord.detectedItemId);
      return truthRecordForTrainingRecord(
        trainingRecord,
        reviewRecord ?? reviewRecordForTrainingRecord(trainingRecord, layoutPackage)
      );
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: "kairo-reviewed-training-truth",
    schemaVersion: 1,
    packageId: `training-truth-${slug(layoutPackage.source.displayName)}`,
    sourceLayout: sourceLayout(layoutPackage),
    reviewPackId: reviewPack.packageId,
    generatedPackageSchema: layoutPackage.schema,
    generatedPackageVersion: layoutPackage.schemaVersion,
    records,
    summary: truthSummary(records)
  };
}

export function exportLayoutReviewPackJson(reviewPack: LayoutReviewPack): string {
  return `${JSON.stringify(reviewPack, null, 2)}\n`;
}

export function exportReviewedTrainingTruthJson(trainingTruth: ReviewedTrainingTruthPackage): string {
  return `${JSON.stringify(trainingTruth, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

export function exportReviewedTrainingTruthCsv(trainingTruth: ReviewedTrainingTruthPackage): string {
  const rows = [
    csvRow([
      "id",
      "detected_item_id",
      "detected_label",
      "detected_type",
      "final_type",
      "review_status",
      "training_use",
      "confidence",
      "geometry_status",
      "corrected_geometry",
      "source_entity_ids",
      "reviewer_note"
    ]),
    ...trainingTruth.records.map((record) =>
      csvRow([
        record.id,
        record.detectedItemId,
        record.detectedLabel,
        record.detectedDeviceType,
        record.finalDeviceType,
        record.reviewStatus,
        record.trainingUse,
        record.confidence.toFixed(2),
        record.detectedGeometryAssociation.status,
        record.correctedGeometryAssociationId ?? record.correctedGeometryAssociationNote ?? "",
        record.sourceEntityIds,
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

export function exportReviewedTrainingSummaryMarkdown(trainingTruth: ReviewedTrainingTruthPackage): string {
  const rows = [
    "# Kairo Reviewed Training Summary",
    "",
    `Source: \`${trainingTruth.sourceLayout.name}\``,
    `Review pack: \`${trainingTruth.reviewPackId}\``,
    "",
    "## Counts",
    "",
    `- Total records: ${trainingTruth.summary.totalRecords}`,
    `- Trainable records: ${trainingTruth.summary.trainableRecords}`,
    `- Excluded records: ${trainingTruth.summary.excludedRecords}`,
    `- Review-only records: ${trainingTruth.summary.reviewOnlyRecords}`,
    `- Accepted: ${trainingTruth.summary.acceptedRecords}`,
    `- Corrected: ${trainingTruth.summary.correctedRecords}`,
    `- Rejected: ${trainingTruth.summary.rejectedRecords}`,
    `- Uncertain: ${trainingTruth.summary.uncertainRecords}`,
    "",
    "## Records",
    "",
    markdownRow(["Use", "Status", "Label", "Detected type", "Final type", "Geometry", "Confidence", "Reviewer note"]),
    "|---|---|---|---|---|---|---:|---|",
    ...trainingTruth.records.map((record) =>
      markdownRow([
        record.trainingUse,
        record.reviewStatus,
        record.detectedLabel,
        record.detectedDeviceType,
        record.finalDeviceType,
        record.correctedGeometryAssociationId ?? record.correctedGeometryAssociationNote ?? record.detectedGeometryAssociation.status,
        record.confidence.toFixed(2),
        record.reviewerNote
      ])
    )
  ];
  return `${rows.join("\n")}\n`;
}
