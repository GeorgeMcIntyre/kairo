import type { Bounds3, Vec3 } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import type { DeviceKind } from "../semantic/deviceDictionary";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity } from "../semantic/layoutSemantics";
import type { DeviceGeometryAssociationStatus } from "../semantic/semanticDevices";
import { safeDisplayText, type SemanticNoteKind } from "../textSafety";

export type AdvancedLayoutModelVersion = "0.2";
export type AreaKind = "line_area" | "station_area" | "cell_area" | "service_area";
export type FoundationPointCategory =
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
export type BomItemCategory = "robot" | "device" | "nest" | "dunnage" | "foundation" | "service-zone" | "annotation";

export type RevisionIdentity = {
  sourcePath?: string;
  sourceFormat?: string;
  sourceFingerprint: string;
  stableKeyVersion: "semantic-v1";
};

export type Line = {
  id: string;
  stableKey: string;
  name: string;
  linePrefix: string;
  stationIds: string[];
  cellIds: string[];
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type Area = {
  id: string;
  stableKey: string;
  kind: AreaKind;
  name: string;
  parentId?: string;
  stationIds: string[];
  deviceIds: string[];
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type Station = {
  id: string;
  stableKey: string;
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

export type Cell = {
  id: string;
  stableKey: string;
  lineId: string;
  name: string;
  stationIds: string[];
  deviceIds: string[];
  bounds: Bounds3;
  centroid: Vec3;
  confidence: number;
  evidence: string[];
};

export type Device = {
  id: string;
  stableKey: string;
  kind: DeviceKind;
  primaryLabel: string;
  rawText?: string;
  displayText: string;
  stationId?: string;
  cellId?: string;
  sourceTextIds: string[];
  linkedEntityIds: string[];
  geometryGroupId?: string;
  bounds: Bounds3;
  centroid: Vec3;
  associationStatus: DeviceGeometryAssociationStatus;
  confidence: number;
  evidence: string[];
};

export type Robot = {
  id: string;
  stableKey: string;
  label: string;
  stationId?: string;
  cellId?: string;
  linkedDeviceId: string;
  linkedEntityIds: string[];
  bounds: Bounds3;
  centroid: Vec3;
  confidence: number;
  evidence: string[];
};

export type Nest = {
  id: string;
  stableKey: string;
  label: string;
  stationId?: string;
  linkedDeviceId: string;
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type Dunnage = {
  id: string;
  stableKey: string;
  label: string;
  stationId?: string;
  linkedDeviceId: string;
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type FoundationPoint = {
  id: string;
  stableKey: string;
  category: FoundationPointCategory;
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

export type ServiceZone = {
  id: string;
  stableKey: string;
  label: string;
  zoneType: "fence" | "cable_tray" | "service_drop";
  stationId?: string;
  linkedDeviceIds: string[];
  bounds: Bounds3;
  confidence: number;
  evidence: string[];
};

export type LayoutAnnotation = {
  id: string;
  stableKey: string;
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

export type BomSummaryItem = {
  id: string;
  stableKey: string;
  category: BomItemCategory;
  label: string;
  quantity: number;
  stationId?: string;
  cellId?: string;
  sourceIds: string[];
  confidence: number;
  reviewStatus: "ready" | "review";
  notes: string[];
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

export type LayoutBomSummary = {
  counts: {
    lines: number;
    areas: number;
    stations: number;
    cells: number;
    devices: number;
    robots: number;
    nests: number;
    dunnage: number;
    annotations: number;
    foundationPoints: number;
    serviceZones: number;
    bomItems: number;
    warnings: number;
    reviewItems: number;
    linkedDevices: number;
    ambiguousDevices: number;
    unlinkedDevices: number;
    devicesMissingStation: number;
  };
  devicesByKind: Record<string, number>;
  bomByCategory: Record<string, number>;
  foundationByCategory: Record<string, number>;
  reviewBySeverity: Record<string, number>;
  warningsByCategory: Record<string, number>;
};

export type AdvancedLayoutModel = {
  modelVersion: AdvancedLayoutModelVersion;
  sourcePath?: string;
  revisionIdentity: RevisionIdentity;
  lines: Line[];
  areas: Area[];
  stations: Station[];
  cells: Cell[];
  devices: Device[];
  robots: Robot[];
  nests: Nest[];
  dunnage: Dunnage[];
  annotations: LayoutAnnotation[];
  foundationPoints: FoundationPoint[];
  serviceZones: ServiceZone[];
  bomItems: BomSummaryItem[];
  warnings: Warning[];
  reviewItems: ReviewItem[];
  summary: LayoutBomSummary;
};

type MutableBounds3 = {
  min: [number, number, number];
  max: [number, number, number];
};

const MODEL_VERSION: AdvancedLayoutModelVersion = "0.2";
const STATION_REF_PATTERN = /\b([A-Z0-9]+-\d{3}[LR])(?:-.+)?\b/i;

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function stableKey(kind: string, value: string): string {
  return `${kind}:${slug(value)}`;
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

function centroid(bounds: Bounds3): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2
  ];
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

function sourceFingerprint(scenePackage: ScenePackage): string {
  const source = scenePackage.manifest.source;
  const stats = [
    scenePackage.scene.nodes.length,
    scenePackage.layers.layers.length,
    scenePackage.geometry.length,
    scenePackage.sourceMap.sources.length
  ].join(":");
  return stableKey("source", `${source.format}:${source.path ?? "current"}:${stats}`);
}

function annotationFromUnknownText(text: SemanticTextEntity, stationIds: ReadonlySet<string>): LayoutAnnotation {
  const rawText = text.rawText ?? text.text;
  return {
    id: `annotation-${slug(text.entityId)}`,
    stableKey: stableKey("annotation", text.entityId),
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

function annotationFromLongDevice(device: DeviceSemantic): LayoutAnnotation | undefined {
  const rawText = device.rawText ?? device.labelText;
  if (!device.isLongText || rawText === device.labelText) return undefined;
  return {
    id: `annotation-device-${slug(device.id)}`,
    stableKey: stableKey("annotation", device.id),
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
      stableKey: stableKey("device", device.id),
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

function buildAnnotations(semantics: LayoutSemantics, stationIds: ReadonlySet<string>): LayoutAnnotation[] {
  const annotations = [
    ...semantics.unknownTextEntities.map((text) => annotationFromUnknownText(text, stationIds)),
    ...semantics.devices.map(annotationFromLongDevice).filter((entry): entry is LayoutAnnotation => Boolean(entry))
  ];
  return annotations.sort((left, right) => left.id.localeCompare(right.id));
}

function buildStations(semantics: LayoutSemantics, annotations: readonly LayoutAnnotation[]): Station[] {
  return semantics.stations
    .map((station) => {
      const annotationIds = annotations
        .filter((annotation) => annotation.stationId === station.stationId)
        .map((annotation) => annotation.id)
        .sort();
      return {
        id: station.stationId,
        stableKey: stableKey("station", station.stationId),
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

function buildCells(stations: readonly Station[], devices: readonly Device[]): Cell[] {
  const devicesByStationId = new Map<string, Device[]>();
  for (const device of devices) {
    if (!device.stationId) continue;
    const entries = devicesByStationId.get(device.stationId) ?? [];
    entries.push(device);
    devicesByStationId.set(device.stationId, entries);
  }

  const byLineAndNumber = new Map<string, Station[]>();
  for (const station of stations) {
    const key = `${station.lineId}:${station.stationNumber}`;
    const entries = byLineAndNumber.get(key) ?? [];
    entries.push(station);
    byLineAndNumber.set(key, entries);
  }

  return [...byLineAndNumber.entries()]
    .map(([key, cellStations]) => {
      const [lineId, stationNumber] = key.split(":");
      const stationIds = cellStations.map((station) => station.id).sort();
      const cellDevices = stationIds.flatMap((stationId) => devicesByStationId.get(stationId) ?? []);
      const cellBounds = mergeBounds([...cellStations.map((station) => station.bounds), ...cellDevices.map((device) => device.bounds)]);
      const id = `cell-${slug(lineId.replace(/^line-/, ""))}-${slug(stationNumber)}`;
      return {
        id,
        stableKey: stableKey("cell", `${lineId}:${stationNumber}`),
        lineId,
        name: `${lineId.replace(/^line-/, "").toUpperCase()} ${stationNumber} cell`,
        stationIds,
        deviceIds: cellDevices.map((device) => device.id).sort(),
        bounds: cellBounds,
        centroid: centroid(cellBounds),
        confidence: average(cellStations.map((station) => station.confidence)),
        evidence: [`${cellStations.length} station side(s) grouped by line and station number`]
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildLines(stations: readonly Station[], cells: readonly Cell[]): Line[] {
  const byLineId = new Map<string, Station[]>();
  for (const station of stations) {
    const entries = byLineId.get(station.lineId) ?? [];
    entries.push(station);
    byLineId.set(station.lineId, entries);
  }

  return [...byLineId.entries()]
    .map(([lineId, lineStations]) => {
      const stationIds = lineStations.map((station) => station.id).sort();
      const cellIds = cells.filter((cell) => cell.lineId === lineId).map((cell) => cell.id).sort();
      const linePrefix = lineId.replace(/^line-/, "").toUpperCase();
      return {
        id: lineId,
        stableKey: stableKey("line", linePrefix),
        name: `Line ${linePrefix}`,
        linePrefix,
        stationIds,
        cellIds,
        bounds: mergeBounds(lineStations.map((station) => station.bounds)),
        confidence: average(lineStations.map((station) => station.confidence)),
        evidence: [`${lineStations.length} station(s) grouped by line prefix`]
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildAreas(lines: readonly Line[], stations: readonly Station[], cells: readonly Cell[], serviceZones: readonly ServiceZone[]): Area[] {
  const lineAreas = lines.map((line) => ({
    id: `area-${line.id}`,
    stableKey: stableKey("area", line.id),
    kind: "line_area" as const,
    name: line.name,
    stationIds: line.stationIds,
    deviceIds: [],
    bounds: line.bounds,
    confidence: line.confidence,
    evidence: ["area derived from detected line bounds"]
  }));
  const stationAreas = stations.map((station) => ({
    id: `area-station-${slug(station.id)}`,
    stableKey: stableKey("area", station.id),
    kind: "station_area" as const,
    name: `${station.id} ${station.processName}`,
    parentId: station.lineId,
    stationIds: [station.id],
    deviceIds: station.deviceIds,
    bounds: station.bounds,
    confidence: station.confidence,
    evidence: ["area derived from station label and nearby semantic context"]
  }));
  const cellAreas = cells.map((cell) => ({
    id: `area-${cell.id}`,
    stableKey: stableKey("area", cell.id),
    kind: "cell_area" as const,
    name: cell.name,
    parentId: cell.lineId,
    stationIds: cell.stationIds,
    deviceIds: cell.deviceIds,
    bounds: cell.bounds,
    confidence: cell.confidence,
    evidence: ["area derived from cell candidate bounds"]
  }));
  const serviceAreas = serviceZones.map((zone) => ({
    id: `area-${zone.id}`,
    stableKey: stableKey("area", zone.id),
    kind: "service_area" as const,
    name: zone.label,
    stationIds: zone.stationId ? [zone.stationId] : [],
    deviceIds: zone.linkedDeviceIds,
    bounds: zone.bounds,
    confidence: zone.confidence,
    evidence: ["area derived from service zone device candidate"]
  }));
  return [...lineAreas, ...stationAreas, ...cellAreas, ...serviceAreas].sort((left, right) => left.id.localeCompare(right.id));
}

function buildServiceZones(devices: readonly Device[]): ServiceZone[] {
  return devices
    .filter(
      (device): device is Device & { kind: "fence" | "cable_tray" | "service_drop" } =>
        device.kind === "fence" || device.kind === "cable_tray" || device.kind === "service_drop"
    )
    .map((device) => ({
      id: `service-zone-${slug(device.id)}`,
      stableKey: stableKey("service-zone", device.id),
      label: device.displayText,
      zoneType: device.kind,
      stationId: device.stationId,
      linkedDeviceIds: [device.id],
      bounds: device.bounds,
      confidence: device.confidence,
      evidence: [`${device.kind} semantic candidate promoted to service zone`]
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildFoundationPoints(devices: readonly Device[]): FoundationPoint[] {
  return devices
    .filter((device) => device.kind === "base_plate")
    .map((device) => ({
      id: `foundation-${slug(device.id)}`,
      stableKey: stableKey("foundation", device.id),
      category: "base_plate" as const,
      label: device.displayText,
      stationId: device.stationId,
      linkedDeviceIds: [device.id],
      sourceEntityIds: device.linkedEntityIds,
      layerIds: [],
      bounds: device.bounds,
      centroid: device.centroid,
      installRisk: device.associationStatus === "linked" ? ("info" as const) : ("warning" as const),
      confidence: device.confidence,
      evidence: ["base plate semantic candidate promoted to foundation planning point"]
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildRobots(devices: readonly Device[]): Robot[] {
  return devices
    .filter(
      (device) =>
        device.kind === "robot_model" ||
        device.kind === "material_handling_robot_or_tooling" ||
        device.kind === "robot_controller" ||
        device.kind === "device_number"
    )
    .map((device) => ({
      id: `robot-${slug(device.id)}`,
      stableKey: stableKey("robot", device.id),
      label: device.displayText,
      stationId: device.stationId,
      cellId: device.cellId,
      linkedDeviceId: device.id,
      linkedEntityIds: device.linkedEntityIds,
      bounds: device.bounds,
      centroid: device.centroid,
      confidence: device.confidence,
      evidence: [`${device.kind} semantic candidate promoted to robot/device planning item`]
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildNests(devices: readonly Device[]): Nest[] {
  return devices
    .filter((device) => device.kind === "nest")
    .map((device) => ({
      id: `nest-${slug(device.id)}`,
      stableKey: stableKey("nest", device.id),
      label: device.displayText,
      stationId: device.stationId,
      linkedDeviceId: device.id,
      bounds: device.bounds,
      confidence: device.confidence,
      evidence: ["nest semantic candidate promoted to nest planning item"]
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function buildDunnage(devices: readonly Device[]): Dunnage[] {
  return devices
    .filter((device) => device.kind === "dunnage")
    .map((device) => ({
      id: `dunnage-${slug(device.id)}`,
      stableKey: stableKey("dunnage", device.id),
      label: device.displayText,
      stationId: device.stationId,
      linkedDeviceId: device.id,
      bounds: device.bounds,
      confidence: device.confidence,
      evidence: ["dunnage semantic candidate promoted to dunnage planning item"]
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function applyCellIdsToDevices(devices: readonly Device[], cells: readonly Cell[]): Device[] {
  const cellByStationId = new Map<string, string>();
  for (const cell of cells) {
    for (const stationId of cell.stationIds) {
      cellByStationId.set(stationId, cell.id);
    }
  }
  return devices.map((device) => ({
    ...device,
    cellId: device.stationId ? cellByStationId.get(device.stationId) : undefined
  }));
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
        suggestedAction: "Assign station context if needed for the Layout BOM Summary."
      }
    };
  }

  return undefined;
}

function warningAndReviewForAnnotation(annotation: LayoutAnnotation): { warning: Warning; reviewItem: ReviewItem } {
  const id = `annotation-review-${slug(annotation.id)}`;
  return {
    warning: {
      id: `warning-${id}`,
      severity: "info",
      category: "annotation",
      message: `${annotation.displayText} is retained as annotation metadata.`,
      sourceIds: [annotation.id, ...annotation.sourceTextIds],
      recommendedAction: "Review whether the note affects scope, site planning, or the Layout BOM Summary."
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
      suggestedAction: "Capture BOM/site impact if this note changes scope."
    }
  };
}

function buildWarningsAndReviewItems(
  devices: readonly Device[],
  annotations: readonly LayoutAnnotation[]
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

function bomCategoryForDevice(device: Device): BomItemCategory {
  if (device.kind === "nest") return "nest";
  if (device.kind === "dunnage") return "dunnage";
  if (
    device.kind === "robot_model" ||
    device.kind === "material_handling_robot_or_tooling" ||
    device.kind === "robot_controller" ||
    device.kind === "device_number"
  ) {
    return "robot";
  }
  return "device";
}

function buildBomItems(
  devices: readonly Device[],
  foundationPoints: readonly FoundationPoint[],
  serviceZones: readonly ServiceZone[],
  annotations: readonly LayoutAnnotation[]
): BomSummaryItem[] {
  const deviceItems = devices.map((device) => ({
    id: `bom-${slug(device.id)}`,
    stableKey: stableKey("bom", device.id),
    category: bomCategoryForDevice(device),
    label: device.displayText,
    quantity: 1,
    stationId: device.stationId,
    cellId: device.cellId,
    sourceIds: [device.id, ...device.sourceTextIds, ...device.linkedEntityIds],
    confidence: device.confidence,
    reviewStatus: device.associationStatus === "linked" && device.confidence >= 0.75 ? "ready" : "review",
    notes: [`${device.kind}; ${device.associationStatus}`]
  })) satisfies BomSummaryItem[];

  const foundationItems = foundationPoints.map((point) => ({
    id: `bom-${slug(point.id)}`,
    stableKey: stableKey("bom", point.id),
    category: "foundation" as const,
    label: point.label,
    quantity: 1,
    stationId: point.stationId,
    sourceIds: [point.id, ...point.sourceEntityIds],
    confidence: point.confidence,
    reviewStatus: point.installRisk === "info" ? ("ready" as const) : ("review" as const),
    notes: [point.category]
  }));

  const serviceItems = serviceZones.map((zone) => ({
    id: `bom-${slug(zone.id)}`,
    stableKey: stableKey("bom", zone.id),
    category: "service-zone" as const,
    label: zone.label,
    quantity: 1,
    stationId: zone.stationId,
    sourceIds: [zone.id, ...zone.linkedDeviceIds],
    confidence: zone.confidence,
    reviewStatus: zone.confidence >= 0.75 ? ("ready" as const) : ("review" as const),
    notes: [zone.zoneType]
  }));

  const annotationItems = annotations
    .filter((annotation) => !annotation.linkedDeviceId)
    .map((annotation) => ({
      id: `bom-${slug(annotation.id)}`,
      stableKey: stableKey("bom", annotation.id),
      category: "annotation" as const,
      label: annotation.displayText,
      quantity: 1,
      stationId: annotation.stationId,
      sourceIds: [annotation.id, ...annotation.sourceTextIds],
      confidence: 0,
      reviewStatus: "review" as const,
      notes: [annotation.noteKind]
    }));

  return [...deviceItems, ...foundationItems, ...serviceItems, ...annotationItems].sort((left, right) => left.id.localeCompare(right.id));
}

function buildSummary(model: Omit<AdvancedLayoutModel, "summary">): LayoutBomSummary {
  return {
    counts: {
      lines: model.lines.length,
      areas: model.areas.length,
      stations: model.stations.length,
      cells: model.cells.length,
      devices: model.devices.length,
      robots: model.robots.length,
      nests: model.nests.length,
      dunnage: model.dunnage.length,
      annotations: model.annotations.length,
      foundationPoints: model.foundationPoints.length,
      serviceZones: model.serviceZones.length,
      bomItems: model.bomItems.length,
      warnings: model.warnings.length,
      reviewItems: model.reviewItems.length,
      linkedDevices: model.devices.filter((device) => device.associationStatus === "linked").length,
      ambiguousDevices: model.devices.filter((device) => device.associationStatus === "ambiguous").length,
      unlinkedDevices: model.devices.filter((device) => device.associationStatus === "unlinked").length,
      devicesMissingStation: model.devices.filter((device) => !device.stationId).length
    },
    devicesByKind: countBy(model.devices, (device) => device.kind),
    bomByCategory: countBy(model.bomItems, (item) => item.category),
    foundationByCategory: countBy(model.foundationPoints, (item) => item.category),
    reviewBySeverity: countBy(model.reviewItems, (item) => item.severity),
    warningsByCategory: countBy(model.warnings, (warning) => warning.category)
  };
}

export function buildAdvancedLayoutModel(scenePackage: ScenePackage, semantics: LayoutSemantics): AdvancedLayoutModel {
  const stationIds = new Set(semantics.stations.map((station) => station.stationId));
  const initialDevices = buildDevices(semantics);
  const annotations = buildAnnotations(semantics, stationIds);
  const stations = buildStations(semantics, annotations);
  const initialCells = buildCells(stations, initialDevices);
  const devices = applyCellIdsToDevices(initialDevices, initialCells);
  const cells = buildCells(stations, devices);
  const serviceZones = buildServiceZones(devices);
  const foundationPoints = buildFoundationPoints(devices);
  const lines = buildLines(stations, cells);
  const areas = buildAreas(lines, stations, cells, serviceZones);
  const robots = buildRobots(devices);
  const nests = buildNests(devices);
  const dunnage = buildDunnage(devices);
  const { warnings, reviewItems } = buildWarningsAndReviewItems(devices, annotations);
  const bomItems = buildBomItems(devices, foundationPoints, serviceZones, annotations);
  const modelWithoutSummary = {
    modelVersion: MODEL_VERSION,
    sourcePath: scenePackage.manifest.source.path,
    revisionIdentity: {
      sourcePath: scenePackage.manifest.source.path,
      sourceFormat: scenePackage.manifest.source.format,
      sourceFingerprint: sourceFingerprint(scenePackage),
      stableKeyVersion: "semantic-v1" as const
    },
    lines,
    areas,
    stations,
    cells,
    devices,
    robots,
    nests,
    dunnage,
    annotations,
    foundationPoints,
    serviceZones,
    bomItems,
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
    ...model.areas.map((area) =>
      csvRow([
        "area",
        area.id,
        area.parentId ?? "",
        area.kind,
        "",
        area.confidence.toFixed(2),
        [...area.stationIds, ...area.deviceIds],
        area.name,
        area.evidence.join("; ")
      ])
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
    ...model.cells.map((cell) =>
      csvRow([
        "cell",
        cell.id,
        cell.lineId,
        "station-cell",
        "",
        cell.confidence.toFixed(2),
        [...cell.stationIds, ...cell.deviceIds],
        cell.name,
        cell.evidence.join("; ")
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
    ...model.robots.map((robot) =>
      csvRow([
        "robot",
        robot.id,
        robot.stationId ?? "",
        "robot",
        "",
        robot.confidence.toFixed(2),
        [robot.linkedDeviceId, ...robot.linkedEntityIds],
        robot.label,
        robot.evidence.join("; ")
      ])
    ),
    ...model.nests.map((nest) =>
      csvRow(["nest", nest.id, nest.stationId ?? "", "nest", "", nest.confidence.toFixed(2), nest.linkedDeviceId, nest.label, nest.evidence.join("; ")])
    ),
    ...model.dunnage.map((entry) =>
      csvRow([
        "dunnage",
        entry.id,
        entry.stationId ?? "",
        "dunnage",
        "",
        entry.confidence.toFixed(2),
        entry.linkedDeviceId,
        entry.label,
        entry.evidence.join("; ")
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
    ...model.foundationPoints.map((point) =>
      csvRow([
        "foundation",
        point.id,
        point.stationId ?? "",
        point.category,
        point.installRisk,
        point.confidence.toFixed(2),
        point.sourceEntityIds,
        point.label,
        point.evidence.join("; ")
      ])
    ),
    ...model.serviceZones.map((zone) =>
      csvRow([
        "service-zone",
        zone.id,
        zone.stationId ?? "",
        zone.zoneType,
        "",
        zone.confidence.toFixed(2),
        zone.linkedDeviceIds,
        zone.label,
        zone.evidence.join("; ")
      ])
    ),
    ...model.bomItems.map((item) =>
      csvRow([
        "bom",
        item.id,
        item.stationId ?? item.cellId ?? "",
        item.category,
        item.reviewStatus,
        item.confidence.toFixed(2),
        item.sourceIds,
        item.label,
        item.notes.join("; ")
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
    "# Kairo Layout BOM Summary",
    "",
    model.sourcePath ? `Source: \`${model.sourcePath}\`` : "Source: current viewer scene",
    `Revision key: \`${model.revisionIdentity.sourceFingerprint}\``,
    "",
    "## Layout Counts",
    "",
    `- Lines: ${model.summary.counts.lines}`,
    `- Areas: ${model.summary.counts.areas}`,
    `- Stations: ${model.summary.counts.stations}`,
    `- Cells: ${model.summary.counts.cells}`,
    `- Devices: ${model.summary.counts.devices}`,
    `- Robots/devices: ${model.summary.counts.robots}`,
    `- Nests: ${model.summary.counts.nests}`,
    `- Dunnage: ${model.summary.counts.dunnage}`,
    `- Foundation points: ${model.summary.counts.foundationPoints}`,
    `- Service zones: ${model.summary.counts.serviceZones}`,
    `- BOM items: ${model.summary.counts.bomItems}`,
    `- Review items: ${model.summary.counts.reviewItems}`,
    "",
    "## BOM Categories",
    "",
    ...Object.entries(model.summary.bomByCategory).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## Device Types",
    "",
    ...Object.entries(model.summary.devicesByKind).map(([kind, count]) => `- ${kind}: ${count}`),
    "",
    "## BOM Items",
    "",
    markdownRow(["Category", "Label", "Station", "Cell", "Qty", "Status", "Confidence"]),
    "|---|---|---|---|---:|---|---:|",
    ...model.bomItems.map((item) =>
      markdownRow([
        item.category,
        item.label,
        item.stationId ?? "-",
        item.cellId ?? "-",
        item.quantity,
        item.reviewStatus,
        item.confidence.toFixed(2)
      ])
    ),
    "",
    "## Station/Cell Groups",
    "",
    markdownRow(["Cell", "Stations", "Devices", "Confidence"]),
    "|---|---|---:|---:|",
    ...model.cells.map((cell) => markdownRow([cell.name, cell.stationIds.join(", "), cell.deviceIds.length, cell.confidence.toFixed(2)])),
    "",
    "## Review Items",
    "",
    markdownRow(["Severity", "Category", "Title", "Suggested action"]),
    "|---|---|---|---|",
    ...model.reviewItems.map((item) => markdownRow([item.severity, item.category, item.title, item.suggestedAction])),
    "",
    "## Devices",
    "",
    markdownRow(["Label", "Type", "Station", "Cell", "Confidence", "Association", "Linked entities"]),
    "|---|---|---|---|---:|---|---:|",
    ...model.devices.map((device) =>
      markdownRow([
        device.primaryLabel,
        device.kind,
        device.stationId ?? "-",
        device.cellId ?? "-",
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
