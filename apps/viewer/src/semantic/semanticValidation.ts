import type { Bounds3, EntityBounds, RobustSceneBounds, Vec3 } from "@kairo/core";
import type { DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity, StationSemantic } from "./layoutSemantics";

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
  stationId?: string;
  candidateKind?: DeviceKind;
  associationMethod?: DeviceSemantic["stationAssociationMethod"];
  evidence: string[];
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
  bounds: Bounds3;
  confidence: number;
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
      stationId: station.stationId,
      evidence: [`side ${station.side}`, `${station.deviceIds.length} device candidates`]
    };
  }

  if (selection.kind === "device") {
    const device = semantics.devices.find((entry) => entry.id === selection.id);
    if (!device) return undefined;
    return {
      selection,
      title: device.kind,
      subtitle: `Detected candidate: ${device.labelText}`,
      confidence: device.confidence,
      bounds: device.bounds,
      sourceTextEntityIds: device.sourceTextEntityIds,
      nearbyEntityIds: device.nearbyEntityIds,
      stationId: device.stationId,
      candidateKind: device.kind,
      associationMethod: device.stationAssociationMethod,
      evidence: device.evidence
    };
  }

  const unknown = semantics.unknownTextEntities.find((entry) => entry.entityId === selection.id);
  if (!unknown) return undefined;
  return {
    selection,
    title: unknown.normalizedText,
    subtitle: "Unknown text label",
    bounds: unknown.bounds,
    sourceTextEntityIds: [unknown.entityId],
    nearbyEntityIds: [],
    evidence: [unknown.sourceKind]
  };
}

function selectedId(selection: SemanticSelection | undefined, kind: SemanticSelection["kind"]): string | undefined {
  if (!selection || selection.kind !== kind) return undefined;
  return selection.id;
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
      label: text.normalizedText
    }));
}

export function buildSemanticOverlayModel(
  semantics: LayoutSemantics,
  filters: SemanticValidationFilters,
  selection?: SemanticSelection
): SemanticOverlayModel {
  const filtered = filterSemanticValidation(semantics, filters);
  const stations = addSelectedStation(filtered.stations, semantics, selection);
  const devices = addSelectedDevice(filtered.devices, semantics, selection);
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
      label: device.labelText,
      kind: device.kind,
      position: device.position,
      bounds: device.bounds,
      confidence: device.confidence,
      stationId: device.stationId,
      selected: selectedKeyValue === `device:${device.id}` || selectedKeyValue === `station:${device.stationId ?? ""}`
    })),
    unknownLabels: filtered.unknownTextEntities.map((text) => ({
      id: text.entityId,
      label: text.normalizedText,
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
