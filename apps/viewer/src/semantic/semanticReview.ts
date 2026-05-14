import type { ScenePackage } from "@kairo/schema";
import type { SemanticSummaryDevice } from "./semanticSummary";
import type { SemanticQaReport } from "./semanticQaReport";
import type { LayoutSemantics } from "./layoutSemantics";
import type { SemanticOverrideMap } from "./semanticSummary";

export const semanticReviewFormat = "kairo-semantic-review";
export const semanticReviewVersion = "0.1.0";

export type SemanticReviewDecision = "draft" | "pass" | "partial" | "fail";
export type SemanticReviewStatus = "unreviewed" | "confirmed" | "incorrect";
export type SemanticGeometryReviewStatus = "unreviewed" | "confirmed" | "incorrect" | "not-applicable";

export type SemanticReviewDeviceState = {
  classificationStatus: SemanticReviewStatus;
  geometryStatus: SemanticGeometryReviewStatus;
  needsOverride: boolean;
  notes: string;
};

export type SemanticReviewStateMap = Record<string, SemanticReviewDeviceState>;

export type SemanticReviewFingerprint = {
  format: string;
  units: string;
  rootNodeId: string;
  nodeCount: number;
  geometryDocumentCount: number;
  layerCount: number;
  sourceMapRowCount: number;
  textEntityCount: number;
  deviceCount: number;
  geometryIds: string[];
};

export type SemanticReviewDocument = {
  format: typeof semanticReviewFormat;
  version: typeof semanticReviewVersion;
  sceneFingerprint: SemanticReviewFingerprint;
  decision: SemanticReviewDecision;
  counts: {
    stations: number;
    devices: number;
    linkedDevices: number;
    ambiguousDevices: number;
    unlinkedDevices: number;
    unknownLabels: number;
  };
  devices: SemanticSummaryDevice[];
  overrides: SemanticOverrideMap;
  review: SemanticReviewStateMap;
  requiredLabels: SemanticQaReport["requiredLabels"];
  warnings: string[];
};

export type SemanticReviewReconcileResult = {
  overrides: SemanticOverrideMap;
  review: SemanticReviewStateMap;
  warnings: string[];
};

const defaultReviewState: SemanticReviewDeviceState = {
  classificationStatus: "unreviewed",
  geometryStatus: "unreviewed",
  needsOverride: false,
  notes: ""
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickReviewStatus(value: unknown): SemanticReviewStatus {
  return value === "confirmed" || value === "incorrect" || value === "unreviewed" ? value : "unreviewed";
}

function pickGeometryStatus(value: unknown): SemanticGeometryReviewStatus {
  return value === "confirmed" || value === "incorrect" || value === "not-applicable" || value === "unreviewed"
    ? value
    : "unreviewed";
}

function pickDecision(value: unknown): SemanticReviewDecision {
  return value === "pass" || value === "partial" || value === "fail" || value === "draft" ? value : "draft";
}

export function semanticReviewStateWithPatch(
  current: SemanticReviewDeviceState | undefined,
  patch: Partial<SemanticReviewDeviceState>
): SemanticReviewDeviceState {
  return {
    ...(current ?? defaultReviewState),
    ...patch
  };
}

export function buildSemanticReviewFingerprint(
  scenePackage: ScenePackage,
  semantics: LayoutSemantics
): SemanticReviewFingerprint {
  return {
    format: scenePackage.manifest.source.format,
    units: scenePackage.manifest.units,
    rootNodeId: scenePackage.scene.rootNodeId,
    nodeCount: scenePackage.scene.nodes.length,
    geometryDocumentCount: scenePackage.geometry.length,
    layerCount: scenePackage.layers.layers.length,
    sourceMapRowCount: scenePackage.sourceMap.sources.length,
    textEntityCount: semantics.textEntities.length,
    deviceCount: semantics.devices.length,
    geometryIds: scenePackage.geometry
      .flatMap((document) => document.geometries.map((geometry) => geometry.id))
      .sort((left, right) => left.localeCompare(right))
  };
}

export function fingerprintsMatch(left: SemanticReviewFingerprint, right: SemanticReviewFingerprint): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildSemanticReviewDocument(options: {
  scenePackage: ScenePackage;
  semantics: LayoutSemantics;
  devices: SemanticSummaryDevice[];
  requiredLabels: SemanticQaReport["requiredLabels"];
  overrides: SemanticOverrideMap;
  review: SemanticReviewStateMap;
  decision?: SemanticReviewDecision;
  warnings?: string[];
}): SemanticReviewDocument {
  return {
    format: semanticReviewFormat,
    version: semanticReviewVersion,
    sceneFingerprint: buildSemanticReviewFingerprint(options.scenePackage, options.semantics),
    decision: options.decision ?? "draft",
    counts: {
      stations: options.semantics.stations.length,
      devices: options.semantics.devices.length,
      linkedDevices: options.semantics.devices.filter((device) => device.associationStatus === "linked").length,
      ambiguousDevices: options.semantics.devices.filter((device) => device.associationStatus === "ambiguous").length,
      unlinkedDevices: options.semantics.devices.filter((device) => device.associationStatus === "unlinked").length,
      unknownLabels: options.semantics.unknownTextEntities.length
    },
    devices: [...options.devices].sort((left, right) => left.deviceId.localeCompare(right.deviceId)),
    overrides: Object.fromEntries(Object.entries(options.overrides).sort(([left], [right]) => left.localeCompare(right))),
    review: Object.fromEntries(Object.entries(options.review).sort(([left], [right]) => left.localeCompare(right))),
    requiredLabels: options.requiredLabels,
    warnings: options.warnings ?? []
  };
}

export function exportSemanticReviewJson(document: SemanticReviewDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseSemanticReviewDocument(value: unknown): SemanticReviewDocument {
  if (!isRecord(value)) {
    throw new Error("Semantic review file must be a JSON object.");
  }

  if (value.format !== semanticReviewFormat || value.version !== semanticReviewVersion) {
    throw new Error(`Unsupported semantic review format/version: ${String(value.format)} ${String(value.version)}.`);
  }

  const fingerprint = value.sceneFingerprint;
  if (!isRecord(fingerprint)) {
    throw new Error("Semantic review file is missing sceneFingerprint.");
  }

  return {
    format: semanticReviewFormat,
    version: semanticReviewVersion,
    sceneFingerprint: {
      format: asString(fingerprint.format),
      units: asString(fingerprint.units),
      rootNodeId: asString(fingerprint.rootNodeId),
      nodeCount: Number(fingerprint.nodeCount ?? 0),
      geometryDocumentCount: Number(fingerprint.geometryDocumentCount ?? 0),
      layerCount: Number(fingerprint.layerCount ?? 0),
      sourceMapRowCount: Number(fingerprint.sourceMapRowCount ?? 0),
      textEntityCount: Number(fingerprint.textEntityCount ?? 0),
      deviceCount: Number(fingerprint.deviceCount ?? 0),
      geometryIds: Array.isArray(fingerprint.geometryIds) ? fingerprint.geometryIds.map((entry) => asString(entry)) : []
    },
    decision: pickDecision(value.decision),
    counts: isRecord(value.counts)
      ? {
          stations: Number(value.counts.stations ?? 0),
          devices: Number(value.counts.devices ?? 0),
          linkedDevices: Number(value.counts.linkedDevices ?? 0),
          ambiguousDevices: Number(value.counts.ambiguousDevices ?? 0),
          unlinkedDevices: Number(value.counts.unlinkedDevices ?? 0),
          unknownLabels: Number(value.counts.unknownLabels ?? 0)
        }
      : {
          stations: 0,
          devices: 0,
          linkedDevices: 0,
          ambiguousDevices: 0,
          unlinkedDevices: 0,
          unknownLabels: 0
        },
    devices: Array.isArray(value.devices) ? value.devices as SemanticSummaryDevice[] : [],
    overrides: isRecord(value.overrides) ? value.overrides as SemanticOverrideMap : {},
    review: normalizeReviewStateMap(value.review),
    requiredLabels: Array.isArray(value.requiredLabels) ? value.requiredLabels as SemanticQaReport["requiredLabels"] : [],
    warnings: Array.isArray(value.warnings) ? value.warnings.map((entry) => asString(entry)).filter(Boolean) : []
  };
}

function normalizeReviewStateMap(value: unknown): SemanticReviewStateMap {
  if (!isRecord(value)) return {};
  const result: SemanticReviewStateMap = {};
  for (const [deviceId, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    result[deviceId] = {
      classificationStatus: pickReviewStatus(entry.classificationStatus),
      geometryStatus: pickGeometryStatus(entry.geometryStatus),
      needsOverride: asBoolean(entry.needsOverride),
      notes: asString(entry.notes)
    };
  }
  return result;
}

export function reconcileSemanticReviewDocument(
  document: SemanticReviewDocument,
  currentFingerprint: SemanticReviewFingerprint,
  currentDeviceIds: readonly string[]
): SemanticReviewReconcileResult {
  const warnings = [...document.warnings];
  if (!fingerprintsMatch(document.sceneFingerprint, currentFingerprint)) {
    warnings.push("Review scene fingerprint differs from the current scene; only matching device IDs were applied.");
  }

  const currentIds = new Set(currentDeviceIds);
  const overrides: SemanticOverrideMap = {};
  const review: SemanticReviewStateMap = {};

  for (const [deviceId, override] of Object.entries(document.overrides)) {
    if (!currentIds.has(deviceId)) continue;
    overrides[deviceId] = override;
  }

  for (const [deviceId, state] of Object.entries(document.review)) {
    if (!currentIds.has(deviceId)) continue;
    review[deviceId] = state;
  }

  const staleIds = [
    ...new Set([
      ...Object.keys(document.overrides).filter((deviceId) => !currentIds.has(deviceId)),
      ...Object.keys(document.review).filter((deviceId) => !currentIds.has(deviceId)),
      ...document.devices.map((device) => device.deviceId).filter((deviceId) => !currentIds.has(deviceId))
    ])
  ].sort((left, right) => left.localeCompare(right));

  if (staleIds.length > 0) {
    warnings.push(`${staleIds.length} imported review device id(s) were not found in the current scene.`);
  }

  return { overrides, review, warnings };
}
