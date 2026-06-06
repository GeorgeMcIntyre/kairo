import type { Bounds3, Vec3 } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import {
  safeDisplayText,
  type DeviceGeometryAssociationStatus,
  type DeviceKind,
  type DeviceSemantic,
  type LayoutSemantics,
  type SemanticNoteKind,
  type SemanticTextEntity
} from "@kairo/semantic";
import { findEquipmentForDeviceKind, type EquipmentBomCategory } from "../equipment/equipmentLibrary";
import { buildEquipmentEnvelope, type EquipmentFootprintSource } from "../equipment/equipmentEnvelope";
import { buildLayoutValidationIssues, type LayoutValidationIssue } from "../layoutValidation/layoutRules";

export type AdvancedLayoutModelVersion = "0.1";
export type FoundationItemCategory =
  | "base_plate"
  | "floor_mounted_equipment"
  | "post"
  | "anchor_zone"
  | "panel_base"
  | "fence_post"
  | "conveyor_support"
  | "pit_or_trench"
  | "unknown_site_item";
export type WarningSeverity = "info" | "warning" | "critical";
export type ReviewItemStatus = "open" | "accepted" | "resolved" | "deferred";
export type ReviewItemCategory = "device-association" | "annotation" | "station-context" | "foundation" | "model-quality";

export type Line = {
  id: string;
  name: string;
  linePrefix: string;
  stationIds: string[];
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type Station = {
  id: string;
  lineId: string;
  stationNumber: string;
  side: "L" | "R";
  processName: string;
  anchorTextIds: string[];
  deviceIds: string[];
  annotationIds: string[];
  bounds: Bounds3;
  position: Vec3;
  confidence: number;
  evidence: string[];
};

export type Device = {
  id: string;
  kind: DeviceKind;
  primaryLabel: string;
  equipmentTypeId?: string;
  equipmentDisplayName?: string;
  bomCategory?: EquipmentBomCategory;
  equipmentRequiresReview: boolean;
  rawText?: string;
  displayText: string;
  stationId?: string;
  sourceTextIds: string[];
  linkedEntityIds: string[];
  geometryGroupId?: string;
  bounds: Bounds3;
  centroid: Vec3;
  footprintBounds: Bounds3;
  clearanceBounds: Bounds3;
  paddedBounds: Bounds3;
  footprintSource: EquipmentFootprintSource;
  clearanceReason?: string;
  paddingMm: number;
  associationStatus: DeviceGeometryAssociationStatus;
  confidence: number;
  evidence: string[];
};

export type Annotation = {
  id: string;
  rawText: string;
  displayText: string;
  normalizedText: string;
  noteKind: SemanticNoteKind;
  sourceTextIds: string[];
  stationId?: string;
  linkedDeviceId?: string;
  bounds: Bounds3;
  position: Vec3;
  evidence: string[];
};

export type FoundationItem = {
  id: string;
  category: FoundationItemCategory;
  label: string;
  stationId?: string;
  linkedDeviceIds: string[];
  sourceEntityIds: string[];
  layerIds: string[];
  bounds: Bounds3;
  centroid: Vec3;
  installRisk: WarningSeverity;
  confidence: number;
  evidence: string[];
};

export type Warning = {
  id: string;
  severity: WarningSeverity;
  category: ReviewItemCategory;
  message: string;
  sourceIds: string[];
  recommendedAction: string;
};

export type ReviewItem = {
  id: string;
  status: ReviewItemStatus;
  category: ReviewItemCategory;
  severity: WarningSeverity;
  title: string;
  details: string;
  sourceIds: string[];
  linkedIds: string[];
  suggestedAction: string;
};

export type BomRowReviewStatus = "ready" | "needs-review";

export type BomRow = {
  id: string;
  stationId?: string;
  equipmentTypeId?: string;
  equipmentDisplayName?: string;
  bomCategory?: EquipmentBomCategory;
  deviceKind: DeviceKind;
  normalizedLabel: string;
  labels: string[];
  quantity: number;
  confidence: number;
  sourceDeviceIds: string[];
  linkedEntityIds: string[];
  reviewStatus: BomRowReviewStatus;
  reviewReasons: string[];
};

export type ConceptQuoteSummary = {
  counts: {
    lines: number;
    stations: number;
    devices: number;
    annotations: number;
    foundationItems: number;
    warnings: number;
    reviewItems: number;
    linkedDevices: number;
    ambiguousDevices: number;
    unlinkedDevices: number;
    devicesMissingStation: number;
    validationIssues: number;
    bomRows: number;
  };
  devicesByKind: Record<string, number>;
  devicesByEquipmentType: Record<string, number>;
  bomRowsByCategory: Record<string, number>;
  bomRowsByStatus: Record<string, number>;
  validationByRule: Record<string, number>;
  validationBySeverity: Record<string, number>;
  foundationByCategory: Record<string, number>;
  reviewBySeverity: Record<string, number>;
  warningsByCategory: Record<string, number>;
};

export type AdvancedLayoutModel = {
  modelVersion: AdvancedLayoutModelVersion;
  sourcePath?: string;
  lines: Line[];
  stations: Station[];
  devices: Device[];
  annotations: Annotation[];
  foundationItems: FoundationItem[];
  bomRows: BomRow[];
  validationIssues: LayoutValidationIssue[];
  warnings: Warning[];
  reviewItems: ReviewItem[];
  summary: ConceptQuoteSummary;
};

type MutableBounds3 = {
  min: [number, number, number];
  max: [number, number, number];
};

const MODEL_VERSION: AdvancedLayoutModelVersion = "0.1";
const STATION_REF_PATTERN = /\b([A-Z0-9]+-\d{3}[LR])(?:-.+)?\b/i;

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function emptyBounds(): MutableBounds3 {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function boundsIsEmpty(bounds: Bounds3): boolean {
  return bounds.min[0] > bounds.max[0] || bounds.min[1] > bounds.max[1] || bounds.min[2] > bounds.max[2];
}

function mergeBounds(bounds: readonly Bounds3[]): Bounds3 {
  const merged = emptyBounds();
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

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
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

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function stationIdFromText(text: string, stationIds: ReadonlySet<string>): string | undefined {
  const match = text.match(STATION_REF_PATTERN);
  const stationId = match?.[1]?.toUpperCase();
  return stationId && stationIds.has(stationId) ? stationId : undefined;
}

function annotationFromUnknownText(text: SemanticTextEntity, stationIds: ReadonlySet<string>): Annotation {
  const rawText = text.rawText ?? text.text;
  return {
    id: `annotation-${slug(text.entityId)}`,
    rawText,
    displayText: text.displayText ?? safeDisplayText(rawText),
    normalizedText: text.normalizedText,
    noteKind: text.noteKind ?? "unknownNote",
    sourceTextIds: [text.entityId],
    stationId: stationIdFromText(text.normalizedText, stationIds),
    bounds: text.bounds,
    position: text.position,
    evidence: [text.noteKind ? `classified as ${text.noteKind}` : "unclassified semantic text"]
  };
}

function annotationFromLongDevice(device: DeviceSemantic): Annotation | undefined {
  const rawText = device.rawText ?? device.labelText;
  if (!device.isLongText || rawText === device.labelText) return undefined;
  return {
    id: `annotation-device-${slug(device.id)}`,
    rawText,
    displayText: device.displayText ?? safeDisplayText(rawText),
    normalizedText: device.normalizedText,
    noteKind: device.noteKind ?? "annotation",
    sourceTextIds: device.sourceTextEntityIds,
    stationId: device.stationId,
    linkedDeviceId: device.id,
    bounds: device.bounds,
    position: device.position,
    evidence: ["long device label text retained as annotation context"]
  };
}

function buildDevices(semantics: LayoutSemantics): Device[] {
  return semantics.devices
    .map((device) => {
      const equipment = findEquipmentForDeviceKind(device.kind);
      const envelope = buildEquipmentEnvelope(device, equipment);
      return {
        id: device.id,
        kind: device.kind,
        primaryLabel: device.labelText,
        equipmentTypeId: equipment?.item.equipmentTypeId,
        equipmentDisplayName: equipment?.item.displayName,
        bomCategory: equipment?.item.defaultBomCategory,
        equipmentRequiresReview: equipment?.requiresReview ?? true,
        rawText: device.rawText,
        displayText: device.displayText ?? safeDisplayText(device.labelText),
        stationId: device.stationId,
        sourceTextIds: device.sourceTextEntityIds,
        linkedEntityIds: device.linkedEntityIds,
        geometryGroupId: device.geometryGroupId,
        bounds: device.bounds,
        centroid: device.centroid,
        footprintBounds: envelope.footprintBounds,
        clearanceBounds: envelope.clearanceBounds,
        paddedBounds: envelope.paddedBounds,
        footprintSource: envelope.footprintSource,
        clearanceReason: envelope.clearanceReason,
        paddingMm: envelope.paddingMm,
        associationStatus: device.associationStatus,
        confidence: device.confidence,
        evidence: [
          ...device.evidence,
          ...device.associationReason,
          ...(equipment?.reason ?? ["no equipment library match"]),
          ...envelope.evidence
        ]
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildAnnotations(semantics: LayoutSemantics, stationIds: ReadonlySet<string>): Annotation[] {
  const annotations = [
    ...semantics.unknownTextEntities.map((text) => annotationFromUnknownText(text, stationIds)),
    ...semantics.devices.map(annotationFromLongDevice).filter((entry): entry is Annotation => Boolean(entry))
  ];
  return annotations.sort((left, right) => left.id.localeCompare(right.id));
}

function buildStations(semantics: LayoutSemantics, annotations: readonly Annotation[]): Station[] {
  return semantics.stations
    .map((station) => {
      const annotationIds = annotations
        .filter((annotation) => annotation.stationId === station.stationId)
        .map((annotation) => annotation.id)
        .sort();
      return {
        id: station.stationId,
        lineId: `line-${slug(station.linePrefix)}`,
        stationNumber: station.stationNumber,
        side: station.side,
        processName: station.processName,
        anchorTextIds: station.sourceTextEntityIds,
        deviceIds: station.deviceIds,
        annotationIds,
        bounds: station.bounds,
        position: station.position,
        confidence: station.confidence,
        evidence: [`station label ${station.labelText}`, `side ${station.side}`]
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildLines(stations: readonly Station[]): Line[] {
  const byLineId = new Map<string, Station[]>();
  for (const station of stations) {
    const entries = byLineId.get(station.lineId) ?? [];
    entries.push(station);
    byLineId.set(station.lineId, entries);
  }

  return [...byLineId.entries()]
    .map(([lineId, lineStations]) => {
      const stationIds = lineStations.map((station) => station.id).sort();
      const linePrefix = lineId.replace(/^line-/, "").toUpperCase();
      return {
        id: lineId,
        name: `Line ${linePrefix}`,
        linePrefix,
        stationIds,
        bounds: mergeBounds(lineStations.map((station) => station.bounds)),
        confidence: average(lineStations.map((station) => station.confidence)),
        evidence: [`${lineStations.length} station(s) grouped by line prefix`]
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function warningAndReviewForDevice(device: Device): { warning: Warning; reviewItem: ReviewItem } | undefined {
  if (device.associationStatus === "ambiguous") {
    const id = `device-ambiguous-${slug(device.id)}`;
    return {
      warning: {
        id: `warning-${id}`,
        severity: "warning",
        category: "device-association",
        message: `${device.displayText} has ambiguous nearby geometry.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        recommendedAction: "Inspect candidates and choose the intended geometry."
      },
      reviewItem: {
        id: `review-${id}`,
        status: "open",
        category: "device-association",
        severity: "warning",
        title: "Resolve ambiguous device geometry",
        details: `${device.displayText} has multiple plausible geometry associations.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        linkedIds: device.linkedEntityIds,
        suggestedAction: "Select the correct geometry candidate or leave it unlinked."
      }
    };
  }

  if (device.associationStatus === "unlinked") {
    const id = `device-unlinked-${slug(device.id)}`;
    return {
      warning: {
        id: `warning-${id}`,
        severity: "warning",
        category: "device-association",
        message: `${device.displayText} has no linked geometry.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        recommendedAction: "Confirm whether the label should link to nearby geometry."
      },
      reviewItem: {
        id: `review-${id}`,
        status: "open",
        category: "device-association",
        severity: "warning",
        title: "Review unlinked device",
        details: `${device.displayText} is classified as ${device.kind} but has no geometry link.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        linkedIds: [],
        suggestedAction: "Link a geometry candidate or mark the item as intentionally unlinked."
      }
    };
  }

  if (!device.stationId) {
    const id = `device-missing-station-${slug(device.id)}`;
    return {
      warning: {
        id: `warning-${id}`,
        severity: "info",
        category: "station-context",
        message: `${device.displayText} is not assigned to a station.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        recommendedAction: "Check whether station context should be inferred or assigned."
      },
      reviewItem: {
        id: `review-${id}`,
        status: "open",
        category: "station-context",
        severity: "info",
        title: "Review missing station context",
        details: `${device.displayText} has no station assignment.`,
        sourceIds: [device.id, ...device.sourceTextIds],
        linkedIds: device.linkedEntityIds,
        suggestedAction: "Assign station context if needed for quote summary."
      }
    };
  }

  return undefined;
}

function warningAndReviewForAnnotation(annotation: Annotation): { warning: Warning; reviewItem: ReviewItem } {
  const id = `annotation-review-${slug(annotation.id)}`;
  return {
    warning: {
      id: `warning-${id}`,
      severity: "info",
      category: "annotation",
      message: `${annotation.displayText} is retained as annotation metadata.`,
      sourceIds: [annotation.id, ...annotation.sourceTextIds],
      recommendedAction: "Review whether the note affects concept quote or site planning."
    },
    reviewItem: {
      id: `review-${id}`,
      status: "open",
      category: "annotation",
      severity: "info",
      title: "Review retained annotation",
      details: annotation.displayText,
      sourceIds: [annotation.id, ...annotation.sourceTextIds],
      linkedIds: annotation.linkedDeviceId ? [annotation.linkedDeviceId] : [],
      suggestedAction: "Capture quote/site impact if this note changes scope."
    }
  };
}

function buildWarningsAndReviewItems(
  devices: readonly Device[],
  annotations: readonly Annotation[]
): { warnings: Warning[]; reviewItems: ReviewItem[] } {
  const pairs = [
    ...devices.map(warningAndReviewForDevice).filter((entry): entry is { warning: Warning; reviewItem: ReviewItem } => Boolean(entry)),
    ...annotations.filter((annotation) => !annotation.linkedDeviceId).map(warningAndReviewForAnnotation)
  ];
  return {
    warnings: pairs.map((pair) => pair.warning).sort((left, right) => left.id.localeCompare(right.id)),
    reviewItems: pairs.map((pair) => pair.reviewItem).sort((left, right) => left.id.localeCompare(right.id))
  };
}

function normalizedBomLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toUpperCase();
}

function bomGroupingKey(device: Device): string {
  return [
    device.stationId ?? "unassigned",
    device.equipmentTypeId ?? "unmapped",
    device.kind,
    device.equipmentTypeId ? "mapped" : normalizedBomLabel(device.primaryLabel)
  ].join("|");
}

function bomReviewReasons(devices: readonly Device[]): string[] {
  const reasons: string[] = [];
  if (devices.some((device) => !device.equipmentTypeId)) reasons.push("missing equipment library mapping");
  if (devices.some((device) => device.associationStatus === "unlinked")) reasons.push("one or more devices have no linked geometry");
  if (devices.some((device) => device.associationStatus === "ambiguous")) reasons.push("one or more devices have ambiguous geometry");
  if (devices.some((device) => device.confidence < 0.72)) reasons.push("one or more devices are below confidence threshold");
  return reasons;
}

function buildBomRows(devices: readonly Device[]): BomRow[] {
  const groups = new Map<string, Device[]>();
  for (const device of devices) {
    const entries = groups.get(bomGroupingKey(device)) ?? [];
    entries.push(device);
    groups.set(bomGroupingKey(device), entries);
  }

  return [...groups.values()]
    .map((group): BomRow => {
      const sortedDevices = [...group].sort((left, right) => left.id.localeCompare(right.id));
      const first = sortedDevices[0];
      const reviewReasons = bomReviewReasons(sortedDevices);
      const confidence = Math.min(...sortedDevices.map((device) => device.confidence));
      const normalizedLabel = first.equipmentTypeId
        ? first.equipmentTypeId
        : normalizedBomLabel(sortedDevices.map((device) => device.primaryLabel).join(" / "));
      return {
        id: `bom-${slug(first.stationId ?? "unassigned")}-${slug(first.equipmentTypeId ?? first.kind)}-${slug(normalizedLabel)}`,
        stationId: first.stationId,
        equipmentTypeId: first.equipmentTypeId,
        equipmentDisplayName: first.equipmentDisplayName,
        bomCategory: first.bomCategory,
        deviceKind: first.kind,
        normalizedLabel,
        labels: uniqueSorted(sortedDevices.map((device) => device.primaryLabel)),
        quantity: sortedDevices.length,
        confidence,
        sourceDeviceIds: sortedDevices.map((device) => device.id),
        linkedEntityIds: uniqueSorted(sortedDevices.flatMap((device) => device.linkedEntityIds)),
        reviewStatus: reviewReasons.length === 0 ? "ready" : "needs-review",
        reviewReasons
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildSummary(model: Omit<AdvancedLayoutModel, "summary">): ConceptQuoteSummary {
  return {
    counts: {
      lines: model.lines.length,
      stations: model.stations.length,
      devices: model.devices.length,
      annotations: model.annotations.length,
      foundationItems: model.foundationItems.length,
      warnings: model.warnings.length,
      reviewItems: model.reviewItems.length,
      linkedDevices: model.devices.filter((device) => device.associationStatus === "linked").length,
      ambiguousDevices: model.devices.filter((device) => device.associationStatus === "ambiguous").length,
      unlinkedDevices: model.devices.filter((device) => device.associationStatus === "unlinked").length,
      devicesMissingStation: model.devices.filter((device) => !device.stationId).length,
      validationIssues: model.validationIssues.length,
      bomRows: model.bomRows.length
    },
    devicesByKind: countBy(model.devices, (device) => device.kind),
    devicesByEquipmentType: countBy(model.devices, (device) => device.equipmentTypeId ?? "unmapped"),
    bomRowsByCategory: countBy(model.bomRows, (row) => row.bomCategory ?? "unknown"),
    bomRowsByStatus: countBy(model.bomRows, (row) => row.reviewStatus),
    validationByRule: countBy(model.validationIssues, (issue) => issue.ruleId),
    validationBySeverity: countBy(model.validationIssues, (issue) => issue.severity),
    foundationByCategory: countBy(model.foundationItems, (item) => item.category),
    reviewBySeverity: countBy(model.reviewItems, (item) => item.severity),
    warningsByCategory: countBy(model.warnings, (warning) => warning.category)
  };
}

export function buildAdvancedLayoutModel(scenePackage: ScenePackage, semantics: LayoutSemantics): AdvancedLayoutModel {
  const stationIds = new Set(semantics.stations.map((station) => station.stationId));
  const devices = buildDevices(semantics);
  const annotations = buildAnnotations(semantics, stationIds);
  const stations = buildStations(semantics, annotations);
  const lines = buildLines(stations);
  const foundationItems: FoundationItem[] = [];
  const bomRows = buildBomRows(devices);
  const validationIssues = buildLayoutValidationIssues(devices, stations);
  const { warnings, reviewItems } = buildWarningsAndReviewItems(devices, annotations);
  const modelWithoutSummary = {
    modelVersion: MODEL_VERSION,
    sourcePath: scenePackage.manifest.source.path,
    lines,
    stations,
    devices,
    annotations,
    foundationItems,
    bomRows,
    validationIssues,
    warnings,
    reviewItems
  };

  return {
    ...modelWithoutSummary,
    summary: buildSummary(modelWithoutSummary)
  };
}

function csvCell(value: unknown): string {
  const normalized = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${normalized.replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

export function exportAdvancedLayoutJson(model: AdvancedLayoutModel): string {
  return `${JSON.stringify(model, null, 2)}\n`;
}

export function exportAdvancedLayoutCsv(model: AdvancedLayoutModel): string {
  const rows = [
    csvRow([
      "section",
      "id",
      "parent",
      "type",
      "equipment_type",
      "bom_category",
      "footprint_source",
      "padding_mm",
      "status",
      "confidence",
      "quantity",
      "source_ids",
      "label",
      "notes"
    ]),
    ...model.lines.map((line) =>
      csvRow([
        "line",
        line.id,
        "",
        line.linePrefix,
        "",
        "",
        "",
        "",
        "",
        line.confidence.toFixed(2),
        "",
        line.stationIds,
        line.name,
        line.evidence.join("; ")
      ])
    ),
    ...model.stations.map((station) =>
      csvRow([
        "station",
        station.id,
        station.lineId,
        station.side,
        "",
        "",
        "",
        "",
        "",
        station.confidence.toFixed(2),
        "",
        station.anchorTextIds,
        station.processName,
        station.evidence.join("; ")
      ])
    ),
    ...model.devices.map((device) =>
      csvRow([
        "device",
        device.id,
        device.stationId ?? "",
        device.kind,
        device.equipmentTypeId ?? "",
        device.bomCategory ?? "",
        device.footprintSource,
        device.paddingMm,
        device.associationStatus,
        device.confidence.toFixed(2),
        "",
        [...device.sourceTextIds, ...device.linkedEntityIds],
        device.primaryLabel,
        device.evidence.join("; ")
      ])
    ),
    ...model.annotations.map((annotation) =>
      csvRow([
        "annotation",
        annotation.id,
        annotation.stationId ?? annotation.linkedDeviceId ?? "",
        annotation.noteKind,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        annotation.sourceTextIds,
        annotation.rawText,
        annotation.evidence.join("; ")
      ])
    ),
    ...model.foundationItems.map((item) =>
      csvRow([
        "foundation",
        item.id,
        item.stationId ?? "",
        item.category,
        "",
        "",
        "",
        "",
        item.installRisk,
        item.confidence.toFixed(2),
        "",
        item.sourceEntityIds,
        item.label,
        item.evidence.join("; ")
      ])
    ),
    ...model.bomRows.map((row) =>
      csvRow([
        "bom",
        row.id,
        row.stationId ?? "",
        row.deviceKind,
        row.equipmentTypeId ?? "",
        row.bomCategory ?? "",
        "",
        "",
        row.reviewStatus,
        row.confidence.toFixed(2),
        row.quantity,
        [...row.sourceDeviceIds, ...row.linkedEntityIds],
        row.labels,
        row.reviewReasons.join("; ")
      ])
    ),
    ...model.warnings.map((warning) =>
      csvRow([
        "warning",
        warning.id,
        "",
        warning.category,
        "",
        "",
        "",
        "",
        warning.severity,
        "",
        "",
        warning.sourceIds,
        warning.message,
        warning.recommendedAction
      ])
    ),
    ...model.validationIssues.map((issue) =>
      csvRow([
        "validation",
        issue.id,
        "",
        issue.ruleId,
        "",
        "",
        "",
        "",
        issue.severity,
        "",
        "",
        [...issue.entityIds, ...issue.deviceIds],
        issue.message,
        issue.suggestedAction
      ])
    ),
    ...model.reviewItems.map((item) =>
      csvRow([
        "review",
        item.id,
        "",
        item.category,
        "",
        "",
        "",
        "",
        item.status,
        "",
        "",
        [...item.sourceIds, ...item.linkedIds],
        item.title,
        item.suggestedAction
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

function bomMarkdownTableRows(rows: readonly BomRow[]): string[] {
  return [
    markdownRow([
      "Station",
      "Equipment",
      "Type",
      "Category",
      "Qty",
      "Confidence",
      "Status",
      "Labels",
      "Linked entities",
      "Review reasons"
    ]),
    "|---|---|---|---|---:|---:|---|---|---|---|",
    ...(rows.length === 0
      ? [markdownRow(["-", "-", "-", "-", 0, "-", "-", "-", "-", "No rows"])]
      : rows.map((row) =>
          markdownRow([
            row.stationId ?? "-",
            row.equipmentTypeId ?? "unmapped",
            row.deviceKind,
            row.bomCategory ?? "unknown",
            row.quantity,
            row.confidence.toFixed(2),
            row.reviewStatus,
            row.labels.join(", "),
            row.linkedEntityIds.join(", "),
            row.reviewReasons.join("; ")
          ])
        ))
  ];
}

export function exportAdvancedLayoutMarkdown(model: AdvancedLayoutModel): string {
  const bomRowsNeedingReview = model.bomRows.filter((row) => row.reviewStatus === "needs-review");
  const readyBomRows = model.bomRows.filter((row) => row.reviewStatus === "ready");
  const lines = [
    "# Kairo Advanced Engineering Layout Summary",
    "",
    model.sourcePath ? `Source: \`${model.sourcePath}\`` : "Source: current viewer scene",
    "",
    "## Concept Counts",
    "",
    `- Lines: ${model.summary.counts.lines}`,
    `- Stations: ${model.summary.counts.stations}`,
    `- Devices: ${model.summary.counts.devices}`,
    `- Annotations: ${model.summary.counts.annotations}`,
    `- Foundation items: ${model.summary.counts.foundationItems}`,
    `- BOM rows: ${model.summary.counts.bomRows}`,
    `- Validation issues: ${model.summary.counts.validationIssues}`,
    `- Review items: ${model.summary.counts.reviewItems}`,
    "",
    "## Device Types",
    "",
    ...Object.entries(model.summary.devicesByKind).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Equipment Library Types",
    "",
    ...Object.entries(model.summary.devicesByEquipmentType).map(([typeId, count]) => `- ${typeId}: ${count}`),
    "",
    "## BOM Rows",
    "",
    "### Needs Review",
    "",
    ...bomMarkdownTableRows(bomRowsNeedingReview),
    "",
    "### Ready",
    "",
    ...bomMarkdownTableRows(readyBomRows),
    "",
    "## Validation Issues",
    "",
    markdownRow(["Severity", "Rule", "Devices", "Message", "Suggested action"]),
    "|---|---|---|---|---|",
    ...model.validationIssues.map((issue) =>
      markdownRow([
        issue.severity,
        issue.ruleId,
        issue.deviceIds.join(", "),
        issue.message,
        issue.suggestedAction
      ])
    ),
    "",
    "## Review Items",
    "",
    markdownRow(["Severity", "Category", "Title", "Suggested action"]),
    "|---|---|---|---|",
    ...model.reviewItems.map((item) =>
      markdownRow([item.severity, item.category, item.title, item.suggestedAction])
    ),
    "",
    "## Devices",
    "",
    markdownRow(["Label", "Type", "Equipment", "Footprint", "Padding", "Station", "Confidence", "Association", "Linked entities"]),
    "|---|---|---|---|---:|---|---:|---|---:|",
    ...model.devices.map((device) =>
      markdownRow([
        device.primaryLabel,
        device.kind,
        device.equipmentTypeId ?? "unmapped",
        device.footprintSource,
        device.paddingMm,
        device.stationId ?? "-",
        device.confidence.toFixed(2),
        device.associationStatus,
        device.linkedEntityIds.length
      ])
    ),
    "",
    "## Annotations",
    "",
    markdownRow(["Text", "Type", "Station/device", "Source text"]),
    "|---|---|---|---|",
    ...model.annotations.map((annotation) =>
      markdownRow([
        annotation.rawText,
        annotation.noteKind,
        annotation.stationId ?? annotation.linkedDeviceId ?? "-",
        annotation.sourceTextIds.join(", ")
      ])
    )
  ];

  return `${lines.join("\n")}\n`;
}
