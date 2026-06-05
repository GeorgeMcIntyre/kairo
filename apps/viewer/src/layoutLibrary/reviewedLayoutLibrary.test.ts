import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { buildAdvancedLayoutModel } from "../advancedEngineering/advancedLayout";
import { computeLayoutSemantics } from "../semantic/layoutSemantics";
import { buildLayoutPackage, type LayoutPackage } from "./layoutPackage";
import { buildBlankLayoutReviewPack, mergeReviewedTrainingTruth, type LayoutReviewPack } from "./layoutReviewPack";
import {
  buildReviewedLayoutLibrary,
  exportReviewedLayoutLibraryCsv,
  exportReviewedLayoutLibraryJson,
  exportReviewedLayoutLibraryMarkdown
} from "./reviewedLayoutLibrary";

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

function p736LayoutPackage(): LayoutPackage {
  const scene = {
    ...scenePackage(),
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set" as const,
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
  } satisfies ScenePackage;
  const semantics = computeLayoutSemantics(scene);
  return buildLayoutPackage(scene, semantics, buildAdvancedLayoutModel(scene, semantics));
}

function reviewedPack(layoutPackage: LayoutPackage): LayoutReviewPack {
  const blank = buildBlankLayoutReviewPack(layoutPackage);
  return {
    ...blank,
    records: blank.records.map((record) => {
      if (record.detectedLabel === "7B-020L-04") {
        return {
          ...record,
          reviewStatus: "corrected",
          correctedDeviceType: "robot_model",
          correctedGeometryAssociationId: "manual-robot-geometry",
          reviewerNote: "Train robot family from the reviewed robot cell.",
          reviewedAt: "2026-06-05T10:01:00.000Z"
        };
      }
      if (record.detectedLabel === "7B-070L-DN1") {
        return {
          ...record,
          reviewStatus: "rejected",
          reviewerNote: "Do not train this duplicate dunnage row.",
          reviewedAt: "2026-06-05T10:02:00.000Z"
        };
      }
      if (record.detectedLabel === "7B-070L-DN2") {
        return {
          ...record,
          reviewStatus: "uncertain",
          reviewerNote: "Hold for visual review.",
          reviewedAt: "2026-06-05T10:03:00.000Z"
        };
      }
      return {
        ...record,
        reviewStatus: "accepted",
        reviewerNote: "Nest is reusable.",
        reviewedAt: "2026-06-05T10:04:00.000Z"
      };
    })
  };
}

describe("reviewed layout library", () => {
  it("builds reusable reviewed library items from trainable truth records", () => {
    const layoutPackage = p736LayoutPackage();
    const trainingTruth = mergeReviewedTrainingTruth(layoutPackage, reviewedPack(layoutPackage));
    const reviewedLibrary = buildReviewedLayoutLibrary(layoutPackage, trainingTruth);
    const byLabel = new Map(reviewedLibrary.items.map((item) => [item.label, item]));

    expect(reviewedLibrary.schema).toBe("kairo-reviewed-layout-library");
    expect(reviewedLibrary.summary).toMatchObject({
      reusableItems: 2,
      acceptedItems: 1,
      correctedItems: 1,
      reviewOnlyRecords: 1,
      excludedRecords: 1,
      itemsByType: {
        nest: 1,
        robot_model: 1
      }
    });
    expect(byLabel.get("7B-020L-04")).toMatchObject({
      itemType: "robot_model",
      equipmentTypeId: "robot.generic",
      reviewStatus: "corrected",
      associatedEntityIds: ["manual-robot-geometry", "p736-robot-geom"],
      reviewerNote: "Train robot family from the reviewed robot cell."
    });
    expect(byLabel.get("7B-060L-1N")).toMatchObject({
      itemType: "nest",
      equipmentTypeId: "nest.station",
      reviewStatus: "accepted",
      associatedEntityIds: ["p736-nest-geom"]
    });
    expect(reviewedLibrary.items.map((item) => item.label)).not.toContain("7B-070L-DN1");
    expect(reviewedLibrary.items.map((item) => item.label)).not.toContain("7B-070L-DN2");
    expect(reviewedLibrary.excludedRecords[0]).toMatchObject({
      label: "7B-070L-DN1",
      trainingUse: "excluded"
    });
    expect(reviewedLibrary.reviewOnlyRecords[0]).toMatchObject({
      label: "7B-070L-DN2",
      trainingUse: "review-only"
    });
  });

  it("exports reviewed library JSON, CSV, and Markdown", () => {
    const layoutPackage = p736LayoutPackage();
    const reviewedLibrary = buildReviewedLayoutLibrary(
      layoutPackage,
      mergeReviewedTrainingTruth(layoutPackage, reviewedPack(layoutPackage))
    );
    const json = JSON.parse(exportReviewedLayoutLibraryJson(reviewedLibrary));
    const csv = exportReviewedLayoutLibraryCsv(reviewedLibrary);
    const markdown = exportReviewedLayoutLibraryMarkdown(reviewedLibrary);

    expect(json.items).toHaveLength(2);
    expect(csv).toContain('"item","reviewed-library-item-truth-training-record-semantic-device-robot-p736-robot-label"');
    expect(csv).toContain('"excluded","reviewed-library-hold-truth-training-record-semantic-device-dunnage-p736-dn1-label"');
    expect(markdown).toContain("# Kairo Reviewed Layout Library");
    expect(markdown).toContain("| corrected | 7B-020L-04 | robot_model | robot.generic |");
  });
});
