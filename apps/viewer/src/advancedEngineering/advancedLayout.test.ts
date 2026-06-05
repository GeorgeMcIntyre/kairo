import type { Bounds3, Vec3 } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity, StationSemantic } from "../semantic/layoutSemantics";
import {
  buildAdvancedLayoutModel,
  exportAdvancedLayoutCsv,
  exportAdvancedLayoutJson,
  exportAdvancedLayoutMarkdown
} from "./advancedLayout";

function bounds(x: number, y: number, size = 100): Bounds3 {
  return { min: [x, y, 0], max: [x + size, y + size, 0] };
}

const linkedGeometryBounds: Bounds3 = { min: [1000, 2000, 0], max: [2000, 3000, 0] };

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf", path: "concept-layout.dxf" }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "root",
          type: "scene",
          children: [],
          localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        }
      ]
    },
    layers: { layers: [] },
    materials: { materials: [] },
    sourceMap: { sources: [] },
    geometry: []
  };
}

function textEntity(
  entityId: string,
  rawText: string,
  normalizedText: string,
  position: Vec3,
  patch: Partial<SemanticTextEntity> = {}
): SemanticTextEntity {
  return {
    entityId,
    text: rawText,
    rawText,
    displayText: rawText.length > 40 ? `${rawText.slice(0, 37)}...` : rawText,
    normalizedText,
    position,
    rotationDeg: 0,
    height: 100,
    sourceKind: "TEXT",
    bounds: bounds(position[0], position[1]),
    ...patch
  };
}

function station(stationId: string, linePrefix: string, stationNumber: string, side: "L" | "R"): StationSemantic {
  return {
    stationId,
    linePrefix,
    stationNumber,
    side,
    processName: "LOAD & SPAC",
    labelText: `${stationId} LOAD & SPAC`,
    position: [Number(stationNumber) * 100, side === "L" ? 0 : 500, 0],
    rotationDeg: 0,
    height: 100,
    bounds: bounds(Number(stationNumber) * 100, side === "L" ? 0 : 500),
    sourceTextEntityIds: [`text-${stationId}`],
    nearbyEntityIds: [],
    candidateDevices: [],
    deviceIds: [],
    confidence: 0.95
  };
}

function device(
  id: string,
  labelText: string,
  stationId: string | undefined,
  associationStatus: DeviceSemantic["associationStatus"],
  patch: Partial<DeviceSemantic> = {}
): DeviceSemantic {
  return {
    id,
    kind: "device_number",
    labelText,
    rawText: labelText,
    displayText: labelText,
    normalizedText: labelText,
    associationText: labelText,
    position: [0, 0, 0],
    rotationDeg: 0,
    height: 100,
    bounds: bounds(0, 0),
    centroid: [50, 50, 0],
    sourceTextEntityIds: [`text-${id}`],
    nearbyEntityIds: associationStatus === "linked" ? [`geom-${id}`] : [],
    linkedEntityIds: associationStatus === "linked" ? [`geom-${id}`] : [],
    geometryGroupId: associationStatus === "linked" ? `group-${id}` : undefined,
    geometryGroupSource: associationStatus === "linked" ? "cluster" : undefined,
    stationId,
    stationAssociationMethod: stationId ? "station-id" : "none",
    confidence: associationStatus === "linked" ? 0.91 : 0.52,
    evidence: ["numeric suffix is a device tag, not a station"],
    associationStatus,
    associationConfidence: associationStatus === "linked" ? 0.86 : 0.2,
    associationReason: [associationStatus === "linked" ? "nearby geometry cluster" : "no nearby geometry group found"],
    associationCandidates:
      associationStatus === "linked"
        ? [
            {
              groupId: `group-${id}`,
              source: "cluster",
              entityIds: [`geom-${id}`],
              bounds: linkedGeometryBounds,
              centroid: [1500, 2500, 0],
              distanceToBounds: 0,
              distanceToCentroid: 0,
              confidence: 0.86,
              reason: ["nearby geometry cluster"]
            }
          ]
        : [],
    ...patch
  };
}

function semanticsFixture(): LayoutSemantics {
  const stations = [station("7B-010L", "7B", "010", "L"), station("7B-020R", "7B", "020", "R")];
  const devices = [
    device("device-linked", "7B-010L-04", "7B-010L", "linked"),
    device("device-ambiguous", "7B-020R-03", "7B-020R", "ambiguous"),
    device("device-unlinked", "7B-999L-99", undefined, "unlinked"),
    device("device-long-note", "7B-020R-05", "7B-020R", "linked", {
      rawText: "Install bracket near 7B-020R-05 with quote-impact note and field verification",
      displayText: "7B-020R-05 Install bracket near...",
      normalizedText: "Install bracket near 7B-020R-05 with quote-impact note and field verification",
      associationText: "7B-020R-05",
      noteKind: "unknownNote",
      isLongText: true,
      sourceTextEntityIds: ["text-long-device"]
    })
  ];
  stations[0].deviceIds = ["device-linked"];
  stations[1].deviceIds = ["device-ambiguous", "device-long-note"];

  const unknownTextEntities = [
    textEntity(
      "text-fence-note",
      "Fence \"Panel\", 1424mm x 2388mm\nwith install risk | by others",
      "Fence \"Panel\", 1424mm x 2388mm with install risk | by others",
      [3000, 0, 0],
      { noteKind: "fenceNote", isLongText: true }
    )
  ];

  return {
    textEntities: [
      textEntity("text-7B-010L", "7B-010L LOAD & SPAC", "7B-010L LOAD & SPAC", [1000, 0, 0]),
      textEntity("text-7B-020R", "7B-020R LOAD & SPAC", "7B-020R LOAD & SPAC", [2000, 500, 0]),
      ...unknownTextEntities
    ],
    mergedTextLabels: [],
    geometryGroups: [],
    stations,
    devices,
    unknownTextEntities
  };
}

describe("advanced engineering layout model", () => {
  it("builds deterministic line, station, device, annotation, warning, and review records", () => {
    const model = buildAdvancedLayoutModel(scenePackage(), semanticsFixture());
    const repeated = buildAdvancedLayoutModel(scenePackage(), semanticsFixture());

    expect(model.modelVersion).toBe("0.1");
    expect(model.sourcePath).toBe("concept-layout.dxf");
    expect(model.lines).toMatchObject([
      {
        id: "line-7b",
        stationIds: ["7B-010L", "7B-020R"]
      }
    ]);
    expect(model.stations.find((entry) => entry.id === "7B-020R")?.deviceIds).toEqual([
      "device-ambiguous",
      "device-long-note"
    ]);
    expect(model.devices.map((entry) => entry.id)).toEqual([
      "device-ambiguous",
      "device-linked",
      "device-long-note",
      "device-unlinked"
    ]);
    expect(model.devices.find((entry) => entry.id === "device-linked")).toMatchObject({
      equipmentTypeId: "robot.generic",
      equipmentDisplayName: "Generic industrial robot",
      bomCategory: "robot",
      equipmentRequiresReview: true,
      footprintSource: "geometry-bounds",
      footprintBounds: linkedGeometryBounds,
      clearanceBounds: { min: [0, 1000, 0], max: [3000, 4000, 0] },
      paddedBounds: { min: [-250, 750, 0], max: [3250, 4250, 0] },
      paddingMm: 250
    });
    expect(model.summary.devicesByEquipmentType).toEqual({
      "robot.generic": 4
    });
    expect(model.annotations.map((entry) => entry.id)).toEqual([
      "annotation-device-device-long-note",
      "annotation-text-fence-note"
    ]);
    expect(model.summary.counts).toMatchObject({
      lines: 1,
      stations: 2,
      devices: 4,
      annotations: 2,
      foundationItems: 0,
      ambiguousDevices: 1,
      unlinkedDevices: 1,
      devicesMissingStation: 1
    });
    expect(model.reviewItems.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "review-device-ambiguous-device-ambiguous",
        "review-device-unlinked-device-unlinked",
        "review-annotation-review-annotation-text-fence-note"
      ])
    );
    expect(repeated).toEqual(model);
  });

  it("preserves raw long annotation text in JSON, CSV, and Markdown exports", () => {
    const model = buildAdvancedLayoutModel(scenePackage(), semanticsFixture());
    const json = JSON.parse(exportAdvancedLayoutJson(model));
    const csv = exportAdvancedLayoutCsv(model);
    const markdown = exportAdvancedLayoutMarkdown(model);
    const rawNote = "Fence \"Panel\", 1424mm x 2388mm\nwith install risk | by others";

    expect(json.annotations.find((entry: { id: string }) => entry.id === "annotation-text-fence-note")).toMatchObject({
      rawText: rawNote,
      noteKind: "fenceNote"
    });
    expect(csv).toContain('"Fence ""Panel"", 1424mm x 2388mm with install risk | by others"');
    expect(markdown).toContain("Fence \"Panel\", 1424mm x 2388mm with install risk \\| by others");
    expect(csv).toContain('"robot.generic","robot","geometry-bounds","250"');
    expect(markdown).toContain("## Equipment Library Types");
    expect(markdown).toContain("| 7B-010L-04 | device_number | robot.generic | geometry-bounds | 250 | 7B-010L |");
  });

  it("retains strong-tag long device text as annotation context without changing the primary device label", () => {
    const model = buildAdvancedLayoutModel(scenePackage(), semanticsFixture());
    const device = model.devices.find((entry) => entry.id === "device-long-note");
    const annotation = model.annotations.find((entry) => entry.linkedDeviceId === "device-long-note");

    expect(device).toMatchObject({
      primaryLabel: "7B-020R-05",
      rawText: "Install bracket near 7B-020R-05 with quote-impact note and field verification"
    });
    expect(annotation).toMatchObject({
      id: "annotation-device-device-long-note",
      linkedDeviceId: "device-long-note",
      noteKind: "unknownNote"
    });
  });

  it("handles empty semantic input without manufacturing foundation or review records", () => {
    const emptySemantics: LayoutSemantics = {
      textEntities: [],
      mergedTextLabels: [],
      geometryGroups: [],
      stations: [],
      devices: [],
      unknownTextEntities: []
    };
    const model = buildAdvancedLayoutModel({ ...scenePackage(), manifest: { ...scenePackage().manifest, source: { format: "dxf" } } }, emptySemantics);

    expect(model.lines).toEqual([]);
    expect(model.foundationItems).toEqual([]);
    expect(model.reviewItems).toEqual([]);
    expect(model.summary.counts).toMatchObject({
      lines: 0,
      stations: 0,
      devices: 0,
      annotations: 0
    });
  });
});
