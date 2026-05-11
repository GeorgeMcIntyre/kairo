import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { parseDeviceText, parseStationDeviceTag } from "./deviceDictionary";
import {
  buildStationAnchors,
  computeLayoutSemantics,
  mergeDeviceTextLabels,
  parseStationLabel,
  type SemanticTextEntity
} from "./layoutSemantics";

function semanticText(entityId: string, text: string, x: number, y: number, height = 100): SemanticTextEntity {
  return {
    entityId,
    text,
    normalizedText: text,
    position: [x, y, 0],
    rotationDeg: 0,
    height,
    layerId: "layer-text",
    sourceKind: "TEXT",
    bounds: {
      min: [x, y, 0],
      max: [x + height, y + height, 0]
    }
  };
}

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf" }
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
    layers: {
      layers: [
        { id: "layer-text", name: "G-ANNO-TEXT", visible: true },
        { id: "layer-robot", name: "0-Q-GENRO", visible: true },
        { id: "layer-fence", name: "FG-FENCE", visible: true }
      ]
    },
    materials: { materials: [] },
    sourceMap: { sources: [] },
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            layerId: "layer-robot",
            entities: [
              {
                id: "label-station",
                type: "text",
                text: "7B-010L LOAD & SPAC",
                position: [0, 0, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "label-controller",
                type: "text",
                text: "ROBOT CONTROLLER",
                position: [1200, 120, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "label-device-tag",
                type: "text",
                text: "7B-010L-04",
                position: [900, -80, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "label-pdp-a",
                type: "text",
                text: "ROBOT PDP",
                position: [1600, 0, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "label-pdp-b",
                type: "text",
                text: "PANEL 400A",
                position: [1600, -120, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "label-unknown",
                type: "text",
                text: "CHECK NOTE",
                position: [8000, 8000, 0],
                rotationDeg: 0,
                height: 100,
                origin: "TEXT",
                layerId: "layer-text"
              },
              {
                id: "circle-robot",
                type: "circle",
                center: [2000, 0, 0],
                radius: 1800,
                layerId: "layer-robot"
              },
              {
                id: "fence-line",
                type: "line",
                start: [2500, 1000, 0],
                end: [3000, 1000, 0],
                layerId: "layer-fence"
              },
              {
                id: "far-line",
                type: "line",
                start: [100000, 100000, 0],
                end: [100100, 100000, 0],
                layerId: "layer-fence"
              }
            ]
          }
        ]
      }
    ]
  };
}

function textDrawingEntity(id: string, text: string, x: number, y: number): DrawingEntity {
  return {
    id,
    type: "text",
    text,
    position: [x, y, 0],
    rotationDeg: 0,
    height: 100,
    origin: "TEXT",
    layerId: "layer-text"
  };
}

function lineDrawingEntity(id: string, x: number, y: number, sourceRef?: string): DrawingEntity {
  return {
    id,
    type: "line",
    start: [x - 100, y - 100, 0],
    end: [x + 100, y + 100, 0],
    layerId: "layer-robot",
    sourceRef
  };
}

function scenePackageWithEntities(entities: DrawingEntity[]): ScenePackage {
  return {
    ...scenePackage(),
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            layerId: "layer-robot",
            entities
          }
        ]
      }
    ]
  };
}

describe("parseStationLabel", () => {
  it("parses base station IDs without requiring process text", () => {
    expect(parseStationLabel("7B-020L")).toMatchObject({
      stationId: "7B-020L",
      linePrefix: "7B",
      stationNumber: "020",
      side: "L",
      processName: ""
    });
  });

  it("parses station id, prefix, station number, side, and process", () => {
    expect(parseStationLabel("7B-010L LOAD & SPAC")).toEqual({
      stationId: "7B-010L",
      linePrefix: "7B",
      stationNumber: "010",
      side: "L",
      processName: "LOAD & SPAC"
    });
  });

  it("parses right-side station labels", () => {
    expect(parseStationLabel("7B-020R GEO & SPAC")).toMatchObject({
      stationId: "7B-020R",
      side: "R",
      processName: "GEO & SPAC"
    });
  });

  it("ignores unknown labels", () => {
    expect(parseStationLabel("NOT A STATION")).toBeUndefined();
  });

  it("does not confuse robot model labels for station IDs", () => {
    expect(parseStationLabel("R2000IC-210L")).toBeUndefined();
  });

  it("does not parse extended station-device tags as station anchors", () => {
    expect(parseStationLabel("7B-020L-04")).toBeUndefined();
  });
});

describe("parseDeviceText", () => {
  it("classifies known automotive device and process labels", () => {
    expect(parseDeviceText("ROBOT CONTROLLER")?.kind).toBe("robot_controller");
    expect(parseDeviceText("ROBOT PDP PANEL 400A")?.kind).toBe("pdp_panel");
    expect(parseDeviceText("BASE PLATE")?.kind).toBe("base_plate");
    expect(parseDeviceText("M/H / MATERIAL HANDLING")?.kind).toBe("material_handling_robot_or_tooling");
    expect(parseDeviceText("R2000IC-210F")?.kind).toBe("robot_model");
    expect(parseDeviceText("RESPOT RIVET")?.kind).toBe("rivet_process");
    expect(parseDeviceText("LIFT & TILT")?.kind).toBe("lift_tilt");
    expect(parseDeviceText("Fence Panel")?.kind).toBe("fence");
    expect(parseDeviceText("Cable Tray Support")?.kind).toBe("cable_tray");
    expect(parseDeviceText("DROP")?.kind).toBe("service_drop");
  });

  it("parses numeric station-device tags with a parent station", () => {
    expect(parseStationDeviceTag("7B-020L-04")).toEqual({
      parentStationId: "7B-020L",
      suffix: "04",
      kind: "device_number"
    });
    expect(parseDeviceText("7B-020L-04")).toMatchObject({
      kind: "device_number",
      parentStationId: "7B-020L",
      tagSuffix: "04"
    });
    expect(parseStationLabel("7B-020L-04")).toBeUndefined();
  });

  it("parses descriptive robot/device tags without treating them as stations", () => {
    expect(parseDeviceText("7B-020L-04 (RIVET) BASE PLATE")).toMatchObject({
      kind: "device_number",
      parentStationId: "7B-020L",
      tagSuffix: "04"
    });
    expect(parseStationLabel("7B-020L-04 (RIVET) BASE PLATE")).toBeUndefined();
  });

  it("parses dunnage and nest station-device tags", () => {
    expect(parseStationDeviceTag("7B-070L-DN1")).toMatchObject({
      parentStationId: "7B-070L",
      kind: "dunnage"
    });
    expect(parseStationDeviceTag("7B-070L-DN2")).toMatchObject({
      parentStationId: "7B-070L",
      kind: "dunnage"
    });
    expect(parseStationDeviceTag("7B-060L-1N")).toMatchObject({
      parentStationId: "7B-060L",
      kind: "nest"
    });
  });
});

describe("buildStationAnchors", () => {
  it("merges station id and nearby process text split across two entities", () => {
    const anchors = buildStationAnchors(
      [semanticText("station", "7B-030L", 0, 0), semanticText("process", "RESPOT RIVET", 0, -120)],
      { stationTextMergeRadius: 500 }
    );

    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({
      stationId: "7B-030L",
      processName: "RESPOT RIVET",
      sourceTextEntityIds: ["station", "process"],
      confidence: 0.78
    });
  });

  it("dedupes repeated base and full station labels by station id", () => {
    const anchors = buildStationAnchors([
      semanticText("station-base", "7B-020R", 0, 0),
      semanticText("station-full", "7B-020R GEO & SPAC", 20, 0)
    ]);

    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toMatchObject({
      stationId: "7B-020R",
      processName: "GEO & SPAC",
      sourceTextEntityIds: ["station-full", "station-base"]
    });
  });
});

describe("mergeDeviceTextLabels", () => {
  it("merges split PDP panel text when labels are close and similarly oriented", () => {
    const labels = mergeDeviceTextLabels(
      [semanticText("pdp-a", "ROBOT PDP", 0, 0), semanticText("pdp-b", "PANEL 400A", 0, -110)],
      new Set()
    );

    expect(labels[0]).toMatchObject({
      normalizedText: "ROBOT PDP PANEL 400A",
      sourceTextEntityIds: ["pdp-a", "pdp-b"]
    });
  });
});

describe("computeLayoutSemantics", () => {
  it("detects stations, classifies device labels, associates nearby devices, and preserves unknown text", () => {
    const semantics = computeLayoutSemantics(scenePackage(), undefined, {
      stationGroupingRadiusX: 5000,
      stationGroupingRadiusY: 5000,
      deviceGroupingRadiusX: 5000,
      deviceGroupingRadiusY: 5000
    });

    expect(semantics.stations).toHaveLength(1);
    expect(semantics.stations[0].stationId).toBe("7B-010L");
    expect(semantics.stations[0].nearbyEntityIds).toContain("circle-robot");
    expect(semantics.stations[0].nearbyEntityIds).toContain("fence-line");
    expect(semantics.stations[0].nearbyEntityIds).not.toContain("far-line");

    expect(semantics.devices.map((device) => device.kind)).toEqual(
      expect.arrayContaining(["robot_controller", "pdp_panel", "device_number"])
    );
    expect(semantics.devices.find((device) => device.kind === "device_number")).toMatchObject({
      stationId: "7B-010L",
      stationAssociationMethod: "station-id",
      tagSuffix: "04"
    });
    expect(semantics.devices.find((device) => device.kind === "pdp_panel")?.sourceTextEntityIds).toEqual([
      "label-pdp-a",
      "label-pdp-b"
    ]);
    expect(semantics.devices.every((device) => device.stationId === "7B-010L")).toBe(true);
    expect(semantics.devices.every((device) => device.nearbyEntityIds.length > 0)).toBe(true);
    expect(semantics.unknownTextEntities.map((text) => text.entityId)).toContain("label-unknown");
  });

  it("keeps ambiguous device associations unlinked while preserving candidates", () => {
    const semantics = computeLayoutSemantics(
      scenePackageWithEntities([
        textDrawingEntity("label-device", "7B-020L-04", 0, 0),
        lineDrawingEntity("left-line", -500, 0, "src-dxf-insert-L-block-robot-base-child-L1"),
        lineDrawingEntity("right-line", 500, 0, "src-dxf-insert-R-block-robot-base-child-L1")
      ])
    );
    const device = semantics.devices.find((entry) => entry.sourceTextEntityIds.includes("label-device"));

    expect(device).toMatchObject({
      associationStatus: "ambiguous",
      linkedEntityIds: [],
      bounds: { min: [-50, -50, 0], max: [50, 50, 0] }
    });
    expect(device?.geometryGroupId).toBeUndefined();
    expect(device?.geometryGroupSource).toBeUndefined();
    expect(device?.associationCandidates).toHaveLength(2);
  });

  it("keeps device IDs stable when earlier parsed labels are added or removed", () => {
    const withoutEarlier = computeLayoutSemantics(
      scenePackageWithEntities([textDrawingEntity("target-label", "7B-020L-04", 0, 0)])
    );
    const withEarlier = computeLayoutSemantics(
      scenePackageWithEntities([
        textDrawingEntity("earlier-label", "ROBOT CONTROLLER", -1000, 0),
        textDrawingEntity("target-label", "7B-020L-04", 0, 0)
      ])
    );

    const targetIdWithoutEarlier = withoutEarlier.devices.find((device) =>
      device.sourceTextEntityIds.includes("target-label")
    )?.id;
    const targetIdWithEarlier = withEarlier.devices.find((device) => device.sourceTextEntityIds.includes("target-label"))?.id;

    expect(targetIdWithoutEarlier).toBe("semantic-device-device_number-target-label");
    expect(targetIdWithEarlier).toBe(targetIdWithoutEarlier);
  });
});
