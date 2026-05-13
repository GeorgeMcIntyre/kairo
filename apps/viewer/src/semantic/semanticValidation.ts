import type { Bounds3, EntityBounds, RobustSceneBounds, Vec3 } from "@kairo/core";
import { MAX_SEMANTIC_OVERLAY_CHARS, safeDisplayText, type SemanticNoteKind } from "../textSafety";
import type { DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity, StationSemantic } from "./layoutSemantics";
import type { DeviceGeometryAssociationCandidate, DeviceGeometryAssociationStatus } from "./semanticDevices";

export type SemanticSelection =
  | { kind: "station"; id: string }
  | { kind: "device"; id: string }
  | { kind: "unknown-text"; id: string };

export type SemanticValidationFilters = {
  stationSearch: string;
  deviceKind: "all" | DeviceKind;
  minConfidence: number;
  showUnknownLabels: boolean;
  showUnassignedDevices: boolean;
};

export type FilteredSemanticValidation = {
  stations: StationSemantic[];
  devices: DeviceSemantic[];
  unknownTextEntities: SemanticTextEntity[];
};

export type SemanticSelectionDetails = {
  selection: SemanticSelection;
  title: string;
  subtitle: string;
  confidence?: number;
  bounds?: Bounds3;
  sourceTextEntityIds: string[];
  nearbyEntityIds: string[];
  linkedEntityIds: string[];
  stationId?: string;
  candidateKind?: DeviceKind;
  associationMethod?: DeviceSemantic["stationAssociationMethod"];
  geometryAssociationStatus?: DeviceGeometryAssociationStatus;
  associationCandidates: DeviceGeometryAssociationCandidate[];
  evidence: string[];
  rawText?: string;
  displayText?: string;
  associationText?: string;
  noteKind?: SemanticNoteKind;
  isLongText?: boolean;
};

export type SemanticOverlayStation = {
  id: string;
  label: string;
  processName: string;
  position: Vec3;
  bounds: Bounds3;
  confidence: number;
  selected: boolean;
};

export type SemanticOverlayDevice = {
  id: string;
  label: string;
  kind: DeviceKind;
  position: Vec3;
  centroid: Vec3;
  bounds: Bounds3;
  confidence: number;
  associationStatus: DeviceGeometryAssociationStatus;
  stationId?: string;
  selected: boolean;
};

export type SemanticOverlayUnknownLabel = {
  id: string;
  label: string;
  position: Vec3;
  bounds: Bounds3;
  selected: boolean;
};

export type SemanticOverlayAssociationLine = {
  id: string;
  stationId: string;
  deviceId: string;
  from: Vec3;
  to: Vec3;
  selected: boolean;
};

export type SemanticOverlaySourceMarker = {
  id: string;
  position: Vec3;
  label: string;
};

export type SemanticOverlayModel = {
  stations: SemanticOverlayStation[];
  deviceCandidates: SemanticOverlayDevice[];
  unknownLabels: SemanticOverlayUnknownLabel[];
  associationLines: SemanticOverlayAssociationLine[];
  selectedBounds?: Bounds3;
  selectedSourceMarkers: SemanticOverlaySourceMarker[];
};

export type SemanticOverlayModelOptions = {
  stationLimit?: number;
  deviceLimit?: number;
  unknownLabelLimit?: number;
};

export type OutlierLayerSummary = {
  layerId: string;
  count: number;
};

export type OutlierSummary = {
  outlierCount: number;
  topLayers: OutlierLayerSummary[];
  topOutliers: EntityBounds[];
};

export const DEFAULT_SEMANTIC_VALIDATION_FILTERS: SemanticValidationFilters = {
  stationSearch: "",
  deviceKind: "all",
  minConfidence: 0,
  showUnknownLabels: false,
  showUnassignedDevices: true
};

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function selectionKey(selection: SemanticSelection | undefined): string {
  if (!selection) return "";
  return `${selection.kind}:${selection.id}`;
}

function stationMatchesSearch(station: StationSemantic, search: string): boolean {
  const query = normalized(search);
  if (!query) return true;
  if (station.stationId.toUpperCase().includes(query)) return true;
  return station.processName.toUpperCase().includes(query);
}

function deviceMatchesSearch(device: DeviceSemantic, search: string): boolean {
  const query = normalized(search);
  if (!query) return true;
  if (device.stationId?.toUpperCase().includes(query)) return true;
  return device.normalizedText.toUpperCase().includes(query);
}

function deviceMatchesKind(device: DeviceSemantic, kind: SemanticValidationFilters["deviceKind"]): boolean {
  if (kind === "all") return true;
  return device.kind === kind;
}

export function filterSemanticValidation(
  semantics: LayoutSemantics,
  filters: SemanticValidationFilters
): FilteredSemanticValidation {
  const minConfidence = Math.min(Math.max(filters.minConfidence, 0), 1);
  const stations = semantics.stations.filter((station) => stationMatchesSearch(station, filters.stationSearch));
  const stationIds = new Set(stations.map((station) => station.stationId));
  const devices = semantics.devices.filter((device) => {
    if (!deviceMatchesKind(device, filters.deviceKind)) return false;
    if (!deviceMatchesSearch(device, filters.stationSearch)) return false;
    if (device.confidence < minConfidence) return false;
    if (!filters.showUnassignedDevices && !device.stationId) return false;
    if (!filters.stationSearch) return true;
    if (!device.stationId) return true;
    return stationIds.has(device.stationId) || deviceMatchesSearch(device, filters.stationSearch);
  });
  const unknownTextEntities = filters.showUnknownLabels ? semantics.unknownTextEntities : [];
  return { stations, devices, unknownTextEntities };
}

export function resolveSemanticSelection(
  semantics: LayoutSemantics,
  selection: SemanticSelection | undefined
): SemanticSelectionDetails | undefined {
  if (!selection) return undefined;

  if (selection.kind === "station") {
    const station = semantics.stations.find((entry) => entry.stationId === selection.id);
    if (!station) return undefined;
    return {
      selection,
      title: station.stationId,
      subtitle: `Station candidate: ${station.processName}`,
      confidence: station.confidence,
      bounds: station.bounds,
      sourceTextEntityIds: station.sourceTextEntityIds,
      nearbyEntityIds: station.nearbyEntityIds,
      linkedEntityIds: station.nearbyEntityIds,
      stationId: station.stationId,
      associationCandidates: [],
      evidence: [`side ${station.side}`, `${station.deviceIds.length} device candidates`]
    };
  }

  if (selection.kind === "device") {
    const device = semantics.devices.find((entry) => entry.id === selection.id);
    if (!device) return undefined;
    return {
      selection,
      title: device.displayText ?? safeDisplayText(device.labelText),
      subtitle: `${device.kind} / ${device.associationStatus}`,
      confidence: device.confidence,
      bounds: device.bounds,
      sourceTextEntityIds: device.sourceTextEntityIds,
      nearbyEntityIds: device.nearbyEntityIds,
      linkedEntityIds: device.linkedEntityIds,
      stationId: device.stationId,
      candidateKind: device.kind,
      associationMethod: device.stationAssociationMethod,
      geometryAssociationStatus: device.associationStatus,
      associationCandidates: device.associationCandidates,
      evidence: device.evidence,
      rawText: device.rawText ?? device.labelText,
      displayText: device.displayText ?? safeDisplayText(device.labelText),
      associationText: device.associationText,
      noteKind: device.noteKind,
      isLongText: device.isLongText
    };
  }

  const unknown = semantics.unknownTextEntities.find((entry) => entry.entityId === selection.id);
  if (!unknown) return undefined;
  return {
    selection,
    title: unknown.displayText ?? safeDisplayText(unknown.normalizedText),
    subtitle: unknown.noteKind ? `${unknown.noteKind} / Unknown text label` : "Unknown text label",
    bounds: unknown.bounds,
    sourceTextEntityIds: [unknown.entityId],
    nearbyEntityIds: [],
    linkedEntityIds: [],
    associationCandidates: [],
    evidence: unknown.noteKind ? [unknown.noteKind, unknown.sourceKind] : [unknown.sourceKind],
    rawText: unknown.rawText ?? unknown.text,
    displayText: unknown.displayText ?? safeDisplayText(unknown.normalizedText),
    associationText: unknown.associationText,
    noteKind: unknown.noteKind,
    isLongText: unknown.isLongText
  };
}

function selectedId(selection: SemanticSelection | undefined, kind: SemanticSelection["kind"]): string | undefined {
  if (!selection || selection.kind !== kind) return undefined;
  return selection.id;
}

function limitWithSelected<T>(
  values: T[],
  limit: number | undefined,
  selectedValue: T | undefined,
  getId: (value: T) => string
): T[] {
  if (!selectedValue) {
    if (limit === undefined || limit <= 0 || values.length <= limit) return values;
    return values.slice(0, limit);
  }
  const selectedValueId = getId(selectedValue);
  const valuesWithSelected = values.some((value) => getId(value) === selectedValueId) ? values : [selectedValue, ...values];
  if (limit === undefined || limit <= 0 || valuesWithSelected.length <= limit) return valuesWithSelected;
  const capped = valuesWithSelected.slice(0, limit);
  if (capped.some((value) => getId(value) === selectedValueId)) return capped;
  return [selectedValue, ...capped.slice(0, Math.max(0, limit - 1))];
}

function addSelectedStation(
  stations: StationSemantic[],
  semantics: LayoutSemantics,
  selection: SemanticSelection | undefined
): StationSemantic[] {
  const id = selectedId(selection, "station");
  if (!id) return stations;
  if (stations.some((station) => station.stationId === id)) return stations;
  const selected = semantics.stations.find((station) => station.stationId === id);
  if (!selected) return stations;
  return [selected, ...stations];
}

function addSelectedDevice(
  devices: DeviceSemantic[],
  semantics: LayoutSemantics,
  selection: SemanticSelection | undefined
): DeviceSemantic[] {
  const id = selectedId(selection, "device");
  if (!id) return devices;
  if (devices.some((device) => device.id === id)) return devices;
  const selected = semantics.devices.find((device) => device.id === id);
  if (!selected) return devices;
  return [selected, ...devices];
}

function sourceMarkersForSelection(semantics: LayoutSemantics, details: SemanticSelectionDetails | undefined) {
  if (!details) return [];
  const ids = new Set(details.sourceTextEntityIds);
  return semantics.textEntities
    .filter((text) => ids.has(text.entityId))
    .map((text) => ({
      id: text.entityId,
      position: text.position,
      label: safeDisplayText(text.displayText ?? text.normalizedText, MAX_SEMANTIC_OVERLAY_CHARS)
    }));
}

export function buildSemanticOverlayModel(
  semantics: LayoutSemantics,
  filters: SemanticValidationFilters,
  selection?: SemanticSelection,
  options: SemanticOverlayModelOptions = {}
): SemanticOverlayModel {
  const filtered = filterSemanticValidation(semantics, filters);
  const selectedStation = semantics.stations.find((station) => station.stationId === selectedId(selection, "station"));
  const selectedDevice = semantics.devices.find((device) => device.id === selectedId(selection, "device"));
  const selectedUnknownLabel = semantics.unknownTextEntities.find(
    (text) => text.entityId === selectedId(selection, "unknown-text")
  );
  const stations = limitWithSelected(
    addSelectedStation(filtered.stations, semantics, selection),
    options.stationLimit,
    selectedStation,
    (station) => station.stationId
  );
  const devices = limitWithSelected(
    addSelectedDevice(filtered.devices, semantics, selection),
    options.deviceLimit,
    selectedDevice,
    (device) => device.id
  );
  const unknownTextEntities = limitWithSelected(
    filtered.unknownTextEntities,
    options.unknownLabelLimit,
    selectedUnknownLabel,
    (text) => text.entityId
  );
  const stationById = new Map(semantics.stations.map((station) => [station.stationId, station]));
  const selectedKeyValue = selectionKey(selection);
  const details = resolveSemanticSelection(semantics, selection);

  return {
    stations: stations.map((station) => ({
      id: station.stationId,
      label: station.stationId,
      processName: station.processName,
      position: station.position,
      bounds: station.bounds,
      confidence: station.confidence,
      selected: selectedKeyValue === `station:${station.stationId}`
    })),
    deviceCandidates: devices.map((device) => ({
      id: device.id,
      label: safeDisplayText(device.displayText ?? device.labelText, MAX_SEMANTIC_OVERLAY_CHARS),
      kind: device.kind,
      position: device.position,
      centroid: device.centroid,
      bounds: device.bounds,
      confidence: device.confidence,
      associationStatus: device.associationStatus,
      stationId: device.stationId,
      selected: selectedKeyValue === `device:${device.id}` || selectedKeyValue === `station:${device.stationId ?? ""}`
    })),
    unknownLabels: unknownTextEntities.map((text) => ({
      id: text.entityId,
      label: safeDisplayText(text.displayText ?? text.normalizedText, MAX_SEMANTIC_OVERLAY_CHARS),
      position: text.position,
      bounds: text.bounds,
      selected: selectedKeyValue === `unknown-text:${text.entityId}`
    })),
    associationLines: devices.flatMap((device) => {
      if (!device.stationId) return [];
      const station = stationById.get(device.stationId);
      if (!station) return [];
      return [
        {
          id: `${station.stationId}:${device.id}`,
          stationId: station.stationId,
          deviceId: device.id,
          from: station.position,
          to: device.position,
          selected: selectedKeyValue === `station:${station.stationId}` || selectedKeyValue === `device:${device.id}`
        }
      ];
    }),
    selectedBounds: details?.bounds,
    selectedSourceMarkers: sourceMarkersForSelection(semantics, details)
  };
}

export function computeOutlierSummary(robustBounds: RobustSceneBounds, layerLimit = 8): OutlierSummary {
  const counts = new Map<string, number>();
  for (const entity of robustBounds.entityBounds) {
    if (!entity.isOutlier) continue;
    const layerId = entity.layerId ?? "none";
    counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
  }

  const topLayers = [...counts.entries()]
    .map(([layerId, count]) => ({ layerId, count }))
    .sort((left, right) => right.count - left.count || left.layerId.localeCompare(right.layerId))
    .slice(0, layerLimit);

  return {
    outlierCount: robustBounds.outlierEntityIds.length,
    topLayers,
    topOutliers: robustBounds.topOutliers
  };
}
