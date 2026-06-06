import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { buildAdvancedLayoutModel } from "../advancedEngineering/advancedLayout";
import { computeLayoutSemantics } from "@kairo/semantic";
import {
  buildLayoutPackage,
  exportLayoutPackageCsv,
  exportLayoutPackageJson,
  exportLayoutPackageMarkdown
} from "./layoutPackage";

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf", path: "C:\\layouts\\p736-layout.dxf" }
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
        { id: "layer-equipment", name: "0-Q-EQUIP", visible: true }
      ]
    },
    materials: { materials: [] },
    sourceMap: { sources: [] },
    geometry: []
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
    layerId: "layer-equipment",
    sourceRef
  };
}

function p736ScenePackage(): ScenePackage {
  return {
    ...scenePackage(),
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            layerId: "layer-equipment",
            entities: [
              textDrawingEntity("p736-robot-label", "7B-020L-04", 0, 0),
              lineDrawingEntity("p736-robot-geom", 120, 0, "src-dxf-insert-R1-block-robot-child-L1"),
              textDrawingEntity("p736-dn1-label", "7B-070L-DN1", 5000, 0),
              lineDrawingEntity("p736-dn1-geom", 5120, 0, "src-dxf-insert-DN1-block-dunnage-child-L1"),
              textDrawingEntity("p736-dn2-label", "7B-070L-DN2", 10000, 0),
              lineDrawingEntity("p736-dn2-geom", 10120, 0, "src-dxf-insert-DN2-block-dunnage-child-L1"),
              textDrawingEntity("p736-nest-label", "7B-060L-1N", 15000, 0),
              lineDrawingEntity("p736-nest-geom", 15120, 0, "src-dxf-insert-N1-block-nest-child-L1")
            ]
          }
        ]
      }
    ]
  };
}

function p736Package() {
  const scene = p736ScenePackage();
  const semantics = computeLayoutSemantics(scene);
  const advancedLayout = buildAdvancedLayoutModel(scene, semantics);
  return buildLayoutPackage(scene, semantics, advancedLayout);
}

describe("layout library package", () => {
  it("builds reusable package records from known P736 semantic labels", () => {
    const layoutPackage = p736Package();
    const classificationsByLabel = new Map(
      layoutPackage.deviceClassifications.map((classification) => [classification.detectedLabel, classification])
    );
    const libraryItemsByLabel = new Map(layoutPackage.libraryItemCandidates.map((item) => [item.label, item]));

    expect(layoutPackage.schema).toBe("kairo-layout-library-package");
    expect(layoutPackage.source).toMatchObject({
      format: "dxf",
      displayName: "p736-layout.dxf",
      units: "millimeter"
    });
    expect(layoutPackage.summary).toMatchObject({
      extractedLabels: 4,
      classifiedDevices: 4,
      geometryAssociations: 4,
      libraryItemCandidates: 4,
      trainingRecords: 4,
      acceptedTrainingRecords: 4,
      uncertainTrainingRecords: 0
    });
    expect(classificationsByLabel.get("7B-020L-04")).toMatchObject({
      classifiedDeviceType: "robot",
      equipmentTypeId: "robot.generic",
      reviewStatus: "accepted"
    });
    expect(classificationsByLabel.get("7B-070L-DN1")).toMatchObject({
      classifiedDeviceType: "dunnage",
      equipmentTypeId: "dunnage.station",
      reviewStatus: "accepted"
    });
    expect(classificationsByLabel.get("7B-070L-DN2")).toMatchObject({
      classifiedDeviceType: "dunnage",
      equipmentTypeId: "dunnage.station",
      reviewStatus: "accepted"
    });
    expect(classificationsByLabel.get("7B-060L-1N")).toMatchObject({
      classifiedDeviceType: "nest",
      equipmentTypeId: "nest.station",
      reviewStatus: "accepted"
    });
    expect(libraryItemsByLabel.get("7B-070L-DN1")).toMatchObject({
      itemType: "dunnage",
      equipmentTypeId: "dunnage.station",
      sourceEntityIds: ["p736-dn1-geom", "p736-dn1-label"]
    });
  });

  it("exports JSON, Markdown, and CSV review formats", () => {
    const layoutPackage = p736Package();
    const json = JSON.parse(exportLayoutPackageJson(layoutPackage));
    const markdown = exportLayoutPackageMarkdown(layoutPackage);
    const csv = exportLayoutPackageCsv(layoutPackage);

    expect(json.trainingPack).toHaveLength(4);
    expect(markdown).toContain("# Kairo Layout Library Package");
    expect(markdown).toContain("## Training Pack");
    expect(markdown).toContain("| accepted | 7B-020L-04 | robot | robot |");
    expect(markdown).toContain("p736-dn1-geom, p736-dn1-label");
    expect(csv).toContain('"training","training-record-semantic-device-dunnage-p736-dn1-label"');
    expect(csv).toContain('"classification","classification-semantic-device-robot-p736-robot-label"');
  });
});
