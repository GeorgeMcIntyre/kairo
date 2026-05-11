import { computeEntityBounds, computeEntityCentroid, type Bounds3, type RobustSceneBounds, type Vec3 } from "@kairo/core";
import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { parseDeviceText, type DeviceDictionaryMatch, type DeviceKind } from "./deviceDictionary";
import {
  associateLabelToGeometry,
  buildSemanticGeometryGroups,
  type DeviceGeometryAssociationCandidate,
  type DeviceGeometryAssociationStatus,
  type SemanticGeometryGroup,
  type SemanticGeometryGroupSource
} from "./semanticDevices";

export type SemanticTextSourceKind = "TEXT" | "MTEXT" | "ATTDEF";

export type SemanticTextEntity = {
  entityId: string;
  text: string;
  normalizedText: string;
  position: Vec3;
  rotationDeg: number;
  height: number;
  layerId?: string;
  color?: DrawingEntity["color"];
  sourceRef?: string;
  sourceKind: SemanticTextSourceKind;
  bounds: Bounds3;
};

export type ParsedStationLabel = {
  stationId: string;
  linePrefix: string;
  stationNumber: string;
  side: "L" | "R";
  processName: string;
};

export type StationAnchor = ParsedStationLabel & {
  labelText: string;
  position: Vec3;
  rotationDeg: number;
  height: number;
  layerId?: string;
  bounds: Bounds3;
  sourceTextEntityIds: string[];
  confidence: number;
};

export type DeviceStationAssociationMethod = "station-id" | "nearest-station" | "none";

export type DeviceSemantic = {
  id: string;
  kind: DeviceKind;
  labelText: string;
  normalizedText: string;
  position: Vec3;
  rotationDeg: number;
  height: number;
  layerId?: string;
  color?: DrawingEntity["color"];
  bounds: Bounds3;
  centroid: Vec3;
  sourceTextEntityIds: string[];
  nearbyEntityIds: string[];
  linkedEntityIds: string[];
  geometryGroupId?: string;
  geometryGroupSource?: SemanticGeometryGroupSource;
  stationId?: string;
  stationAssociationMethod: DeviceStationAssociationMethod;
  tagSuffix?: string;
  confidence: number;
  evidence: string[];
  associationStatus: DeviceGeometryAssociationStatus;
  associationConfidence: number;
  associationReason: string[];
  associationCandidates: DeviceGeometryAssociationCandidate[];
};

export type DeviceCandidate = {
  kind: DeviceKind;
  entityIds: string[];
  confidence: number;
  evidence: string[];
};

export type StationSemantic = StationAnchor & {
  nearbyEntityIds: string[];
  candidateDevices: DeviceCandidate[];
  deviceIds: string[];
};

export type LayoutSemantics = {
  textEntities: SemanticTextEntity[];
  mergedTextLabels: SemanticTextLabel[];
  geometryGroups: SemanticGeometryGroup[];
  stations: StationSemantic[];
  devices: DeviceSemantic[];
  unknownTextEntities: SemanticTextEntity[];
};

export type LayoutSemanticOptions = {
  stationTextMergeRadius?: number;
  stationTextMergeXFactor?: number;
  stationTextMergeYFactor?: number;
  deviceTextMergeRadius?: number;
  deviceTextMergeXFactor?: number;
  deviceTextMergeYFactor?: number;
  textRotationToleranceDeg?: number;
  textHeightRatioTolerance?: number;
  stationGroupingRadiusX?: number;
  stationGroupingRadiusY?: number;
  deviceGroupingRadiusX?: number;
  deviceGroupingRadiusY?: number;
  deviceAssociationRadius?: number;
  geometryClusterCellSize?: number;
  stationAssociationRadius?: number;
  outlierEntityIds?: ReadonlySet<string>;
};

export type SemanticTextLabel = {
  text: string;
  normalizedText: string;
  position: Vec3;
  rotationDeg: number;
  height: number;
  layerId?: string;
  color?: DrawingEntity["color"];
  bounds: Bounds3;
  sourceTextEntityIds: string[];
};

type EntityRecord = {
  entity: DrawingEntity;
  layerId?: string;
  layerName?: string;
  centroid: Vec3;
  bounds: Bounds3;
};

type StationAssociation = {
  stationId?: string;
  method: DeviceStationAssociationMethod;
  confidenceBoost: number;
};

type MutableBounds3 = {
  min: [number, number, number];
  max: [number, number, number];
};

const STATION_LABEL_PATTERN = /^([A-Z0-9]+)-(\d{3})([LR])(?:\s+(.+))?$/i;
const STATION_ID_PATTERN = /^([A-Z0-9]+)-(\d{3})([LR])$/i;
const STATION_REF_PATTERN = /\b([A-Z0-9]+-\d{3}[LR])(?:-.+)?\b/i;

export function normalizeLabelText(text: string): string {
  return text.replace(/\\P/gi, " ").replace(/\s+/g, " ").trim();
}

function distance2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function rotationDeltaDeg(a: number, b: number): number {
  const delta = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return delta === 0 ? 0 : delta;
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

function stationAnchorScore(anchor: StationAnchor): number {
  return (anchor.processName ? 2 : 0) + anchor.confidence;
}

function mergeStationAnchor(existing: StationAnchor, next: StationAnchor): StationAnchor {
  const primary = stationAnchorScore(next) > stationAnchorScore(existing) ? next : existing;
  const sourceTextEntityIds = [...new Set([...existing.sourceTextEntityIds, ...next.sourceTextEntityIds])];
  return {
    ...primary,
    bounds: mergeBounds([existing.bounds, next.bounds]),
    sourceTextEntityIds,
    confidence: Math.max(existing.confidence, next.confidence)
  };
}

function dedupeStationAnchors(anchors: readonly StationAnchor[]): StationAnchor[] {
  const byStationId = new Map<string, StationAnchor>();
  for (const anchor of anchors) {
    const existing = byStationId.get(anchor.stationId);
    if (!existing) {
      byStationId.set(anchor.stationId, anchor);
      continue;
    }
    byStationId.set(anchor.stationId, mergeStationAnchor(existing, anchor));
  }
  return [...byStationId.values()];
}

function sourceKindFor(entity: Extract<DrawingEntity, { type: "text" }>): SemanticTextSourceKind {
  if (entity.sourceRef?.startsWith("src-dxf-mtext-")) return "MTEXT";
  return entity.origin;
}

export function parseStationLabel(text: string): ParsedStationLabel | undefined {
  const normalized = normalizeLabelText(text).toUpperCase();
  if (parseDeviceText(normalized)?.kind === "robot_model") return undefined;
  const match = normalized.match(STATION_LABEL_PATTERN);
  if (!match) return undefined;
  return {
    stationId: `${match[1]}-${match[2]}${match[3]}`,
    linePrefix: match[1],
    stationNumber: match[2],
    side: match[3] as "L" | "R",
    processName: (match[4] ?? "").trim()
  };
}

export function extractSemanticTextEntities(scenePackage: ScenePackage): SemanticTextEntity[] {
  const items: SemanticTextEntity[] = [];
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      for (const entity of geometry.entities) {
        if (entity.type !== "text") continue;
        const normalizedText = normalizeLabelText(entity.text);
        if (!normalizedText) continue;
        items.push({
          entityId: entity.id,
          text: entity.text,
          normalizedText,
          position: [entity.position[0], entity.position[1], entity.position[2]],
          rotationDeg: entity.rotationDeg,
          height: entity.height,
          layerId: entity.layerId ?? geometry.layerId,
          color: entity.color,
          sourceRef: entity.sourceRef,
          sourceKind: sourceKindFor(entity),
          bounds: computeEntityBounds(entity)
        });
      }
    }
  }
  return items;
}

export function buildStationAnchors(
  textEntities: readonly SemanticTextEntity[],
  options: Pick<LayoutSemanticOptions, "stationTextMergeRadius" | "stationTextMergeXFactor" | "stationTextMergeYFactor"> = {}
): StationAnchor[] {
  const mergeRadius = options.stationTextMergeRadius ?? 900;
  const mergeXFactor = options.stationTextMergeXFactor ?? 7;
  const mergeYFactor = options.stationTextMergeYFactor ?? 5;
  const usedEntityIds = new Set<string>();
  const anchors: StationAnchor[] = [];
  const baseOnlyTexts: Array<{ text: SemanticTextEntity; parsed: ParsedStationLabel }> = [];

  for (const text of textEntities) {
    const parsed = parseStationLabel(text.normalizedText);
    if (!parsed) continue;
    if (!parsed.processName) {
      baseOnlyTexts.push({ text, parsed });
      continue;
    }
    usedEntityIds.add(text.entityId);
    anchors.push({
      ...parsed,
      labelText: text.normalizedText,
      position: text.position,
      rotationDeg: text.rotationDeg,
      height: text.height,
      layerId: text.layerId,
      bounds: text.bounds,
      sourceTextEntityIds: [text.entityId],
      confidence: 0.95
    });
  }

  for (const { text } of baseOnlyTexts) {
    if (usedEntityIds.has(text.entityId)) continue;
    const stationMatch = text.normalizedText.toUpperCase().match(STATION_ID_PATTERN);
    if (!stationMatch) continue;

    const candidates = textEntities
      .filter((candidate) => candidate.entityId !== text.entityId && !usedEntityIds.has(candidate.entityId))
      .filter((candidate) => !STATION_ID_PATTERN.test(candidate.normalizedText.toUpperCase()))
      .map((candidate) => ({
        candidate,
        distance: distance2d(text.position, candidate.position),
        dx: Math.abs(text.position[0] - candidate.position[0]),
        dy: Math.abs(text.position[1] - candidate.position[1])
      }))
      .filter(
        ({ candidate, distance, dx, dy }) =>
          distance <= mergeRadius &&
          dx <= Math.max(text.height, candidate.height) * mergeXFactor &&
          dy <= Math.max(text.height, candidate.height) * mergeYFactor
      )
      .sort((a, b) => a.distance - b.distance);

    const processText = candidates[0]?.candidate;
    if (!processText) continue;
    const parsed = parseStationLabel(`${text.normalizedText} ${processText.normalizedText}`);
    if (!parsed) continue;

    usedEntityIds.add(text.entityId);
    usedEntityIds.add(processText.entityId);
    anchors.push({
      ...parsed,
      labelText: `${text.normalizedText} ${processText.normalizedText}`,
      position: text.position,
      rotationDeg: text.rotationDeg,
      height: Math.max(text.height, processText.height),
      layerId: text.layerId,
      bounds: mergeBounds([text.bounds, processText.bounds]),
      sourceTextEntityIds: [text.entityId, processText.entityId],
      confidence: 0.78
    });
  }

  for (const { text, parsed } of baseOnlyTexts) {
    if (usedEntityIds.has(text.entityId)) continue;
    usedEntityIds.add(text.entityId);
    anchors.push({
      ...parsed,
      labelText: text.normalizedText,
      position: text.position,
      rotationDeg: text.rotationDeg,
      height: text.height,
      layerId: text.layerId,
      bounds: text.bounds,
      sourceTextEntityIds: [text.entityId],
      confidence: 0.9
    });
  }

  return dedupeStationAnchors(anchors).sort(
    (a, b) => a.linePrefix.localeCompare(b.linePrefix) || a.stationNumber.localeCompare(b.stationNumber) || a.side.localeCompare(b.side)
  );
}

function layerNameMap(scenePackage: ScenePackage): Map<string, string> {
  return new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer.name]));
}

function entityRecords(scenePackage: ScenePackage, outlierEntityIds?: ReadonlySet<string>): EntityRecord[] {
  const layers = layerNameMap(scenePackage);
  const records: EntityRecord[] = [];
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      for (const entity of geometry.entities) {
        if (entity.type === "text") continue;
        if (outlierEntityIds?.has(entity.id)) continue;
        const layerId = entity.layerId ?? geometry.layerId;
        records.push({
          entity,
          layerId,
          layerName: layerId ? layers.get(layerId) : undefined,
          centroid: computeEntityCentroid(entity),
          bounds: computeEntityBounds(entity)
        });
      }
    }
  }
  return records;
}

export function groupNearbyEntities(
  anchors: readonly StationAnchor[],
  records: readonly EntityRecord[],
  options: Pick<LayoutSemanticOptions, "stationGroupingRadiusX" | "stationGroupingRadiusY"> = {}
): Map<string, DrawingEntity[]> {
  const radiusX = options.stationGroupingRadiusX ?? 13000;
  const radiusY = options.stationGroupingRadiusY ?? 9000;
  const result = new Map<string, DrawingEntity[]>();
  for (const anchor of anchors) {
    const nearby = records
      .filter((record) => {
        const dx = Math.abs(record.centroid[0] - anchor.position[0]);
        const dy = Math.abs(record.centroid[1] - anchor.position[1]);
        return dx <= radiusX && dy <= radiusY;
      })
      .map((record) => record.entity);
    result.set(anchor.stationId, nearby);
  }
  return result;
}

function textLabelFromEntity(entity: SemanticTextEntity): SemanticTextLabel {
  return {
    text: entity.text,
    normalizedText: entity.normalizedText,
    position: entity.position,
    rotationDeg: entity.rotationDeg,
    height: entity.height,
    layerId: entity.layerId,
    color: entity.color,
    bounds: entity.bounds,
    sourceTextEntityIds: [entity.entityId]
  };
}

function readingOrderCompare(a: SemanticTextEntity, b: SemanticTextEntity): number {
  const maxHeight = Math.max(a.height, b.height, 1);
  const dy = b.position[1] - a.position[1];
  if (Math.abs(dy) > maxHeight * 0.35) return dy;
  return a.position[0] - b.position[0];
}

function mergedTextLabel(items: readonly SemanticTextEntity[]): SemanticTextLabel {
  const sorted = [...items].sort(readingOrderCompare);
  const text = sorted.map((item) => item.text).join(" ");
  const normalizedText = normalizeLabelText(sorted.map((item) => item.normalizedText).join(" "));
  return {
    text,
    normalizedText,
    position: sorted[0].position,
    rotationDeg: sorted[0].rotationDeg,
    height: Math.max(...sorted.map((item) => item.height)),
    layerId: sorted[0].layerId,
    color: sorted[0].color,
    bounds: mergeBounds(sorted.map((item) => item.bounds)),
    sourceTextEntityIds: sorted.map((item) => item.entityId)
  };
}

function mergeCandidateScore(a: SemanticTextEntity, b: SemanticTextEntity, merged: SemanticTextLabel): number {
  const parsed = parseDeviceText(merged.normalizedText);
  const confidence = parsed?.confidence ?? 0;
  return distance2d(a.position, b.position) - confidence * 1000;
}

function textCanMerge(a: SemanticTextEntity, b: SemanticTextEntity, options: LayoutSemanticOptions): boolean {
  const radius = options.deviceTextMergeRadius ?? 850;
  const xFactor = options.deviceTextMergeXFactor ?? 10;
  const yFactor = options.deviceTextMergeYFactor ?? 4;
  const rotationTolerance = options.textRotationToleranceDeg ?? 5;
  const heightRatioTolerance = options.textHeightRatioTolerance ?? 1.6;
  const maxHeight = Math.max(a.height, b.height, 1);
  const minHeight = Math.max(Math.min(a.height, b.height), 1e-6);
  const dx = Math.abs(a.position[0] - b.position[0]);
  const dy = Math.abs(a.position[1] - b.position[1]);
  if (distance2d(a.position, b.position) > radius) return false;
  if (dx > maxHeight * xFactor) return false;
  if (dy > maxHeight * yFactor) return false;
  if (rotationDeltaDeg(a.rotationDeg, b.rotationDeg) > rotationTolerance) return false;
  if (maxHeight / minHeight > heightRatioTolerance) return false;
  return true;
}

export function mergeDeviceTextLabels(
  textEntities: readonly SemanticTextEntity[],
  stationTextEntityIds: ReadonlySet<string>,
  options: LayoutSemanticOptions = {}
): SemanticTextLabel[] {
  const available = textEntities.filter((text) => !stationTextEntityIds.has(text.entityId));
  const mergeCandidates: Array<{ label: SemanticTextLabel; ids: string[]; score: number }> = [];

  for (let i = 0; i < available.length; i += 1) {
    for (let j = i + 1; j < available.length; j += 1) {
      const left = available[i];
      const right = available[j];
      if (parseDeviceText(left.normalizedText)?.parentStationId || parseDeviceText(right.normalizedText)?.parentStationId) continue;
      if (!textCanMerge(left, right, options)) continue;
      const merged = mergedTextLabel([left, right]);
      if (!parseDeviceText(merged.normalizedText)) continue;
      mergeCandidates.push({
        label: merged,
        ids: [left.entityId, right.entityId],
        score: mergeCandidateScore(left, right, merged)
      });
    }
  }

  mergeCandidates.sort((a, b) => a.score - b.score);
  const used = new Set<string>();
  const labels: SemanticTextLabel[] = [];
  for (const candidate of mergeCandidates) {
    if (candidate.ids.some((id) => used.has(id))) continue;
    for (const id of candidate.ids) used.add(id);
    labels.push(candidate.label);
  }

  for (const text of available) {
    if (used.has(text.entityId)) continue;
    labels.push(textLabelFromEntity(text));
  }

  return labels;
}

function classifyDeviceCandidateFromLabel(label: SemanticTextLabel, parsed: DeviceDictionaryMatch): DeviceCandidate {
  return {
    kind: parsed.kind,
    entityIds: label.sourceTextEntityIds,
    confidence: parsed.confidence,
    evidence: parsed.evidence
  };
}

function stationAssociationFor(
  label: SemanticTextLabel,
  stations: readonly StationAnchor[],
  options: LayoutSemanticOptions,
  parsed?: DeviceDictionaryMatch
): StationAssociation {
  const stationIds = new Set(stations.map((station) => station.stationId));
  if (parsed?.parentStationId && stationIds.has(parsed.parentStationId)) {
    return { stationId: parsed.parentStationId, method: "station-id", confidenceBoost: 0.08 };
  }

  const directMatch = label.normalizedText.toUpperCase().match(STATION_REF_PATTERN);
  if (directMatch && stationIds.has(directMatch[1])) {
    return { stationId: directMatch[1], method: "station-id", confidenceBoost: 0.08 };
  }

  const radius = options.stationAssociationRadius ?? 18000;
  const nearest = stations
    .map((station) => ({ station, distance: distance2d(label.position, station.position) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest || nearest.distance > radius) {
    return { method: "none", confidenceBoost: -0.12 };
  }

  const confidenceBoost = Math.max(0, 0.08 - nearest.distance / radius / 10);
  return { stationId: nearest.station.stationId, method: "nearest-station", confidenceBoost };
}

function deviceBoundsFromAssociation(label: SemanticTextLabel, associationBounds?: Bounds3): Bounds3 {
  if (!associationBounds) return label.bounds;
  return mergeBounds([label.bounds, associationBounds]);
}

function semanticIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "none";
}

function semanticDeviceId(label: SemanticTextLabel, kind: DeviceKind, fallbackIndex: number): string {
  const sourceIds = label.sourceTextEntityIds.map(semanticIdPart).filter(Boolean).sort();
  if (sourceIds.length > 0) return `semantic-device-${semanticIdPart(kind)}-${sourceIds.join("_")}`;
  return `semantic-device-${semanticIdPart(kind)}-${fallbackIndex}`;
}

export function buildDeviceSemantics(
  labels: readonly SemanticTextLabel[],
  stations: readonly StationAnchor[],
  geometryGroups: readonly SemanticGeometryGroup[],
  options: LayoutSemanticOptions = {}
): DeviceSemantic[] {
  const devices: DeviceSemantic[] = [];
  for (const label of labels) {
    const parsed = parseDeviceText(label.normalizedText);
    if (!parsed) continue;
    const geometryAssociation = associateLabelToGeometry(label, geometryGroups, parsed, options);
    const linkedGroup = geometryAssociation.status === "linked" ? geometryAssociation.group : undefined;
    const association = stationAssociationFor(label, stations, options, parsed);
    const associatedEntityCount = linkedGroup?.entityIds.length ?? 0;
    const nearbyBoost = Math.min(0.08, associatedEntityCount / 80);
    const geometryBoost =
      geometryAssociation.status === "linked"
        ? Math.min(0.08, geometryAssociation.confidence * 0.08)
        : geometryAssociation.status === "ambiguous"
        ? -0.05
        : -0.1;
    const confidence = Math.max(
      0.1,
      Math.min(0.98, parsed.confidence + association.confidenceBoost + nearbyBoost + geometryBoost)
    );
    const deviceNumber = devices.length + 1;
    const linkedEntityIds = linkedGroup?.entityIds ?? [];
    const nearbyEntityIds = linkedEntityIds;
    devices.push({
      id: semanticDeviceId(label, parsed.kind, deviceNumber),
      kind: parsed.kind,
      labelText: label.text,
      normalizedText: label.normalizedText,
      position: label.position,
      rotationDeg: label.rotationDeg,
      height: label.height,
      layerId: label.layerId,
      color: label.color,
      bounds: linkedGroup ? deviceBoundsFromAssociation(label, linkedGroup.bounds) : label.bounds,
      centroid: linkedGroup?.centroid ?? label.position,
      sourceTextEntityIds: label.sourceTextEntityIds,
      nearbyEntityIds,
      linkedEntityIds,
      geometryGroupId: linkedGroup?.id,
      geometryGroupSource: linkedGroup?.source,
      stationId: association.stationId,
      stationAssociationMethod: association.method,
      tagSuffix: parsed.tagSuffix,
      confidence,
      evidence: [...parsed.evidence, ...geometryAssociation.reason],
      associationStatus: geometryAssociation.status,
      associationConfidence: geometryAssociation.confidence,
      associationReason: geometryAssociation.reason,
      associationCandidates: geometryAssociation.candidates
    });
  }
  return devices;
}

export function computeLayoutSemantics(
  scenePackage: ScenePackage,
  robustBounds?: RobustSceneBounds,
  options: LayoutSemanticOptions = {}
): LayoutSemantics {
  const textEntities = extractSemanticTextEntities(scenePackage);
  const stations = buildStationAnchors(textEntities, options);
  const stationTextEntityIds = new Set(stations.flatMap((station) => station.sourceTextEntityIds));
  const outlierEntityIds = options.outlierEntityIds ?? (robustBounds ? new Set(robustBounds.outlierEntityIds) : undefined);
  const records = entityRecords(scenePackage, outlierEntityIds);
  const geometryGroups = buildSemanticGeometryGroups(scenePackage, { ...options, outlierEntityIds });
  const grouped = groupNearbyEntities(stations, records, options);
  const mergedTextLabels = mergeDeviceTextLabels(textEntities, stationTextEntityIds, options);
  const devices = buildDeviceSemantics(mergedTextLabels, stations, geometryGroups, options);
  const deviceTextEntityIds = new Set(devices.flatMap((device) => device.sourceTextEntityIds));
  const devicesByStationId = new Map<string, DeviceSemantic[]>();

  for (const device of devices) {
    if (!device.stationId) continue;
    const existing = devicesByStationId.get(device.stationId) ?? [];
    existing.push(device);
    devicesByStationId.set(device.stationId, existing);
  }

  return {
    textEntities,
    mergedTextLabels,
    geometryGroups,
    devices,
    unknownTextEntities: textEntities.filter(
      (text) => !stationTextEntityIds.has(text.entityId) && !deviceTextEntityIds.has(text.entityId)
    ),
    stations: stations.map((station) => {
      const nearbyEntities = grouped.get(station.stationId) ?? [];
      const stationDevices = devicesByStationId.get(station.stationId) ?? [];
      return {
        ...station,
        nearbyEntityIds: nearbyEntities.map((entity) => entity.id),
        candidateDevices: stationDevices.map((device) =>
          classifyDeviceCandidateFromLabel(
            {
              text: device.labelText,
              normalizedText: device.normalizedText,
              position: device.position,
              rotationDeg: device.rotationDeg,
              height: device.height,
              layerId: device.layerId,
              color: device.color,
              bounds: device.bounds,
              sourceTextEntityIds: device.sourceTextEntityIds
            },
            {
              kind: device.kind,
              confidence: device.confidence,
              evidence: device.evidence
            }
          )
        ),
        deviceIds: stationDevices.map((device) => device.id)
      };
    })
  };
}
