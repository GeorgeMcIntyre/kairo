import type { Bounds3, Vec3 } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import { safeDisplayText, type SemanticNoteKind } from "../textSafety";
import type { DeviceKind } from "../semantic/deviceDictionary";
import type { DeviceGeometryAssociationStatus } from "../semantic/semanticDevices";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity } from "../semantic/layoutSemantics";

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
  rawText?: string;
  displayText: string;
  stationId?: string;
  sourceTextIds: string[];
  linkedEntityIds: string[];
  geometryGroupId?: string;
  bounds: Bounds3;
  centroid: Vec3;
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
  };
  devicesByKind: Record<string, number>;
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
    .map((device) => ({
      id: device.id,
      kind: device.kind,
      primaryLabel: device.labelText,
      rawText: device.rawText,
      displayText: device.displayText ?? safeDisplayText(device.labelText),
      stationId: device.stationId,
      sourceTextIds: device.sourceTextEntityIds,
      linkedEntityIds: device.linkedEntityIds,
      geometryGroupId: device.geometryGroupId,
      bounds: device.bounds,
      centroid: device.centroid,
      associationStatus: device.associationStatus,
      confidence: device.confidence,
      evidence: [...device.evidence, ...device.associationReason]
    }))
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
      devicesMissingStation: model.devices.filter((device) => !device.stationId).length
    },
    devicesByKind: countBy(model.devices, (device) => device.kind),
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
  const { warnings, reviewItems } = buildWarningsAndReviewItems(devices, annotations);
  const modelWithoutSummary = {
    modelVersion: MODEL_VERSION,
    sourcePath: scenePackage.manifest.source.path,
    lines,
    stations,
    devices,
    annotations,
    foundationItems,
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
    csvRow(["section", "id", "parent", "type", "status", "confidence", "source_ids", "label", "notes"]),
    ...model.lines.map((line) =>
      csvRow(["line", line.id, "", line.linePrefix, "", line.confidence.toFixed(2), line.stationIds, line.name, line.evidence.join("; ")])
    ),
    ...model.stations.map((station) =>
      csvRow([
        "station",
        station.id,
        station.lineId,
        station.side,
        "",
        station.confidence.toFixed(2),
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
        device.associationStatus,
        device.confidence.toFixed(2),
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
        item.installRisk,
        item.confidence.toFixed(2),
        item.sourceEntityIds,
        item.label,
        item.evidence.join("; ")
      ])
    ),
    ...model.warnings.map((warning) =>
      csvRow([
        "warning",
        warning.id,
        "",
        warning.category,
        warning.severity,
        "",
        warning.sourceIds,
        warning.message,
        warning.recommendedAction
      ])
    ),
    ...model.reviewItems.map((item) =>
      csvRow([
        "review",
        item.id,
        "",
        item.category,
        item.status,
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

export function exportAdvancedLayoutMarkdown(model: AdvancedLayoutModel): string {
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
    `- Review items: ${model.summary.counts.reviewItems}`,
    "",
    "## Device Types",
    "",
    ...Object.entries(model.summary.devicesByKind).map(([kind, count]) => `- ${kind}: ${count}`),
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
    markdownRow(["Label", "Type", "Station", "Confidence", "Association", "Linked entities"]),
    "|---|---|---|---:|---|---:|",
    ...model.devices.map((device) =>
      markdownRow([
        device.primaryLabel,
        device.kind,
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
