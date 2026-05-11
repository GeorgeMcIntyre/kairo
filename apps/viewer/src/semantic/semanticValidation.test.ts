import type { RobustSceneBounds } from "@kairo/core";
import { describe, expect, it } from "vitest";
import type { LayoutSemantics } from "./layoutSemantics";
import {
  DEFAULT_SEMANTIC_VALIDATION_FILTERS,
  buildSemanticOverlayModel,
  computeOutlierSummary,
  filterSemanticValidation,
  resolveSemanticSelection
} from "./semanticValidation";

function semanticsFixture(): LayoutSemantics {
  return {
    textEntities: [
      {
        entityId: "text-station",
        text: "7B-010L LOAD & SPAC",
        normalizedText: "7B-010L LOAD & SPAC",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds: { min: [0, 0, 0], max: [100, 100, 0] }
      },
      {
        entityId: "text-device",
        text: "ROBOT CONTROLLER",
        normalizedText: "ROBOT CONTROLLER",
        position: [500, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds: { min: [500, 0, 0], max: [600, 100, 0] }
      },
      {
        entityId: "text-unknown",
        text: "CHECK NOTE",
        normalizedText: "CHECK NOTE",
        position: [1000, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds: { min: [1000, 0, 0], max: [1100, 100, 0] }
      }
    ],
    mergedTextLabels: [],
    geometryGroups: [],
    unknownTextEntities: [
      {
        entityId: "text-unknown",
        text: "CHECK NOTE",
        normalizedText: "CHECK NOTE",
        position: [1000, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds: { min: [1000, 0, 0], max: [1100, 100, 0] }
      }
    ],
    devices: [
      {
        id: "device-controller",
        kind: "robot_controller",
        labelText: "ROBOT CONTROLLER",
        normalizedText: "ROBOT CONTROLLER",
        position: [500, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: { min: [450, -50, 0], max: [800, 250, 0] },
        centroid: [625, 100, 0],
        sourceTextEntityIds: ["text-device"],
        nearbyEntityIds: ["geom-controller"],
        linkedEntityIds: ["geom-controller"],
        geometryGroupId: "group-controller",
        geometryGroupSource: "cluster",
        stationId: "7B-010L",
        stationAssociationMethod: "nearest-station",
        confidence: 0.92,
        evidence: ["ROBOT CONTROLLER"],
        associationStatus: "linked",
        associationConfidence: 0.86,
        associationReason: ["ROBOT CONTROLLER", "distance to group 0 mm"],
        associationCandidates: []
      },
      {
        id: "device-lift",
        kind: "lift_tilt",
        labelText: "LIFT & TILT",
        normalizedText: "LIFT & TILT",
        position: [2000, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: { min: [2000, -50, 0], max: [2300, 250, 0] },
        centroid: [2150, 100, 0],
        sourceTextEntityIds: ["text-lift"],
        nearbyEntityIds: [],
        linkedEntityIds: [],
        stationAssociationMethod: "none",
        confidence: 0.58,
        evidence: ["LIFT & TILT"],
        associationStatus: "unlinked",
        associationConfidence: 0.2,
        associationReason: ["no nearby geometry group found"],
        associationCandidates: []
      }
    ],
    stations: [
      {
        stationId: "7B-010L",
        linePrefix: "7B",
        stationNumber: "010",
        side: "L",
        processName: "LOAD & SPAC",
        labelText: "7B-010L LOAD & SPAC",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: { min: [0, 0, 0], max: [100, 100, 0] },
        sourceTextEntityIds: ["text-station"],
        nearbyEntityIds: ["geom-controller"],
        candidateDevices: [],
        deviceIds: ["device-controller"],
        confidence: 0.95
      },
      {
        stationId: "7B-020R",
        linePrefix: "7B",
        stationNumber: "020",
        side: "R",
        processName: "GEO & SPAC",
        labelText: "7B-020R GEO & SPAC",
        position: [4000, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: { min: [4000, 0, 0], max: [4100, 100, 0] },
        sourceTextEntityIds: ["text-station-r"],
        nearbyEntityIds: [],
        candidateDevices: [],
        deviceIds: [],
        confidence: 0.9
      }
    ]
  };
}

describe("filterSemanticValidation", () => {
  it("filters stations by station id search", () => {
    const result = filterSemanticValidation(semanticsFixture(), {
      ...DEFAULT_SEMANTIC_VALIDATION_FILTERS,
      stationSearch: "020R"
    });

    expect(result.stations.map((station) => station.stationId)).toEqual(["7B-020R"]);
  });

  it("filters device candidates by type and confidence", () => {
    const result = filterSemanticValidation(semanticsFixture(), {
      ...DEFAULT_SEMANTIC_VALIDATION_FILTERS,
      deviceKind: "robot_controller",
      minConfidence: 0.8
    });

    expect(result.devices.map((device) => device.id)).toEqual(["device-controller"]);
  });

  it("can hide unassigned device candidates", () => {
    const result = filterSemanticValidation(semanticsFixture(), {
      ...DEFAULT_SEMANTIC_VALIDATION_FILTERS,
      showUnassignedDevices: false
    });

    expect(result.devices.map((device) => device.id)).not.toContain("device-lift");
  });

  it("preserves unknown labels only when requested", () => {
    const hidden = filterSemanticValidation(semanticsFixture(), DEFAULT_SEMANTIC_VALIDATION_FILTERS);
    const shown = filterSemanticValidation(semanticsFixture(), {
      ...DEFAULT_SEMANTIC_VALIDATION_FILTERS,
      showUnknownLabels: true
    });

    expect(hidden.unknownTextEntities).toEqual([]);
    expect(shown.unknownTextEntities.map((text) => text.entityId)).toEqual(["text-unknown"]);
  });
});

describe("resolveSemanticSelection", () => {
  it("returns station selection details and related ids", () => {
    const details = resolveSemanticSelection(semanticsFixture(), { kind: "station", id: "7B-010L" });

    expect(details).toMatchObject({
      title: "7B-010L",
      nearbyEntityIds: ["geom-controller"],
      sourceTextEntityIds: ["text-station"]
    });
  });

  it("returns detected candidate wording for device selections", () => {
    const details = resolveSemanticSelection(semanticsFixture(), { kind: "device", id: "device-controller" });

    expect(details?.subtitle).toContain("Detected candidate");
    expect(details?.candidateKind).toBe("robot_controller");
  });
});

describe("buildSemanticOverlayModel", () => {
  it("maps stations, device candidates, association lines, and selected source markers", () => {
    const model = buildSemanticOverlayModel(
      semanticsFixture(),
      DEFAULT_SEMANTIC_VALIDATION_FILTERS,
      { kind: "device", id: "device-controller" }
    );

    expect(model.stations.map((station) => station.id)).toContain("7B-010L");
    expect(model.deviceCandidates.map((device) => device.id)).toContain("device-controller");
    expect(model.associationLines.map((line) => line.deviceId)).toContain("device-controller");
    expect(model.selectedSourceMarkers.map((marker) => marker.id)).toEqual(["text-device"]);
  });
});

describe("computeOutlierSummary", () => {
  it("groups outliers by layer and preserves farthest entries", () => {
    const robustBounds: RobustSceneBounds = {
      rawBounds: { min: [0, 0, 0], max: [10, 10, 0] },
      visibleBounds: { min: [0, 0, 0], max: [5, 5, 0] },
      fitBounds: { min: [0, 0, 0], max: [5, 5, 0] },
      outlierBounds: { min: [9, 9, 0], max: [10, 10, 0] },
      outlierEntityIds: ["out-a", "out-b"],
      mainClusterCenter: [0, 0, 0],
      topOutliers: [
        {
          entityId: "out-a",
          type: "line",
          layerId: "layer-a",
          bounds: { min: [9, 9, 0], max: [10, 10, 0] },
          centroid: [9.5, 9.5, 0],
          size: [1, 1, 0],
          diagonal: Math.SQRT2,
          distanceFromMainCluster: 13.4,
          isOutlier: true
        }
      ],
      entityBounds: [
        {
          entityId: "out-a",
          type: "line",
          layerId: "layer-a",
          bounds: { min: [9, 9, 0], max: [10, 10, 0] },
          centroid: [9.5, 9.5, 0],
          size: [1, 1, 0],
          diagonal: Math.SQRT2,
          distanceFromMainCluster: 13.4,
          isOutlier: true
        },
        {
          entityId: "out-b",
          type: "line",
          layerId: "layer-a",
          bounds: { min: [8, 8, 0], max: [9, 9, 0] },
          centroid: [8.5, 8.5, 0],
          size: [1, 1, 0],
          diagonal: Math.SQRT2,
          distanceFromMainCluster: 12,
          isOutlier: true
        }
      ]
    };

    const summary = computeOutlierSummary(robustBounds);

    expect(summary.outlierCount).toBe(2);
    expect(summary.topLayers).toEqual([{ layerId: "layer-a", count: 2 }]);
    expect(summary.topOutliers[0].entityId).toBe("out-a");
  });
});
