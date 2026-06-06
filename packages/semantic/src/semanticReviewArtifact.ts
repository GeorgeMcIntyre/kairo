import { DEVICE_KINDS, type DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics } from "./layoutSemantics";
import type { SemanticDeviceOverride, SemanticOverrideMap } from "./semanticSummary";

export type SemanticReviewArtifactSchema = "kairo-semantic-review-artifact";
export type SemanticReviewArtifactSchemaVersion = 1;
export type SemanticReviewStatus = "accepted" | "corrected" | "rejected" | "uncertain";

export type SemanticReviewSource = {
  id: string;
  name: string;
  path?: string;
};

export type SemanticReviewGeometryAssociation = {
  status: DeviceSemantic["associationStatus"];
  geometryGroupId?: string;
  linkedEntityIds: string[];
  candidateGroupIds: string[];
};

export type SemanticReviewRecord = {
  id: string;
  deviceId: string;
  detectedLabel: string;
  detectedDeviceType: DeviceKind;
  correctedDeviceType?: DeviceKind;
  detectedGeometryAssociation: SemanticReviewGeometryAssociation;
  correctedGeometryGroupId?: string;
  unlink: boolean;
  confidence: number;
  evidence: string[];
  reviewStatus: SemanticReviewStatus;
  reviewerNote: string;
  reviewedAt: string;
  reviewVersion: number;
  sourceTextEntityIds: string[];
};

export type SemanticReviewArtifact = {
  schema: SemanticReviewArtifactSchema;
  schemaVersion: SemanticReviewArtifactSchemaVersion;
  source: SemanticReviewSource;
  createdAt: string;
  reviewVersion: number;
  records: SemanticReviewRecord[];
  summary: {
    totalRecords: number;
    acceptedRecords: number;
    correctedRecords: number;
    rejectedRecords: number;
    uncertainRecords: number;
    overrideRecords: number;
  };
};

export type SemanticReviewArtifactValidationError = {
  path: string;
  message: string;
};

export type SemanticReviewArtifactParseResult =
  | { ok: true; artifact: SemanticReviewArtifact }
  | { ok: false; errors: SemanticReviewArtifactValidationError[] };

const REVIEW_ARTIFACT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const VALID_REVIEW_STATUSES: readonly SemanticReviewStatus[] = ["accepted", "corrected", "rejected", "uncertain"];

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

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isDeviceKind(value: unknown): value is DeviceKind {
  return isString(value) && DEVICE_KINDS.includes(value as DeviceKind);
}

function isReviewStatus(value: unknown): value is SemanticReviewStatus {
  return isString(value) && VALID_REVIEW_STATUSES.includes(value as SemanticReviewStatus);
}

function sourceName(sourcePath: string | undefined): string {
  if (!sourcePath) return "current viewer scene";
  return sourcePath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "current viewer scene";
}

function sourceForPath(sourcePath: string | undefined): SemanticReviewSource {
  const name = sourceName(sourcePath);
  return {
    id: `semantic-source-${slug(name)}`,
    name,
    ...(sourcePath ? { path: sourcePath } : {})
  };
}

function geometryAssociationForDevice(device: DeviceSemantic): SemanticReviewGeometryAssociation {
  return {
    status: device.associationStatus,
    geometryGroupId: device.geometryGroupId,
    linkedEntityIds: uniqueSorted(device.linkedEntityIds),
    candidateGroupIds: uniqueSorted(device.associationCandidates.map((candidate) => candidate.groupId))
  };
}

function reviewStatusForDevice(device: DeviceSemantic, override: SemanticDeviceOverride | undefined): SemanticReviewStatus {
  if (override?.unlink) return "rejected";
  if (override?.kind || override?.geometryGroupId) return "corrected";
  if (device.associationStatus !== "linked" || device.confidence < 0.72) return "uncertain";
  return "accepted";
}

function recordForDevice(device: DeviceSemantic, override: SemanticDeviceOverride | undefined): SemanticReviewRecord {
  return {
    id: `semantic-review-${slug(device.id)}`,
    deviceId: device.id,
    detectedLabel: device.associationText ?? device.rawText ?? device.displayText ?? device.labelText,
    detectedDeviceType: device.kind,
    correctedDeviceType: override?.kind,
    detectedGeometryAssociation: geometryAssociationForDevice(device),
    correctedGeometryGroupId: override?.geometryGroupId,
    unlink: override?.unlink === true,
    confidence: device.confidence,
    evidence: uniqueSorted([...device.evidence, ...device.associationReason]),
    reviewStatus: reviewStatusForDevice(device, override),
    reviewerNote: "",
    reviewedAt: "",
    reviewVersion: 1,
    sourceTextEntityIds: uniqueSorted(device.sourceTextEntityIds)
  };
}

function buildSummary(records: readonly SemanticReviewRecord[]): SemanticReviewArtifact["summary"] {
  return {
    totalRecords: records.length,
    acceptedRecords: records.filter((record) => record.reviewStatus === "accepted").length,
    correctedRecords: records.filter((record) => record.reviewStatus === "corrected").length,
    rejectedRecords: records.filter((record) => record.reviewStatus === "rejected").length,
    uncertainRecords: records.filter((record) => record.reviewStatus === "uncertain").length,
    overrideRecords: records.filter((record) => record.reviewStatus === "corrected" || record.reviewStatus === "rejected").length
  };
}

export function buildSemanticReviewArtifact(
  semantics: LayoutSemantics,
  overrides: SemanticOverrideMap,
  sourcePath?: string
): SemanticReviewArtifact {
  const records = semantics.devices
    .map((device) => recordForDevice(device, overrides[device.id]))
    .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  return {
    schema: "kairo-semantic-review-artifact",
    schemaVersion: 1,
    source: sourceForPath(sourcePath),
    createdAt: REVIEW_ARTIFACT_TIMESTAMP,
    reviewVersion: 1,
    records,
    summary: buildSummary(records)
  };
}

export function exportSemanticReviewArtifactJson(artifact: SemanticReviewArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function validateSource(value: unknown, errors: SemanticReviewArtifactValidationError[]): SemanticReviewSource | undefined {
  if (!isRecord(value)) {
    errors.push({ path: "source", message: "source must be an object." });
    return undefined;
  }
  if (!isString(value.id) || !value.id) {
    errors.push({ path: "source.id", message: "source.id must be a non-empty string." });
  }
  if (!isString(value.name) || !value.name) {
    errors.push({ path: "source.name", message: "source.name must be a non-empty string." });
  }
  if (value.path !== undefined && !isString(value.path)) {
    errors.push({ path: "source.path", message: "source.path must be a string when present." });
  }
  return {
    id: isString(value.id) ? value.id : "",
    name: isString(value.name) ? value.name : "",
    ...(isString(value.path) ? { path: value.path } : {})
  };
}

function validateGeometryAssociation(
  value: unknown,
  path: string,
  errors: SemanticReviewArtifactValidationError[]
): SemanticReviewGeometryAssociation | undefined {
  if (!isRecord(value)) {
    errors.push({ path, message: "detectedGeometryAssociation must be an object." });
    return undefined;
  }
  if (!["linked", "ambiguous", "unlinked"].includes(String(value.status))) {
    errors.push({ path: `${path}.status`, message: "status must be linked, ambiguous, or unlinked." });
  }
  if (value.geometryGroupId !== undefined && !isString(value.geometryGroupId)) {
    errors.push({ path: `${path}.geometryGroupId`, message: "geometryGroupId must be a string when present." });
  }
  if (!isStringArray(value.linkedEntityIds)) {
    errors.push({ path: `${path}.linkedEntityIds`, message: "linkedEntityIds must be an array of strings." });
  }
  if (!isStringArray(value.candidateGroupIds)) {
    errors.push({ path: `${path}.candidateGroupIds`, message: "candidateGroupIds must be an array of strings." });
  }
  return {
    status:
      value.status === "linked" || value.status === "ambiguous" || value.status === "unlinked" ? value.status : "unlinked",
    geometryGroupId: isString(value.geometryGroupId) ? value.geometryGroupId : undefined,
    linkedEntityIds: isStringArray(value.linkedEntityIds) ? uniqueSorted(value.linkedEntityIds) : [],
    candidateGroupIds: isStringArray(value.candidateGroupIds) ? uniqueSorted(value.candidateGroupIds) : []
  };
}

function validateRecord(
  value: unknown,
  index: number,
  semantics: LayoutSemantics,
  errors: SemanticReviewArtifactValidationError[]
): SemanticReviewRecord | undefined {
  const path = `records[${index}]`;
  if (!isRecord(value)) {
    errors.push({ path, message: "record must be an object." });
    return undefined;
  }

  const devicesById = new Set(semantics.devices.map((device) => device.id));
  const groupsById = new Set(semantics.geometryGroups.map((group) => group.id));
  const detectedGeometryAssociation = validateGeometryAssociation(value.detectedGeometryAssociation, `${path}.detectedGeometryAssociation`, errors);

  if (!isString(value.id) || !value.id) errors.push({ path: `${path}.id`, message: "id must be a non-empty string." });
  if (!isString(value.deviceId) || !value.deviceId) {
    errors.push({ path: `${path}.deviceId`, message: "deviceId must be a non-empty string." });
  } else if (!devicesById.has(value.deviceId)) {
    errors.push({ path: `${path}.deviceId`, message: `deviceId '${value.deviceId}' does not exist in the current semantics.` });
  }
  if (!isString(value.detectedLabel) || !value.detectedLabel) {
    errors.push({ path: `${path}.detectedLabel`, message: "detectedLabel must be a non-empty string." });
  }
  if (!isDeviceKind(value.detectedDeviceType)) {
    errors.push({ path: `${path}.detectedDeviceType`, message: "detectedDeviceType must be a known device kind." });
  }
  if (value.correctedDeviceType !== undefined && !isDeviceKind(value.correctedDeviceType)) {
    errors.push({ path: `${path}.correctedDeviceType`, message: "correctedDeviceType must be a known device kind when present." });
  }
  if (value.correctedGeometryGroupId !== undefined && !isString(value.correctedGeometryGroupId)) {
    errors.push({ path: `${path}.correctedGeometryGroupId`, message: "correctedGeometryGroupId must be a string when present." });
  } else if (isString(value.correctedGeometryGroupId) && !groupsById.has(value.correctedGeometryGroupId)) {
    errors.push({
      path: `${path}.correctedGeometryGroupId`,
      message: `correctedGeometryGroupId '${value.correctedGeometryGroupId}' does not exist in the current semantics.`
    });
  }
  if (!isBoolean(value.unlink)) errors.push({ path: `${path}.unlink`, message: "unlink must be a boolean." });
  if (!isNumber(value.confidence)) errors.push({ path: `${path}.confidence`, message: "confidence must be a finite number." });
  if (!isStringArray(value.evidence)) errors.push({ path: `${path}.evidence`, message: "evidence must be an array of strings." });
  if (!isReviewStatus(value.reviewStatus)) {
    errors.push({ path: `${path}.reviewStatus`, message: "reviewStatus must be accepted, corrected, rejected, or uncertain." });
  }
  if (!isString(value.reviewerNote)) errors.push({ path: `${path}.reviewerNote`, message: "reviewerNote must be a string." });
  if (!isString(value.reviewedAt)) errors.push({ path: `${path}.reviewedAt`, message: "reviewedAt must be a string." });
  if (!isNumber(value.reviewVersion)) errors.push({ path: `${path}.reviewVersion`, message: "reviewVersion must be a finite number." });
  if (!isStringArray(value.sourceTextEntityIds)) {
    errors.push({ path: `${path}.sourceTextEntityIds`, message: "sourceTextEntityIds must be an array of strings." });
  }

  if (value.reviewStatus === "corrected" && !value.correctedDeviceType && !value.correctedGeometryGroupId) {
    errors.push({ path: `${path}.reviewStatus`, message: "corrected records must include correctedDeviceType or correctedGeometryGroupId." });
  }
  if (value.reviewStatus === "rejected" && value.unlink !== true) {
    errors.push({ path: `${path}.unlink`, message: "rejected records must set unlink to true." });
  }
  if ((value.reviewStatus === "accepted" || value.reviewStatus === "uncertain") && value.unlink === true) {
    errors.push({ path: `${path}.unlink`, message: "only rejected records may set unlink to true." });
  }

  if (!detectedGeometryAssociation) return undefined;
  return {
    id: isString(value.id) ? value.id : "",
    deviceId: isString(value.deviceId) ? value.deviceId : "",
    detectedLabel: isString(value.detectedLabel) ? value.detectedLabel : "",
    detectedDeviceType: isDeviceKind(value.detectedDeviceType) ? value.detectedDeviceType : "device_number",
    correctedDeviceType: isDeviceKind(value.correctedDeviceType) ? value.correctedDeviceType : undefined,
    detectedGeometryAssociation,
    correctedGeometryGroupId: isString(value.correctedGeometryGroupId) ? value.correctedGeometryGroupId : undefined,
    unlink: value.unlink === true,
    confidence: isNumber(value.confidence) ? value.confidence : 0,
    evidence: isStringArray(value.evidence) ? uniqueSorted(value.evidence) : [],
    reviewStatus: isReviewStatus(value.reviewStatus) ? value.reviewStatus : "uncertain",
    reviewerNote: isString(value.reviewerNote) ? value.reviewerNote : "",
    reviewedAt: isString(value.reviewedAt) ? value.reviewedAt : "",
    reviewVersion: isNumber(value.reviewVersion) ? value.reviewVersion : 1,
    sourceTextEntityIds: isStringArray(value.sourceTextEntityIds) ? uniqueSorted(value.sourceTextEntityIds) : []
  };
}

export function parseSemanticReviewArtifactJson(
  content: string,
  semantics: LayoutSemantics
): SemanticReviewArtifactParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      ok: false,
      errors: [{ path: "$", message: error instanceof Error ? error.message : "Invalid JSON." }]
    };
  }

  const errors: SemanticReviewArtifactValidationError[] = [];
  if (!isRecord(parsed)) {
    return { ok: false, errors: [{ path: "$", message: "Semantic review artifact must be a JSON object." }] };
  }
  if (parsed.schema !== "kairo-semantic-review-artifact") {
    errors.push({ path: "schema", message: "schema must be kairo-semantic-review-artifact." });
  }
  if (parsed.schemaVersion !== 1) {
    errors.push({ path: "schemaVersion", message: "schemaVersion must be 1." });
  }
  const source = validateSource(parsed.source, errors);
  if (!isString(parsed.createdAt)) errors.push({ path: "createdAt", message: "createdAt must be a string." });
  if (!isNumber(parsed.reviewVersion)) errors.push({ path: "reviewVersion", message: "reviewVersion must be a finite number." });
  if (!Array.isArray(parsed.records)) {
    errors.push({ path: "records", message: "records must be an array." });
  }

  const records = Array.isArray(parsed.records)
    ? parsed.records
        .map((record, index) => validateRecord(record, index, semantics, errors))
        .filter((record): record is SemanticReviewRecord => Boolean(record))
    : [];

  if (errors.length > 0 || !source) return { ok: false, errors };
  const createdAt = isString(parsed.createdAt) ? parsed.createdAt : REVIEW_ARTIFACT_TIMESTAMP;
  const reviewVersion = isNumber(parsed.reviewVersion) ? parsed.reviewVersion : 1;

  return {
    ok: true,
    artifact: {
      schema: "kairo-semantic-review-artifact",
      schemaVersion: 1,
      source,
      createdAt,
      reviewVersion,
      records,
      summary: buildSummary(records)
    }
  };
}

export function semanticOverridesFromReviewArtifact(artifact: SemanticReviewArtifact): SemanticOverrideMap {
  const overrides: SemanticOverrideMap = {};
  for (const record of artifact.records) {
    if (record.reviewStatus !== "corrected" && record.reviewStatus !== "rejected") continue;
    const override: SemanticDeviceOverride = {};
    if (record.correctedDeviceType) override.kind = record.correctedDeviceType;
    if (record.correctedGeometryGroupId) override.geometryGroupId = record.correctedGeometryGroupId;
    if (record.reviewStatus === "rejected") override.unlink = true;
    if (override.kind || override.geometryGroupId || override.unlink) {
      overrides[record.deviceId] = override;
    }
  }
  return overrides;
}
