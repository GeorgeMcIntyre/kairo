import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { buildAdvancedLayoutModel } from "../advancedEngineering/advancedLayout";
import { computeLayoutSemantics } from "../semantic/layoutSemantics";
import { buildLayoutPackage, type LayoutPackage } from "./layoutPackage";
import {
  buildBlankLayoutReviewPack,
  exportLayoutReviewPackJson,
  exportReviewedTrainingSummaryMarkdown,
  exportReviewedTrainingTruthCsv,
  exportReviewedTrainingTruthJson,
  mergeReviewedTrainingTruth,
  parseLayoutReviewPackJson,
  type LayoutReviewPack
} from "./layoutReviewPack";

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
    createdAt: "2026-06-05T10:00:00.000Z",
    records: blank.records.map((record) => {
      if (record.detectedLabel === "7B-020L-04") {
        return {
          ...record,
          reviewStatus: "corrected",
          correctedDeviceType: "robot_model",
          correctedGeometryAssociationId: "manual-robot-geometry",
          correctedGeometryAssociationNote: "Use the full robot cell block after reviewer confirmation.",
          reviewerNote: "Robot label is correct, but training target should include the robot model family.",
          reviewedAt: "2026-06-05T10:01:00.000Z"
        };
      }
      if (record.detectedLabel === "7B-070L-DN1") {
        return {
          ...record,
          reviewStatus: "rejected",
          reviewerNote: "Duplicate trial row; do not train from this record.",
          reviewedAt: "2026-06-05T10:02:00.000Z"
        };
      }
      if (record.detectedLabel === "7B-070L-DN2") {
        return {
          ...record,
          reviewStatus: "uncertain",
          reviewerNote: "Need to inspect whether this is a second dunnage stand or alternate text.",
          reviewedAt: "2026-06-05T10:03:00.000Z"
        };
      }
      return {
        ...record,
        reviewStatus: "accepted",
        reviewerNote: "Nest is correct.",
        reviewedAt: "2026-06-05T10:04:00.000Z"
      };
    })
  };
}

describe("layout review pack", () => {
  it("imports a valid reviewed pack", () => {
    const layoutPackage = p736LayoutPackage();
    const pack = reviewedPack(layoutPackage);
    const parsed = parseLayoutReviewPackJson(exportLayoutReviewPackJson(pack), layoutPackage);

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.reviewPack.records : []).toHaveLength(4);
  });

  it("fails invalid reviewed packs with clear validation errors", () => {
    const layoutPackage = p736LayoutPackage();
    const blank = buildBlankLayoutReviewPack(layoutPackage);
    const invalid = {
      ...blank,
      records: [
        {
          ...blank.records[0],
          detectedItemId: "missing-device",
          detectedDeviceType: "not-a-device-kind",
          reviewStatus: "done"
        }
      ]
    };
    const parsed = parseLayoutReviewPackJson(JSON.stringify(invalid), layoutPackage);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "records[0].detectedDeviceType",
          message: "detectedDeviceType must be a known Kairo device kind."
        }),
        expect.objectContaining({
          path: "records[0].reviewStatus",
          message: "reviewStatus must be accepted, corrected, rejected, or uncertain."
        })
      ])
    );
  });

  it("rejects review records that reference unknown generated training records", () => {
    const layoutPackage = p736LayoutPackage();
    const blank = buildBlankLayoutReviewPack(layoutPackage);
    const invalid = {
      ...blank,
      records: [{ ...blank.records[0], detectedItemId: "missing-device" }]
    };
    const parsed = parseLayoutReviewPackJson(JSON.stringify(invalid), layoutPackage);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? [] : parsed.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "records[0].detectedItemId",
          message: "detectedItemId missing-device does not exist in the generated training pack."
        })
      ])
    );
  });

  it("merges corrected, rejected, uncertain, and accepted records into training truth", () => {
    const layoutPackage = p736LayoutPackage();
    const trainingTruth = mergeReviewedTrainingTruth(layoutPackage, reviewedPack(layoutPackage));
    const byLabel = new Map(trainingTruth.records.map((record) => [record.detectedLabel, record]));

    expect(byLabel.get("7B-020L-04")).toMatchObject({
      reviewStatus: "corrected",
      trainingUse: "trainable",
      detectedDeviceType: "robot",
      finalDeviceType: "robot_model",
      correctedGeometryAssociationId: "manual-robot-geometry"
    });
    expect(byLabel.get("7B-070L-DN1")).toMatchObject({
      reviewStatus: "rejected",
      trainingUse: "excluded",
      finalDeviceType: "dunnage"
    });
    expect(byLabel.get("7B-070L-DN2")).toMatchObject({
      reviewStatus: "uncertain",
      trainingUse: "review-only",
      finalDeviceType: "dunnage"
    });
    expect(byLabel.get("7B-060L-1N")).toMatchObject({
      reviewStatus: "accepted",
      trainingUse: "trainable",
      finalDeviceType: "nest"
    });
    expect(trainingTruth.summary).toMatchObject({
      totalRecords: 4,
      trainableRecords: 2,
      excludedRecords: 1,
      reviewOnlyRecords: 1,
      correctedRecords: 1,
      rejectedRecords: 1,
      uncertainRecords: 1
    });
  });

  it("exports reviewed training truth JSON, CSV, and Markdown", () => {
    const layoutPackage = p736LayoutPackage();
    const trainingTruth = mergeReviewedTrainingTruth(layoutPackage, reviewedPack(layoutPackage));
    const json = JSON.parse(exportReviewedTrainingTruthJson(trainingTruth));
    const csv = exportReviewedTrainingTruthCsv(trainingTruth);
    const markdown = exportReviewedTrainingSummaryMarkdown(trainingTruth);

    expect(json.schema).toBe("kairo-reviewed-training-truth");
    expect(csv).toContain('"7B-020L-04","robot","robot_model","corrected","trainable"');
    expect(csv).toContain('"7B-070L-DN1","dunnage","dunnage","rejected","excluded"');
    expect(markdown).toContain("# Kairo Reviewed Training Summary");
    expect(markdown).toContain("| trainable | corrected | 7B-020L-04 | robot | robot_model | manual-robot-geometry |");
  });
});
